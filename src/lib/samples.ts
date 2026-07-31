import { CATALOG, byId, displayName } from "./catalog"
import { rfc3339Local } from "./date"
import type { Exercise, SetEntry } from "./types"

/**
 * Translates the log to and from the metrics wire format.
 *
 * One sample per set per measure, stamped at the set's own `loggedAt` — not a daily rollup.
 * Facts, not summaries, because a storage layer can only give back what it was sent: a day's
 * total can't tell you it was 2x100kg x5 rather than 1x200kg x5, so rollups can never be
 * restored from.
 *
 *   health_barbell_squat_weight  100  @ 09:14:03
 *   health_barbell_squat_reps      5  @ 09:14:03
 *   health_barbell_squat_volume  500  @ 09:14:03
 *
 * Grafana reads that directly and correctly: sum_over_time for daily volume, max_over_time on
 * weight for a top-set line, count_over_time for sets. One sample per set means no
 * double-counting, which is exactly what the old revisioned rollups got wrong.
 *
 * `_sets` is deliberately not stored — `count_over_time(x_volume[1d])` already is the set
 * count, and a stored copy could only ever disagree with it.
 */

export type Measure = "weight" | "reps" | "volume" | "seconds" | "metres"

/** `Barbell Squat` -> `barbell_squat`. Matches what the shim's own sanitiser would produce. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function prefixOf(ex: Exercise): string {
  return slug(displayName(ex))
}

/** Reverse map for reconstruction: metric prefix -> exercise. */
const BY_PREFIX: Map<string, Exercise> = new Map(CATALOG.map((e) => [prefixOf(e), e]))

export function exerciseForPrefix(prefix: string): Exercise | undefined {
  return BY_PREFIX.get(prefix)
}

const MEASURES: Measure[] = ["weight", "reps", "volume", "seconds", "metres"]

/** The measures a single set contributes, keyed by measure. */
export function measuresOf(set: SetEntry, ex: Exercise): Partial<Record<Measure, number>> {
  switch (ex.kind) {
    case "weight_reps":
      if (set.weightKg === undefined || set.reps === undefined) return {}
      return {
        weight: set.weightKg,
        reps: set.reps,
        // Stored rather than derived: multiplying two series pointwise in PromQL is painful,
        // and volume is the chart you actually want.
        volume: round(set.weightKg * set.reps),
      }
    case "reps":
      return set.reps === undefined ? {} : { reps: set.reps }
    case "duration":
      return set.durationSec === undefined ? {} : { seconds: set.durationSec }
    case "distance": {
      if (set.distanceM === undefined) return {}
      return {
        metres: set.distanceM,
        ...(set.durationSec === undefined ? {} : { seconds: set.durationSec }),
      }
    }
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Identity of a set as the remote sees it. Changing any of these means the remote copy is
 * stale — and because VictoriaMetrics keeps the biggest value on a timestamp tie, a stale
 * copy cannot be corrected by re-sending it.
 */
export function fingerprint(set: SetEntry, ex: Exercise): string {
  const m = measuresOf(set, ex)
  return `${set.loggedAt}|${MEASURES.map((k) => m[k] ?? "").join(",")}`
}

export interface Sample {
  metric: string
  /** RFC3339 with a real local offset and milliseconds. */
  at: string
  value: number
}

/**
 * Samples for a batch of sets, with timestamps made unique per exercise.
 *
 * Uniqueness is not optional: two samples of the same metric at the same millisecond collapse
 * under `-dedup.minScrapeInterval=1ms`, and the survivor is whichever value is larger — so a
 * duplicated set logged in the same millisecond would silently eat its twin. Colliding sets
 * are nudged forward a millisecond each, which is far below the resolution anyone reads.
 */
export function samplesFor(sets: SetEntry[]): Sample[] {
  const used = new Map<string, Set<number>>()
  const out: Sample[] = []

  // Stable order so the same input always produces the same nudges.
  const ordered = [...sets].sort((a, b) =>
    `${a.loggedAt}${a.id}`.localeCompare(`${b.loggedAt}${b.id}`),
  )

  for (const set of ordered) {
    const ex = byId(set.exerciseId)
    if (!ex) continue
    const measures = measuresOf(set, ex)
    const keys = Object.keys(measures) as Measure[]
    if (keys.length === 0) continue

    const prefix = prefixOf(ex)
    const stamp = Date.parse(set.loggedAt)
    if (!Number.isFinite(stamp)) continue

    const taken = used.get(prefix) ?? new Set<number>()
    let ms = stamp
    while (taken.has(ms)) ms += 1
    taken.add(ms)
    used.set(prefix, taken)

    const at = rfc3339Local(new Date(ms))
    for (const measure of keys) {
      out.push({ metric: `${prefix}_${measure}`, at, value: measures[measure] as number })
    }
  }
  return out
}

/** Samples grouped into the shim's payload shape: metric -> timestamp -> value. */
export function payloadFor(sets: SetEntry[]): Record<string, Record<string, number>> {
  const payload: Record<string, Record<string, number>> = {}
  for (const s of samplesFor(sets)) {
    const byTime = (payload[s.metric] ??= {})
    byTime[s.at] = s.value
  }
  return payload
}

/**
 * The `match[]` selector for reading our own series back.
 *
 * Anchored on the measure suffix so it can't sweep up the rest of the stack: `health_step`
 * and `health_weight` have no second underscore and so never match, which matters because
 * `health_weight` would otherwise look a lot like one of ours.
 */
export function readSelector(): string {
  return `{__name__=~"health_.+_(${MEASURES.join("|")})"}`
}

/** Splits a metric name into its exercise prefix and measure, or null if it isn't ours. */
export function parseMetric(name: string): { prefix: string; measure: Measure } | null {
  const bare = name.startsWith("health_") ? name.slice("health_".length) : name
  const idx = bare.lastIndexOf("_")
  if (idx <= 0) return null
  const measure = bare.slice(idx + 1) as Measure
  if (!MEASURES.includes(measure)) return null
  return { prefix: bare.slice(0, idx), measure }
}
