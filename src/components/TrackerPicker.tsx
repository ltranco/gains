"use client"

import { useEffect, useMemo, useState } from "react"

import { nutritionTrackers, otherTrackers, searchTrackers } from "@/lib/trackers"
import type { Tracker, UnitSystem } from "@/lib/types"
import { trackerUnit } from "@/lib/units"
import { Sheet } from "./Sheet"
import { Search } from "./icons"

/**
 * What the Food button opens: nutrition first, everything else below it.
 *
 * Two sections rather than two entry points. Waist doesn't deserve a button in the bottom bar —
 * it's measured weekly — but it doesn't deserve to be *hidden* either, so it lives one heading
 * down in the sheet the daily thing already opens, and search finds it from the first keystroke.
 *
 * Deliberately shorter than `ExercisePicker`: there are five trackers, not 173, so there's no
 * collapsing, no grouping by movement, and the search is a convenience rather than the only way
 * through the list.
 */
export function TrackerPicker({
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
  const nutrition = useMemo(() => nutritionTrackers(trackers), [trackers])
  const other = useMemo(() => otherTrackers(trackers), [trackers])

  return (
    <Sheet open={open} onClose={onClose} title="Log food" fullHeight>
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
                Add your own in Settings.
              </p>
            </div>
          ) : (
            <ul>
              {results.map((t) => (
                <TrackerRow key={t.id} tracker={t} units={units} onPick={onPick} />
              ))}
            </ul>
          )
        ) : (
          <>
            {nutrition.length > 0 && (
              <section>
                <SectionLabel>Nutrition</SectionLabel>
                <ul>
                  {nutrition.map((t) => (
                    <TrackerRow key={t.id} tracker={t} units={units} onPick={onPick} />
                  ))}
                </ul>
              </section>
            )}

            {other.length > 0 && (
              <section>
                <SectionLabel>Body &amp; other</SectionLabel>
                <ul>
                  {other.map((t) => (
                    <TrackerRow key={t.id} tracker={t} units={units} onPick={onPick} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="px-4 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase"
      style={{ color: "var(--text-faint)" }}
    >
      {children}
    </h3>
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
