"use client"

import { useEffect, useRef, useState } from "react"

import { Close } from "./icons"

/**
 * Tracks the *visual* viewport — the part of the page not covered by the on-screen keyboard.
 *
 * iOS Safari doesn't shrink the layout viewport when the keyboard opens; it overlays it and
 * scrolls. `100dvh` therefore stays full-screen height, so a bottom-anchored sheet gets pushed
 * up until its own header is above the top of the screen. Sizing to `visualViewport` instead is
 * the fix where `interactive-widget=resizes-content` isn't supported.
 *
 * ## Why the resync exists
 *
 * Dismissing the keyboard left the sheet stranded: mispositioned, and no amount of tapping
 * brought it back. iOS does not reliably fire a final `resize` once the keyboard has finished
 * retracting — the last event it does fire carries a mid-animation `offsetTop`, and with the body
 * scroll-locked nothing afterwards nudges it. The stale offset then *is* the layout, permanently.
 *
 * So every signal schedules a few follow-up reads across the animation, and focus changes inside
 * the sheet count as signals. Reading the same value four times is free; reading it once and
 * being wrong is unrecoverable.
 */
function useVisualViewport(active: boolean) {
  const [rect, setRect] = useState<{ height: number; offsetTop: number } | null>(null)

  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    if (!vv) return

    const timers: number[] = []
    const read = () =>
      setRect({
        height: vv.height,
        // Never negative. A mid-animation offset can come back below zero, which translated the
        // whole dialog off the top of the screen.
        offsetTop: Math.max(0, vv.offsetTop),
      })

    const update = () => {
      read()
      // The keyboard animates for roughly a quarter of a second; catch it having settled.
      for (const t of timers.splice(0)) clearTimeout(t)
      for (const delay of [60, 200, 400]) timers.push(window.setTimeout(read, delay))
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    // A field losing focus is how the keyboard usually goes away, and it is the one signal that
    // arrives reliably when the resize event doesn't.
    window.addEventListener("focusin", update)
    window.addEventListener("focusout", update)
    window.addEventListener("orientationchange", update)

    return () => {
      for (const t of timers) clearTimeout(t)
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      window.removeEventListener("focusin", update)
      window.removeEventListener("focusout", update)
      window.removeEventListener("orientationchange", update)
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
      className={`sheet-frame fixed inset-x-0 top-0 z-50 flex justify-center ${
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
