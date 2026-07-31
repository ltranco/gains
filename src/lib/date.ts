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
 * An instant on `dayKey` at the current time of day.
 *
 * `loggedAt` used to be plain `new Date()`, which is wrong the moment you log against a past
 * day: the set filed under yesterday, but the metric sample it produces is stamped now, so it
 * lands on today in any chart. Same wall-clock time, correct calendar day — and for today this
 * is just now.
 */
export function instantOn(dayKey: string): string {
  const now = new Date()
  const d = fromDayKey(dayKey)
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
  return d.toISOString()
}

/**
 * `2026-07-31 14:32:58` — always 24-hour, never am/pm, seconds included.
 *
 * Not `toLocaleString()`, which picks 12- or 24-hour from the browser locale and lands on
 * "7/31/2026, 2:32:58 PM". Seconds matter here: two syncs a minute apart are common while
 * you're testing, and a stamp that can't tell them apart says nothing.
 */
export function formatStamp(iso: string | undefined): string {
  if (!iso) return "·"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "·"
  const p = (n: number) => n.toString().padStart(2, "0")
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

/**
 * `YYYY-MM-DDTHH:mm:ss.sss±HH:MM` — RFC3339 with a real local offset and milliseconds.
 *
 * This exact format matters. The metrics shim parses timestamp keys three ways, and the
 * epoch-millis path runs them through `int64(float64 * 1e9)`, which at 1.78e18 can't hold
 * nanoseconds: a `+1ms` key lands at `…000999936ns` and falls back into the previous
 * millisecond, where VictoriaMetrics' 1ms dedup discards it as a tie. RFC3339 goes through
 * `time.ParseInLocation` instead — exact integer arithmetic, no float, no lost revisions.
 */
export function rfc3339Local(d: Date): string {
  const p = (n: number, w = 2) => Math.abs(n).toString().padStart(w, "0")
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? "+" : "-"
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `.${p(d.getMilliseconds(), 3)}` +
    `${sign}${p(Math.floor(Math.abs(offsetMin) / 60))}:${p(Math.abs(offsetMin) % 60)}`
  )
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
