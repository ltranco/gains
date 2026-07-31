/**
 * A kettlebell: handle arc over a bell. Reads at 14px in a way a barbell doesn't — a barbell
 * is a horizontal line with two blobs, which at icon size is just a line with two blobs.
 *
 * No wordmark. The app is one screen; a lockup announcing its own name on every view is
 * chrome that never earns its place.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[6px]"
      style={{ background: "var(--accent)", width: size, height: size }}
      aria-label="gains"
      role="img"
    >
      <Kettlebell size={Math.round(size * 0.62)} color="#fff" />
    </span>
  )
}

export function Kettlebell({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    // viewBox cropped to the glyph's actual bounds, so `size` is the drawn size rather than
    // the size of a box the drawing floats inside.
    <svg width={size} height={size} viewBox="4.6 5.6 14.8 14.8" aria-hidden="true" fill="none">
      {/* Handle */}
      <path
        d="M8.6 10.7V9.4a3.4 3.4 0 016.8 0v1.3"
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* Bell */}
      <path
        d="M12 10.1c-4 0-6.8 3.4-6.8 6.7 0 1.7 1.1 2.8 2.8 2.8h8c1.7 0 2.8-1.1 2.8-2.8 0-3.3-2.8-6.7-6.8-6.7z"
        fill={color}
      />
    </svg>
  )
}
