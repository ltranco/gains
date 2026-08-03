"use client"

import { useId } from "react"

/**
 * A labelled numeric field with thumb-sized steppers either side. The native spinners are
 * a few pixels tall and unusable one-handed, which is the only way this app ever gets used.
 *
 * `inputMode="decimal"` rather than `type="number"`: it still summons the iOS number pad, but
 * keeps the value a plain string so a half-typed "1." doesn't get silently normalised, and
 * avoids the scroll-wheel-changes-the-value trap on desktop.
 */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  step,
  min = 0,
  suffix,
  placeholder,
  autoFocus,
  inputMode = "decimal",
}: {
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  step: number
  min?: number
  suffix?: string
  placeholder?: string
  autoFocus?: boolean
  inputMode?: "decimal" | "numeric" | "text"
}) {
  const id = useId()

  const nudge = (delta: number) => {
    // Strip grouping: a prefilled 1,250 must still step to 1,252.5.
    const current = Number(value.replace(/,/g, ""))
    const base = Number.isFinite(current) ? current : 0
    const next = Math.max(min, Math.round((base + delta) * 100) / 100)
    onChange(String(next))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {label}
        </label>
        {hint && (
          <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            {hint}
          </span>
        )}
      </div>

      <div
        className="flex items-stretch overflow-hidden rounded-lg border focus-within:border-[var(--accent)]"
        style={{ background: "var(--bg-subtle)" }}
      >
        <Stepper label={`Decrease ${label}`} onClick={() => nudge(-step)}>
          −
        </Stepper>

        <div className="relative flex min-w-0 flex-1 items-center justify-center">
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode={inputMode}
            autoComplete="off"
            placeholder={placeholder}
            autoFocus={autoFocus}
            // Select-all on focus so tapping a prefilled field and typing replaces it,
            // rather than appending to last set's number.
            onFocus={(e) => e.currentTarget.select()}
            className="nums w-full border-x-0 bg-transparent py-2.5 text-center text-[17px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--text-faint)]"
          />
          {suffix && (
            <span
              className="pointer-events-none absolute right-2 text-[12px]"
              style={{ color: "var(--text-faint)" }}
            >
              {suffix}
            </span>
          )}
        </div>

        <Stepper label={`Increase ${label}`} onClick={() => nudge(step)}>
          +
        </Stepper>
      </div>
    </div>
  )
}

function Stepper({
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
      aria-label={label}
      onClick={onClick}
      className="flex w-11 shrink-0 items-center justify-center text-[17px] transition-colors select-none hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </button>
  )
}

/** Free-text field for values the steppers can't help with, like `1:30`. */
export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  autoFocus,
  freeText = false,
}: {
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  autoFocus?: boolean
  /**
   * Actual prose rather than a number in disguise — a food's name.
   *
   * Gets the sans face, left alignment and a normal keyboard, and keeps whatever is already there
   * on focus. The mono, centred, select-all-on-focus treatment is right for a measurement you're
   * replacing wholesale and wrong for a word you're correcting a letter of.
   */
  freeText?: boolean
}) {
  const id = useId()
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {label}
        </label>
        {hint && (
          <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            {hint}
          </span>
        )}
      </div>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={freeText ? "text" : "numeric"}
        autoComplete="off"
        autoCapitalize={freeText ? "sentences" : "none"}
        enterKeyHint={freeText ? "next" : undefined}
        onFocus={freeText ? undefined : (e) => e.currentTarget.select()}
        className={
          freeText
            ? "w-full rounded-lg border px-3 py-2.5 text-[16px] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
            : "nums w-full rounded-lg border py-2.5 text-center text-[17px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
        }
        style={{ background: "var(--bg-subtle)" }}
      />
    </div>
  )
}

/**
 * A real `<input type="datetime-local">`, not a text box.
 *
 * Day and time together, because moving a set to the right day is the same correction as
 * moving it to the right minute. The platform picker beats anything worth hand-rolling: iOS
 * gives its wheel, desktop a calendar and spinner, and the value comes back as
 * `YYYY-MM-DDTHH:mm` in local time whatever the locale displays.
 */
export function DateTimeField({
  label,
  hint,
  value,
  max,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  /** Upper bound, same shape as `value`. A set cannot have happened in the future. */
  max?: string
  onChange: (next: string) => void
}) {
  const id = useId()
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {label}
        </label>
        {hint && (
          <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            {hint}
          </span>
        )}
      </div>
      <input
        id={id}
        type="datetime-local"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        step={60}
        className="nums w-full rounded-lg border py-2.5 text-center text-[17px] font-medium outline-none focus:border-[var(--accent)]"
        style={{ background: "var(--bg-subtle)", colorScheme: "inherit" }}
      />
    </div>
  )
}
