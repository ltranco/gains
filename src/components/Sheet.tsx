"use client"

import { useEffect, useRef } from "react"

import { Close } from "./icons"

/**
 * Bottom sheet on phones, centred panel from `sm` up — the same component either way, since
 * this is a responsive site rather than a mobile app wearing a browser.
 *
 * Deliberately closes on scrim click and Escape only. No drag-to-dismiss: a swipe handler
 * is invisible to a mouse and a keyboard, and the header already carries a real close button
 * that works for all three.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  fullHeight = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  /**
   * Pin the panel to a fixed tall height instead of letting content size it. Without this a
   * sheet whose list empties out collapses to the height of its header and slides down behind
   * the iOS keyboard, taking the search field with it.
   */
  fullHeight?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)

    // Lock the page behind the sheet. Without this, iOS scrolls the body when the sheet's
    // own content hits its end.
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="sheet-scrim absolute inset-0 cursor-default"
        style={{ background: "var(--overlay)" }}
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        className="sheet-panel relative flex w-full flex-col overflow-hidden rounded-t-2xl sm:max-w-[440px] sm:rounded-2xl"
        style={{
          background: "var(--bg-elevated)",
          boxShadow: "var(--shadow-sheet)",
          paddingBottom: "env(safe-area-inset-bottom)",
          // dvh, not vh: iOS shrinks the dynamic viewport when the keyboard comes up, so the
          // panel tracks the space actually left rather than sliding under it.
          maxHeight: "92dvh",
          ...(fullHeight ? { height: "92dvh" } : {}),
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            <Close size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t px-4 py-3" style={{ background: "var(--bg-elevated)" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
