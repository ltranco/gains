import { describe, expect, it } from "vitest"

import { MACROS, macroTotals, summariseFood, foodName, targetFor } from "./food"
import { dayFoods, dayProgress } from "./select"
import type { FoodEntry } from "./types"

const food = (over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: "f1",
  date: "2026-08-02",
  loggedAt: "2026-08-02T15:12:00.000Z",
  name: "Chicken bowl",
  kcal: 620,
  proteinG: 48,
  carbsG: 61,
  fatG: 22,
  ...over,
})

describe("a food is one thing, not four numbers", () => {
  it("summarises onto one row, macros first and calories last", () => {
    // The row also carries a time and a name on a 390px screen, so this string is deliberately
    // tight — the letters sit against their numbers and there is no unit but kcal.
    expect(summariseFood(food())).toBe("48P 61C 22F 620kcal")
  })

  it("keeps the summary short when a macro is zero or fractional", () => {
    expect(summariseFood(food({ proteinG: 0, fatG: 7.5 }))).toBe("0P 61C 7.5F 620kcal")
  })

  it("falls back to a label rather than an empty row", () => {
    // A pulled food has no name: the store holds numbers only.
    expect(foodName(food({ name: "" }))).toBe("Food")
    expect(foodName(food({ name: "   " }))).toBe("Food")
    expect(foodName(food())).toBe("Chicken bowl")
  })
})

describe("a day's macros", () => {
  const day = [
    food({ id: "a", loggedAt: "2026-08-02T15:12:00.000Z" }),
    food({ id: "b", loggedAt: "2026-08-02T20:40:00.000Z", kcal: 810, proteinG: 62, carbsG: 74, fatG: 25 }),
    food({ id: "c", date: "2026-08-01", kcal: 1000 }),
  ]

  it("adds up only that day", () => {
    const totals = macroTotals(dayFoods(day, "2026-08-02"))
    expect(totals.kcal).toBe(1430)
    expect(totals.protein).toBe(110)
    expect(totals.carbs).toBe(135)
    expect(totals.fat).toBe(47)
    expect(macroTotals(dayFoods(day, "2026-08-01")).kcal).toBe(1000)
  })

  it("returns all four at zero on an empty day, so the rings still draw", () => {
    expect(macroTotals(dayFoods(day, "2026-07-31"))).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    })
  })

  it("does not let float dust leak into a total", () => {
    const crumbs = [food({ id: "a", fatG: 0.1 }), food({ id: "b", fatG: 0.2 })]
    expect(macroTotals(crumbs).fat).toBe(0.3)
  })

  it("lists the day's food oldest first — the order you ate it", () => {
    expect(dayFoods(day, "2026-08-02").map((f) => f.id)).toEqual(["a", "b"])
  })
})

describe("ring progress", () => {
  const day = [food()]

  it("skips a macro with no target rather than drawing it at zero", () => {
    // An arc is a fraction of something. With no denominator there is nothing truthful to draw.
    const progress = dayProgress(day, { kcal: 2000 }, "2026-08-02")
    expect(progress.map((p) => p.macro.key)).toEqual(["kcal"])
    expect(targetFor({ kcal: 0 }, "kcal")).toBeUndefined()
    expect(targetFor({}, "protein")).toBeUndefined()
  })

  it("keeps the declared macro order, whatever order the targets were set in", () => {
    const progress = dayProgress(day, { fat: 70, kcal: 2000, carbs: 220, protein: 180 }, "2026-08-02")
    expect(progress.map((p) => p.macro.key)).toEqual(MACROS.map((m) => m.key))
  })

  it("draws an empty ring on a day with nothing eaten", () => {
    const [p] = dayProgress([], { kcal: 2000 }, "2026-08-02")
    expect(p?.total).toBe(0)
    expect(p?.fraction).toBe(0)
  })

  it("reports over target rather than capping it", () => {
    // Capping would make 2,900 against a 2,200 target look exactly like hitting it.
    const [p] = dayProgress([food({ kcal: 3000 })], { kcal: 2000 }, "2026-08-02")
    expect(p?.fraction).toBe(1.5)
  })
})
