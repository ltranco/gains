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

export const Settings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Svg>
)

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
)
