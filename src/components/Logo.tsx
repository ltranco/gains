/**
 * The mark: a barbell abstracted to three strokes, matching the home-screen icon so the
 * installed app and the header read as the same product. Set in the accent tile at small
 * sizes because a hairline glyph disappears against a busy page.
 *
 * The wordmark stays lowercase — the app is called gains, not Gains.
 */
export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2 select-none">
      <span
        className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px]"
        style={{ background: "var(--accent)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="#fff">
          <rect x="7" y="10.6" width="10" height="2.8" rx="1.4" />
          <rect x="3.2" y="7" width="3.4" height="10" rx="1.7" />
          <rect x="17.4" y="7" width="3.4" height="10" rx="1.7" />
        </svg>
      </span>
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-[-0.02em]">gains</span>
      )}
    </span>
  )
}
