/**
 * The empty day. A barbell doing one slow rep, in SVG with CSS keyframes rather than a
 * Lottie runtime: it's a couple of hundred bytes instead of a couple of hundred kilobytes,
 * inherits the theme through `currentColor`, and goes still under
 * `prefers-reduced-motion` — none of which a prebaked animation JSON does for free.
 */
export function EmptyDay({ isToday }: { isToday: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-14">
      <svg
        width="112"
        height="76"
        viewBox="0 0 112 76"
        aria-hidden="true"
        style={{ color: "var(--text-faint)" }}
      >
        {/* Ground shadow, tightening as the bar rises. */}
        <ellipse
          className="ground-pulse"
          cx="56"
          cy="64"
          rx="30"
          ry="3.5"
          fill="currentColor"
          opacity="0.5"
        />

        <g className="rep-lift">
          {/* Knurled bar. */}
          <rect x="34" y="32" width="44" height="5" rx="2.5" fill="currentColor" />
          <g opacity="0.55" fill="currentColor">
            <rect x="45" y="33.4" width="1.2" height="2.2" rx="0.6" />
            <rect x="49" y="33.4" width="1.2" height="2.2" rx="0.6" />
            <rect x="53" y="33.4" width="1.2" height="2.2" rx="0.6" />
            <rect x="57" y="33.4" width="1.2" height="2.2" rx="0.6" />
            <rect x="61" y="33.4" width="1.2" height="2.2" rx="0.6" />
            <rect x="65" y="33.4" width="1.2" height="2.2" rx="0.6" />
          </g>

          {/* Plates, flexing slightly at lockout. */}
          <g className="bar-flex" fill="currentColor">
            <rect x="24" y="19" width="7" height="31" rx="3.5" />
            <rect x="15" y="24" width="6" height="21" rx="3" opacity="0.7" />
            <rect x="81" y="19" width="7" height="31" rx="3.5" />
            <rect x="91" y="24" width="6" height="21" rx="3" opacity="0.7" />
          </g>

          {/* Collars. */}
          <g fill="currentColor" opacity="0.85">
            <rect x="32" y="28" width="2.5" height="13" rx="1.25" />
            <rect x="77.5" y="28" width="2.5" height="13" rx="1.25" />
          </g>
        </g>
      </svg>

      <p className="mt-5 text-[14px] font-medium" style={{ color: "var(--text-muted)" }}>
        Nothing logged {isToday ? "today" : "this day"}
      </p>
    </div>
  )
}
