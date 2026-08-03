"use client"

import { formatTime } from "@/lib/date"
import type { MetricRow } from "@/lib/select"
import type { ClockFormat, Reading, Tracker, UnitSystem } from "@/lib/types"
import { formatTracker } from "@/lib/units"
import { Duplicate, Trash } from "./icons"

/**
 * The day's metrics: one section, one row per reading, in the order they were logged.
 *
 * The same grammar as the food section and an exercise block — heading, then time, name, value,
 * duplicate, delete, with the row itself opening the editor. That repetition is the point: three
 * kinds of thing are logged here and there is one way to read a row back.
 *
 * Flat rather than a section per metric. Grouping earned its keep when four macros lived here and
 * each had several entries a day; what's left is a handful of things measured once, where a heading
 * per row is all heading and no rows.
 */
export function MetricsLog({
  rows,
  units,
  clock,
  records,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  rows: MetricRow[]
  units: UnitSystem
  clock: ClockFormat
  /** Reading ids that were a record when logged. */
  records: Set<string>
  onEdit: (tracker: Tracker, reading: Reading) => void
  onDuplicate: (reading: Reading) => void
  onDelete: (reading: Reading, tracker: Tracker) => void
}) {
  if (rows.length === 0) return null

  return (
    <section className="border-b px-3 py-3 last:border-b-0">
      {/* No add button on the heading: the caret beside Food already opens this, and a second
          copy here was duplication. */}
      <div className="mb-1 pl-1">
        <h2
          className="truncate text-[14px] font-normal tracking-[-0.005em]"
          style={{ color: "var(--text-muted)" }}
        >
          Metrics
        </h2>
      </div>

      <ul className="flex flex-col">
        {rows.map(({ reading, tracker }) => {
          const isRecord = records.has(reading.id)
          return (
            <li
              key={reading.id}
              className="flex items-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            >
              <button
                type="button"
                onClick={() => onEdit(tracker, reading)}
                className="flex min-w-0 flex-1 items-baseline gap-2.5 py-2 pl-1 text-left"
              >
                <span
                  className="nums-quiet shrink-0 text-[12px]"
                  style={{ color: "var(--text-faint)" }}
                >
                  {formatTime(reading.loggedAt, clock) ?? "--:--"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px]">{tracker.name}</span>
                {/* A label as well as the colour: colour alone is invisible to anyone who can't
                    distinguish it, and "PR" is the thing you're actually looking for. */}
                {isRecord && (
                  <span
                    className="shrink-0 rounded px-1.5 py-[3px] text-[9px] leading-none font-bold tracking-[0.09em]"
                    style={{
                      color: "var(--accent)",
                      background: "color-mix(in srgb, var(--accent) 13%, transparent)",
                    }}
                    title={`Best ${tracker.better === "lower" ? "low" : "high"} so far`}
                  >
                    PR
                  </span>
                )}
                <span
                  className="nums shrink-0 text-[15px]"
                  style={isRecord ? { color: "var(--accent)" } : undefined}
                >
                  {formatTracker(reading.value, tracker, units)}
                </span>
              </button>

              <RowAction label={`Duplicate ${tracker.name}`} onClick={() => onDuplicate(reading)}>
                <Duplicate size={15} />
              </RowAction>
              <RowAction
                label={`Delete ${tracker.name}`}
                onClick={() => onDelete(reading, tracker)}
                danger
              >
                <Trash size={15} />
              </RowAction>
            </li>
          )
        })}
      </ul>
    </section>
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
