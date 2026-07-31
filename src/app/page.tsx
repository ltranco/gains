"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { BottomBar } from "@/components/BottomBar"
import { DayLog } from "@/components/DayLog"
import { EmptyDay } from "@/components/EmptyDay"
import { ExercisePicker } from "@/components/ExercisePicker"
import { SetEntrySheet, summarise } from "@/components/SetEntrySheet"
import { Toast } from "@/components/Toast"
import { TopBar } from "@/components/TopBar"
import { isFuture, shiftDay, todayKey } from "@/lib/date"
import { dayEntries } from "@/lib/select"
import type { Exercise, SetEntry } from "@/lib/types"
import { useStore } from "@/providers/StoreProvider"

export default function Today() {
  const { state, hydrated, duplicateSet, deleteSet, restoreSet } = useStore()
  const [date, setDate] = useState(todayKey)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [entry, setEntry] = useState<{ exercise: Exercise; editing: SetEntry | null } | null>(
    null,
  )
  const [undo, setUndo] = useState<{ set: SetEntry; message: string } | null>(null)

  const entries = useMemo(() => dayEntries(state.sets, date), [state.sets, date])
  const openPicker = useCallback(() => setPickerOpen(true), [])

  // Desktop shortcuts: n or / to add, arrows to move through days, t for today.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return
      }
      if (pickerOpen || entry) return

      switch (e.key) {
        case "n":
        case "/":
          e.preventDefault()
          openPicker()
          break
        case "ArrowLeft":
          setDate((d) => shiftDay(d, -1))
          break
        case "ArrowRight":
          setDate((d) => (isFuture(shiftDay(d, 1)) ? d : shiftDay(d, 1)))
          break
        case "t":
          setDate(todayKey())
          break
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openPicker, pickerOpen, entry])

  const handleDelete = (set: SetEntry, exercise: Exercise) => {
    deleteSet(set.id)
    setUndo({ set, message: `Deleted ${summarise(set, exercise, state.prefs.units)}` })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col border-x">
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
        ) : entries.length === 0 ? (
          <EmptyDay isToday={date === todayKey()} />
        ) : (
          <DayLog
            entries={entries}
            units={state.prefs.units}
            clock={state.prefs.clock}
            onAddTo={(exercise) => setEntry({ exercise, editing: null })}
            onEdit={(exercise, set) => setEntry({ exercise, editing: set })}
            onDuplicate={(set) => duplicateSet(set.id)}
            onDelete={handleDelete}
          />
        )}
      </div>

      <BottomBar date={date} onChangeDate={setDate} onAdd={openPicker} />

      {undo && (
        <Toast
          message={undo.message}
          actionLabel="Undo"
          onAction={() => {
            restoreSet(undo.set)
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

      <SetEntrySheet
        open={Boolean(entry)}
        exercise={entry?.exercise ?? null}
        editing={entry?.editing ?? null}
        date={date}
        onClose={() => setEntry(null)}
      />
    </main>
  )
}
