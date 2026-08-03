import { CATALOG, byId, displayName } from "./catalog"
import { rfc3339Local } from "./date"
import {
  TRACKER_UNITS,
  type Exercise,
  type Reading,
  type SetEntry,
  type Tracker,
  type TrackerUnit,
} from "./types"

/**
 * Translates the log to and from the metrics wire format.
 *
 * One sample per thing logged per measure, stamped at its own `loggedAt` — not a daily rollup.
 * Facts, not summaries, because a storage layer can only give back what it was sent: a day's
 * total can't tell you it was 2x100kg x5 rather than 1x200kg x5, so rollups can never be
 * restored from.
 *
 *   health_barbell_squat_weight  100  @ 09:14:03
 *   health_barbell_squat_reps      5  @ 09:14:03
 *   health_barbell_squat_volume  500  @ 09:14:03
 *   health_calories_kcal         620  @ 08:12:00
 *   health_waist_cm               81  @ 09:00:00
 *
 * Grafana reads that directly and correctly: sum_over_time for daily volume or daily calories,
 * max_over_time on weight for a top-set line, last_over_time for a measurement like waist.
 *
 * `_sets` is deliberately not stored — `count_over_time(x_volume[1d])` already is the set
 * count, and a stored copy could only ever disagree with it.
 *
 * ## Two kinds of thing, one pipeline
 *
 * A set and a reading differ only in what values they carry: a set contributes up to three
 * measures, a reading contributes exactly one. Everything downstream — the per-prefix
 * millisecond nudge, RFC3339 stamping, batching, tombstones — works on `Syncable`, so neither
 * kind has its own copy of the machinery that took so long to get right.
 *
 * ## Deletions
 *
 * The store only appends, and its delete API is deliberately not exposed. A removed entry is
 * therefore recorded as a *tombstone*: a `<prefix>_deleted` sample carrying the value 1,
 * stamped at the voided entry's own timestamp.
 *
 *   health_barbell_squat_deleted  1  @ 09:14:03   <- voids what was logged at 09:14:03
 *
 * The timestamp is the identifier, so nothing depends on a value surviving float formatting.
 * Everything that reads this data replays the same rule: fetch the tombstones, drop the
 * samples they point at. The app does it in `reconstruct`, and the dashboard does it in panel
 * JavaScript. The server keeps the whole event log and stays authoritative; no reader is
 * allowed a private opinion about what was deleted.
 */

export type Measure = "weight" | "reps" | "volume" | "seconds" | "metres"

/** Not a measure: marks the sample at the same timestamp as void. */
export const TOMBSTONE = "deleted"

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

/** Everything a reader has to fetch to know the true state, tombstones included. */
const READABLE = [...MEASURES, ...TRACKER_UNITS, TOMBSTONE]

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
 * One thing to push: which series it belongs to, when, and what numbers it carries.
 *
 * `values` is keyed by metric suffix, so a set holds up to three entries and a reading holds
 * exactly one. Nothing past this point needs to know which it was looking at.
 */
export interface Syncable {
  /** Local id, so push bookkeeping can be keyed by it. */
  id: string
  loggedAt: string
  prefix: string
  /** suffix -> value */
  values: Record<string, number>
  /**
   * Identity as the remote sees it. Changing any value means the remote copy is stale — and
   * because dedup keeps the biggest value on a timestamp tie, a stale copy cannot be corrected
   * by re-sending it in place, only retracted and rewritten.
   *
   * **The format is frozen per kind.** It is compared against fingerprints already recorded in
   * `RemoteConfig.pushed` on the user's device; a different string for the same set would make
   * every already-pushed set look edited and trigger a tombstone-and-rewrite of the entire log.
   */
  fp: string
}

/** A set as one syncable, or null if it carries nothing worth storing. */
export function syncSet(set: SetEntry): Syncable | null {
  const ex = byId(set.exerciseId)
  if (!ex) return null
  const values = measuresOf(set, ex)
  if (Object.keys(values).length === 0) return null
  return {
    id: set.id,
    loggedAt: set.loggedAt,
    prefix: prefixOf(ex),
    values,
    // Frozen format: `loggedAt|weight,reps,volume,seconds,metres`, blank for absent.
    fp: `${set.loggedAt}|${MEASURES.map((k) => values[k] ?? "").join(",")}`,
  }
}

/** A reading as one syncable. Its single value lands under the tracker's unit. */
export function syncReading(reading: Reading, tracker: Tracker): Syncable | null {
  if (!Number.isFinite(reading.value)) return null
  return {
    id: reading.id,
    loggedAt: reading.loggedAt,
    prefix: tracker.id,
    values: { [tracker.unit]: reading.value },
    fp: `${reading.loggedAt}|${reading.value}`,
  }
}

export function syncSets(sets: SetEntry[]): Syncable[] {
  return sets.map(syncSet).filter((s): s is Syncable => s !== null)
}

export function syncReadings(readings: Reading[], trackers: Tracker[]): Syncable[] {
  const byTrackerId = new Map(trackers.map((t) => [t.id, t]))
  const out: Syncable[] = []
  for (const reading of readings) {
    const tracker = byTrackerId.get(reading.trackerId)
    if (!tracker) continue
    const item = syncReading(reading, tracker)
    if (item) out.push(item)
  }
  return out
}

