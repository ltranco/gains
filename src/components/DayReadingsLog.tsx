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
      {groups.map((group) => (
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
                  headline, and the entries below it are the working. Only worth showing when
                  there's more than one entry — otherwise it just repeats the row. */}
              {group.readings.length > 1 && (
                <span className="nums-quiet text-[12px]" style={{ color: "var(--text-faint)" }}>
                  {formatTracker(group.total, group.tracker, units)}
                </span>
              )}
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
                  <span
                    className="nums-quiet shrink-0 text-[12px]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {formatTime(reading.loggedAt, clock) ?? "--:--"}
                  </span>
                  <span className="nums truncate text-[15px]">
                    {formatTracker(reading.value, group.tracker, units)}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={`Delete ${group.tracker.name} entry`}
                  onClick={() => onDelete(reading, group.tracker)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-active)]"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash size={15} />
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
