import { toDayKey } from "./date"
import { exerciseForPrefix, parseMetric, type Measure } from "./samples"
import { newId } from "./store"
import type { SetEntry } from "./types"

/**
 * Rebuilds sets from VictoriaMetrics' `/api/v1/export` output.
 *
 * Export emits JSON Lines — one object per series, each holding parallel `values` and
 * `timestamps` arrays. A set is the join of every measure sharing one timestamp under one
 * exercise prefix, which is why samples are written at the set's own `loggedAt` rather than at
 * a rollup boundary.
 *
 * Two things do not survive the round trip, because VictoriaMetrics stores only numbers:
 * a set's `note`, and its original `id`. Ids are regenerated.
 */

export interface ReconstructResult {
  sets: SetEntry[]
  /** Metric names that looked like ours but named no exercise in the catalog. */
  unknownPrefixes: string[]
  /** Series skipped because they aren't ours at all (health_step, health_weight, …). */
  skippedSeries: number
}

interface ExportLine {
  metric?: { __name__?: string }
  values?: unknown
  timestamps?: unknown
}

export function reconstruct(jsonl: string): ReconstructResult {
  // prefix -> timestamp(ms) -> measure -> value
  const grouped = new Map<string, Map<number, Partial<Record<Measure, number>>>>()
  const unknown = new Set<string>()
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
    if (!exerciseForPrefix(split.prefix)) {
      unknown.add(split.prefix)
      continue
    }

    const values = Array.isArray(parsed.values) ? parsed.values : []
    const stamps = Array.isArray(parsed.timestamps) ? parsed.timestamps : []
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

  sets.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  return { sets, unknownPrefixes: [...unknown], skippedSeries: skipped }
}
