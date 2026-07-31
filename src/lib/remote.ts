import { rollupTimestamp } from "./date"
import { dailyMetrics, fingerprint } from "./rollup"
import type { RemoteConfig, SetEntry } from "./types"

/**
 * Pushes derived daily metrics to a configured endpoint speaking the metrics-shim contract:
 *
 *   POST <url>   Authorization: Bearer <token>
 *   { "<metric>": { "<rfc3339 timestamp>": <number> }, … }
 *
 * The host is configuration. Anything honouring that contract works.
 *
 * It goes through `/api/remote` on our own origin so an arbitrary endpoint doesn't have to
 * serve CORS headers to be usable — not for secrecy, since the token sits in localStorage.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface PushOutcome {
  /** Days whose metrics differed from the last push and were therefore sent. */
  days: string[]
  /** Number of individual metric samples in the payload. */
  samples: number
  /** Config with updated per-day hashes and revisions; caller persists it. */
  config: RemoteConfig
}

/** Builds the payload for changed days only, and the config update that records the push. */
export function buildPush(
  config: RemoteConfig,
  sets: SetEntry[],
): { payload: Record<string, Record<string, number>>; outcome: PushOutcome } {
  const perDay = dailyMetrics(sets)
  const pushed = { ...(config.pushed ?? {}) }

  const payload: Record<string, Record<string, number>> = {}
  const days: string[] = []
  let samples = 0

  for (const [day, metrics] of [...perDay].sort(([a], [b]) => a.localeCompare(b))) {
    const hash = fingerprint(metrics)
    const previous = pushed[day]
    if (previous?.hash === hash) continue

    // First push of a day uses offset 0; every correction after it steps one millisecond so
    // it can't tie with — and lose to — the sample already stored.
    const rev = previous ? previous.rev + 1 : 0
    const stamp = rollupTimestamp(day, rev)

    for (const [metric, value] of Object.entries(metrics)) {
      payload[metric] ??= {}
      payload[metric][stamp] = value
      samples++
    }

    pushed[day] = { hash, rev }
    days.push(day)
  }

  return { payload, outcome: { days, samples, config: { ...config, pushed } } }
}

export async function pushMetrics(
  config: RemoteConfig,
  sets: SetEntry[],
): Promise<Result<PushOutcome>> {
  const { payload, outcome } = buildPush(config, sets)
  if (outcome.days.length === 0) {
    return { ok: true, value: outcome }
  }

  try {
    const res = await fetch("/api/remote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: config.url, token: config.token, payload }),
    })
    const data = (await res.json()) as { error?: string; written?: number }
    if (!res.ok) {
      return { ok: false, error: data.error ?? `Request failed (${res.status}).` }
    }
    return {
      ok: true,
      value: {
        ...outcome,
        config: { ...outcome.config, lastSyncedAt: new Date().toISOString() },
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." }
  }
}

/**
 * Forgets what was pushed, so the next push re-sends every day.
 *
 * Revisions are preserved rather than reset — reusing an offset would tie with a stored
 * sample, and dedup would keep whichever value was larger instead of the one being re-sent.
 */
export function resetPushState(config: RemoteConfig): RemoteConfig {
  const pushed: Record<string, { hash: string; rev: number }> = {}
  for (const [day, entry] of Object.entries(config.pushed ?? {})) {
    pushed[day] = { hash: "", rev: entry.rev }
  }
  return { ...config, pushed }
}
