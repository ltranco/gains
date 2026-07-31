import { byId } from "./catalog"
import type { Exercise, SetEntry } from "./types"

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
