import { byId, displayName } from "./catalog"
import type { SetEntry } from "./types"

/**
 * Turns the set-level log into the per-exercise daily scalars the metrics stack accepts.
 *
 * The wire format is the metrics shim's, not something bespoke:
 *
 *   POST <url>   Authorization: Bearer <token>
 *   { "barbell_squat_volume": { "2026-07-31T00:00:00.000-07:00": 5400 } }
 *
 * Anything implementing that contract works — the URL is configuration, not a hardcoded
 * host. Note the shim prepends its measurement name, so what lands in VictoriaMetrics is
 * `health_barbell_squat_volume`.
 *
 * This is a one-way derived feed. Daily totals cannot be turned back into sets, so pushing
 * metrics is emphatically not a backup of the log.
 */

/** `Barbell Squat` → `barbell_squat`. Matches what the shim's own sanitiser would produce. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export type Measure = "volume" | "sets" | "reps" | "seconds" | "metres"

/** One day's metrics: metric name → value. */
export type DayMetrics = Record<string, number>

/**
 * Per-exercise scalars for a single day.
 *
 * `volume` is Σ weight × reps, which is only meaningful because weight is now always the real
 * load — a pull up records bodyweight plus any belt, so it contributes actual work rather
 * than the zero it used to.
 */
function accumulate(target: DayMetrics, sets: SetEntry[]): void {
  for (const set of sets) {
    const exercise = byId(set.exerciseId)
    if (!exercise) continue

    const prefix = slug(displayName(exercise))
    const add = (measure: Measure, value: number) => {
      const key = `${prefix}_${measure}`
      target[key] = (target[key] ?? 0) + value
    }

    add("sets", 1)

    switch (exercise.kind) {
      case "weight_reps":
        if (set.weightKg !== undefined && set.reps !== undefined) {
          add("volume", set.weightKg * set.reps)
        }
        if (set.reps !== undefined) add("reps", set.reps)
        break
      case "reps":
        if (set.reps !== undefined) add("reps", set.reps)
        break
      case "duration":
        if (set.durationSec !== undefined) add("seconds", set.durationSec)
        break
      case "distance":
        if (set.distanceM !== undefined) add("metres", set.distanceM)
        // Time on a run is optional, so it's only emitted when it was actually logged.
        if (set.durationSec !== undefined) add("seconds", set.durationSec)
        break
    }
  }
}

/** Every logged day's metrics, keyed by day. Values rounded — VM stores float64 either way,
 *  but 5399.999999999999 in a dashboard is noise. */
export function dailyMetrics(all: SetEntry[]): Map<string, DayMetrics> {
  const byDay = new Map<string, SetEntry[]>()
  for (const set of all) {
    const bucket = byDay.get(set.date)
    if (bucket) bucket.push(set)
    else byDay.set(set.date, [set])
  }

  const out = new Map<string, DayMetrics>()
  for (const [day, sets] of byDay) {
    const metrics: DayMetrics = {}
    accumulate(metrics, sets)
    for (const k of Object.keys(metrics)) {
      metrics[k] = Math.round((metrics[k] ?? 0) * 1000) / 1000
    }
    out.set(day, metrics)
  }
  return out
}

/**
 * Stable fingerprint of a day's metrics, used to push only what changed.
 *
 * Without this every push would add a fresh sample to every day ever logged. That bloats the
 * series and, worse, skews `sum_over_time` — which counts every sample, not the latest.
 */
export function fingerprint(metrics: DayMetrics): string {
  return Object.keys(metrics)
    .sort()
    .map((k) => `${k}=${metrics[k]}`)
    .join(",")
}
