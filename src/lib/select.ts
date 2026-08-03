import { byId } from "./catalog"
import { MACROS, macroTotals, targetFor, type Macro } from "./food"
import type { Exercise, FoodEntry, Kind, MacroTargets, Reading, SetEntry, Tracker } from "./types"

export interface DayEntry {
  exercise: Exercise
  sets: SetEntry[]
}

/**
 * A day's sets grouped by exercise, in the order each exercise was first logged that day —
 * not alphabetical. The order you did things in is the order you want to read them back,
 * and it doubles as a record of how the session actually ran.
 */
export function dayEntries(all: SetEntry[], date: string): DayEntry[] {
  const ofDay = all
    .filter((s) => s.date === date)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))

  const order: string[] = []
  const byExercise = new Map<string, SetEntry[]>()

  for (const s of ofDay) {
    const bucket = byExercise.get(s.exerciseId)
    if (bucket) {
      bucket.push(s)
    } else {
      byExercise.set(s.exerciseId, [s])
      order.push(s.exerciseId)
    }
  }

  const out: DayEntry[] = []
  for (const id of order) {
    const exercise = byId(id)
    // An unknown id means the catalog dropped an entry that history still references.
    // Skipping it would silently hide logged work, so surface it as its own movement.
    const resolved: Exercise =
      exercise ??
      { id, movement: id, equipment: "bodyweight", group: "core", kind: "reps" }
    out.push({ exercise: resolved, sets: byExercise.get(id) ?? [] })
  }
  return out
}

/** Most recent set of an exercise on or before `date`, used to prefill the entry sheet. */
export function lastSetOf(
  all: SetEntry[],
  exerciseId: string,
  date: string,
): SetEntry | undefined {
  return all
    .filter((s) => s.exerciseId === exerciseId && s.date <= date)
    .sort((a, b) => (a.date + a.loggedAt).localeCompare(b.date + b.loggedAt))
    .at(-1)
}

/** Exercise ids you've logged, most recently used first. Drives the picker's Recent list. */
export function recentExerciseIds(all: SetEntry[], limit = 8): string[] {
  const seen = new Map<string, string>()
  for (const s of all) {
    const stamp = `${s.date}T${s.loggedAt}`
    const prev = seen.get(s.exerciseId)
    if (!prev || stamp > prev) seen.set(s.exerciseId, stamp)
  }
  return [...seen.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, limit)
    .map(([id]) => id)
}

/** Day keys that have at least one set, newest first. */
export function loggedDays(all: SetEntry[]): string[] {
  return [...new Set(all.map((s) => s.date))].sort((a, b) => b.localeCompare(a))
}

/* ── Readings ────────────────────────────────────────────────────────────────── */

export interface MetricRow {
  reading: Reading
  tracker: Tracker
}

/** Chronological across days, for anything keyed by `date` + `loggedAt`. */
const byInstant = (a: { date: string; loggedAt: string }, b: { date: string; loggedAt: string }) =>
  `${a.date}T${a.loggedAt}`.localeCompare(`${b.date}T${b.loggedAt}`)

/**
 * A day's readings as one flat list, oldest first — the same shape the food section takes.
 *
 * Flat rather than grouped by metric. Grouping made sense when four macros were metrics and each
 * had several entries a day; what's left is a handful of things measured once, and a heading per
 * row is all heading and no rows.
 *
 * A reading whose metric no longer exists is dropped rather than shown as a bare number: without
 * the definition there is no name, no unit and no way to say what it measured.
 */
export function dayMetricRows(all: Reading[], trackers: Tracker[], date: string): MetricRow[] {
  const byId = new Map(trackers.map((t) => [t.id, t]))
  return all
    .filter((r) => r.date === date)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .flatMap((reading) => {
      const tracker = byId.get(reading.trackerId)
      return tracker ? [{ reading, tracker }] : []
    })
}

/**
 * Ids of readings that were a record *at the moment they were logged*, so old records stay marked
 * and the day reads as a history of when you moved the needle.
 *
 * Direction comes from the metric: a smaller waist is progress, a bigger lift is. A metric with no
 * direction gets no badge — a creatine dose is not a personal best, and a badge on every one would
 * be noise. The first reading of a metric is never marked; it beats nothing.
 *
 * Same rule as `personalRecordIds` for sets, deliberately: two different answers to "is this a
 * record" would be one too many.
 */
export function metricRecordIds(all: Reading[], trackers: Tracker[]): Set<string> {
  const byId = new Map(trackers.map((t) => [t.id, t]))
  const byTracker = new Map<string, Reading[]>()
  for (const r of all) {
    const bucket = byTracker.get(r.trackerId)
    if (bucket) bucket.push(r)
    else byTracker.set(r.trackerId, [r])
  }

  const records = new Set<string>()
  for (const [trackerId, readings] of byTracker) {
    const tracker = byId.get(trackerId)
    if (!tracker?.better) continue
    const improves = (value: number, best: number) =>
      tracker.better === "higher" ? value > best : value < best

    let best: number | null = null
    for (const reading of [...readings].sort(byInstant)) {
      if (best !== null && improves(reading.value, best)) records.add(reading.id)
      if (best === null || improves(reading.value, best)) best = reading.value
    }
  }
  return records
}

