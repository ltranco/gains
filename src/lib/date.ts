/**
 * Day keys are `YYYY-MM-DD` in the *local* calendar, built by hand rather than via
 * `toISOString()` — that converts to UTC first, so a set logged at 9pm Pacific would land on
 * tomorrow's date. The metrics repo hit the same class of bug from the other direction.
 */

export function toDayKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayKey(): string {
  return toDayKey(new Date())
}

/** Parses a day key as local midnight, not UTC midnight. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function shiftDay(key: string, days: number): string {
  const d = fromDayKey(key)
  d.setDate(d.getDate() + days)
  return toDayKey(d)
}

/** "Today", "Yesterday", or "Wed 30 Jul" — with the year only when it isn't this one. */
export function formatDayLabel(key: string): string {
  const today = todayKey()
  if (key === today) return "Today"
  if (key === shiftDay(today, -1)) return "Yesterday"
  if (key === shiftDay(today, 1)) return "Tomorrow"

  const d = fromDayKey(key)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}

export function isFuture(key: string): boolean {
  return key > todayKey()
}

/**
 * `loggedAt` → `14:32` or `2:32 pm`. Built by hand rather than via `toLocaleTimeString`,
 * which decides 12- vs 24-hour from the browser locale and so ignores the preference.
 * Returns null for sets with no usable timestamp — imported data may predate this field.
 */
export function formatTime(iso: string | undefined, clock: "24h" | "12h"): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null

  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, "0")

  if (clock === "24h") return `${h.toString().padStart(2, "0")}:${m}`
  const suffix = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${suffix}`
}
