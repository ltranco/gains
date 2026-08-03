/**
 * How an exercise is measured. This is the axis that decides which inputs the set-entry
 * sheet shows, and it is not always what intuition says:
 *
 *   - Pull ups and dips look rep-based but belong to `weight_reps`, because you can hang a
 *     belt off yourself. `weightKg` is the real load that moved — your bodyweight, plus a
 *     belt if you wore one — so the ladder from bodyweight to +20kg is one continuous
 *     series rather than two. There is no zero sentinel; see lib/units.ts.
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
  /** Alternative names for search only. Never displayed, never stored. */
  also?: string[]
}

/**
 * One logged set. Numeric fields are always SI — kilograms, seconds, metres — with
 * imperial applied at the display boundary only. Fields irrelevant to the exercise's
 * `kind` are absent rather than zero, so a missing `weightKg` is a gap, never "no load".
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

/* ── Food: what you ate, with its macros ─────────────────────────────────────── */

/**
 * One thing you ate. A meal is a *food*, not four unrelated numbers — nobody logs "48 g of
 * protein", they log a chicken bowl that happened to contain it. This is also the shape an
 * inference service will hand back from a photo of a plate: one item, four figures.
 *
 * Macros are absent rather than zero when they weren't recorded, with one exception: a food
 * genuinely containing no fat stores `0`, because "no fat" and "didn't say" are different facts.
 * The entry sheet writes 0 for a blank macro on purpose — you are reading a label, and a blank
 * there means none.
 */
export interface FoodEntry {
  id: string
  /** Local calendar day, `YYYY-MM-DD`. Not derived from `loggedAt` — see lib/date.ts. */
  date: string
  /** The instant, which is also its identity remotely. */
  loggedAt: string
  /** What you ate. Display only — a number store can't hold it, so it never comes back. */
  name: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  note?: string
}

/** A daily target per macro. Any of them may be unset, in which case that ring isn't drawn. */
export interface MacroTargets {
  kcal?: number
  protein?: number
  carbs?: number
  fat?: number
}

/* ── Metrics: the custom things logged as one number ─────────────────────────── */

/**
 * The unit a tracker records in, and the metric-name suffix it pushes under.
 *
 * Deliberately disjoint from the exercise measures (`weight`, `reps`, `volume`, `seconds`,
 * `metres`) — metric names are split at their last underscore, so an overlapping suffix would
 * make `<something>_weight` readable two ways with no way to tell which was meant.
 *
 * `cm` is the only one that is a display transform away from what you'd type: it stores
 * centimetres and shows inches under imperial, same rule as kilograms. The rest are
 * unit-system-neutral — a gram is a gram.
 */
export type TrackerUnit = "kcal" | "g" | "mg" | "ml" | "cm" | "count" | "pct"

export const TRACKER_UNITS: TrackerUnit[] = ["kcal", "g", "mg", "ml", "cm", "count", "pct"]

/** What the unit is called on screen. `cm` is resolved against the unit system instead. */
export const UNIT_LABEL: Record<TrackerUnit, string> = {
  kcal: "kcal",
  g: "g",
  mg: "mg",
  ml: "ml",
  cm: "cm",
  count: "×",
  pct: "%",
}

/**
 * How a day's worth of entries collapses into one number.
 *
 * `sum` is a quantity you accumulate — four meals make one calorie total. `point` is a reading
 * of something that already had a value before you measured it; adding two waist measurements
 * together would be nonsense, so the latest one wins.
 */
export type TrackerMode = "sum" | "point"

/**
 * A thing you log a single number for: a waist measurement, a creatine dose. The counterpart to
 * `Exercise`, and deliberately *not* where macros live — those are fields of a `FoodEntry`.
 *
 * Builtins live in `lib/trackers.ts`; anything else is user-defined and lives in `GainsState`,
 * because a custom metric is data — it has to survive an export and come back.
 */
export interface Tracker {
  /** Slug, frozen at creation. This is the metric prefix, so renaming must never touch it. */
  id: string
  /** Display text. Freely editable, unlike `id`. */
  name: string
  unit: TrackerUnit
  mode: TrackerMode
  /** Daily target, for the rare metric that has one. */
  target?: number
  /** Rebuilt from the remote on pull, so its `mode` is a guess. */
  recovered?: boolean
}

/**
 * One logged number. The counterpart to `SetEntry`, and stored the same way: `date` is the
 * local calendar day, `loggedAt` is the instant — which is also its identity remotely.
 */
export interface Reading {
  id: string
  trackerId: string
  /** Local calendar day, `YYYY-MM-DD`. Not derived from `loggedAt` — see lib/date.ts. */
  date: string
  loggedAt: string
  /** In the tracker's own unit. */
  value: number
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
  /** What the rings are fractions of. Preferences rather than data — nothing is logged here. */
  macros: MacroTargets
}

/**
 * What was sent for one entry, and where it landed.
 *
 * `fp` detects a local edit. `at` is the millisecond timestamp the samples were written at, which
 * is the only way to address them once the entry no longer exists locally — a tombstone has to
 * point somewhere. `prefixes` is every series it wrote, because a food wrote four and all four
 * have to be retracted together.
 */
export interface PushRecord {
  fp: string
  at: number
  prefixes: string[]
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
  /** Entry id -> what was sent and where it landed. */
  pushed?: Record<string, PushRecord>
}

/**
 * The exported document. `version` went to 2 when food and metrics arrived; there is no migration
 * step because the parser fills missing fields, so a v1 export loads with no food, no readings and
 * no custom metrics rather than failing.
 *
 * `trackers` holds user-defined metrics only. Builtins are code, so shipping a new one reaches
 * every device without touching stored data.
 */
export interface GainsState {
  version: 2
  sets: SetEntry[]
  foods: FoodEntry[]
  readings: Reading[]
  trackers: Tracker[]
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
