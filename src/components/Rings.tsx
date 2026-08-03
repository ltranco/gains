"use client"

import { useEffect, useState } from "react"

import type { Progress } from "@/lib/select"
import type { Tracker, UnitSystem } from "@/lib/types"
import { trackerUnit, trackerValue } from "@/lib/units"

/**
 * The day's nutrition, as rings.
 *
 * One large ring for the first metric with a target — calories, by the order they're declared —
 * and a small one for each of the rest. A metric with no target isn't here at all: an arc is a
 * fraction of something, and with no denominator there is nothing truthful to draw.
 *
 * Each ring is a button that opens its own entry sheet, so the fastest way to log protein is to
 * tap the protein ring. That's the reason this block sits above the log rather than below it.
 *
 * ## Why the numbers under each ring are not decoration
 *
 * The four hues pass the CVD separation check in the band that is only legal *alongside*
 * secondary encoding. The name and the value are that encoding. Removing them to tidy the block
 * up would make two of the rings indistinguishable to a red-green colourblind reader.
 */

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
  units,
  onPick,
}: {
  progress: Progress[]
  units: UnitSystem
  onPick: (tracker: Tracker) => void
}) {
  const armed = useArmed()
  if (progress.length === 0) return null

  const [primary, ...rest] = progress

  return (
    <section className="flex items-center gap-4 border-b px-4 py-3.5">
      {primary && (
        <RingCell
          progress={primary}
          index={0}
          size={88}
          stroke={9}
          units={units}
          armed={armed}
          onPick={onPick}
        />
      )}

      {rest.length > 0 && (
        <div className="flex min-w-0 flex-1 justify-around gap-2">
          {rest.map((p, i) => (
            <RingCell
              key={p.tracker.id}
              progress={p}
              index={i + 1}
              size={46}
              stroke={6}
              units={units}
              armed={armed}
              onPick={onPick}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RingCell({
  progress,
  index,
  size,
  stroke,
  units,
  armed,
  onPick,
}: {
  progress: Progress
  /** Position in the block: picks the hue and staggers the sweep. */
  index: number
  size: number
  stroke: number
  units: UnitSystem
  armed: boolean
  onPick: (tracker: Tracker) => void
}) {
  const { tracker, total, target, fraction } = progress
  const colour = `var(--ring-${(index % 4) + 1})`
  const large = size > 60
  const unit = trackerUnit(tracker.unit, units)

  return (
    <button
      type="button"
      onClick={() => onPick(tracker)}
      // The accessible name carries what the ring means; the arc itself is aria-hidden.
      aria-label={`${tracker.name}: ${trackerValue(total, tracker.unit, units)} of ${trackerValue(
        target,
        tracker.unit,
        units,
      )} ${unit}. Add an entry.`}
      className="flex min-w-0 shrink-0 flex-col items-center gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--bg-hover)]"
    >
      <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <Arc fraction={fraction} size={size} stroke={stroke} colour={colour} armed={armed} delay={index * 90} />
        {large && (
          <span className="absolute flex flex-col items-center leading-none">
            <span className="nums text-[15px]">{trackerValue(total, tracker.unit, units)}</span>
            <span className="mt-0.5 text-[9px]" style={{ color: "var(--text-faint)" }}>
              {unit}
            </span>
          </span>
        )}
      </span>

      <span className="flex flex-col items-center leading-tight">
        <span
          className={`max-w-[72px] truncate ${large ? "text-[12px]" : "text-[10px]"}`}
          style={{ color: "var(--text-muted)" }}
        >
          {tracker.name}
        </span>
        <span
          className={`nums-quiet ${large ? "text-[11px]" : "text-[10px]"}`}
          style={{ color: "var(--text-faint)" }}
        >
          {large
            ? `of ${trackerValue(target, tracker.unit, units)}`
            : `${trackerValue(total, tracker.unit, units)}/${trackerValue(target, tracker.unit, units)}`}
        </span>
      </span>
    </button>
  )
}

/**
 * One arc. `stroke-dasharray` is the full circumference and `stroke-dashoffset` is how much of it
 * to hide, so the visible sweep is a single animatable number.
 *
 * Over target draws a second lap on top, the way Activity does — capping at full would make 3,000
 * kcal against a 2,000 target look exactly like hitting it.
 */
function Arc({
  fraction,
  size,
  stroke,
  colour,
  armed,
  delay,
}: {
  fraction: number
  size: number
  stroke: number
  colour: string
  armed: boolean
  delay: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const first = Math.min(Math.max(fraction, 0), 1)
  const second = Math.min(Math.max(fraction - 1, 0), 1)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {/* Twelve o'clock start, clockwise, like every dial anyone has ever read. */}
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={stroke}
        />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          // A round cap at zero would draw a stray dot on an empty ring.
          strokeLinecap={first > 0.001 ? "round" : "butt"}
          strokeDasharray={c}
          strokeDashoffset={armed ? c * (1 - first) : c}
          style={{ transitionDelay: `${delay}ms` }}
        />
        {second > 0 && (
          <circle
            className="ring-arc"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={armed ? c * (1 - second) : c}
            // Lighter than the lap beneath it, so the overlap reads as a second pass rather
            // than as one thicker ring.
            opacity={0.5}
            style={{ transitionDelay: `${delay + 220}ms` }}
          />
        )}
      </g>
    </svg>
  )
}
