"use client"

import { useEffect, useRef, useState } from "react"

import { formatDayLabel, isFuture, shiftDay } from "@/lib/date"
import { Apple, Barbell, ChevronLeft, ChevronRight, ChevronUp } from "./icons"

/**
 * Everything you touch mid-session, docked to the bottom edge — on a phone this is the only
 * part of the screen a thumb reaches without regripping.
 *
 * The layout is fixed: two arrows and a date, always the same three slots. A "Today" button
 * that appeared and vanished depending on the selected day shifted everything each time it
 * came and went; Today now lives inside the date picker, where it belongs.
 *
 * Two add buttons, not one with a menu. Exercise and food are both logged several times a day,
 * so making either of them a second tap behind a chooser taxes the two things this app is for.
 *
 * Anything logged weekly hangs off the caret on the Food button instead. A metric earns a door,
 * not a slot: it was briefly a row at the foot of the day, which was one more thing on screen at
 * all times for something touched once a week.
 */
export function BottomBar({
  date,
  onStep,
  onOpenPicker,
  onAddExercise,
  onAddFood,
  onAddMetric,
}: {
  date: string
  onStep: (days: number) => void
  onOpenPicker: () => void
  onAddExercise: () => void
  onAddFood: () => void
  onAddMetric: () => void
}) {
  return (
    <div
      className="sticky bottom-0 z-20 border-t"
      style={{
        background: "var(--bg)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)",
      }}
    >
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
        <StepButton label="Previous day" onClick={() => onStep(-1)}>
          <ChevronLeft size={18} />
        </StepButton>

        <button
          type="button"
          onClick={onOpenPicker}
          className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-[14px] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
        >
          {formatDayLabel(date)}
        </button>

        <StepButton
          label="Next day"
          onClick={() => onStep(1)}
          disabled={isFuture(shiftDay(date, 1))}
        >
          <ChevronRight size={18} />
        </StepButton>
      </div>

      <div className="flex gap-2 px-3 pt-1">
        <AddButton label="Exercise" onClick={onAddExercise}>
          <Barbell size={17} />
        </AddButton>
        <FoodButton onAddFood={onAddFood} onAddMetric={onAddMetric} />
      </div>
    </div>
  )
}

/** Equal weight, equal width. Neither of these is the secondary one. */
function AddButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-3 text-[15px] font-semibold transition-colors"
      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
    >
      {children}
      {label}
    </button>
  )
}

/**
 * Food, with a caret on its left for the things you log rarely.
 *
 * A real button rather than a long-press: this is a responsive site, so every action has to work
 * with a finger, a mouse and a keyboard. The menu closes on Escape, on a click anywhere outside it,
 * and on choosing something.
 */
function FoodButton({
  onAddFood,
  onAddMetric,
}: {
  onAddFood: () => void
  onAddMetric: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative flex flex-1">
      <div
        className="flex flex-1 overflow-hidden rounded-lg"
        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="More to log"
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-10 shrink-0 items-center justify-center transition-colors"
          // A hairline of the button's own text colour, so the split reads without a second hue.
          style={{
            borderRight: "1px solid color-mix(in srgb, var(--accent-text) 25%, transparent)",
            background: open ? "rgba(0,0,0,0.14)" : undefined,
          }}
        >
          <ChevronUp size={16} />
        </button>

        <button
          type="button"
          onClick={onAddFood}
          className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[15px] font-semibold"
        >
          <Apple size={17} />
          Food
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full z-30 mb-2 min-w-[160px] overflow-hidden rounded-lg border"
          style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-pop)" }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onAddMetric()
            }}
            className="block w-full px-3.5 py-2.5 text-left text-[14px] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Metric
          </button>
        </div>
      )}
    </div>
  )
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-25"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </button>
  )
}
