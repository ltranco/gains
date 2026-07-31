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

export function isPreset(v: string): v is AccentChoice {
  return v in ACCENTS
}

export const HEX = /^#[0-9a-fA-F]{6}$/

/** Accepts `#abc123`, `abc123`, or `ABC123`; returns the normalised form or null. */
export function normaliseHex(input: string): string | null {
  const v = input.trim()
  const withHash = v.startsWith("#") ? v : `#${v}`
  return HEX.test(withHash) ? withHash.toLowerCase() : null
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function darken(hex: string, factor = 0.87): string {
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, "0")
  const [r, g, b] = channels(hex)
  return `#${to2(r * factor)}${to2(g * factor)}${to2(b * factor)}`
}

/**
 * WCAG relative luminance, used to decide whether a filled button in this colour needs white
 * or near-black text. Without it a custom yellow produces white-on-yellow, which is the
 * failure mode of every "pick any colour" theme picker.
 */
function luminance(hex: string): number {
  const srgb = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
}

export interface ResolvedAccent {
  base: string
  hover: string
  text: string
}

/** A preset key or a hex string → the three values the CSS variables need. */
export function resolveAccent(value: string): ResolvedAccent | null {
  if (isPreset(value)) {
    const preset = ACCENTS[value]
    return { base: preset.base, hover: preset.hover, text: "#ffffff" }
  }
  const hex = normaliseHex(value)
  if (!hex) return null
  return {
    base: hex,
    hover: darken(hex),
    text: luminance(hex) > 0.45 ? "#16161a" : "#ffffff",
  }
}
