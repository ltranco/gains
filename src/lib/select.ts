import { byId } from "./catalog"
import type { Exercise, Kind, SetEntry } from "./types"

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
