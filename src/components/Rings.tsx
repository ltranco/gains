"use client"

import { useEffect, useState } from "react"

import type { MacroKey } from "@/lib/food"
import type { Progress } from "@/lib/select"
import { formatCount } from "@/lib/units"

/**
 * The day's macros, as rings. One per macro with a target, all the same size.
 *
 * Uniform on purpose. An earlier version drew calories large and the macros small, which implied a
 * hierarchy that isn't there — you read all four at once, and the odd sizes made the block taller
 * than the log it sits above. Same diameter, value inside, target underneath.
 *
 * Each ring is a button that opens the food sheet, so tapping a ring is a way to add a meal rather
 * than a dead end.
 *
 * ## Why the numbers under each ring are not decoration
 *
 * The four hues pass the CVD separation check in the band that is only legal *alongside* secondary
 * encoding. The label and the target are that encoding. Removing them to tidy the block up would
 * make two of the rings indistinguishable to a red-green colourblind reader.
 */

/**
 * Stroke is deliberately ~1/6 of the diameter. A thin ring reads as a progress bar bent into a
 * circle; the Activity look comes from a band thick enough to have a face, with just enough hole
 * left for the number.
 */
const SIZE = 60
const STROKE = 10

/** Ring hue per macro. Fixed, so calories are always the same colour as yesterday. */
const HUE: Record<MacroKey, string> = {
  kcal: "var(--ring-1)",
  protein: "var(--ring-2)",
  carbs: "var(--ring-3)",
  fat: "var(--ring-4)",
}

/** Sweeps the arcs in from empty on mount. Remount — a new `key` — replays it. */
function useArmed(): boolean {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    // Two frames: one for the browser to paint the empty state, one to transition away from it.
    // A single rAF sometimes coalesces with the initial paint and the ring just appears.
    const outer = requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)))
    return () => cancelAnimationFrame(outer)
  }, [])
  return armed
}

export function Rings({
  progress,
  onAdd,
}: {
  progress: Progress[]
  onAdd: () => void
}) {
  const armed = useArmed()
  if (progress.length === 0) return null

  return (
    <section className="flex items-start justify-around gap-1 border-b px-3 py-3">
      {progress.map((p, i) => (
        <RingCell key={p.macro.key} progress={p} index={i} armed={armed} onAdd={onAdd} />
      ))}
    </section>
  )
}

function RingCell({
  progress,
  index,
  armed,
  onAdd,
}: {
  progress: Progress
  /** Staggers the sweep, so the four arrive in sequence rather than as one lump. */
  index: number
  armed: boolean
  onAdd: () => void
}) {
  const { macro, total, target, fraction } = progress

  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`${macro.label}: ${formatCount(total)} of ${formatCount(target)} ${macro.unit}. Add food.`}
      className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-0.5 transition-colors hover:bg-[var(--bg-hover)]"
    >
      <span
        className="relative flex shrink-0 items-center justify-center"
        style={{ width: SIZE, height: SIZE }}
      >
        <Arc
          fraction={fraction}
          colour={HUE[macro.key]}
          armed={armed}
          delay={index * 80}
        />
        {/* Inside the ring, always — it's the number you came for. In the ring's own hue rather
            than the text colour: it names which arc it belongs to without a second label, and the
            thick stroke around it carries the contrast the small type can't. Sized down past four
            digits so 2,900 doesn't touch the band. */}
        <span
          className="nums absolute"
          style={{
            fontSize: total >= 1000 ? 11 : 13,
            letterSpacing: "-0.04em",
            color: HUE[macro.key],
          }}
        >
          {formatCount(total)}
        </span>
      </span>

      {/* Name and target on one line, so the block is a ring plus a caption rather than three
          stacked rows. */}
      <span className="flex max-w-full items-baseline gap-1 truncate">
        <span className="truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
          {macro.label}
        </span>
        <span className="nums-quiet shrink-0 text-[9px]" style={{ color: "var(--text-faint)" }}>
          /{formatCount(target)}
        </span>
      </span>
    </button>
  )
}

/**
 * One arc. `stroke-dasharray` is the full circumference and `stroke-dashoffset` is how much of it
 * to hide, so the visible sweep is a single animatable number.
 *
 * Over target draws a second lap on top, the way Activity does — capping at full would make 2,900
 * kcal against a 2,200 target look exactly like hitting it.
 *
 * Getting that lap *visible* took two goes. Drawing it at partial alpha in the same hue was
 * invisible, because a translucent orange arc over an opaque orange arc is just orange. Dimming the
 * lap underneath instead made it visible but said the wrong thing: at 1.2× the only bright arc left
 * was the 20% overflow, so a day well past its target read at a glance as barely started. What
 * works is keeping the completed lap at full strength and tinting the overflow towards white — the
 * ring stays emphatically full, and the pale arc on top is the "and then some".
 */
function Arc({
  fraction,
  colour,
  armed,
  delay,
}: {
  fraction: number
  colour: string
  armed: boolean
  delay: number
}) {
  const r = (SIZE - STROKE) / 2
  const c = 2 * Math.PI * r
  const first = Math.min(Math.max(fraction, 0), 1)
  const second = Math.min(Math.max(fraction - 1, 0), 1)

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      {/* Twelve o'clock start, clockwise, like every dial anyone has ever read. */}
      <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={STROKE}
        />
        <circle
          className="ring-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={STROKE}
          // A round cap at zero would draw a stray dot on an empty ring.
          strokeLinecap={first > 0.001 ? "round" : "butt"}
          strokeDasharray={c}
          strokeDashoffset={armed ? c * (1 - first) : c}
          style={{ transitionDelay: `${delay}ms` }}
        />
        {second > 0 && (
          <circle
            className="ring-arc"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            // Same hue pulled towards white, so it reads over the lap it sits on in either theme.
            stroke={`color-mix(in oklab, ${colour} 42%, white)`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={armed ? c * (1 - second) : c}
            style={{
              transitionDelay: `${delay + 240}ms`,
              // The shadow is what sells it. Tint alone reads as a two-tone ring; a cast shadow
              // reads as one band physically lying over another and wrapping round behind it.
              filter: "drop-shadow(0 0 1.5px rgba(0,0,0,0.45))",
            }}
          />
        )}
      </g>
    </svg>
  )
}
