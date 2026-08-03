"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { BottomBar } from "@/components/BottomBar"
import { DatePicker } from "@/components/DatePicker"
import { DayLog } from "@/components/DayLog"
import { DayReadingsLog } from "@/components/DayReadingsLog"
import { EmptyDay } from "@/components/EmptyDay"
import { ExercisePicker } from "@/components/ExercisePicker"
import { ReadingSheet } from "@/components/ReadingSheet"
import { Rings } from "@/components/Rings"
import { SetEntrySheet, summarise } from "@/components/SetEntrySheet"
import { Toast } from "@/components/Toast"
import { TopBar } from "@/components/TopBar"
import { TrackerPicker } from "@/components/TrackerPicker"
import { isFuture, shiftDay, todayKey } from "@/lib/date"
import {
  dayEntries,
  dayProgress,
  dayReadings,
  loggedDays,
  personalRecordIds,
  readingDays,
} from "@/lib/select"
import { nutritionTrackers } from "@/lib/trackers"
import { formatTracker } from "@/lib/units"
import type { Exercise, Reading, SetEntry, Tracker } from "@/lib/types"
import { useStore } from "@/providers/StoreProvider"

export default function Today() {
  const {
    state,
    hydrated,
    trackers,
    duplicateSet,
    deleteSet,
    restoreSet,
    deleteReading,
    restoreReading,
  } = useStore()
  const [date, setDate] = useState(todayKey)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [foodOpen, setFoodOpen] = useState(false)
  const [entry, setEntry] = useState<{ exercise: Exercise; editing: SetEntry | null } | null>(
    null,
  )
  const [reading, setReading] = useState<{ tracker: Tracker; editing: Reading | null } | null>(
    null,
  )
  /**
   * Undo carries its own restore, rather than a set the page has to know how to put back. Two
   * kinds of thing can be deleted now, and the toast has no business caring which one it was.
   */
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null)
  const [dateOpen, setDateOpen] = useState(false)

  const entries = useMemo(() => dayEntries(state.sets, date), [state.sets, date])
  const readings = useMemo(
    () => dayReadings(state.readings, trackers, date),
    [state.readings, trackers, date],
  )
  const progress = useMemo(
    () => dayProgress(state.readings, nutritionTrackers(trackers), date),
    [state.readings, trackers, date],
  )
  // Both kinds of entry get a dot in the date picker: a day you only ate on is still a logged day.
  const logged = useMemo(
    () => new Set([...loggedDays(state.sets), ...readingDays(state.readings)]),
    [state.sets, state.readings],
  )
  const records = useMemo(() => personalRecordIds(state.sets), [state.sets])
  const openPicker = useCallback(() => setPickerOpen(true), [])
  const openFood = useCallback(() => setFoodOpen(true), [])
  const step = useCallback(
    (days: number) =>
      setDate((d) => {
        const next = shiftDay(d, days)
        return isFuture(next) ? d : next
      }),
    [],
  )

  const busy = pickerOpen || foodOpen || Boolean(entry) || Boolean(reading) || dateOpen

  // Desktop shortcuts: n or / to add an exercise, f for food, arrows to move through days.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return
      }
      if (busy) return

      switch (e.key) {
        case "n":
        case "/":
          e.preventDefault()
          openPicker()
          break
        case "f":
          e.preventDefault()
          openFood()
          break
        case "ArrowLeft":
          step(-1)
          break
        case "ArrowRight":
          step(1)
          break
        case "t":
          setDate(todayKey())
          break
        case "d":
          e.preventDefault()
          setDateOpen(true)
          break
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openPicker, openFood, busy, step])

  const handleDeleteSet = (set: SetEntry, exercise: Exercise) => {
    deleteSet(set.id)
    setUndo({
      message: `Deleted ${summarise(set, exercise, state.prefs.units)}`,
      restore: () => restoreSet(set),
    })
  }

  const handleDeleteReading = (deleted: Reading, tracker: Tracker) => {
    deleteReading(deleted.id)
    setUndo({
      message: `Deleted ${formatTracker(deleted.value, tracker, state.prefs.units)}`,
      restore: () => restoreReading(deleted),
    })
  }

  const nothingLogged = entries.length === 0 && readings.length === 0

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <TopBar />

      <div className="flex-1">
        {!hydrated ? (
          // Skeleton, not an empty state: claiming "nothing logged" before storage has been
          // read shows the user something false for a frame.
          <div className="px-4 py-6">
            <div
              className="h-3 w-24 animate-pulse rounded"
              style={{ background: "var(--bg-active)" }}
            />
          </div>
        ) : (
          <>
            {/* Keyed by day so the arcs sweep again when you move to another one — a ring that
                silently jumps to a new value reads as a rendering glitch. */}
            <Rings
              key={date}
              progress={progress}
              units={state.prefs.units}
              onPick={(tracker) => setReading({ tracker, editing: null })}
            />

            {nothingLogged ? (
              <EmptyDay isToday={date === todayKey()} />
            ) : (
              <>
                <DayLog
                  entries={entries}
                  units={state.prefs.units}
                  clock={state.prefs.clock}
                  onAddTo={(exercise) => setEntry({ exercise, editing: null })}
                  onEdit={(exercise, set) => setEntry({ exercise, editing: set })}
                  onDuplicate={(set) => duplicateSet(set.id)}
                  onDelete={handleDeleteSet}
                  records={records}
                />
                <DayReadingsLog
                  groups={readings}
                  units={state.prefs.units}
                  clock={state.prefs.clock}
                  onAddTo={(tracker) => setReading({ tracker, editing: null })}
                  onEdit={(tracker, edited) => setReading({ tracker, editing: edited })}
                  onDelete={handleDeleteReading}
                />
              </>
            )}
          </>
        )}
      </div>

      <BottomBar
        date={date}
        onStep={step}
        onOpenPicker={() => setDateOpen(true)}
        onAddExercise={openPicker}
        onAddFood={openFood}
      />

      <DatePicker
        open={dateOpen}
        date={date}
        loggedDays={logged}
        onPick={(next) => {
          setDate(next)
          setDateOpen(false)
        }}
        onClose={() => setDateOpen(false)}
      />

      {undo && (
        <Toast
          message={undo.message}
          actionLabel="Undo"
          onAction={() => {
            undo.restore()
            setUndo(null)
          }}
          onDismiss={() => setUndo(null)}
        />
      )}

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(exercise) => {
          setPickerOpen(false)
          setEntry({ exercise, editing: null })
        }}
      />

      <TrackerPicker
        open={foodOpen}
        trackers={trackers}
        units={state.prefs.units}
        onClose={() => setFoodOpen(false)}
        onPick={(tracker) => {
          setFoodOpen(false)
          setReading({ tracker, editing: null })
        }}
      />

      <SetEntrySheet
        open={Boolean(entry)}
        exercise={entry?.exercise ?? null}
        editing={entry?.editing ?? null}
        date={date}
        onClose={() => setEntry(null)}
      />

      <ReadingSheet
        open={Boolean(reading)}
        tracker={reading?.tracker ?? null}
        editing={reading?.editing ?? null}
        date={date}
        onClose={() => setReading(null)}
      />
    </main>
  )
}
