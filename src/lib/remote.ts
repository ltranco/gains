import { reconstruct } from "./reconstruct"
import {
  buildSamples,
  payloadFor,
  readSelector,
  syncablesOf,
  tombstonePayload,
  type Syncable,
} from "./samples"
import type { GainsState, Reading, RemoteConfig, SetEntry, Tracker } from "./types"

/**
 * Client side of the bring-your-own storage layer.
 *
 *   push — POST <ingestUrl>  { "<metric>": { "<rfc3339>": <number> } }
 *   pull — GET  <readUrl>?match[]=…  ->  VictoriaMetrics export JSON Lines
 *
 * Both carry `Authorization: Bearer <token>` — one credential. Both go through
 * `/api/remote` on our own origin so an arbitrary endpoint needn't serve CORS headers.
 *
 * The store only appends and its delete API is not exposed, so removing an entry is itself an
 * append: a tombstone at the removed entry's timestamp. Push sends those alongside new ones, and
 * every reader — this app and the dashboard's panel JS — replays the same rule. The server
 * holds the whole event log and stays authoritative.
 *
 * Everything here works on `Syncable`, so sets and readings travel the same path. See
 * `lib/samples.ts`.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface Tombstone {
  /** Local id, so bookkeeping can be cleared once the tombstone lands. */
  id: string
  prefix: string
  at: number
  /** True when the entry still exists locally and is being rewritten rather than removed. */
  replaced: boolean
}

export interface PushPlan {
  /** Entries never sent before. */
  fresh: Syncable[]
  /** Entries deleted locally after being pushed. Each becomes a tombstone. */
  tombstones: Tombstone[]
  /**
   * Entries edited after being pushed. Repaired the same way a delete is: tombstone the samples
   * at their old timestamp, then write the new values at a fresh one.
   *
   * Re-sending in place cannot work. The samples sit at a fixed timestamp and dedup keeps the
   * larger value per field, so lowering a weight while raising the reps would leave the store
   * holding a set that never happened. And the new copy has to land at least a millisecond
   * clear of the old, or the tombstone that voids the original voids the correction with it.
   */
  changed: Syncable[]
  sampleCount: number
}

