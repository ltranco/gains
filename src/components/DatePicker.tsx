"use client"

import { useMemo, useState } from "react"

import { fromDayKey, isFuture, toDayKey, todayKey } from "@/lib/date"
import { Sheet } from "./Sheet"
import { ChevronLeft, ChevronRight } from "./icons"

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

/** Monday-start offset for a month's first cell. `getDay()` is Sunday-based. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })
}

/**
 * A real calendar rather than the native `<input type="date">`. The native control gives an
 * iOS wheel that's fine for picking a birthday and poor for "which day did I train" — it
 * can't show which days have anything logged, and it left the Today button loose in the
 * bottom bar where it shifted the layout every time it appeared.
 */
export function DatePicker({
  open,
  date,
  loggedDays,
  onPick,
  onClose,
}: {
  open: boolean
  date: string
  /** Day keys with at least one set, rendered as a dot. */
  loggedDays: Set<string>
  onPick: (next: string) => void
  onClose: () => void
}) {
  const selected = fromDayKey(date)
  const [view, setView] = useState({
    year: selected.getFullYear(),
    month: selected.getMonth(),
  })

  // Re-anchor the visible month whenever the sheet reopens on a different day.
  const [anchor, setAnchor] = useState(date)
  if (open && anchor !== date) {
    setAnchor(date)
    setView({ year: selected.getFullYear(), month: selected.getMonth() })
  }

  const cells = useMemo(() => {
    const { year, month } = view
    const days = new Date(year, month + 1, 0).getDate()
    const out: (string | null)[] = Array(leadingBlanks(year, month)).fill(null)
    for (let d = 1; d <= days; d++) out.push(toDayKey(new Date(year, month, d)))
    return out
  }, [view])

  const step = (delta: number) =>
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  const today = todayKey()
  // No month past the current one has anything to show.
  const nextDisabled =
    view.year > new Date().getFullYear() ||
    (view.year === new Date().getFullYear() && view.month >= new Date().getMonth())

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Jump to a day"
      footer={
        <button
          type="button"
          onClick={() => onPick(today)}
          disabled={date === today}
          className="w-full rounded-lg py-2.5 text-[15px] font-semibold transition-colors disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          Today
        </button>
      }
    >
      <div className="px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <NavButton label="Previous month" onClick={() => step(-1)}>
            <ChevronLeft size={17} />
          </NavButton>
          <span className="text-[14px] font-semibold">
            {monthLabel(view.year, view.month)}
          </span>
          <NavButton label="Next month" onClick={() => step(1)} disabled={nextDisabled}>
            <ChevronRight size={17} />
          </NavButton>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((d, i) => (
            <div
              key={i}
              className="pb-1 text-center text-[11px] font-medium"
              style={{ color: "var(--text-faint)" }}
            >
              {d}
            </div>
          ))}

          {cells.map((key, i) =>
            key === null ? (
              <div key={`blank-${i}`} />
            ) : (
              <DayCell
                key={key}
                dayKey={key}
                selected={key === date}
                isToday={key === today}
                hasLog={loggedDays.has(key)}
                disabled={isFuture(key)}
                onPick={onPick}
              />
            ),
          )}
        </div>
      </div>
    </Sheet>
  )
}

function DayCell({
  dayKey,
  selected,
  isToday,
  hasLog,
  disabled,
  onPick,
}: {
  dayKey: string
  selected: boolean
  isToday: boolean
  hasLog: boolean
  disabled: boolean
  onPick: (key: string) => void
}) {
  const day = Number(dayKey.slice(-2))

  return (
    <button
      type="button"
      onClick={() => onPick(dayKey)}
      disabled={disabled}
      aria-current={selected ? "date" : undefined}
      className="nums-quiet relative flex aspect-square items-center justify-center rounded-md text-[14px] transition-colors disabled:pointer-events-none disabled:opacity-25"
      style={
        selected
          ? { background: "var(--accent)", color: "var(--accent-text)", fontWeight: 700 }
          : isToday
            ? { boxShadow: "inset 0 0 0 1px var(--border-strong)" }
            : undefined
      }
    >
      {day}
      {/* A dot for days with sets — the reason to use a calendar over a wheel. */}
      {hasLog && !selected && (
        <span
          className="absolute bottom-[5px] size-[3px] rounded-full"
          style={{ background: "var(--accent)" }}
        />
      )}
    </button>
  )
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-25"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </button>
  )
}
