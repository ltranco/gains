"use client"

import { useEffect } from "react"

/**
 * Sits above the bottom bar and offers one action. It exists because delete is now a single
 * unconfirmed tap — that's the right call for logging speed, but only if the mistake is
 * cheap to reverse. A confirm dialog would cost a tap every time; undo costs one only when
 * you actually got it wrong.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 5000,
}: {
  message: string
  actionLabel: string
  onAction: () => void
  onDismiss: () => void
  duration?: number
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
    // `message` in the deps restarts the clock when a second delete replaces the first.
  }, [message, duration, onDismiss])

  return (
    <div
      className="toast-in pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 6.25rem)" }}
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto flex max-w-[400px] flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2"
        style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-pop)" }}
      >
        <span className="min-w-0 truncate text-[13px]" style={{ color: "var(--text-muted)" }}>
          {message}
        </span>
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--accent)" }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
