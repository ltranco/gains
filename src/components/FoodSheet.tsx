"use client"

import { useEffect, useState } from "react"

import { dateTimeLocalValue, parseDateTimeLocal, toDayKey } from "@/lib/date"
import { MACROS, valueOf, type MacroKey } from "@/lib/food"
import type { FoodEntry } from "@/lib/types"
import { useStore } from "@/providers/StoreProvider"
import { Sheet } from "./Sheet"
import { DateTimeField, NumberField, TextField } from "./NumberField"

/**
 * One thing you ate: a name and four macros.
 *
 * The name comes first and is the only free-text field in the app, because it's the thing you'll
 * read the row back by. It is *not* required — a bowl with no name is still 620 kcal, and demanding
 * a label before you can log a snack is how logging stops happening.
 *
 * A blank macro is stored as 0 rather than refused. You are copying a label, and a blank on a
 * label means none. Calories are the one field worth insisting on: a food with no calories is not
 * a food you were trying to record.
 *
 * Nothing is focused on open, unlike the single-field sheets. Five fields plus a keyboard is more
 * than fits, and raising it before you've said which field you want covered the four you probably
 * did want.
 */

type Draft = Record<MacroKey, string> & { name: string; at: string }

const EMPTY: Draft = { name: "", kcal: "", protein: "", carbs: "", fat: "", at: "" }

function draftFrom(food: FoodEntry): Draft {
  const out = { ...EMPTY, name: food.name, at: dateTimeLocalValue(food.loggedAt) }
  for (const macro of MACROS) {
    const v = valueOf(food, macro)
    out[macro.key] = v === 0 ? "" : String(v)
  }
  return out
}

export function FoodSheet({
  open,
  date,
  editing,
  onClose,
}: {
  open: boolean
  date: string
  /** Present when opened from an existing row; the sheet becomes a single-save editor. */
  editing?: FoodEntry | null
  onClose: () => void
}) {
  const { addFoods, updateFood, deleteFood } = useStore()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(editing ? draftFrom(editing) : EMPTY)
    setError(null)
  }, [open, editing])

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const commit = () => {
    const kcal = Number(draft.kcal.trim().replace(/,/g, ""))
    if (!draft.kcal.trim() || !Number.isFinite(kcal) || kcal <= 0) {
      setError("Enter the calories.")
      return
    }
    setError(null)

    const macro = (key: MacroKey): number => {
      const raw = draft[key].trim().replace(/,/g, "")
      if (!raw) return 0
      const n = Number(raw)
      return Number.isFinite(n) && n >= 0 ? n : 0
    }

    const values = {
      name: draft.name.trim(),
      kcal,
      proteinG: macro("protein"),
      carbsG: macro("carbs"),
      fatG: macro("fat"),
    }

    if (editing) {
      // Moving a food changes its identity remotely, so it takes the same repair path as any other
      // edit: the old samples are retracted and rewritten at the new instant. `date` moves with it,
      // since that is what the day view groups on.
      const parsed = parseDateTimeLocal(draft.at)
      const moved = parsed && parsed.getTime() <= Date.now() ? parsed : null
      updateFood(editing.id, {
        ...values,
        ...(moved ? { loggedAt: moved.toISOString(), date: toDayKey(moved) } : {}),
      })
    } else {
      addFoods([{ date, ...values }])
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit food" : "Add food"}
      footer={
        <div className="flex gap-2">
          {editing && (
            <button
              type="button"
              onClick={() => {
                deleteFood(editing.id)
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
            {editing ? "Save" : "Add food"}
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
        <TextField
          label="Food"
          hint="optional"
          value={draft.name}
          onChange={set("name")}
          placeholder="Chicken bowl"
          freeText
        />

        {MACROS.map((macro) => (
          <NumberField
            key={macro.key}
            label={macro.label}
            value={draft[macro.key]}
            onChange={set(macro.key)}
            step={macro.step}
            suffix={macro.unit}
            placeholder="0"
          />
        ))}

        {/* Last, and deliberately quiet: you are correcting a record, not logging one. */}
        {editing && (
          <DateTimeField
            label="Logged at"
            value={draft.at}
            max={dateTimeLocalValue(new Date().toISOString())}
            onChange={set("at")}
          />
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
