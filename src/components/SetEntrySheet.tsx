"use client"

import { useEffect, useMemo, useState } from "react"

import { displayName } from "@/lib/catalog"
import { lastSetOf } from "@/lib/select"
import type { Exercise, SetEntry, UnitSystem } from "@/lib/types"
import {
  distanceUnit,
  distanceValue,
  formatCount,
  formatDuration,
  formatLoad,
  parseDistance,
  parseDuration,
  parseReps,
  parseWeight,
  weightUnit,
  weightValue,
} from "@/lib/units"
import { useStore } from "@/providers/StoreProvider"
import { Sheet } from "./Sheet"
import { NumberField, TextField } from "./NumberField"

interface Draft {
  weight: string
  reps: string
  duration: string
  distance: string
  /** `HH:mm`, editing only. The set's own timestamp, which is also its identity remotely. */
  time: string
}

const EMPTY_DRAFT: Draft = { weight: "", reps: "", duration: "", distance: "", time: "" }

const clockValue = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => n.toString().padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function draftFrom(set: SetEntry | undefined, units: UnitSystem): Draft {
  if (!set) return EMPTY_DRAFT
  return {
    time: clockValue(set.loggedAt),
    weight: set.weightKg === undefined ? "" : weightValue(set.weightKg, units),
    reps: set.reps === undefined ? "" : String(set.reps),
    duration: set.durationSec === undefined ? "" : formatDuration(set.durationSec),
    distance: set.distanceM === undefined ? "" : distanceValue(set.distanceM, units),
  }
}

