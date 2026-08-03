"use client"

import { formatDayLabel, isFuture, shiftDay } from "@/lib/date"
import { Apple, Barbell, ChevronLeft, ChevronRight } from "./icons"

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
 * Anything logged weekly — a waist measurement — does not earn a slot here; it's a section down
 * inside the food picker, findable by search.
 */
export function BottomBar({
  date,
  onStep,
  onOpenPicker,
  onAddExercise,
  onAddFood,
}: {
  date: string
  onStep: (days: number) => void
  onOpenPicker: () => void
  onAddExercise: () => void
  onAddFood: () => void
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
        <AddButton label="Food" onClick={onAddFood}>
          <Apple size={17} />
        </AddButton>
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
