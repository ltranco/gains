import type { UnitSystem } from "./types"

/**
 * Storage is metric, always — kilograms, metres, seconds. Imperial exists only as a
 * transform applied on the way to the screen and undone on the way back in. Nothing here
 * writes to storage; if you find yourself wanting a `toImperial` that persists, don't.
 */

const LB_PER_KG = 2.2046226218
const MI_PER_KM = 0.6213711922

export const kgToLb = (kg: number): number => kg * LB_PER_KG
export const lbToKg = (lb: number): number => lb / LB_PER_KG

export const weightUnit = (u: UnitSystem): string => (u === "metric" ? "kg" : "lb")
export const distanceUnit = (u: UnitSystem): string => (u === "metric" ? "km" : "mi")

/**
 * Trim trailing zeros and group thousands: 14 not 14.0, 14.5 not 14.50, 1,250 not 1250.
 * Grouping matters more than it looks — `10000` and `1000` are one glance apart in a mono
 * column, `10,000` and `1,000` are not.
 */
function trim(n: number, places: number): string {
  const rounded = Number(n.toFixed(places))
  const [whole = "0", frac] = Math.abs(rounded).toString().split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const sign = rounded < 0 ? "-" : ""
  return `${sign}${grouped}${frac ? `.${frac}` : ""}`
}

/** Whole counts — reps — with the same grouping, so 1,000 never renders as 1000. */
export function formatCount(n: number | undefined): string {
  if (n === undefined) return "—"
  return trim(n, 0)
}

/** Strips grouping commas before parsing, so a value we rendered can be typed back in. */
function numeric(input: string): number {
  return Number(input.trim().replace(/,/g, ""))
}

/** Canonical kg → display string, without a unit suffix. */
export function weightValue(kg: number, u: UnitSystem): string {
  return trim(u === "metric" ? kg : kgToLb(kg), 1)
}

/**
 * Renders load for a `weight_reps` set.
 *
 * There is no bodyweight special case. A pull up records the weight that actually moved —
 * your bodyweight, plus a belt if you wore one — the same as any other loaded movement.
 * Storing 0 and printing "BW" made every bodyweight set contribute nothing to volume, which
 * is wrong at the point it matters most: the derived metrics.
 */
export function formatLoad(kg: number | undefined, u: UnitSystem): string {
  if (kg === undefined) return "—"
  return `${weightValue(kg, u)} ${weightUnit(u)}`
}

/** Display number → canonical kg. Returns undefined for unparseable input. */
export function parseWeight(input: string, u: UnitSystem): number | undefined {
  const n = numeric(input)
  if (!Number.isFinite(n) || n < 0) return undefined
  return u === "metric" ? n : lbToKg(n)
}

export const mToKm = (m: number): number => m / 1000
export const kmToM = (km: number): number => km * 1000

export function distanceValue(m: number, u: UnitSystem): string {
  const km = mToKm(m)
  return trim(u === "metric" ? km : km * MI_PER_KM, 2)
}

export function formatDistance(m: number | undefined, u: UnitSystem): string {
  if (m === undefined) return "—"
  return `${distanceValue(m, u)} ${distanceUnit(u)}`
}

export function parseDistance(input: string, u: UnitSystem): number | undefined {
  const n = numeric(input)
  if (!Number.isFinite(n) || n < 0) return undefined
  return u === "metric" ? kmToM(n) : kmToM(n / MI_PER_KM)
}

/** Seconds → `1:30`, or `1:02:30` once it passes an hour. */
export function formatDuration(sec: number | undefined): string {
  if (sec === undefined) return "—"
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

/**
 * Accepts `90`, `1:30` or `1:02:30`. A bare number is seconds, which is what someone typing
 * a plank time into a number pad means. Duration is unit-free — no imperial variant.
 */
export function parseDuration(input: string): number | undefined {
  const raw = input.trim()
  if (!raw) return undefined
  const parts = raw.split(":")
  if (parts.length === 1) {
    const n = Number(parts[0])
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined
  }
  if (parts.length > 3) return undefined
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return undefined
  return nums.reduce((acc, n) => acc * 60 + n, 0)
}

export function parseReps(input: string): number | undefined {
  const n = numeric(input)
  if (!Number.isInteger(n) || n <= 0) return undefined
  return n
}
