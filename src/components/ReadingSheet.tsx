"use client"

import { useEffect, useState } from "react"

import { dateTimeLocalValue, parseDateTimeLocal, toDayKey } from "@/lib/date"
import { dayTotal } from "@/lib/select"
import type { Reading, Tracker, UnitSystem } from "@/lib/types"
import { formatTracker, parseTrackerValue, trackerUnit, trackerValue } from "@/lib/units"
import { useStore } from "@/providers/StoreProvider"
import { Sheet } from "./Sheet"
import { DateTimeField, NumberField } from "./NumberField"

/**
 * One number, for one tracker, on one day. The `SetEntrySheet` pattern at a quarter the size,
 * because a reading has exactly one field where a set has up to three.
 *
 * The step is chosen per unit rather than being asked for: calories move in fifties because you
 * are reading them off a label, and centimetres in halves because that's the resolution of a tape
 * measure. Getting this wrong makes the steppers useless — a +1 on calories is forty taps.
 */
export function ReadingSheet({
  open,
  tracker,
  date,
  editing,
  onClose,
}: {
  open: boolean
  tracker: Tracker | null
  date: string
  /** Present when opened from an existing row; the sheet becomes a single-save editor. */
  editing?: Reading | null
  onClose: () => void
}) {
  const { state, addReading, updateReading, deleteReading } = useStore()
  const units = state.prefs.units

  const [value, setValue] = useState("")
  const [at, setAt] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !tracker) return
    // A point reading prefills from the last one — a waist measurement moves by millimetres, so
    // starting from the previous number is nearly always the right ballpark. A sum does not: a
    // meal has nothing to do with the last meal, and prefilling would invite a double entry.
    const prefill =
      editing !== null && editing !== undefined
        ? trackerValue(editing.value, tracker.unit, units)
        : tracker.mode === "point"
          ? lastValue(state.readings, tracker, units)
          : ""
    setValue(prefill)
    setAt(editing ? dateTimeLocalValue(editing.loggedAt) : "")
    setError(null)
    // Prefill is a snapshot taken when the sheet opens, deliberately not reactive to
    // `state.readings` — recomputing it as you log would rewrite the field under your fingers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tracker, editing, units])

  if (!tracker) return null

  const unit = trackerUnit(tracker.unit, units)
  const soFar = dayTotal(state.readings, tracker, date)

  const commit = () => {
    const parsed = parseTrackerValue(value, tracker.unit, units)
    if (parsed === undefined || parsed <= 0) {
      setError(`Enter a ${tracker.name.toLowerCase()} in ${unit}.`)
      return
    }
    setError(null)

    if (editing) {
      // Moving a reading changes its identity remotely, so it takes the same repair path as any
      // other edit: the old sample is retracted and rewritten at the new instant. `date` moves
      // with it, since that is what the day view groups on.
      const moved = parseDateTimeLocal(at)
      const when = moved && moved.getTime() <= Date.now() ? moved : null
      updateReading(editing.id, {
        value: parsed,
        ...(when ? { loggedAt: when.toISOString(), date: toDayKey(when) } : {}),
      })
    } else {
      addReading({ trackerId: tracker.id, date, value: parsed })
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tracker.name}
      footer={
        <div className="flex gap-2">
          {editing && (
            <button
              type="button"
              onClick={() => {
                deleteReading(editing.id)
                onClose()
              }}
              className="rounded-lg border px-3.5 py-2.5 text-[14px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--danger)", borderColor: "var(--border-strong)" }}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={commit}
            className="flex-1 rounded-lg py-2.5 text-[15px] font-medium transition-colors"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            {editing ? "Save" : "Add"}
          </button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-3.5 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          commit()
        }}
      >
        <NumberField
          label={tracker.name}
          value={value}
          onChange={setValue}
          step={stepFor(tracker, units)}
          suffix={unit}
          placeholder={placeholderFor(tracker)}
          autoFocus
        />

        {/* Last, and deliberately quiet: you are correcting a record, not logging one. */}
        {editing && (
          <DateTimeField
            label="Logged at"
            value={at}
            max={dateTimeLocalValue(new Date().toISOString())}
            onChange={setAt}
          />
        )}

        {/* What's already down for the day, so a fourth meal doesn't need a mental running
            total. Only for sums — for a measurement the "total" is just the same number again. */}
        {!editing && tracker.mode === "sum" && soFar !== undefined && (
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            Today so far: {formatTracker(soFar, tracker, units)}
            {tracker.target !== undefined &&
              ` of ${trackerValue(tracker.target, tracker.unit, units)}`}
          </p>
        )}

        {error && (
          <p className="text-[13px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        {/* Lets Return submit on iOS without a visible duplicate button. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  )
}

/** The most recent reading of a tracker, on any day, as a display string. */
function lastValue(readings: Reading[], tracker: Tracker, units: UnitSystem): string {
  const last = readings
    .filter((r) => r.trackerId === tracker.id)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .at(-1)
  return last ? trackerValue(last.value, tracker.unit, units) : ""
}

function stepFor(tracker: Tracker, units: UnitSystem): number {
  switch (tracker.unit) {
    case "kcal":
      return 50
    case "g":
      return 5
    case "mg":
      return 50
    case "ml":
      return 100
    case "cm":
      // Half a centimetre, or a quarter inch — either way the finest mark on the tape.
      return units === "metric" ? 0.5 : 0.25
    case "pct":
      return 0.5
    case "count":
      return 1
  }
}

function placeholderFor(tracker: Tracker): string {
  switch (tracker.unit) {
    case "kcal":
      return "600"
    case "g":
      return "40"
    case "mg":
      return "200"
    case "ml":
      return "500"
    case "cm":
      return "81"
    case "pct":
      return "15"
    case "count":
      return "1"
  }
}
