import { byId } from "./catalog"
import { reconstruct } from "./reconstruct"
import { buildSamples, fingerprint, payloadFor, readSelector, tombstonePayload } from "./samples"
import type { GainsState, RemoteConfig, SetEntry } from "./types"

/**
 * Client side of the bring-your-own storage layer.
 *
 *   push — POST <ingestUrl>  { "<metric>": { "<rfc3339>": <number> } }
 *   pull — GET  <readUrl>?match[]=…  ->  VictoriaMetrics export JSON Lines
 *
 * Both carry `Authorization: Bearer <token>` — one credential. Both go through
 * `/api/remote` on our own origin so an arbitrary endpoint needn't serve CORS headers.
 *
 * The store only appends and its delete API is not exposed, so removing a set is itself an
 * append: a tombstone at the removed set's timestamp. Push sends those alongside new sets, and
 * every reader — this app and the dashboard's panel JS — replays the same rule. The server
 * holds the whole event log and stays authoritative.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface Tombstone {
  /** Local set id, so bookkeeping can be cleared once the tombstone lands. */
  id: string
  prefix: string
  at: number
  /** True when the set still exists locally and is being rewritten rather than removed. */
  replaced: boolean
}

export interface PushPlan {
  /** Sets never sent before. */
  fresh: SetEntry[]
  /** Sets deleted locally after being pushed. Each becomes a tombstone. */
  tombstones: Tombstone[]
  /**
   * Sets edited after being pushed. Repaired the same way a delete is: tombstone the samples
   * at their old timestamp, then write the new values at a fresh one.
   *
   * Re-sending in place cannot work. The samples sit at a fixed timestamp and dedup keeps the
   * larger value per field, so lowering a weight while raising the reps would leave the store
   * holding a set that never happened. And the new copy has to land at least a millisecond
   * clear of the old, or the tombstone that voids the original voids the correction with it.
   */
  changed: SetEntry[]
  sampleCount: number
}

export function planPush(config: RemoteConfig, sets: SetEntry[]): PushPlan {
  const pushed = config.pushed ?? {}
  const live = new Map(sets.map((s) => [s.id, s]))

  const fresh: SetEntry[] = []
  const changed: SetEntry[] = []

  for (const set of sets) {
    const ex = byId(set.exerciseId)
    if (!ex) continue
    const seen = pushed[set.id]
    if (seen === undefined) fresh.push(set)
    else if (seen.fp !== fingerprint(set, ex)) changed.push(set)
  }

  const tombstones: Tombstone[] = []
  for (const [id, entry] of Object.entries(pushed)) {
    // Deleted, or edited: both retract what is stored. An edit then re-lands as a fresh set.
    if (!live.has(id) || changed.some((s) => s.id === id)) {
      tombstones.push({ id, prefix: entry.prefix, at: entry.at, replaced: live.has(id) })
    }
  }

  const sampleCount =
    Object.values(payloadFor([...fresh, ...changed])).reduce(
      (n, byTime) => n + Object.keys(byTime).length,
      0,
    ) + tombstones.length

  return { fresh, tombstones, changed, sampleCount }
}

/** Keeps each request comfortably under the shim's 1MB body limit. */
const SETS_PER_REQUEST = 150

export interface PushOutcome extends PushPlan {
  written: number
  config: RemoteConfig
}

