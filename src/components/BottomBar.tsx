"use client"

import { formatDayLabel, isFuture, shiftDay, todayKey } from "@/lib/date"
import { ChevronLeft, ChevronRight, Plus } from "./icons"

/**
 * Everything you touch mid-session, docked to the bottom edge: the day you're logging
 * against and the button that starts a set. On a phone this is the only part of the screen
 * your thumb reaches without regripping, which is why the date moved down here from the
 * header.
 */
export function BottomBar({
  date,
  onChangeDate,
  onAdd,
}: {
  date: string
  onChangeDate: (next: string) => void
  onAdd: () => void
}) {
  const atToday = date === todayKey()
  const nextDay = shiftDay(date, 1)

  return (
    <div
      className="sticky bottom-0 z-20 border-t"
      style={{
        background: "var(--bg)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)",
      }}
    >
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
        <StepButton label="Previous day" onClick={() => onChangeDate(shiftDay(date, -1))}>
          <ChevronLeft size={18} />
        </StepButton>

        <div className="min-w-0 flex-1 text-center">
          {/*
            A native date input under an invisible overlay: iOS gives its own wheel and
            desktop its own picker, both better than a hand-rolled calendar. The visible label
            sits on top so it can say "Today" rather than a raw date.
          */}
          <label className="relative inline-flex cursor-pointer items-baseline justify-center px-2 py-1">
            <span className="text-[14px] font-semibold">{formatDayLabel(date)}</span>
            <input
              type="date"
              value={date}
              max={todayKey()}
              onChange={(e) => e.target.value && onChangeDate(e.target.value)}
              aria-label="Pick a date"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        <StepButton
          label="Next day"
          onClick={() => onChangeDate(nextDay)}
          disabled={isFuture(nextDay)}
        >
          <ChevronRight size={18} />
        </StepButton>

        {/* Only earns its space once you've navigated away from today. */}
        {!atToday && (
          <button
            type="button"
            onClick={() => onChangeDate(todayKey())}
            className="rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--accent)" }}
          >
            Today
          </button>
        )}
      </div>

      <div className="px-3 pt-1">
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-3 text-[15px] font-semibold transition-colors"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          <Plus size={17} />
          Add exercise
        </button>
      </div>
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
