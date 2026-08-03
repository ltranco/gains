import type { FoodEntry, MacroTargets } from "./types"

/**
 * Food, and the four macros that describe it.
 *
 * Macros are **not** metrics. They are fields of a thing you ate, and that distinction is the
 * whole design: an earlier version made Calories and Protein separate trackers you logged
 * independently, which meant recording a chicken bowl was four trips through a picker and left
 * nothing in the log that remembered it was one bowl. Nobody eats 48 g of protein.
 *
 * That also makes room for what comes later. A photo of a plate resolves to exactly this shape —
 * one item, four figures — so an inference service will build a `FoodEntry` and nothing else has
 * to change.
 *
 * ## Wire format
 *
 * A food writes one sample per macro, all at its own instant:
 *
 *   health_calories_kcal  620  @ 08:12:00
 *   health_protein_g       48  @ 08:12:00
 *   health_carbs_g         61  @ 08:12:00
 *   health_fat_g           22  @ 08:12:00
 *
 * Four series rather than one, because that is what a dashboard wants to sum. They share the one
 * timestamp, which is what lets a reader join them back into a single item — and why those four
 * prefixes are reserved names no custom metric may claim.
 *
 * The `name` does not survive. VictoriaMetrics stores numbers, so a pulled food comes back as its
 * macros with no label, the same limitation that loses a set's `note`.
 */

export type MacroKey = "kcal" | "protein" | "carbs" | "fat"

export interface Macro {
  key: MacroKey
  /** Metric prefix. Frozen — it is half the series name. */
  prefix: string
  /** Metric suffix, and the unit shown on screen. */
  unit: "kcal" | "g"
  label: string
  /** One letter for the row summary. Calories carry their unit instead. */
  short: string
  /** Field on `FoodEntry`. */
  field: "kcal" | "proteinG" | "carbsG" | "fatG"
  /** Stepper increment in the entry sheet. */
  step: number
}

/**
 * Order is load-bearing: it is the ring order, the field order in the sheet, and the order in the
 * row summary. Calories first because it's the number you look at.
 */
export const MACROS: Macro[] = [
  { key: "kcal", prefix: "calories", unit: "kcal", label: "Calories", short: "kcal", field: "kcal", step: 50 },
  { key: "protein", prefix: "protein", unit: "g", label: "Protein", short: "P", field: "proteinG", step: 5 },
  { key: "carbs", prefix: "carbs", unit: "g", label: "Carbs", short: "C", field: "carbsG", step: 5 },
  { key: "fat", prefix: "fat", unit: "g", label: "Fat", short: "F", field: "fatG", step: 5 },
]

/** The prefixes food owns. No custom metric may claim one — see `validateTrackerName`. */
export const MACRO_PREFIXES: Set<string> = new Set(MACROS.map((m) => m.prefix))

export function macroByPrefix(prefix: string): Macro | undefined {
  return MACROS.find((m) => m.prefix === prefix)
}

export function valueOf(food: FoodEntry, macro: Macro): number {
  return food[macro.field]
}

export type MacroTotals = Record<MacroKey, number>

const ZERO: MacroTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

/** A day's food added up. Always returns all four, so a ring can draw at zero. */
export function macroTotals(foods: FoodEntry[]): MacroTotals {
  const out: MacroTotals = { ...ZERO }
  for (const food of foods) {
    for (const macro of MACROS) out[macro.key] += valueOf(food, macro)
  }
  // Float dust: 0.1 + 0.2 worth of fat should not read as 0.30000000000000004.
  for (const macro of MACROS) out[macro.key] = Math.round(out[macro.key] * 1000) / 1000
  return out
}

/**
 * Energy per gram, the Atwater factors every nutrition label is computed with: 4 kcal for a gram of
 * protein or carbohydrate, 9 for a gram of fat.
 *
 * Which means calories are *derivable* from the other three, and the entry sheet does that rather
 * than asking for a number you'd have to read off separately. It stays overridable: a label's
 * stated calories and the sum of its rounded macros routinely disagree by a few percent, and the
 * label is the one you'd rather keep.
 */
const KCAL_PER_GRAM: Record<Exclude<MacroKey, "kcal">, number> = { protein: 4, carbs: 4, fat: 9 }

export function energyOf(macros: { protein: number; carbs: number; fat: number }): number {
  const total =
    macros.protein * KCAL_PER_GRAM.protein +
    macros.carbs * KCAL_PER_GRAM.carbs +
    macros.fat * KCAL_PER_GRAM.fat
  return Math.round(total)
}

export function targetFor(targets: MacroTargets, key: MacroKey): number | undefined {
  const t = targets[key]
  return typeof t === "number" && t > 0 ? t : undefined
}

/**
 * `48P 61C 22F 620kcal` — the whole food on one line.
 *
 * Macros first and calories last, tight against their letters, because the row also carries a
 * time and a name and this has to survive a 390px screen without pushing the name off it.
 */
export function summariseFood(food: FoodEntry): string {
  const macros = MACROS.filter((m) => m.key !== "kcal")
    .map((m) => `${trim(valueOf(food, m))}${m.short}`)
    .join(" ")
  return `${macros} ${trim(food.kcal)}kcal`
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/** What an unnamed food is called. A pulled one has no name — the store holds numbers only. */
export const UNNAMED_FOOD = "Food"

export function foodName(food: FoodEntry): string {
  return food.name.trim() || UNNAMED_FOOD
}