export function SetEntrySheet({
  open,
  exercise,
  date,
  editing,
  onClose,
}: {
  open: boolean
  exercise: Exercise | null
  date: string
  /** Present when opened from an existing row; the sheet becomes a single-save editor. */
  editing?: SetEntry | null
  onClose: () => void
}) {
  const { state, addSet, updateSet, deleteSet } = useStore()
  const units = state.prefs.units

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)

  const previous = useMemo(
    () => (exercise ? lastSetOf(state.sets, exercise.id, date) : undefined),
    // Intentionally not reactive to `state.sets`: prefill is a snapshot taken when the sheet
    // opens. Recomputing it as you add sets would rewrite the fields under your fingers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercise, date, open],
  )

  useEffect(() => {
    if (!open || !exercise) return
    setDraft(draftFrom(editing ?? previous, units))
    setError(null)
  }, [open, exercise, editing, previous, units])

  if (!exercise) return null

  const kind = exercise.kind
  const patch = () => buildPatch(draft, exercise, units)

  const commit = () => {
    const built = patch()
    if ("error" in built) {
      setError(built.error)
      return
    }
    setError(null)

    if (editing) {
      // A changed time moves the set's identity, so it goes through the same repair path as
      // any other edit: the old samples are retracted and rewritten at the new instant.
      const at = movedTo(editing, draft.time)
      updateSet(editing.id, { ...built.value, ...(at ? { loggedAt: at } : {}) })
    } else {
      addSet({ exerciseId: exercise.id, date, ...built.value })
    }
    // Always back to the day view, so the set you just logged is the thing you see. Repeating
    // a set is the `+` on that exercise's block, which reopens here prefilled from it.
    onClose()
  }

  const weightStep = units === "metric" ? 2.5 : 5

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={displayName(exercise)}
      footer={
        <div className="flex gap-2">
          {editing && (
            <button
              type="button"
              onClick={() => {
                deleteSet(editing.id)
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
            {editing ? "Save set" : "Add set"}
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
        {kind === "weight_reps" && (
          <>
            <NumberField
              label="Weight"
              value={draft.weight}
              onChange={(weight) => setDraft((d) => ({ ...d, weight }))}
              step={weightStep}
              suffix={weightUnit(units)}
              placeholder="0"
              autoFocus
            />
            <NumberField
              label="Reps"
              value={draft.reps}
              onChange={(reps) => setDraft((d) => ({ ...d, reps }))}
              step={1}
              min={1}
              inputMode="numeric"
              placeholder="8"
            />
          </>
        )}

        {kind === "reps" && (
          <NumberField
            label="Reps"
            value={draft.reps}
            onChange={(reps) => setDraft((d) => ({ ...d, reps }))}
            step={1}
            min={1}
            inputMode="numeric"
            placeholder="12"
            autoFocus
          />
        )}

        {kind === "duration" && (
          <TextField
            label="Duration"
            hint="mm:ss or seconds"
            value={draft.duration}
            onChange={(duration) => setDraft((d) => ({ ...d, duration }))}
            placeholder="1:30"
            autoFocus
          />
        )}

        {kind === "distance" && (
          <>
            <NumberField
              label="Distance"
              value={draft.distance}
              onChange={(distance) => setDraft((d) => ({ ...d, distance }))}
              step={units === "metric" ? 0.5 : 0.25}
              suffix={distanceUnit(units)}
              placeholder="5"
              autoFocus
            />
            <TextField
              label="Time"
              hint="optional"
              value={draft.duration}
              onChange={(duration) => setDraft((d) => ({ ...d, duration }))}
              placeholder="28:00"
            />
          </>
        )}

        {/* Last, and deliberately quiet: you are correcting a record, not logging one. */}
        {editing && (
          <TextField
            label="Time"
            hint="24-hour"
            value={draft.time}
            onChange={(time) => setDraft((d) => ({ ...d, time }))}
            placeholder="14:32"
          />
        )}

        {previous && !editing && (
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            Last time: {summarise(previous, exercise, units)}
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

/**
 * The set's instant with the clock face replaced, or null if the field is blank or unparseable.
 * The calendar day never moves: that is what the date stepper is for.
 */
function movedTo(set: SetEntry, time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const d = new Date(set.loggedAt)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(h, min, 0, 0)
  return d.toISOString()
}

type Built =
  | { value: Pick<SetEntry, "reps" | "weightKg" | "durationSec" | "distanceM"> }
  | { error: string }

function buildPatch(draft: Draft, ex: Exercise, units: UnitSystem): Built {
  switch (ex.kind) {
    case "weight_reps": {
      const reps = parseReps(draft.reps)
      if (reps === undefined) return { error: "Reps must be a whole number above zero." }
      // Blank always means you forgot. A pull up carries your bodyweight, so there is no
      // reading of "no weight entered" that should silently become 0kg.
      const raw = draft.weight.trim()
      if (!raw) return { error: "Enter a weight." }
      const weightKg = parseWeight(raw, units)
      if (weightKg === undefined) return { error: "Weight must be a positive number." }
      return { value: { reps, weightKg } }
    }
    case "reps": {
      const reps = parseReps(draft.reps)
      if (reps === undefined) return { error: "Reps must be a whole number above zero." }
      return { value: { reps } }
    }
    case "duration": {
      const durationSec = parseDuration(draft.duration)
      if (durationSec === undefined || durationSec <= 0) {
        return { error: "Enter a duration like 1:30 or 90." }
      }
      return { value: { durationSec } }
    }
    case "distance": {
      const distanceM = parseDistance(draft.distance, units)
      if (distanceM === undefined || distanceM <= 0) return { error: "Enter a distance." }
      const raw = draft.duration.trim()
      if (!raw) return { value: { distanceM } }
      const durationSec = parseDuration(raw)
      if (durationSec === undefined) return { error: "Time should look like 28:00." }
      return { value: { distanceM, durationSec } }
    }
  }
}

/** Shared one-line rendering of a set, used by the sheet and the day list. */
export function summarise(set: SetEntry, ex: Exercise, units: UnitSystem): string {
  switch (ex.kind) {
    case "weight_reps":
      return `${formatLoad(set.weightKg, units)} × ${formatCount(set.reps)}`
    case "reps":
      return `${formatCount(set.reps)} reps`
    case "duration":
      return formatDuration(set.durationSec)
    case "distance": {
      const d = set.distanceM === undefined ? "·" : `${distanceValue(set.distanceM, units)} ${distanceUnit(units)}`
      return set.durationSec ? `${d} · ${formatDuration(set.durationSec)}` : d
    }
  }
}
