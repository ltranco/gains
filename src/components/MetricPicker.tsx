"use client"

import { useEffect, useMemo, useState } from "react"

import Link from "next/link"

import { searchTrackers } from "@/lib/trackers"
import type { Tracker, UnitSystem } from "@/lib/types"
import { trackerUnit } from "@/lib/units"
import { Sheet } from "./Sheet"
import { Search } from "./icons"

/**
 * The metrics you log as one number: a waist measurement, a creatine dose.
 *
 * One flat list, no sections. Deliberately shorter than `ExercisePicker` — there are a handful of
 * these, not 173, so there's no collapsing and no grouping, and the search is a convenience rather
 * than the only way through.
 *
 * Reached from a quiet row at the foot of the day rather than from the bottom bar. These are
 * measured weekly; the two buttons in thumb range belong to the things logged several times a day.
 */
export function MetricPicker({
  open,
  trackers,
  units,
  onClose,
  onPick,
}: {
  open: boolean
  trackers: Tracker[]
  units: UnitSystem
  onClose: () => void
  onPick: (tracker: Tracker) => void
}) {
  const [query, setQuery] = useState("")

  // Reset per opening: a stale query from last time is never what you want next.
  useEffect(() => {
    if (!open) return
    setQuery("")
  }, [open])

  const results = useMemo(() => searchTrackers(query, trackers), [query, trackers])

  return (
    <Sheet open={open} onClose={onClose} title="Log a metric" fullHeight>
      <div
        className="sticky top-0 z-10 border-b px-3 py-2.5"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div className="relative">
          <span
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
            style={{ color: "var(--text-faint)" }}
          >
            <Search size={15} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search metrics"
            type="search"
            // See ExercisePicker: React's autoFocus stays inside the tap's own gesture, which is
            // what makes iOS raise the keyboard. A focus() from a timeout does not.
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="w-full rounded-lg border py-2 pr-3 pl-8 text-[15px] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
            style={{ background: "var(--bg-subtle)" }}
          />
        </div>
      </div>

      <div className="pb-2">
        {query ? (
          results.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12">
              <span style={{ color: "var(--text-faint)" }}>
                <Search size={22} />
              </span>
              <p className="mt-3 text-[13px]" style={{ color: "var(--text-faint)" }}>
                No match for “{query}”
              </p>
              <p className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
                Add it in Settings
              </p>
            </div>
          ) : (
            <ul>
              {results.map((t) => (
                <TrackerRow key={t.id} tracker={t} units={units} onPick={onPick} />
              ))}
            </ul>
          )
        ) : trackers.length === 0 ? (
          // Nothing ships with the app, so the first visit here is empty by design.
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
              No metrics yet
            </p>
            <p className="mt-1 max-w-[240px] text-[13px]" style={{ color: "var(--text-faint)" }}>
              A waist measurement, a supplement dose, anything you log as one number
            </p>
            <Link
              href="/settings/metrics"
              className="mt-4 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: "var(--border-strong)" }}
            >
              Add one
            </Link>
          </div>
        ) : (
          <ul>
            {trackers.map((t) => (
              <TrackerRow key={t.id} tracker={t} units={units} onPick={onPick} />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}

function TrackerRow({
  tracker,
  units,
  onPick,
}: {
  tracker: Tracker
  units: UnitSystem
  onPick: (tracker: Tracker) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(tracker)}
        className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]"
      >
        <span className="min-w-0 flex-1 truncate text-[15px]">{tracker.name}</span>
        {/* The unit, not the group: it's what tells you which number the sheet wants. */}
        <span className="nums-quiet shrink-0 text-[12px]" style={{ color: "var(--text-faint)" }}>
          {trackerUnit(tracker.unit, units)}
        </span>
      </button>
    </li>
  )
}