export function planPush(config: RemoteConfig, items: Syncable[]): PushPlan {
  const pushed = config.pushed ?? {}
  const live = new Map(items.map((i) => [i.id, i]))

  const fresh: Syncable[] = []
  const changed: Syncable[] = []

  for (const item of items) {
    const seen = pushed[item.id]
    if (seen === undefined) fresh.push(item)
    else if (seen.fp !== item.fp) changed.push(item)
  }

  const tombstones: Tombstone[] = []
  const changedIds = new Set(changed.map((i) => i.id))
  for (const [id, entry] of Object.entries(pushed)) {
    // Deleted, or edited: both retract what is stored. An edit then re-lands as a fresh sample.
    if (!live.has(id) || changedIds.has(id)) {
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
const ENTRIES_PER_REQUEST = 150

export interface PushOutcome extends PushPlan {
  written: number
  config: RemoteConfig
}

export async function pushLog(
  config: RemoteConfig,
  items: Syncable[],
): Promise<Result<PushOutcome>> {
  const plan = planPush(config, items)
  if (plan.fresh.length === 0 && plan.tombstones.length === 0 && plan.changed.length === 0) {
    return { ok: true, value: { ...plan, written: 0, config } }
  }

  const pushed = { ...(config.pushed ?? {}) }
  let written = 0

  /**
   * An edited entry is rewritten at least a millisecond past where it used to live, so the
   * tombstone retracting the original cannot swallow the correction as well.
   *
   * `fp` is deliberately carried across rather than recomputed from the shifted `loggedAt`. The
   * fingerprint that gets recorded has to be one the *local* entry can produce again, or the next
   * plan compares it against a string that will never match: the entry looks edited forever,
   * every push re-tombstones it and writes another copy a millisecond further along, and Settings
   * sits on a permanent "1 edited to sync". That was a real bug, and `remote.test.ts` holds the
   * line on it.
   */
  const previous = new Map(plan.tombstones.map((t) => [t.id, t.at]))
  const rewritten = plan.changed.map((item) => {
    const old = previous.get(item.id) ?? 0
    const wanted = Date.parse(item.loggedAt)
    return wanted > old ? item : { ...item, loggedAt: new Date(old + 1).toISOString() }
  })
  const outgoing = [...plan.fresh, ...rewritten]

  // Tombstones first. If the run dies halfway, the store having forgotten an entry it should
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

  for (let i = 0; i < outgoing.length; i += ENTRIES_PER_REQUEST) {
    const batch = outgoing.slice(i, i + ENTRIES_PER_REQUEST)
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
    // Record where each entry actually landed, collision nudge included, so a later tombstone
    // points at the sample that exists rather than the one we intended to write.
    const { stampById, prefixById } = buildSamples(batch)
    for (const item of batch) {
      const at = stampById.get(item.id)
      const prefix = prefixById.get(item.id)
      if (at === undefined || prefix === undefined) continue
      pushed[item.id] = { fp: item.fp, at, prefix }
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
  readings: Reading[]
  /** Trackers that had to be rebuilt, so the UI can say their mode is a guess. */
  recovered: Tracker[]
  voided: number
  unknownPrefixes: string[]
  config: RemoteConfig
}

/**
 * @param trackers the *resolved* list — builtins merged with stored ones, i.e.
 * `allTrackers(state.trackers)`. Passing only the stored half would make every builtin look
 * unknown and get rebuilt as a duplicate.
 */
export async function pullLog(
  config: RemoteConfig,
  trackers: Tracker[],
): Promise<Result<PullOutcome>> {
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

  const { sets, readings, recovered, voided, unknownPrefixes } = reconstruct(
    res.value.body ?? "",
    trackers,
  )

  const merged = mergeTrackers(trackers, recovered)

  // A pulled entry is by definition already stored, at the timestamp it came back on.
  const pushed: Record<string, { fp: string; at: number; prefix: string }> = {}
  const items = syncablesOf(sets, readings, merged)
  const { stampById, prefixById } = buildSamples(items)
  for (const item of items) {
    const at = stampById.get(item.id)
    const prefix = prefixById.get(item.id)
    if (at !== undefined && prefix !== undefined) {
      pushed[item.id] = { fp: item.fp, at, prefix }
    }
  }

  return {
    ok: true,
    value: {
      sets,
      readings,
      recovered,
      voided,
      unknownPrefixes,
      config: { ...config, pushed, lastSyncedAt: new Date().toISOString() },
    },
  }
}

/**
 * Stored trackers win over rebuilt ones. A local definition knows its mode and its target;
 * a rebuilt one guessed both.
 */
export function mergeTrackers(stored: Tracker[], recovered: Tracker[]): Tracker[] {
  const have = new Set(stored.map((t) => t.id))
  return [...stored, ...recovered.filter((t) => !have.has(t.id))]
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

/** Forgets push bookkeeping so the next push re-sends everything. */
export function resetPushState(config: RemoteConfig): RemoteConfig {
  return { ...config, pushed: {} }
}

/**
 * Local state with the pulled log swapped in, preferences untouched.
 *
 * Replaces rather than merges, for both sets and readings: merging needs a rule for "both sides
 * changed the same entry" and inventing one silently is how a log stops matching what happened.
 * Trackers are the exception — those are definitions, not history, so a rebuilt one is appended
 * rather than allowed to overwrite what this device already knows.
 */
export function applyPull(state: GainsState, pulled: PullOutcome): GainsState {
  return {
    ...state,
    sets: pulled.sets,
    readings: pulled.readings,
    trackers: mergeTrackers(state.trackers, pulled.recovered),
  }
}
