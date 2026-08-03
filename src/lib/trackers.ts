import { CATALOG } from "./catalog"
import { fuzzyScoreTerms } from "./fuzzy"
import { prefixOf, slug } from "./samples"
import type { Tracker, TrackerUnit } from "./types"

/**
 * Trackers: the things you log as one number rather than as a set. Calories, protein, waist.
 *
 * The counterpart to `lib/catalog.ts`, and deliberately much smaller. An exercise needs two axes
 * because a movement is done with different implements; a tracker is just a name, a unit, and how
 * a day's entries collapse. Everything else about it — how it's pushed, how it comes back, how a
 * deletion propagates — is the machinery the exercise log already had.
 *
 * ## Builtins vs custom
 *
 * Builtins live here, in code, so shipping a new one reaches every device without migrating
 * stored data. Custom trackers live in `GainsState`, because they're data: they have to survive
 * an export and come back.
 *
 * Editing a builtin — a different calorie target, a shorter name — stores a full copy under the
 * same id, which shadows the builtin. That keeps one merge rule instead of a separate overrides
 * document that could disagree with itself.
 *
 * ## What is deliberately absent
 *
 * **No bodyweight, and no step count.** HealthKit already pushes `health_weight` and
 * `health_step` from an iOS Shortcut. A second writer on those series would mean two lines that
 * disagree whenever both were used, and a deletion here would tombstone a HealthKit sample. Those
 * slugs are reserved and rejected — see `validateTrackerName`.
 */

/**
 * Targets ship set rather than blank. A ring needs a whole to be an arc, so shipping them empty
 * would mean the rings show nothing at all until you've been through Settings — a feature that
 * looks broken on first run. These are a lifter's plausible defaults, not a recommendation;
 * Settings changes them.
 */
export const BUILTIN_TRACKERS: Tracker[] = [
  { id: "calories", name: "Calories", unit: "kcal", mode: "sum", nutrition: true, target: 2200 },
  { id: "protein", name: "Protein", unit: "g", mode: "sum", nutrition: true, target: 180 },
  { id: "carbs", name: "Carbs", unit: "g", mode: "sum", nutrition: true, target: 220 },
  { id: "fat", name: "Fat", unit: "g", mode: "sum", nutrition: true, target: 70 },
  // Point, not sum: two waist measurements in a day are one waist, not a bigger one.
  { id: "waist", name: "Waist", unit: "cm", mode: "point" },
]

/** Metric prefixes the exercise catalog already owns, so a tracker can't claim one. */
const EXERCISE_PREFIXES: Set<string> = new Set(CATALOG.map(prefixOf))

/**
 * Slugs that belong to the iOS Shortcut's half of the store.
 *
 * `ingest` is the shim's own heartbeat. All three are single-token names, which is why the
 * exercise read selector never saw them; a tracker claiming one would start writing to them.
 */
const RESERVED = new Set(["weight", "step", "ingest"])

/**
 * Builtins with stored copies shadowing them, then anything custom, in creation order.
 *
 * Order is the display order everywhere — the picker, the rings, Settings — so it's fixed here
 * once rather than re-sorted per screen.
 */
export function allTrackers(stored: Tracker[]): Tracker[] {
  const byId = new Map(stored.map((t) => [t.id, t]))
  const out = BUILTIN_TRACKERS.map((b) => byId.get(b.id) ?? b)
  const builtinIds = new Set(BUILTIN_TRACKERS.map((b) => b.id))
  for (const t of stored) {
    if (!builtinIds.has(t.id)) out.push(t)
  }
  return out
}

export function trackerById(trackers: Tracker[], id: string): Tracker | undefined {
  return trackers.find((t) => t.id === id)
}

export function isBuiltin(id: string): boolean {
  return BUILTIN_TRACKERS.some((b) => b.id === id)
}

/** Nutrition trackers, in order. These are what the Food button and the rings show. */
export function nutritionTrackers(trackers: Tracker[]): Tracker[] {
  return trackers.filter((t) => t.nutrition)
}

/** Everything else — body measurements and whatever else you've added. */
export function otherTrackers(trackers: Tracker[]): Tracker[] {
  return trackers.filter((t) => !t.nutrition)
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

  if (RESERVED.has(id)) {
    return { error: `Apple Health already logs ${trimmed.toLowerCase()}. Pick another name.` }
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
 * Fuzzy search across trackers, scored the same way exercises are so one query can rank both.
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
