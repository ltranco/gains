import { describe, expect, it } from "vitest"

import { CATALOG, byId, displayName, search } from "./catalog"
import { prefixOf } from "./samples"

const top = (q: string) => search(q).slice(0, 5).map(displayName)

describe("catalog integrity", () => {
  it("has no duplicate ids", () => {
    const ids = CATALOG.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("has no two exercises sharing a metric prefix", () => {
    // A collision would silently merge two exercises into one series in the storage layer,
    // and there is no way to unpick that afterwards.
    const prefixes = CATALOG.map(prefixOf)
    const dupes = prefixes.filter((p, i) => prefixes.indexOf(p) !== i)
    expect(dupes).toEqual([])
  })

  it("never derives a name like 'Bodyweight Push Up' or 'Machine Treadmill'", () => {
    const awkward = CATALOG.map(displayName).filter((n) =>
      /^Bodyweight |^Machine (Treadmill|Rowing Machine|Stationary|Elliptical|Assault|Ski|Stair)/.test(n),
    )
    expect(awkward).toEqual([])
  })
})

describe("measurement kind is assigned by how you progress the movement", () => {
  it.each([
    ["pull_up.bodyweight", "weight_reps"],
    ["chin_up.bodyweight", "weight_reps"],
    ["dip.bodyweight", "weight_reps"],
    ["inverted_row.bodyweight", "weight_reps"],
    ["push_up.bodyweight", "reps"],
    ["plank.bodyweight", "duration"],
    ["side_plank.bodyweight", "duration"],
    ["wall_sit.bodyweight", "duration"],
    ["run.bodyweight", "distance"],
    // Same movement, different implement, different kind: bodyweight crunches are rep-based,
    // cable crunches are a loaded movement you progress by weight.
    ["crunch.bodyweight", "reps"],
    ["crunch.cable", "weight_reps"],
  ])("%s is %s", (id, kind) => {
    expect(byId(id)?.kind).toBe(kind)
  })
})

describe("fuzzy search", () => {
  it("accepts terms in any order", () => {
    // Substring search required the catalog's word order, so none of these found anything.
    for (const q of ["db curl", "curl db", "curl dumbbell"]) {
      expect(top(q)[0]).toBe("Dumbbell Bicep Curl")
    }
  })

  it("prefers a contiguous match over a scattered one", () => {
    // Greedy subsequence matching latches onto the c in "Bicep" and reaches for "url",
    // scoring Bicep Curl below Wrist, Hammer and Spider Curl.
    expect(top("curl")[0]).toBe("Barbell Bicep Curl")
  })

  it("understands gym shorthand", () => {
    // "bb" is a literal substring of "dumbbell", so this needs an alias table, not scoring.
    expect(top("bb squat")[0]).toBe("Barbell Squat")
    expect(top("ohp")[0]).toBe("Barbell Overhead Press")
    expect(top("rdl")[0]).toBe("Barbell Romanian Deadlift")
    expect(top("kb swing")[0]).toBe("Kettlebell Swing")
  })

  it("resolves near-identical variants to the usual implement", () => {
    expect(top("hammer curl")[0]).toBe("Dumbbell Hammer Curl")
    expect(top("bench press")[0]).toBe("Barbell Bench Press")
  })

  it("still puts exact names first", () => {
    expect(top("plank")[0]).toBe("Plank")
    expect(top("push up")[0]).toBe("Push Up")
    expect(top("deadlift")[0]).toBe("Barbell Deadlift")
  })

  it("returns nothing for nonsense", () => {
    for (const q of ["zzzzz", "xylophone", "qqqq"]) expect(search(q)).toEqual([])
  })

  it("returns nothing for an empty query", () => {
    expect(search("")).toEqual([])
    expect(search("   ")).toEqual([])
  })
})

describe("synonyms", () => {
  it("finds the overhead press by the names people actually use", () => {
    // This was the real report: "dumbbell shoulder press" returned nothing at all, so as far
    // as anyone using the app was concerned the exercise did not exist.
    expect(top("dumbbell shoulder press")[0]).toBe("Dumbbell Overhead Press")
    expect(top("db shoulder press")[0]).toBe("Dumbbell Overhead Press")
    expect(top("military press")).toContain("Barbell Overhead Press")
  })

  it.each([
    ["chest press", "Barbell Bench Press"],
    ["pulldown", "Cable Lat Pulldown"],
    ["hamstring curl", "Machine Leg Curl"],
    ["side raise", "Dumbbell Lateral Raise"],
    ["reverse fly", "Dumbbell Rear Delt Fly"],
    ["french press", "Dumbbell Overhead Tricep Extension"],
    ["hyperextension", "Back Extension"],
    ["pushup", "Push Up"],
    ["rfess", "Barbell Bulgarian Split Squat"],
  ])("resolves %s", (query, expected) => {
    expect(top(query)).toContain(expected)
  })

  it("keeps synonyms out of the displayed name", () => {
    // They exist for search only; a synonym leaking into a label would also leak into the
    // metric prefix, which is frozen.
    expect(displayName(byId("overhead_press.dumbbell")!)).toBe("Dumbbell Overhead Press")
  })

  it("does not let a synonym outrank an exact name match", () => {
    // "curl" is a synonym of Bicep Curl, but Nordic Curl and Leg Curl are named that.
    expect(top("leg curl")[0]).toBe("Machine Leg Curl")
    expect(top("nordic curl")[0]).toBe("Nordic Curl")
  })
})