/** Everything the log has to offer the remote, in one list. */
export function syncablesOf(
  sets: SetEntry[],
  readings: Reading[],
  trackers: Tracker[],
): Syncable[] {
  return [...syncSets(sets), ...syncReadings(readings, trackers)]
}

export interface Sample {
  metric: string
  /** RFC3339 with a real local offset and milliseconds. */
  at: string
  value: number
}

/**
 * Samples for a batch, with timestamps made unique per series prefix.
 *
 * Uniqueness is not optional: two samples of the same metric at the same millisecond collapse
 * under `-dedup.minScrapeInterval=1ms`, and the survivor is whichever value is larger — so a
 * duplicated set logged in the same millisecond would silently eat its twin. Colliding entries
 * are nudged forward a millisecond each, which is far below the resolution anyone reads.
 *
 * Nudging is *per prefix*, which is what lets a meal be four readings at one instant: calories
 * and three macros are four different series, so none of them collide.
 */
export function samplesFor(items: Syncable[]): Sample[] {
  return buildSamples(items).samples
}

/**
 * Samples plus the timestamp each entry was actually assigned.
 *
 * The caller needs the second half: a nudged entry lands a millisecond off its own `loggedAt`,
 * and a tombstone written later has to point at where the samples really are, not where they
 * were meant to go.
 */
export function buildSamples(items: Syncable[]): {
  samples: Sample[]
  stampById: Map<string, number>
  prefixById: Map<string, string>
} {
  const used = new Map<string, Set<number>>()
  const stampById = new Map<string, number>()
  const prefixById = new Map<string, string>()
  const out: Sample[] = []

  // Stable order so the same input always produces the same nudges.
  const ordered = [...items].sort((a, b) =>
    `${a.loggedAt}${a.id}`.localeCompare(`${b.loggedAt}${b.id}`),
  )

  for (const item of ordered) {
    const keys = Object.keys(item.values)
    if (keys.length === 0) continue

    const stamp = Date.parse(item.loggedAt)
    if (!Number.isFinite(stamp)) continue

    const taken = used.get(item.prefix) ?? new Set<number>()
    let ms = stamp
    while (taken.has(ms)) ms += 1
    taken.add(ms)
    used.set(item.prefix, taken)

    stampById.set(item.id, ms)
    prefixById.set(item.id, item.prefix)

    const at = rfc3339Local(new Date(ms))
    for (const key of keys) {
      out.push({ metric: `${item.prefix}_${key}`, at, value: item.values[key] as number })
    }
  }
  return { samples: out, stampById, prefixById }
}

/** Samples grouped into the shim's payload shape: metric -> timestamp -> value. */
export function payloadFor(items: Syncable[]): Record<string, Record<string, number>> {
  const payload: Record<string, Record<string, number>> = {}
  for (const s of samplesFor(items)) {
    const byTime = (payload[s.metric] ??= {})
    byTime[s.at] = s.value
  }
  return payload
}

/**
 * The `match[]` selector for reading our own series back.
 *
 * Anchored on the suffix so it can't sweep up the rest of the stack: `health_step` and
 * `health_weight` have no second underscore and so never match, which matters because
 * `health_weight` would otherwise look a lot like one of ours — and it is HealthKit's, written
 * by an iOS Shortcut that knows nothing about this app.
 */
export function readSelector(): string {
  return `{__name__=~"health_.+_(${READABLE.join("|")})"}`
}

export type ParsedMetric =
  | { prefix: string; kind: "measure"; measure: Measure }
  | { prefix: string; kind: "unit"; unit: TrackerUnit }
  | { prefix: string; kind: "tombstone" }

/**
 * Splits a metric name into its series prefix and what it carries, or null if it isn't ours.
 *
 * The split is always at the *last* underscore, which is what makes the whole naming scheme
 * unambiguous: `bench_press_g` can only be read as prefix `bench_press`, suffix `g`. Because the
 * exercise measures and the tracker units are disjoint sets, the suffix alone says which kind of
 * thing this is — and two things can only ever collide by sharing a prefix outright, which
 * `validateTrackerName` refuses to let happen.
 */
export function parseMetric(name: string): ParsedMetric | null {
  const bare = name.startsWith("health_") ? name.slice("health_".length) : name
  const idx = bare.lastIndexOf("_")
  if (idx <= 0) return null
  const suffix = bare.slice(idx + 1)
  const prefix = bare.slice(0, idx)
  if (suffix === TOMBSTONE) return { prefix, kind: "tombstone" }
  if (MEASURES.includes(suffix as Measure)) {
    return { prefix, kind: "measure", measure: suffix as Measure }
  }
  if (TRACKER_UNITS.includes(suffix as TrackerUnit)) {
    return { prefix, kind: "unit", unit: suffix as TrackerUnit }
  }
  return null
}

/**
 * Tombstone samples for entries that were removed after being pushed.
 *
 * `at` is the millisecond timestamp the entry was originally written at, which is why the push
 * bookkeeping records it: the entry is gone locally, so its own `loggedAt` is no longer around
 * to recompute from.
 */
export function tombstonePayload(
  voided: { prefix: string; at: number }[],
): Record<string, Record<string, number>> {
  const payload: Record<string, Record<string, number>> = {}
  for (const { prefix, at } of voided) {
    const metric = `${prefix}_${TOMBSTONE}`
    const byTime = (payload[metric] ??= {})
    byTime[rfc3339Local(new Date(at))] = 1
  }
  return payload
}
