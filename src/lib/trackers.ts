import { CATALOG } from "./catalog"
import { MACRO_PREFIXES } from "./food"
import { fuzzyScoreTerms } from "./fuzzy"
import { prefixOf, slug } from "./samples"
import type { Tracker, TrackerUnit } from "./types"

/**
 * Metrics: the things you log as one number. A waist measurement, a creatine dose.
 *
 * The counterpart to `lib/catalog.ts`, and deliberately much smaller. An exercise needs two axes
 * because a movement is done with different implements; a metric is just a name, a unit, and how
 * a day's entries collapse. Everything else about it — how it's pushed, how it comes back, how a
 * deletion propagates — is the machinery the exercise log already had.
 *
 * **Macros are not metrics.** Calories, protein, carbs and fat are fields of a `FoodEntry`, not
 * things you log independently — see `lib/food.ts`. An earlier version had them here as four
 * trackers, which made recording one chicken bowl four trips through a picker and left nothing in
 * the log that remembered it was one bowl. Those four need special handling; that's what earns them
 * a place in code.
 *
 * ## Every metric is yours. There are no builtins.
 *
 * Waist shipped as one for a while, on the grounds that an empty list looks like a broken feature.
 * That was the wrong trade: a waist measurement needs no special handling whatsoever, so putting it
 * in code bought a two-tier system — a shadowing merge rule, a can't-be-removed exception — to
 * privilege one circumference over thigh and neck for no reason anyone could defend. The list starts
 * empty and everything in it is data.
 *
 * ## What can never be a metric
 *
 * **Bodyweight and step count.** HealthKit already pushes `health_weight` and `health_step` from an
 * iOS Shortcut. A second writer on those series would mean two lines that disagree whenever both
 * were used, and a deletion here would tombstone a HealthKit sample. Those slugs are reserved and
 * rejected — see `validateTrackerName`.
 */

/** Metric prefixes the exercise catalog already owns, so a tracker can't claim one. */
const EXERCISE_PREFIXES: Set<string> = new Set(CATALOG.map(prefixOf))

/**
 * Slugs that belong to the iOS Shortcut's half of the store.
 *
 * `ingest` is the shim's own heartbeat. All three are single-token names, which is why the read
 * selector never saw them; a metric claiming one would start writing to them.
 */
const HEALTHKIT = new Set(["weight", "step", "ingest"])

export function trackerById(trackers: Tracker[], id: string): Tracker | undefined {
  return trackers.find((t) => t.id === id)
}

/**
 * A name to the id it would get, or why it can't have one.
 *
 * The slug is the metric prefix and is frozen at creation, so this runs once — when the tracker
 * is made. Renaming later leaves the id alone, which is the whole reason the two are separate
 * fields.
 *
 * Collision matters more than it looks. Metric names are split at their *last* underscore, so
 * every name has exactly one reading: `bench_press_g` can only ever be prefix `bench_press` and
 * suffix `g`. That makes prefix equality the only way two things can collide — and `_deleted` is
 * shared by both kinds, so an exercise called Run and a tracker called Run would produce one
 * `run_deleted` series voiding samples in both.
 */
export function validateTrackerName(
  name: string,
  existing: Tracker[],
): { id: string } | { error: string } {
  const trimmed = name.trim()
  if (!trimmed) return { error: "Give it a name." }

  const id = slug(trimmed)
  if (!id) return { error: "The name needs a letter or a number in it." }

  if (HEALTHKIT.has(id)) {
    return { error: `Apple Health already logs ${trimmed.toLowerCase()}. Pick another name.` }
  }
  if (MACRO_PREFIXES.has(id)) {
    return { error: `That's a macro — log it on a food instead.` }
  }
  if (EXERCISE_PREFIXES.has(id)) {
    return { error: `An exercise is already called that. Pick another name.` }
  }
  if (existing.some((t) => t.id === id)) {
    return { error: "You already have one of those." }
  }
  return { id }
}

/**
 * A metric prefix back to a display name, for a tracker rebuilt from the remote.
 *
 * The store holds numbers, so a pull can recover that `creatine_g` exists and what it measured,
 * but not what it was called. Title-casing the slug is the closest honest guess.
 */
export function nameFromPrefix(prefix: string): string {
  return prefix
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/**
 * A tracker for a prefix that came back from the remote with nothing local to match it.
 *
 * `mode` and `target` are unrecoverable — a number store can't say whether four samples in a day
 * were four meals or four measurements — so this guesses `sum`, the commoner case, and marks
 * itself `recovered` so Settings can say so rather than pretending it knows.
 */
export function recoveredTracker(prefix: string, unit: TrackerUnit): Tracker {
  return { id: prefix, name: nameFromPrefix(prefix), unit, mode: "sum", recovered: true }
}

/**
 * Fuzzy search across metrics, scored the same way exercises are so one query can rank both.
 *
 * Matches the name and the unit, so "protein" and "kcal" both find something, and an empty query
 * returns nothing — the caller shows its sections instead.
 */
export function searchTrackers(query: string, trackers: Tracker[]): Tracker[] {
  if (!query.trim()) return []
  const scored: { tracker: Tracker; score: number }[] = []
  for (const tracker of trackers) {
    const byName = fuzzyScoreTerms(query, tracker.name)
    const byUnit = fuzzyScoreTerms(query, `${tracker.name} ${tracker.unit}`)
    const score = Math.max(byName ?? -Infinity, byUnit ?? -Infinity)
    if (Number.isFinite(score)) scored.push({ tracker, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.tracker)
}
