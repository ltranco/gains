/**
 * How an exercise is measured. This is the axis that decides which inputs the set-entry
 * sheet shows, and it is not always what intuition says:
 *
 *   - Pull ups and dips look rep-based but belong to `weight_reps`, because you can hang a
 *     belt off yourself. Bodyweight is just `weightKg: 0` in that scheme, so the ladder
 *     from bodyweight to +20kg is one continuous series rather than two.
 *   - Push ups genuinely are `reps`. Nobody logs a weighted push up, and offering a weight
 *     field would be noise on every single entry.
 */
export type Kind = "weight_reps" | "reps" | "duration" | "distance"

export type Group = "push" | "pull" | "legs" | "core" | "cardio"

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "smith"
  | "ez_bar"
  | "t_bar"
  | "trap_bar"
  | "kettlebell"
  | "band"
  | "bodyweight"

export interface Exercise {
  /** `movement.equipment`, slugged — e.g. `bicep_curl.dumbbell`. Stable; never reuse. */
  id: string
  /** The movement on its own, shared across implements: `Bicep Curl`. */
  movement: string
  equipment: Equipment
  group: Group
  kind: Kind
}

/**
 * One logged set. Numeric fields are always SI — kilograms, seconds, metres — with
 * imperial applied at the display boundary only. Fields irrelevant to the exercise's
 * `kind` are absent rather than zero, so `weightKg: 0` unambiguously means bodyweight.
 */
export interface SetEntry {
  id: string
  exerciseId: string
  /** Local calendar day, `YYYY-MM-DD`. Not derived from `loggedAt` — see lib/date.ts. */
  date: string
  /** ISO instant, used only for ordering within a day. */
  loggedAt: string
  reps?: number
  weightKg?: number
  durationSec?: number
  distanceM?: number
  note?: string
}

export type UnitSystem = "metric" | "imperial"
export type ThemeChoice = "system" | "light" | "dark"
export type ClockFormat = "24h" | "12h"
export type AccentChoice =
  | "indigo"
  | "blue"
  | "teal"
  | "green"
  | "orange"
  | "red"
  | "violet"

export interface Prefs {
  units: UnitSystem
  theme: ThemeChoice
  clock: ClockFormat
  /** A preset key from `lib/accents.ts`, or any `#rrggbb`. */
  accent: string
}

/**
 * Where derived metrics get pushed. Deliberately *not* part of GainsState: that document is
 * what gets exported, and a bearer token has no business travelling inside it. Lives under
 * its own storage key.
 */
export interface RemoteConfig {
  /** Where samples are POSTed. The shim's ingest contract. */
  url: string
  /** Optional. VictoriaMetrics' export endpoint, for reading the log back. */
  readUrl?: string
  /** One bearer token, used for both directions. */
  token: string
  /** Push anything new once a minute, without being asked. */
  autoPush?: boolean
  lastSyncedAt?: string
  /**
   * Set id -> fingerprint of what was last sent. Lets a push skip sets already stored, and
   * lets the UI tell you which sets have since been edited or deleted locally — neither of
   * which can propagate to an append-only store.
   */
  pushed?: Record<string, string>
}

export interface GainsState {
  version: 1
  sets: SetEntry[]
  prefs: Prefs
}

export const GROUP_LABEL: Record<Group, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  core: "Core",
  cardio: "Cardio",
}

export const GROUP_ORDER: Group[] = ["push", "pull", "legs", "core", "cardio"]

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  machine: "Machine",
  cable: "Cable",
  smith: "Smith Machine",
  ez_bar: "EZ Bar",
  t_bar: "T-Bar",
  trap_bar: "Trap Bar",
  kettlebell: "Kettlebell",
  band: "Band",
  bodyweight: "Bodyweight",
}
