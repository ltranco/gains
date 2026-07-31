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
    const current = Number(value)
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
}: {
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  autoFocus?: boolean
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
        inputMode="numeric"
        autoComplete="off"
        onFocus={(e) => e.currentTarget.select()}
        className="nums w-full rounded-lg border py-2.5 text-center text-[17px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
        style={{ background: "var(--bg-subtle)" }}
      />
    </div>
  )
}
