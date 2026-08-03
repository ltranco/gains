"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { BottomBar } from "@/components/BottomBar"
import { DatePicker } from "@/components/DatePicker"
import { DayLog } from "@/components/DayLog"
import { EmptyDay } from "@/components/EmptyDay"
import { ExercisePicker } from "@/components/ExercisePicker"
import { FoodLog } from "@/components/FoodLog"
import { FoodSheet } from "@/components/FoodSheet"
import { MetricPicker } from "@/components/MetricPicker"
import { MetricsLog } from "@/components/MetricsLog"
import { ReadingSheet } from "@/components/ReadingSheet"
import { Rings } from "@/components/Rings"
import { SetEntrySheet, summarise } from "@/components/SetEntrySheet"
import { Toast } from "@/components/Toast"
import { TopBar } from "@/components/TopBar"
import { isFuture, shiftDay, todayKey } from "@/lib/date"
import { foodName } from "@/lib/food"
import {
  dayEntries,
  dayFoods,
  dayMetricRows,
  dayProgress,
  foodDays,
  loggedDays,
  metricRecordIds,
  personalRecordIds,
  readingDays,
} from "@/lib/select"
import { formatTracker } from "@/lib/units"
import type { Exercise, FoodEntry, Reading, SetEntry, Tracker } from "@/lib/types"
import { useStore } from "@/providers/StoreProvider"

export default function Today() {
  const {
    state,
    hydrated,
    trackers,
    duplicateSet,
    deleteSet,
    restoreSet,
    duplicateFood,
    deleteFood,
    restoreFood,
    duplicateReading,
    deleteReading,
    restoreReading,
  } = useStore()
  const [date, setDate] = useState(todayKey)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [metricsOpen, setMetricsOpen] = useState(false)
  const [entry, setEntry] = useState<{ exercise: Exercise; editing: SetEntry | null } | null>(
    null,
  )
  const [food, setFood] = useState<{ editing: FoodEntry | null } | null>(null)
  const [reading, setReading] = useState<{ tracker: Tracker; editing: Reading | null } | null>(
    null,
  )
  /**
   * Undo carries its own restore, rather than the entry the page would have to know how to put
   * back. Three kinds of thing can be deleted now, and the toast has no business caring which.
   */
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null)
  const [dateOpen, setDateOpen] = useState(false)

  const entries = useMemo(() => dayEntries(state.sets, date), [state.sets, date])
  const foods = useMemo(() => dayFoods(state.foods, date), [state.foods, date])
  const metrics = useMemo(
    () => dayMetricRows(state.readings, trackers, date),
    [state.readings, trackers, date],
  )
  const metricRecords = useMemo(
    () => metricRecordIds(state.readings, trackers),
    [state.readings, trackers],
  )
  const progress = useMemo(
    () => dayProgress(state.foods, state.prefs.macros, date),
    [state.foods, state.prefs.macros, date],
  )
  // Every kind of entry gets a dot in the date picker: a day you only ate on is still a logged day.
  const logged = useMemo(
    () =>
      new Set([
        ...loggedDays(state.sets),
        ...foodDays(state.foods),
        ...readingDays(state.readings),
      ]),
    [state.sets, state.foods, state.readings],
  )
  const records = useMemo(() => personalRecordIds(state.sets), [state.sets])
  const openPicker = useCallback(() => setPickerOpen(true), [])
  const openFood = useCallback(() => setFood({ editing: null }), [])
  const step = useCallback(
    (days: number) =>
      setDate((d) => {
        const next = shiftDay(d, days)
        return isFuture(next) ? d : next
      }),
    [],
  )

  const busy =
    pickerOpen || metricsOpen || Boolean(entry) || Boolean(food) || Boolean(reading) || dateOpen

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

  const handleDeleteFood = (deleted: FoodEntry) => {
    deleteFood(deleted.id)
    setUndo({ message: `Deleted ${foodName(deleted)}`, restore: () => restoreFood(deleted) })
  }

  const handleDeleteReading = (deleted: Reading, tracker: Tracker) => {
    deleteReading(deleted.id)
    setUndo({
      message: `Deleted ${formatTracker(deleted.value, tracker, state.prefs.units)}`,
      restore: () => restoreReading(deleted),
    })
  }

  const nothingLogged = entries.length === 0 && foods.length === 0 && metrics.length === 0

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
            <Rings key={date} progress={progress} onAdd={openFood} />

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
                <FoodLog
                  foods={foods}
                  clock={state.prefs.clock}
                  onAdd={openFood}
                  onEdit={(edited) => setFood({ editing: edited })}
                  onDuplicate={(f) => duplicateFood(f.id)}
                  onDelete={handleDeleteFood}
                />
                <MetricsLog
                  rows={metrics}
                  units={state.prefs.units}
                  clock={state.prefs.clock}
                  records={metricRecords}
                  onAdd={() => setMetricsOpen(true)}
                  onEdit={(tracker, edited) => setReading({ tracker, editing: edited })}
                  onDuplicate={(r) => duplicateReading(r.id)}
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
        onAddMetric={() => setMetricsOpen(true)}
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

      <MetricPicker
        open={metricsOpen}
        trackers={trackers}
        units={state.prefs.units}
        onClose={() => setMetricsOpen(false)}
        onPick={(tracker) => {
          setMetricsOpen(false)
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

      <FoodSheet
        open={Boolean(food)}
        editing={food?.editing ?? null}
        date={date}
        onClose={() => setFood(null)}
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
