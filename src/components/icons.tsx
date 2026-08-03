/**
 * Hand-rolled rather than pulling in an icon package for six glyphs. All inherit
 * `currentColor` and size from the `size` prop; stroke width 1.75 to sit right next to Inter
 * at body weight.
 */

interface IconProps {
  size?: number
  className?: string
}

function Svg({
  size = 16,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
)

export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18l6-6-6-6" />
  </Svg>
)

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)

export const Plus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const Close = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Svg>
)

export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
)

export const Duplicate = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 5.5A1.5 1.5 0 0013.5 4H5.5A1.5 1.5 0 004 5.5v8A1.5 1.5 0 005.5 15" />
  </Svg>
)

export const Trash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4.8A.8.8 0 019.8 4h4.4a.8.8 0 01.8.8V7" />
    <path d="M6.5 7l.8 12.2a.8.8 0 00.8.8h7.8a.8.8 0 00.8-.8L17.5 7" />
  </Svg>
)

/**
 * A cog with actual teeth. The previous version was a circle with radiating spokes, which
 * reads as a brightness control rather than settings.
 */
export const Cog = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.14 12.94a7.6 7.6 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.3 7.3 0 00-1.63-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.65 8.84a.5.5 0 00.12.64l2.03 1.58a7.6 7.6 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54a.5.5 0 00.5.42h3.84a.5.5 0 00.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64z" />
  </Svg>
)

export const Calendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" />
  </Svg>
)

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
)

export const Alert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5" />
    <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
)

/**
 * A loaded barbell, for the exercise half of the bottom bar.
 *
 * Drawn as a bar with two plates each side rather than a dumbbell — the app's own logo is a
 * barbell, so this reads as "the thing this app has always been about".
 */
export const Barbell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 12h6" />
    <path d="M6.5 8.5v7M9.5 7v10M14.5 7v10M17.5 8.5v7" />
    <path d="M3.5 10.5v3M20.5 10.5v3" />
  </Svg>
)

/**
 * An apple, for the food half. A fork-and-knife pair is the obvious choice and the wrong one:
 * at 17px the tines collapse into a smudge, and it reads as "restaurant" rather than "what I
 * ate".
 */
export const Apple = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 8.5c-1.2-1.4-3-2-4.6-1.2C5.4 8.2 4.5 10.6 5 13c.6 2.9 2.6 6.5 4.7 6.5.9 0 1.5-.4 2.3-.4s1.4.4 2.3.4c2.1 0 4.1-3.6 4.7-6.5.5-2.4-.4-4.8-2.4-5.7-1.6-.8-3.4-.2-4.6 1.2z" />
    <path d="M12 8.5c.2-1.6 1.3-3 2.9-3.4" />
  </Svg>
)

/** Spins via the `.spin` class in globals.css, which respects prefers-reduced-motion. */
export const Spinner = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className={`spin ${className ?? ""}`}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path
      d="M21 12a9 9 0 00-9-9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
)
