/**
 * Subsequence fuzzy matching, scored so the obvious answer ranks first.
 *
 * Substring search made you type the words in the catalog's order: "db curl" found nothing,
 * "curl db" found nothing, and "bicep db" found nothing, even though all three obviously mean
 * Dumbbell Bicep Curl. Fuzzy matching accepts any subsequence, and the scoring is what stops
 * that from returning noise — a match at a word boundary or in a run of consecutive characters
 * is worth far more than a letter picked out of the middle of a word.
 */

const CONSECUTIVE = 8
const WORD_START = 10
const START_OF_STRING = 6
const GAP_PENALTY = 1
const LEADING_GAP_PENALTY = 2

/**
 * A contiguous hit always outranks a scattered one, by a margin no subsequence can close.
 *
 * Without this, matching is greedy-first and easy to sabotage: searching "curl" against
 * "Dumbbell Bicep Curl" latches onto the `c` in "Bi**c**ep", then has to reach across a gap for
 * "url" — scoring *worse* than "Dumbbell Wrist Curl", where the first `c` it meets is the real
 * one. That put Wrist, Hammer and Spider Curl above Bicep Curl for "db curl".
 */
const SUBSTRING_BASE = 100

/** Separators our display names and slugs actually use. */
function isBoundary(ch: string | undefined): boolean {
  return ch === " " || ch === "-" || ch === "_" || ch === "("
}

/**
 * Score of `needle` against `haystack`, or null if it isn't a subsequence at all.
 * Higher is better. Case-insensitive; the caller need not normalise.
 */
export function fuzzyScore(needle: string, haystack: string): number | null {
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (n.length === 0) return 0
  if (n.length > h.length) return null

  const at = h.indexOf(n)
  if (at !== -1) {
    let s = SUBSTRING_BASE
    if (at === 0) s += START_OF_STRING + WORD_START
    else if (isBoundary(h[at - 1])) s += WORD_START
    s -= Math.min(at, 20) * 0.5
    s -= Math.max(0, h.length - n.length) * 0.05
    return s
  }

  let score = 0
  let hi = 0
  let previousMatch = -1

  for (let ni = 0; ni < n.length; ni++) {
    const ch = n[ni]
    if (ch === " ") continue

    let found = -1
    while (hi < h.length) {
      if (h[hi] === ch) {
        found = hi
        hi++
        break
      }
      hi++
    }
    if (found === -1) return null

    if (found === 0) {
      score += START_OF_STRING + WORD_START
    } else if (isBoundary(h[found - 1])) {
      score += WORD_START
    }

    if (previousMatch >= 0 && found === previousMatch + 1) {
      score += CONSECUTIVE
    } else if (previousMatch >= 0) {
      score -= Math.min(found - previousMatch - 1, 6) * GAP_PENALTY
    } else {
      // A match deep into the string is weaker than one near the front.
      score -= Math.min(found, 10) * LEADING_GAP_PENALTY
    }

    previousMatch = found
  }

  // Prefer the tighter of two equal-quality matches.
  score -= Math.max(0, h.length - n.length) * 0.05
  return score
}

/**
 * Gym shorthand, expanded before matching.
 *
 * Character matching alone can't get these right, and one is actively wrong: "bb" is a literal
 * substring of "du**mbb**ell", so "bb squat" ranked every Dumbbell Squat variant above Barbell
 * Squat. No amount of scoring fixes that — "bb" really is in the string. It has to be
 * understood as a word.
 */
const ALIASES: Record<string, string> = {
  bb: "barbell",
  db: "dumbbell",
  kb: "kettlebell",
  ez: "ez bar",
  dl: "deadlift",
  rdl: "romanian deadlift",
  ohp: "overhead press",
  bp: "bench press",
  bw: "bodyweight",
  sq: "squat",
}

function expand(term: string): string {
  return ALIASES[term] ?? term
}

/**
 * Every whitespace-separated term must match somewhere, in any order. This is what makes
 * "db curl", "curl db" and "curl dumbbell" all land on the same entry.
 */
export function fuzzyScoreTerms(query: string, haystack: string): number | null {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) => expand(t).split(" "))
  if (terms.length === 0) return 0

  let total = 0
  for (const term of terms) {
    const s = fuzzyScore(term, haystack)
    if (s === null) return null
    total += s
  }
  return total
}