export async function pushSets(
  config: RemoteConfig,
  sets: SetEntry[],
): Promise<Result<PushOutcome>> {
  const plan = planPush(config, sets)
  if (plan.fresh.length === 0 && plan.tombstones.length === 0 && plan.changed.length === 0) {
    return { ok: true, value: { ...plan, written: 0, config } }
  }

  const pushed = { ...(config.pushed ?? {}) }
  let written = 0

  // An edited set is rewritten at least a millisecond past where it used to live, so the
  // tombstone retracting the original cannot swallow the correction as well.
  const previous = new Map(plan.tombstones.map((t) => [t.id, t.at]))
  const rewritten = plan.changed.map((set) => {
    const old = previous.get(set.id) ?? 0
    const wanted = Date.parse(set.loggedAt)
    return wanted > old ? set : { ...set, loggedAt: new Date(old + 1).toISOString() }
  })
  const outgoing = [...plan.fresh, ...rewritten]

  // Tombstones first. If the run dies halfway, the store having forgotten a set it should
  // forget is a better resting place than it holding one it shouldn't.
  if (plan.tombstones.length > 0) {
    const res = await call({
      url: config.url,
      token: config.token,
      payload: tombstonePayload(plan.tombstones),
    })
    if (!res.ok) return { ok: false, error: res.error }
    written += res.value.written ?? 0
    for (const t of plan.tombstones) delete pushed[t.id]
  }

  for (let i = 0; i < outgoing.length; i += SETS_PER_REQUEST) {
    const batch = outgoing.slice(i, i + SETS_PER_REQUEST)
    const res = await call({
      url: config.url,
      token: config.token,
      payload: payloadFor(batch),
    })
    if (!res.ok) {
      return {
        ok: false,
        error:
          written === 0 ? res.error : `${res.error} (${written} samples written before the failure)`,
      }
    }
    written += res.value.written ?? 0
    // Record where each set actually landed, collision nudge included, so a later tombstone
    // points at the sample that exists rather than the one we intended to write.
    const { stampBySetId, prefixBySetId } = buildSamples(batch)
    for (const set of batch) {
      const ex = byId(set.exerciseId)
      const at = stampBySetId.get(set.id)
      const prefix = prefixBySetId.get(set.id)
      if (!ex || at === undefined || prefix === undefined) continue
      pushed[set.id] = { fp: fingerprint(set, ex), at, prefix }
    }
  }

  return {
    ok: true,
    value: {
      ...plan,
      written,
      config: { ...config, pushed, lastSyncedAt: new Date().toISOString() },
    },
  }
}

export interface PullOutcome {
  sets: SetEntry[]
  voided: number
  unknownPrefixes: string[]
  config: RemoteConfig
}

export async function pullSets(config: RemoteConfig): Promise<Result<PullOutcome>> {
  if (!config.readUrl?.trim()) {
    return { ok: false, error: "No read endpoint configured." }
  }

  const res = await call({
    url: config.readUrl,
    token: config.token,
    read: {
      "match[]": readSelector(),
      start: "2000-01-01T00:00:00Z",
      end: new Date(Date.now() + 86_400_000).toISOString(),
    },
  })
  if (!res.ok) return res

  const { sets, voided, unknownPrefixes } = reconstruct(res.value.body ?? "")

  // A pulled set is by definition already stored, at the timestamp it came back on.
  const pushed: Record<string, { fp: string; at: number; prefix: string }> = {}
  const { stampBySetId, prefixBySetId } = buildSamples(sets)
  for (const set of sets) {
    const ex = byId(set.exerciseId)
    const at = stampBySetId.get(set.id)
    const prefix = prefixBySetId.get(set.id)
    if (ex && at !== undefined && prefix !== undefined) {
      pushed[set.id] = { fp: fingerprint(set, ex), at, prefix }
    }
  }

  return {
    ok: true,
    value: {
      sets,
      voided,
      unknownPrefixes,
      config: { ...config, pushed, lastSyncedAt: new Date().toISOString() },
    },
  }
}

interface CallBody {
  url: string
  token: string
  payload?: Record<string, Record<string, number>>
  read?: Record<string, string>
}

async function call(body: CallBody): Promise<Result<{ written?: number; body?: string }>> {
  try {
    const res = await fetch("/api/remote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { error?: string; written?: number; body?: string }
    if (!res.ok) return { ok: false, error: data.error ?? `Request failed (${res.status}).` }
    return { ok: true, value: data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." }
  }
}

/** Forgets push bookkeeping so the next push re-sends every set. */
export function resetPushState(config: RemoteConfig): RemoteConfig {
  return { ...config, pushed: {} }
}

/** Local state with a pulled set list swapped in, preferences untouched. */
export function applyPull(state: GainsState, sets: SetEntry[]): GainsState {
  return { ...state, sets }
}
