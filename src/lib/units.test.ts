import { describe, expect, it } from "vitest"

import {
  formatCount,
  formatDistance,
  formatDuration,
  formatLoad,
  parseDistance,
  parseDuration,
  parseReps,
  parseWeight,
  weightValue,
} from "./units"

describe("imperial is display only", () => {
  it("round-trips kilograms through an imperial display without drift", () => {
    // The invariant the whole unit system rests on: what's stored stays metric, so showing
    // pounds and reading them back must not corrupt the underlying kg.
    for (const kg of [2.5, 20, 60, 102.5, 500]) {
      const shown = weightValue(kg, "imperial")
      const back = parseWeight(shown, "imperial") as number
      expect(Math.abs(back - kg)).toBeLessThan(0.05)
    }
  })

  it("round-trips metres through miles", () => {
    const shown = `${parseFloat(formatDistance(5000, "imperial"))}`
    expect(Math.abs((parseDistance(shown, "imperial") as number) - 5000)).toBeLessThan(10)
  })
})

describe("number formatting", () => {
  it("trims trailing zeros", () => {
    expect(weightValue(14, "metric")).toBe("14")
    expect(weightValue(14.5, "metric")).toBe("14.5")
  })

  it("groups thousands", () => {
    // 10000 and 1000 are one glance apart in a mono column; 10,000 and 1,000 are not.
    expect(weightValue(999, "metric")).toBe("999")
    expect(weightValue(1000, "metric")).toBe("1,000")
    expect(weightValue(1234.5, "metric")).toBe("1,234.5")
    expect(formatCount(1000)).toBe("1,000")
  })

  it("parses back anything it rendered, commas and all", () => {
    for (const kg of [1000, 1234.5, 10000]) {
      expect(parseWeight(weightValue(kg, "metric"), "metric")).toBe(kg)
    }
    expect(parseReps("1,000")).toBe(1000)
  })

  it("renders a placeholder rather than an em dash", () => {
    expect(formatLoad(undefined, "metric")).toBe("·")
    expect(formatCount(undefined)).toBe("·")
    expect(formatDuration(undefined)).toBe("·")
  })
})

describe("bodyweight is a real number now", () => {
  it("has no BW sentinel: load is whatever moved", () => {
    // A pull up records bodyweight plus any belt. Storing 0 and printing "BW" made every
    // bodyweight set contribute nothing to derived volume.
    expect(formatLoad(80, "metric")).toBe("80 kg")
    expect(formatLoad(0, "metric")).toBe("0 kg")
    expect(formatLoad(0, "metric")).not.toContain("BW")
  })
})

describe("duration", () => {
  it("accepts bare seconds, mm:ss and h:mm:ss", () => {
    expect(parseDuration("90")).toBe(90)
    expect(parseDuration("1:30")).toBe(90)
    expect(parseDuration("1:02:30")).toBe(3750)
  })

  it("formats back symmetrically", () => {
    expect(formatDuration(90)).toBe("1:30")
    expect(formatDuration(3750)).toBe("1:02:30")
    expect(formatDuration(5)).toBe("0:05")
  })

  it("rejects junk rather than guessing", () => {
    expect(parseDuration("abc")).toBeUndefined()
    expect(parseDuration("-5")).toBeUndefined()
    expect(parseDuration("")).toBeUndefined()
  })
})

describe("reps validation", () => {
  it("requires a whole number above zero", () => {
    expect(parseReps("8")).toBe(8)
    expect(parseReps("0")).toBeUndefined()
    expect(parseReps("2.5")).toBeUndefined()
    expect(parseReps("abc")).toBeUndefined()
  })
})
