"use client"

import { useEffect, useState } from "react"

import { SubPageBar } from "@/components/TopBar"
import { ChevronDown } from "@/components/icons"
import { validateTrackerName } from "@/lib/trackers"
import {
  TRACKER_UNITS,
  type Tracker,
  type TrackerMode,
  type TrackerUnit,
  type UnitSystem,
} from "@/lib/types"
import { trackerUnit, trackerUnitName, trackerValue } from "@/lib/units"
import { useStore } from "@/providers/StoreProvider"

/**
 * The metrics you log as one number: a waist measurement, a creatine dose.
 *
 * Its own page rather than a section of Settings, which was already long enough to scroll past.
 * Macros are not here — they're fields of a food, and their targets are a preference. Nothing here
 * ships with the app either; the list starts empty and every row in it is yours.
 *
 * **Unit is frozen after creation**, like the slug, and for the same reason: the unit is half the
 * metric name. Changing `waist` from cm to inches wouldn't convert anything, it would start writing
 * `waist_in` and orphan every sample already stored under `waist_cm`. Which is also why the picker
 * shows units in *your* system — you pick what you'll be typing, and the app stores the SI value.
 */
export default function Metrics() {
  const { state, hydrated, saveTracker, removeTracker } = useStore()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const units = hydrated ? state.prefs.units : "metric"

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <SubPageBar title="Metrics" back="/settings" />

      <div className="px-4 py-4">
        <ul className="flex flex-col">
          {state.trackers.map((tracker) => (
            <li key={tracker.id} className="border-b">
              <button
                type="button"
                onClick={() => setExpanded((id) => (id === tracker.id ? null : tracker.id))}
                aria-expanded={expanded === tracker.id}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[15px]">{tracker.name}</span>
                <span
                  className="nums-quiet shrink-0 text-[12px]"
                  style={{ color: "var(--text-faint)" }}
                >
                  {tracker.target === undefined
                    ? trackerUnit(tracker.unit, units)
                    : `${trackerValue(tracker.target, tracker.unit, units)} ${trackerUnit(
                        tracker.unit,
                        units,
                      )}`}
                </span>
                <span
                  className="shrink-0 transition-transform"
                  style={{
                    color: "var(--text-faint)",
                    transform: expanded === tracker.id ? "rotate(180deg)" : undefined,
                  }}
                >
                  <ChevronDown size={15} />
                </span>
              </button>

              {expanded === tracker.id && (
                <TrackerEditor
                  tracker={tracker}
                  units={units}
                  onSave={saveTracker}
                  onRemove={() => {
                    removeTracker(tracker.id)
                    setExpanded(null)
                  }}
                />
              )}
            </li>
          ))}
        </ul>

        {state.trackers.length === 0 && !adding && (
          <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
            Nothing yet. A waist measurement, a supplement dose — anything you log as one number.
          </p>
        )}

        {adding ? (
          <NewTracker
            existing={state.trackers}
            units={units}
            onCancel={() => setAdding(false)}
            onCreate={(tracker) => {
              saveTracker(tracker)
              setAdding(false)
              setExpanded(tracker.id)
            }}
          />
        ) : (
          <div className="mt-4">
            <Button onClick={() => setAdding(true)}>Add metric</Button>
          </div>
        )}
      </div>
    </main>
  )
}

