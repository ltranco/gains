"use client"

import { formatTime } from "@/lib/date"
import type { DayReadings } from "@/lib/select"
import type { ClockFormat, Reading, Tracker, UnitSystem } from "@/lib/types"
import { formatTracker } from "@/lib/units"
import { Plus, Trash } from "./icons"

/**
 * The day's readings, entry by entry. Same row language as `DayLog` — clock on the left, value in
 * the mono face, one tap to edit and one to delete — because they're the same kind of thing to
 * read back, and a second visual grammar for numbers would be one grammar too many.
 *
 * It sits *below* the exercise log on purpose. The rings above already answer "how am I doing
 * today"; this answers "which entry was wrong", which is a rarer question and doesn't deserve to
 * push the workout down the screen.
 *
 * Nothing renders on a day with no readings, so a pure lifting day looks exactly as it did before
 * any of this existed.
 *
 * ## One entry collapses to one line
 *
 * Where an exercise almost always has several sets under its name, a metric usually has one
 * number. Borrowing the header-plus-rows shape unaltered spent two lines saying what fits on
 * one, and four metrics logged once each filled the screen with headings. So a lone entry is a
 * single row and several stay grouped — the same rule as the total, which only appears when
 * there's more than one number for it to be the total of.
 */
export function DayReadingsLog({
  groups,
  units,
  clock,
  onAddTo,
  onEdit,
  onDelete,
}: {
  groups: DayReadings[]
  units: UnitSystem
  clock: ClockFormat
  onAddTo: (tracker: Tracker) => void
  onEdit: (tracker: Tracker, reading: Reading) => void
  onDelete: (reading: Reading, tracker: Tracker) => void
}) {
  if (groups.length === 0) return null

  return (
    <ul className="flex flex-col">
      {groups.map((group) =>
        group.readings.length === 1 ? (
          <li key={group.tracker.id} className="flex items-center border-b px-3 last:border-b-0">
            <button
              type="button"
              onClick={() => onEdit(group.tracker, group.readings[0]!)}
              className="flex min-w-0 flex-1 items-baseline gap-3 py-2.5 pl-1 text-left"
            >
              <span
                className="min-w-0 flex-1 truncate text-[14px]"
                style={{ color: "var(--text-muted)" }}
              >
                {group.tracker.name}
              </span>
              <Clock at={group.readings[0]!.loggedAt} clock={clock} />
              <span className="nums shrink-0 text-[15px]">
                {formatTracker(group.readings[0]!.value, group.tracker, units)}
              </span>
            </button>
            <RowAction label={`Add ${group.tracker.name}`} onClick={() => onAddTo(group.tracker)}>
              <Plus size={15} />
            </RowAction>
            <RowAction
              label={`Delete ${group.tracker.name} entry`}
              onClick={() => onDelete(group.readings[0]!, group.tracker)}
              danger
            >
              <Trash size={15} />
            </RowAction>
          </li>
        ) : (
          <li key={group.tracker.id} className="border-b px-3 py-3 last:border-b-0">
            <div className="mb-1 flex items-baseline justify-between gap-3 pl-1">
              <h2
                className="min-w-0 truncate text-[14px] font-normal tracking-[-0.005em]"
                style={{ color: "var(--text-muted)" }}
              >
                {group.tracker.name}
              </h2>

              <div className="flex shrink-0 items-baseline gap-2">
                {/* The day's one number, beside the name rather than as a footer row: it's the
                    headline, and the entries below it are the working. */}
                <span className="nums-quiet text-[12px]" style={{ color: "var(--text-faint)" }}>
                  {formatTracker(group.total, group.tracker, units)}
                </span>
                <button
                  type="button"
                  onClick={() => onAddTo(group.tracker)}
                  aria-label={`Add ${group.tracker.name}`}
                  className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-faint)" }}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            <ul className="flex flex-col">
              {group.readings.map((reading) => (
                <li
                  key={reading.id}
                  className="flex items-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <button
                    type="button"
                    onClick={() => onEdit(group.tracker, reading)}
                    className="flex min-w-0 flex-1 items-baseline gap-3 py-2 pl-1 text-left"
                  >
                    <Clock at={reading.loggedAt} clock={clock} />
                    <span className="nums truncate text-[15px]">
                      {formatTracker(reading.value, group.tracker, units)}
                    </span>
                  </button>

                  <RowAction
                    label={`Delete ${group.tracker.name} entry`}
                    onClick={() => onDelete(reading, group.tracker)}
                    danger
                  >
                    <Trash size={15} />
                  </RowAction>
                </li>
              ))}
            </ul>
          </li>
        ),
      )}
    </ul>
  )
}

function Clock({ at, clock }: { at: string; clock: ClockFormat }) {
  return (
    <span className="nums-quiet shrink-0 text-[12px]" style={{ color: "var(--text-faint)" }}>
      {formatTime(at, clock) ?? "--:--"}
    </span>
  )
}

function RowAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-active)]"
      style={{ color: danger ? "var(--danger)" : "var(--text-faint)" }}
    >
      {children}
    </button>
  )
}
