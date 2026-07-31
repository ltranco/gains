import type { AccentChoice } from "./types"

/**
 * The seven accents. One hex per accent regardless of light or dark, deliberately: each is a
 * mid-tone that holds up on both a white and a near-black ground, and a scheme-specific pair
 * would double the CSS for a difference nobody would notice.
 *
 * All are dark enough to carry white text on a filled button — that's the constraint that
 * ruled out the brighter teals and ambers, which look lovely as a swatch and turn a primary
 * button into mush.
 */
export const ACCENTS: Record<AccentChoice, { label: string; base: string; hover: string }> = {
  indigo: { label: "Indigo", base: "#5E6AD2", hover: "#525FC9" },
  blue: { label: "Blue", base: "#3E63DD", hover: "#3556CE" },
  teal: { label: "Teal", base: "#0E8175", hover: "#0B6E64" },
  green: { label: "Green", base: "#2F7D4F", hover: "#276B43" },
  orange: { label: "Orange", base: "#C2570C", hover: "#A94B0A" },
  red: { label: "Red", base: "#D13438", hover: "#BC2C30" },
  violet: { label: "Violet", base: "#8E4EC6", hover: "#7E42B4" },
}

export const ACCENT_ORDER: AccentChoice[] = [
  "indigo",
  "blue",
  "teal",
  "green",
  "orange",
  "red",
  "violet",
]

export const DEFAULT_ACCENT: AccentChoice = "indigo"

export function isAccent(v: unknown): v is AccentChoice {
  return typeof v === "string" && v in ACCENTS
}
