import { byId } from "./catalog"
import { reconstruct } from "./reconstruct"
import { fingerprint, payloadFor, readSelector } from "./samples"
import type { GainsState, RemoteConfig, SetEntry } from "./types"

/**
 * Client side of the bring-your-own storage layer.
 *
 * Two capabilities, both optional to the backend:
 *
 *   push — POST <ingestUrl>  { "<metric>": { "<rfc3339>": <number> } }
 *   pull — GET  <readUrl>?match[]=…  ->  VictoriaMetrics export JSON Lines
 *
 * Both carry `Authorization: Bearer <token>` — one credential. Both go through
 * `/api/remote` on our own origin so an arbitrary endpoint needn't serve CORS headers.
 *
 * The remote is append-only. New sets propagate; **edits and deletes do not**, because
 * VictoriaMetrics keeps the biggest value on a timestamp tie and its delete API isn't
 * exposed. Rather than half-apply an edit — weight rising while reps fall — we don't re-send
 * changed sets at all, and report them as divergence instead.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface PushPlan {
  /** Sets never sent before. These are the only ones that get written. */
  fresh: SetEntry[]
  /** Sets already sent whose values have since changed locally. Cannot be corrected remotely. */
  changed: SetEntry[]
  /** Ids sent previously that no longer exist locally. Still present remotely, forever. */
  deletedIds: string[]
  sampleCount: number
}

export function planPush(config: RemoteConfig, sets: SetEntry[]): PushPlan {
  const pushed = config.pushed ?? {}
  const live = new Set(sets.map((s) => s.id))

  const fresh: SetEntry[] = []
  const changed: SetEntry[] = []

  for (const set of sets) {
    const ex = byId(set.exerciseId)
    if (!ex) continue
    const fp = fingerprint(set, ex)
    const seen = pushed[set.id]
    if (seen === undefined) fresh.push(set)
    else if (seen !== fp) changed.push(set)
  }

  const deletedIds = Object.keys(pushed).filter((id) => !live.has(id))
  const sampleCount = Object.values(payloadFor(fresh)).reduce(
    (n, byTime) => n + Object.keys(byTime).length,
    0,
  )
  return { fresh, changed, deletedIds, sampleCount }
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
  if (plan.fresh.length === 0) {
    return { ok: true, value: { ...plan, written: 0, config } }
  }

  const pushed = { ...(config.pushed ?? {}) }
  let written = 0

  for (let i = 0; i < plan.fresh.length; i += SETS_PER_REQUEST) {
    const batch = plan.fresh.slice(i, i + SETS_PER_REQUEST)
    const res = await call({
      url: config.url,
      token: config.token,
      payload: payloadFor(batch),
    })
    if (!res.ok) {
      // Persist what did land, so a retry doesn't duplicate the successful batches.
      return {
        ok: false,
        error:
          i === 0
            ? res.error
            : `${res.error} (${written} samples written before the failure)`,
      }
    }
    written += res.value.written ?? 0
    for (const set of batch) {
      const ex = byId(set.exerciseId)
      if (ex) pushed[set.id] = fingerprint(set, ex)
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
      // A range wide enough to be "everything" without relying on export's defaults.
      start: "2000-01-01T00:00:00Z",
      end: new Date(Date.now() + 86_400_000).toISOString(),
    },
  })
  if (!res.ok) return res

  const { sets, unknownPrefixes } = reconstruct(res.value.body ?? "")

  // A pulled set is by definition already on the remote, so record it as pushed. Without
  // this, the next push would re-send everything it just read back.
  const pushed: Record<string, string> = {}
  for (const set of sets) {
    const ex = byId(set.exerciseId)
    if (ex) pushed[set.id] = fingerprint(set, ex)
  }

  return {
    ok: true,
    value: {
      sets,
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

async function call(
  body: CallBody,
): Promise<Result<{ written?: number; body?: string }>> {
  try {
    const res = await fetch("/api/remote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as {
      error?: string
      written?: number
      body?: string
    }
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

/**
 * Stops reporting sets that diverged, without sending anything.
 *
 * Neither kind of divergence can be repaired: the store only appends, so a deleted set stays
 * there and an edited one keeps its original value. Reporting them forever with no way to act
 * is worse than useless, because it reads as "you have unsynced work" when there is nothing to
 * sync. This accepts the remote as it stands.
 *
 * Deleted sets are dropped from the bookkeeping entirely. Edited sets keep their entry, updated
 * to the current local values, so they aren't re-offered as fresh on the next push, which would
 * half-apply the edit: dedup keeps the larger value per field, so a weight going up and reps
 * coming down would leave the remote holding a set that never happened.
 */
export function acknowledgeDivergence(
  config: RemoteConfig,
  sets: SetEntry[],
): RemoteConfig {
  const plan = planPush(config, sets)
  const pushed = { ...(config.pushed ?? {}) }

  for (const id of plan.deletedIds) delete pushed[id]
  for (const set of plan.changed) {
    const ex = byId(set.exerciseId)
    if (ex) pushed[set.id] = fingerprint(set, ex)
  }
  return { ...config, pushed }
}

/** Local state with a pulled set list swapped in, preferences untouched. */
export function applyPull(state: GainsState, sets: SetEntry[]): GainsState {
  return { ...state, sets }
}
