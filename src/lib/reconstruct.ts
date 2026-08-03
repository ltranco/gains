import { toDayKey } from "./date"
import { exerciseForPrefix, parseMetric, type Measure } from "./samples"
import { newId } from "./store"
import { allTrackers, recoveredTracker } from "./trackers"
import type { Reading, SetEntry, Tracker, TrackerUnit } from "./types"

/**
 * Rebuilds the log from VictoriaMetrics' `/api/v1/export` output.
 *
 * Export emits JSON Lines — one object per series, each holding parallel `values` and
 * `timestamps` arrays. A set is the join of every measure sharing one timestamp under one
 * exercise prefix; a reading is a single value under a tracker's prefix. That is why samples are
 * written at their own `loggedAt` rather than at a rollup boundary.
 *
 * Two things do not survive the round trip, because VictoriaMetrics stores only numbers:
 * a `note`, and an original `id`. Ids are regenerated.
 */

export interface ReconstructResult {
  sets: SetEntry[]
  readings: Reading[]
  /**
   * Trackers rebuilt from series that nothing local knew about. Merged into stored trackers by
   * the caller, so a device wiped by Safari's ITP gets its own custom metrics back.
   */
  recovered: Tracker[]
  /** How many stored entries were suppressed by a tombstone. */
  voided: number
  /** Metric names that looked like ours but named nothing we could resolve. */
  unknownPrefixes: string[]
  /** Series skipped because they aren't ours at all (health_step, health_weight, …). */
  skippedSeries: number
}

interface ExportLine {
  metric?: { __name__?: string }
  values?: unknown
  timestamps?: unknown
}

/**
 * @param trackers the trackers this device knows about. Defaults to the builtins, which is what
 * a fresh install has; anything beyond them is recovered and reported.
 */
export function reconstruct(jsonl: string, trackers: Tracker[] = allTrackers([])): ReconstructResult {
  // prefix -> timestamp(ms) -> measure -> value, for exercises
  const grouped = new Map<string, Map<number, Partial<Record<Measure, number>>>>()
  // prefix -> timestamp(ms) -> value, for trackers. One value per sample, so no join needed.
  const scalars = new Map<string, Map<number, number>>()
  // Entries the server has been told to forget, keyed prefix@ms.
  const voided = new Set<string>()
  const unknown = new Set<string>()
  const recovered = new Map<string, Tracker>()
  const known = new Map(trackers.map((t) => [t.id, t]))
  let skipped = 0

  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let parsed: ExportLine
    try {
      parsed = JSON.parse(trimmed) as ExportLine
    } catch {
      continue
    }

    const name = parsed.metric?.__name__
    if (typeof name !== "string") continue

    const split = parseMetric(name)
    if (!split) {
      skipped++
      continue
    }

    const values = Array.isArray(parsed.values) ? parsed.values : []
    const stamps = Array.isArray(parsed.timestamps) ? parsed.timestamps : []

    // A tombstone names no measure, so it can't say which kind of thing it voids. It doesn't
    // have to: prefixes are unique across exercises and trackers, so prefix@timestamp is enough.
    if (split.kind === "tombstone") {
      for (const t of stamps) {
        if (typeof t === "number") voided.add(`${split.prefix}@${t}`)
      }
      continue
    }

    if (split.kind === "unit") {
      const tracker = resolve(split.prefix, split.unit, known, recovered)
      // A prefix we can't place at all, e.g. a unit that no longer exists in the app.
      if (!tracker) {
        unknown.add(split.prefix)
        continue
      }
      const byStamp = scalars.get(split.prefix) ?? new Map<number, number>()
      for (let i = 0; i < Math.min(values.length, stamps.length); i++) {
        const v = values[i]
        const t = stamps[i]
        if (typeof v !== "number" || typeof t !== "number") continue
        byStamp.set(t, v)
      }
      scalars.set(split.prefix, byStamp)
      continue
    }

    if (!exerciseForPrefix(split.prefix)) {
      unknown.add(split.prefix)
      continue
    }

    const byStamp = grouped.get(split.prefix) ?? new Map()
    for (let i = 0; i < Math.min(values.length, stamps.length); i++) {
      const v = values[i]
      const t = stamps[i]
      if (typeof v !== "number" || typeof t !== "number") continue
      const bucket = byStamp.get(t) ?? {}
      bucket[split.measure] = v
      byStamp.set(t, bucket)
    }
    grouped.set(split.prefix, byStamp)
  }

  const sets: SetEntry[] = []
  for (const [prefix, byStamp] of grouped) {
    const exercise = exerciseForPrefix(prefix)
    if (!exercise) continue

    for (const [ms, measures] of byStamp) {
      // A tombstone at this exact timestamp means it was deleted after being pushed. The samples
      // remain in the store forever; the deletion is what's authoritative.
      if (voided.has(`${prefix}@${ms}`)) continue
      const when = new Date(ms)
      const set: SetEntry = {
        id: newId(),
        exerciseId: exercise.id,
        // Recomputed from the instant in local time, never carried over, so a set logged at
        // 9pm Pacific lands on the day it was actually done.
        date: toDayKey(when),
        loggedAt: when.toISOString(),
      }

      switch (exercise.kind) {
        case "weight_reps":
          if (measures.weight === undefined || measures.reps === undefined) continue
          set.weightKg = measures.weight
          set.reps = measures.reps
          break
        case "reps":
          if (measures.reps === undefined) continue
          set.reps = measures.reps
          break
        case "duration":
          if (measures.seconds === undefined) continue
          set.durationSec = measures.seconds
          break
        case "distance":
          if (measures.metres === undefined) continue
          set.distanceM = measures.metres
          if (measures.seconds !== undefined) set.durationSec = measures.seconds
          break
      }
      sets.push(set)
    }
  }

  const readings: Reading[] = []
  for (const [prefix, byStamp] of scalars) {
    for (const [ms, value] of byStamp) {
      if (voided.has(`${prefix}@${ms}`)) continue
      const when = new Date(ms)
      readings.push({
        id: newId(),
        trackerId: prefix,
        date: toDayKey(when),
        loggedAt: when.toISOString(),
        value,
      })
    }
  }

  sets.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  readings.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))

  return {
    sets,
    readings,
    recovered: [...recovered.values()],
    voided: voided.size,
    unknownPrefixes: [...unknown],
    skippedSeries: skipped,
  }
}

/**
 * The tracker a prefix belongs to, inventing one if nothing local claims it.
 *
 * A unit suffix is proof this series was written by this app — nothing else in the store is named
 * that way — so an unrecognised prefix means the definition was lost locally, not that the data
 * is foreign. Recovering it is the difference between "local state is a cache" being true and
 * being a slogan.
 *
 * The exception is a prefix whose unit disagrees with what we already hold. Trusting the stored
 * definition is right: it knows the mode and the target, and a unit that changed would mean two
 * incompatible histories under one name, which no automatic rule can reconcile.
 */
function resolve(
  prefix: string,
  unit: TrackerUnit,
  known: Map<string, Tracker>,
  recovered: Map<string, Tracker>,
): Tracker | undefined {
  const existing = known.get(prefix)
  if (existing) return existing.unit === unit ? existing : undefined
  const already = recovered.get(prefix)
  if (already) return already.unit === unit ? already : undefined
  const made = recoveredTracker(prefix, unit)
  recovered.set(prefix, made)
  return made
}
