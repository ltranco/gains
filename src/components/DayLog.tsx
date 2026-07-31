"use client"

import { displayName } from "@/lib/catalog"
import { formatTime } from "@/lib/date"
import type { DayEntry } from "@/lib/select"
import type { ClockFormat, Exercise, SetEntry, UnitSystem } from "@/lib/types"
import { summarise } from "./SetEntrySheet"
import { Duplicate, Plus, Trash } from "./icons"

export function DayLog({
  entries,
  units,
  clock,
  onAddTo,
  onEdit,
  onDuplicate,
  onDelete,
  records,
}: {
  entries: DayEntry[]
  units: UnitSystem
  clock: ClockFormat
  onAddTo: (ex: Exercise) => void
  onEdit: (ex: Exercise, set: SetEntry) => void
  onDuplicate: (set: SetEntry) => void
  onDelete: (set: SetEntry, ex: Exercise) => void
  /** Set ids that were a personal best when logged. */
  records: Set<string>
}) {
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <li key={entry.exercise.id} className="border-b px-3 py-3 last:border-b-0">
          <div className="mb-1 flex items-baseline justify-between gap-3 pl-1">
            {/* Light against the mono 700 values below it — the exercise names the row, the
                numbers are what you're actually reading. */}
            <h2
              className="min-w-0 truncate text-[14px] font-normal tracking-[-0.005em]"
              style={{ color: "var(--text-muted)" }}
            >
              {displayName(entry.exercise)}
            </h2>
            <button
              type="button"
              onClick={() => onAddTo(entry.exercise)}
              aria-label={`Add a set of ${displayName(entry.exercise)}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-faint)" }}
            >
              <Plus size={15} />
            </button>
          </div>

          <ul className="flex flex-col">
            {entry.sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                exercise={entry.exercise}
                units={units}
                clock={clock}
                onEdit={() => onEdit(entry.exercise, set)}
                onDuplicate={() => onDuplicate(set)}
                onDelete={() => onDelete(set, entry.exercise)}
                isRecord={records.has(set.id)}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/**
 * One tap to edit, one tap to duplicate, one tap to delete — no menu in between. The clock
 * column replaces the set index: the ordinal was derivable from position anyway, whereas when
 * you did the set is information nothing else carries.
 */
function SetRow({
  set,
  exercise,
  units,
  clock,
  onEdit,
  onDuplicate,
  onDelete,
  isRecord,
}: {
  set: SetEntry
  exercise: Exercise
  units: UnitSystem
  clock: ClockFormat
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  isRecord: boolean
}) {
  const time = formatTime(set.loggedAt, clock)

  return (
    <li className="flex items-center rounded-md transition-colors hover:bg-[var(--bg-hover)]">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-baseline gap-3 py-2 pl-1 text-left"
      >
        <span
          className="nums-quiet shrink-0 text-[12px]"
          style={{ color: "var(--text-faint)" }}
        >
          {time ?? "--:--"}
        </span>
        <span
          className="nums truncate text-[15px]"
          style={isRecord ? { color: "var(--accent)" } : undefined}
        >
          {summarise(set, exercise, units)}
        </span>
        {/* A label as well as the colour: colour alone is invisible to anyone who can't
            distinguish it, and "PR" is the thing you're actually looking for. The tint is
            derived from the accent so it follows a custom colour without a second variable. */}
        {isRecord && (
          <span
            className="shrink-0 rounded px-1.5 py-[3px] text-[9px] leading-none font-bold tracking-[0.09em]"
            style={{
              color: "var(--accent)",
              background: "color-mix(in srgb, var(--accent) 13%, transparent)",
            }}
            title="Personal record"
          >
            PR
          </span>
        )}
      </button>

      <RowAction label="Duplicate set" onClick={onDuplicate}>
        <Duplicate size={15} />
      </RowAction>
      <RowAction label="Delete set" onClick={onDelete} danger>
        <Trash size={15} />
      </RowAction>
    </li>
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
