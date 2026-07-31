"use client"

import { useEffect, useMemo, useState } from "react"

import { displayName } from "@/lib/catalog"
import { lastSetOf } from "@/lib/select"
import type { Exercise, SetEntry, UnitSystem } from "@/lib/types"
import {
  distanceUnit,
  distanceValue,
  formatDuration,
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

/** Bodyweight movements you can load — pull ups, dips. 0 means bodyweight, not "no data". */
function isLoadedBodyweight(ex: Exercise): boolean {
  return ex.kind === "weight_reps" && ex.equipment === "bodyweight"
}

interface Draft {
  weight: string
  reps: string
  duration: string
  distance: string
}

const EMPTY_DRAFT: Draft = { weight: "", reps: "", duration: "", distance: "" }

function draftFrom(set: SetEntry | undefined, units: UnitSystem, ex: Exercise): Draft {
  if (!set) return { ...EMPTY_DRAFT, ...(isLoadedBodyweight(ex) ? { weight: "0" } : {}) }
  return {
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
  /** Sets added during this opening, so you can see the ladder you just logged. */
  const [added, setAdded] = useState<SetEntry[]>([])
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
    setDraft(draftFrom(editing ?? previous, units, exercise))
    setAdded([])
    setError(null)
  }, [open, exercise, editing, previous, units])

  if (!exercise) return null

  const kind = exercise.kind
  const bodyweight = isLoadedBodyweight(exercise)
  const patch = () => buildPatch(draft, exercise, units)

  const commit = () => {
    const built = patch()
    if ("error" in built) {
      setError(built.error)
      return
    }
    setError(null)

    if (editing) {
      updateSet(editing.id, built.value)
      onClose()
      return
    }

    // Stay open and keep the values. Four sets of the same weight is the common case, and
    // reopening the sheet three more times to retype them is the thing that makes logging
    // feel like admin.
    addSet({ exerciseId: exercise.id, date, ...built.value })
    setAdded((prev) => [
      ...prev,
      {
        id: `local-${prev.length}`,
        exerciseId: exercise.id,
        date,
        loggedAt: new Date().toISOString(),
        ...built.value,
      },
    ])
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
              label={bodyweight ? "Added weight" : "Weight"}
              hint={bodyweight ? "0 = bodyweight" : undefined}
              value={draft.weight}
              onChange={(weight) => setDraft((d) => ({ ...d, weight }))}
              step={weightStep}
              suffix={weightUnit(units)}
              placeholder="0"
              autoFocus={!bodyweight}
            />
            <NumberField
              label="Reps"
              value={draft.reps}
              onChange={(reps) => setDraft((d) => ({ ...d, reps }))}
              step={1}
              min={1}
              inputMode="numeric"
              placeholder="8"
              autoFocus={bodyweight}
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

        {added.length > 0 && (
          <div className="mt-1 border-t pt-3">
            <h3
              className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase"
              style={{ color: "var(--text-faint)" }}
            >
              Added
            </h3>
            <ul className="flex flex-col gap-1">
              {added.map((s, i) => (
                <li key={s.id} className="nums flex gap-3 text-[13px]">
                  <span style={{ color: "var(--text-faint)" }}>{i + 1}</span>
                  <span>{summarise(s, exercise, units)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lets Return submit on iOS without a visible duplicate button. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  )
}

type Built =
  | { value: Pick<SetEntry, "reps" | "weightKg" | "durationSec" | "distanceM"> }
  | { error: string }

function buildPatch(draft: Draft, ex: Exercise, units: UnitSystem): Built {
  switch (ex.kind) {
    case "weight_reps": {
      const reps = parseReps(draft.reps)
      if (reps === undefined) return { error: "Reps must be a whole number above zero." }
      const raw = draft.weight.trim()
      // Blank weight on a loadable bodyweight movement means bodyweight, which is 0. On a
      // barbell movement it means you forgot, so it's an error rather than a silent 0kg.
      if (!raw) {
        if (isLoadedBodyweight(ex)) return { value: { reps, weightKg: 0 } }
        return { error: "Enter a weight." }
      }
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
    case "weight_reps": {
      const bw = isLoadedBodyweight(ex)
      const load =
        set.weightKg === undefined
          ? "—"
          : bw
            ? set.weightKg === 0
              ? "BW"
              : `+${weightValue(set.weightKg, units)} ${weightUnit(units)}`
            : `${weightValue(set.weightKg, units)} ${weightUnit(units)}`
      return `${load} × ${set.reps ?? "—"}`
    }
    case "reps":
      return `${set.reps ?? "—"} reps`
    case "duration":
      return formatDuration(set.durationSec)
    case "distance": {
      const d = set.distanceM === undefined ? "—" : `${distanceValue(set.distanceM, units)} ${distanceUnit(units)}`
      return set.durationSec ? `${d} · ${formatDuration(set.durationSec)}` : d
    }
  }
}
