"use client"

import { useEffect, useRef, useState } from "react"

import { Close } from "./icons"

/**
 * Tracks the *visual* viewport — the part of the page not covered by the on-screen keyboard.
 *
 * iOS Safari doesn't shrink the layout viewport when the keyboard opens; it overlays it and
 * scrolls. `100dvh` therefore stays full-screen height, so a bottom-anchored sheet gets pushed
 * up until its own header — the search field — is above the top of the screen. Sizing to
 * `visualViewport` instead is the only reliable fix.
 */
function useVisualViewport(active: boolean) {
  const [rect, setRect] = useState<{ height: number; offsetTop: number } | null>(null)

  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    if (!vv) return

    const update = () => setRect({ height: vv.height, offsetTop: vv.offsetTop })
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setRect(null)
    }
  }, [active])

  return rect
}

/**
 * Bottom sheet on phones, centred panel from `sm` up — the same component either way, since
 * this is a responsive site rather than a mobile app wearing a browser.
 *
 * Closes on scrim click and Escape only. No drag-to-dismiss: a swipe handler is invisible to a
 * mouse and a keyboard, and the header already carries a real close button that works for all
 * three.
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
   * Fill the visible viewport and anchor to the top. Use for sheets that own a text input:
   * the header stays at the top of the screen with the keyboard below it, and an emptying
   * list can't collapse the panel out from under the field.
   */
  fullHeight?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const viewport = useVisualViewport(open)

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)

    // Lock the page behind the sheet. Without this, iOS scrolls the body when the sheet's own
    // content hits its end — which is also what lets the keyboard shove everything upward.
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  // Pin the whole dialog to the visible region. Falls back to dvh where visualViewport is
  // absent, which is every desktop browser worth worrying about and costs nothing there.
  const frame: React.CSSProperties = viewport
    ? { height: `${viewport.height}px`, transform: `translateY(${viewport.offsetTop}px)` }
    : { height: "100dvh" }

  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 flex justify-center ${
        fullHeight ? "items-stretch sm:items-center sm:py-6" : "items-end sm:items-center"
      }`}
      style={frame}
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
        className={`sheet-panel relative flex w-full flex-col overflow-hidden sm:max-w-[440px] sm:rounded-2xl ${
          fullHeight ? "sm:max-h-full" : "max-h-full rounded-t-2xl"
        }`}
        style={{
          background: "var(--bg-elevated)",
          boxShadow: "var(--shadow-sheet)",
          // Only the bottom-anchored variant needs to clear the home indicator; the
          // full-height one is already inside the visible viewport.
          ...(fullHeight ? {} : { paddingBottom: "env(safe-area-inset-bottom)" }),
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
          <div
            className="shrink-0 border-t px-4 py-3"
            style={{
              background: "var(--bg-elevated)",
              ...(fullHeight ? { paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" } : {}),
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