/**
 * A day's entries as one number, or undefined if nothing was logged.
 *
 * `sum` accumulates — four meals make one calorie total. `point` takes the last reading of the
 * day, because adding two waist measurements together would be nonsense and averaging them
 * would invent a number that was never measured.
 */
export function dayTotal(
  all: Reading[],
  tracker: Tracker,
  date: string,
): number | undefined {
  const ofDay = all
    .filter((r) => r.trackerId === tracker.id && r.date === date)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  if (ofDay.length === 0) return undefined
  return collapse(ofDay, tracker)
}

/** Expects `readings` already sorted oldest first. */
function collapse(readings: Reading[], tracker: Tracker): number {
  if (tracker.mode === "point") return readings[readings.length - 1]?.value ?? 0
  return round(readings.reduce((n, r) => n + r.value, 0))
}

// Float dust: 0.1 + 0.2 worth of protein entries should not render as 0.30000000000000004.
function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

/* ── Food ────────────────────────────────────────────────────────────────────── */

/** A day's food, oldest first — the order you ate it. */
export function dayFoods(all: FoodEntry[], date: string): FoodEntry[] {
  return all
    .filter((f) => f.date === date)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
}

export interface Progress {
  macro: Macro
  /** Logged so far today. Zero when nothing has been logged, so the ring still draws empty. */
  total: number
  target: number
  /** `total / target`, uncapped — over 1 means over target, which the ring shows as a second lap. */
  fraction: number
}

/**
 * Ring data for the day's macros, in the order `MACROS` declares.
 *
 * A macro with no target is skipped rather than drawn at zero. An arc is a fraction of something;
 * with no denominator there is nothing truthful to draw.
 */
export function dayProgress(
  all: FoodEntry[],
  targets: MacroTargets,
  date: string,
): Progress[] {
  const totals = macroTotals(dayFoods(all, date))
  const out: Progress[] = []
  for (const macro of MACROS) {
    const target = targetFor(targets, macro.key)
    if (target === undefined) continue
    const total = totals[macro.key]
    out.push({ macro, total, target, fraction: total / target })
  }
  return out
}

/** Day keys that have at least one reading, newest first. Feeds the date picker's dots. */
export function readingDays(all: Reading[]): string[] {
  return [...new Set(all.map((r) => r.date))].sort((a, b) => b.localeCompare(a))
}

export function foodDays(all: FoodEntry[]): string[] {
  return [...new Set(all.map((f) => f.date))].sort((a, b) => b.localeCompare(a))
}

/**
 * What counts as "more" for an exercise, as a tuple compared left to right.
 *
 * For loaded movements that's weight first, reps as the tiebreak — heaviest is the intuitive
 * max, and the tiebreak is what makes bodyweight work: pull ups sit at 0kg forever, so reps
 * decide, and the same rule covers a belt appearing later without a special case.
 */
function score(set: SetEntry, kind: Kind): number[] | null {
  switch (kind) {
    case "weight_reps":
      if (set.reps === undefined) return null
      return [set.weightKg ?? 0, set.reps]
    case "reps":
      return set.reps === undefined ? null : [set.reps]
    case "duration":
      return set.durationSec === undefined ? null : [set.durationSec]
    case "distance":
      return set.distanceM === undefined ? null : [set.distanceM]
  }
}

function beats(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

const chronologically = (a: SetEntry, b: SetEntry) =>
  `${a.date}T${a.loggedAt}`.localeCompare(`${b.date}T${b.loggedAt}`)

/**
 * Ids of sets that were a personal best *at the moment they were logged* — each is compared
 * only against what came before it, so old records stay marked and the day view reads as a
 * history of when you moved the needle rather than a single highlight on your all-time best.
 *
 * The first set of an exercise is never marked. It beats nothing, and flagging every debut
 * would put a badge on half an empty log.
 */
export function personalRecordIds(all: SetEntry[]): Set<string> {
  const byExercise = new Map<string, SetEntry[]>()
  for (const s of all) {
    const bucket = byExercise.get(s.exerciseId)
    if (bucket) bucket.push(s)
    else byExercise.set(s.exerciseId, [s])
  }

  const records = new Set<string>()
  for (const [exerciseId, sets] of byExercise) {
    const exercise = byId(exerciseId)
    if (!exercise) continue

    let best: number[] | null = null
    for (const set of [...sets].sort(chronologically)) {
      const current = score(set, exercise.kind)
      if (current === null) continue
      if (best !== null && beats(current, best)) records.add(set.id)
      if (best === null || beats(current, best)) best = current
    }
  }
  return records
}