function TrackerEditor({
  tracker,
  units,
  onSave,
  onRemove,
}: {
  tracker: Tracker
  units: UnitSystem
  onSave: (next: Tracker) => void
  onRemove: () => void
}) {
  // Local drafts so a half-typed name or target doesn't rewrite state on every keystroke.
  const [name, setName] = useState(tracker.name)
  const [target, setTarget] = useState(
    tracker.target === undefined ? "" : trackerValue(tracker.target, tracker.unit, units),
  )
  useEffect(() => setName(tracker.name), [tracker.name])

  const commitName = () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === tracker.name) return setName(tracker.name)
    // The id never moves. That's the point of it being separate from the name.
    onSave({ ...tracker, name: trimmed })
  }

  const commitTarget = () => {
    const raw = target.trim().replace(/,/g, "")
    if (!raw) {
      const { target: _drop, ...rest } = tracker
      return onSave(rest)
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) {
      return setTarget(
        tracker.target === undefined ? "" : trackerValue(tracker.target, tracker.unit, units),
      )
    }
    // Stored in the tracker's own unit, so an imperially entered waist target lands as cm.
    onSave({ ...tracker, target: tracker.unit === "cm" && units === "imperial" ? n * 2.54 : n })
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <Labelled label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          autoCapitalize="words"
          autoCorrect="off"
          className="w-full max-w-[280px] rounded-lg border px-2.5 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
          style={{ background: "var(--bg-subtle)" }}
        />
      </Labelled>

      <Labelled label="Daily target">
        <div className="flex items-center gap-2">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            inputMode="decimal"
            placeholder="none"
            className="nums w-28 rounded-lg border px-2.5 py-2 text-[14px] outline-none placeholder:font-normal placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
            style={{ background: "var(--bg-subtle)" }}
          />
          <span className="text-[13px]" style={{ color: "var(--text-faint)" }}>
            {trackerUnit(tracker.unit, units)}
          </span>
        </div>
      </Labelled>

      <Labelled label="A day's entries">
        <Segmented<TrackerMode>
          value={tracker.mode}
          options={[
            ["sum", "Add up"],
            ["point", "Latest wins"],
          ]}
          onChange={(mode) =>
            onSave({ ...tracker, mode, ...(tracker.recovered ? { recovered: false } : {}) })
          }
        />
      </Labelled>

      {/* Which way progress runs. "Neither" is the default and gets no badge: a creatine dose is
          not a personal best, and a PR on every entry is noise. */}
      <Labelled label="Records">
        <Segmented<"none" | "higher" | "lower">
          value={tracker.better ?? "none"}
          options={[
            ["none", "Neither"],
            ["higher", "Higher"],
            ["lower", "Lower"],
          ]}
          onChange={(next) => {
            if (next === "none") {
              const { better: _drop, ...rest } = tracker
              onSave(rest)
            } else {
              onSave({ ...tracker, better: next })
            }
          }}
        />
      </Labelled>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--danger)", borderColor: "var(--border-strong)" }}
        >
          Remove
        </button>
        <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          Deletes its entries here too.
        </span>
      </div>
    </div>
  )
}

function NewTracker({
  existing,
  units,
  onCancel,
  onCreate,
}: {
  existing: Tracker[]
  units: UnitSystem
  onCancel: () => void
  onCreate: (tracker: Tracker) => void
}) {
  const [name, setName] = useState("")
  const [unit, setUnit] = useState<TrackerUnit>("g")
  const [error, setError] = useState<string | null>(null)

  const create = () => {
    // The slug is the metric prefix and can never move, so it's validated here and only here:
    // against Apple Health's own names, against the four macro names, against all 173 exercise
    // prefixes, and against what you already have. See lib/trackers.ts for why a collision is
    // unrecoverable.
    const checked = validateTrackerName(name, existing)
    if ("error" in checked) return setError(checked.error)
    onCreate({ id: checked.id, name: name.trim(), unit, mode: "point" })
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border p-3">
      <Labelled label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Creatine"
          autoCapitalize="words"
          autoCorrect="off"
          autoFocus
          className="w-full max-w-[280px] rounded-lg border px-2.5 py-2 text-[14px] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
          style={{ background: "var(--bg-subtle)" }}
        />
      </Labelled>

      <Labelled label="Unit" hint="Can't be changed later">
        <div className="flex flex-wrap gap-1.5">
          {TRACKER_UNITS.map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={u === unit}
              onClick={() => setUnit(u)}
              className="nums-quiet rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors"
              style={
                u === unit
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {trackerUnitName(u, units)}
            </button>
          ))}
        </div>
      </Labelled>

      {error && (
        <p className="text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={create}
          className="rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          Create
        </button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  // `items-start` so a segmented control is as wide as its options, not as wide as the page.
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex w-full items-baseline justify-between gap-2">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        {hint && (
          <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange: (next: T) => void
}) {
  return (
    <div
      className="inline-flex rounded-lg border p-0.5"
      style={{ background: "var(--bg-subtle)" }}
      role="group"
    >
      {options.map(([key, label]) => {
        const active = key === value
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors"
            style={
              active
                ? { background: "var(--bg-elevated)", boxShadow: "var(--shadow-pop)" }
                : { color: "var(--text-muted)" }
            }
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
      style={{ borderColor: "var(--border-strong)" }}
    >
      {children}
    </button>
  )
}
