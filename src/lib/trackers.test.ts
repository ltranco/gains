import { describe, expect, it } from "vitest"

import { CATALOG } from "./catalog"
import { measuresOf, prefixOf } from "./samples"
import {
  BUILTIN_TRACKERS,
  allTrackers,
  nameFromPrefix,
  recoveredTracker,
  searchTrackers,
  validateTrackerName,
} from "./trackers"
import { TRACKER_UNITS, type Tracker } from "./types"

const TOMBSTONE = "deleted"
const MEASURES = ["weight", "reps", "volume", "seconds", "metres"] as const

/**
 * Every metric name this app can ever write, given a set of trackers.
 *
 * Exercise names are over-generated on purpose — every measure for every exercise, rather than
 * only the ones its kind emits. A collision that only appears after someone reclassifies a
 * movement is still a collision.
 */
function everyMetricName(trackers: Tracker[]): string[] {
  const out: string[] = []
  for (const ex of CATALOG) {
    const prefix = prefixOf(ex)
    for (const m of MEASURES) out.push(`${prefix}_${m}`)
    out.push(`${prefix}_${TOMBSTONE}`)
  }
  for (const t of trackers) {
    out.push(`${t.id}_${t.unit}`)
    out.push(`${t.id}_${TOMBSTONE}`)
  }
  return out
}

describe("the metric namespace has room for both kinds of thing", () => {
  it("cannot produce one name two ways", () => {
    // A collision merges two different things into one series, and there is no unpicking that
    // afterwards. `_deleted` is the sharp edge: it names no measure, so an exercise and a
    // tracker sharing a prefix would void each other's samples.
    const names = everyMetricName(BUILTIN_TRACKERS)
    const dupes = names.filter((n, i) => names.indexOf(n) !== i)
    expect(dupes).toEqual([])
  })

  it("keeps the tracker units disjoint from the exercise measures", () => {
    // This is what makes the last-underscore split unambiguous. If the two sets ever overlapped,
    // `<prefix>_weight` could be either kind and the reader would have to guess.
    const overlap = TRACKER_UNITS.filter((u) => (MEASURES as readonly string[]).includes(u))
    expect(overlap).toEqual([])
    expect(TRACKER_UNITS).not.toContain(TOMBSTONE)
  })

  it("emits nothing under a builtin's name from the exercise side", () => {
    // Belt and braces on the check above: no set of any exercise produces a measure key that
    // matches a builtin tracker's unit.
    const units = new Set<string>(BUILTIN_TRACKERS.map((t) => t.unit))
    for (const ex of CATALOG) {
      const keys = Object.keys(
        measuresOf(
          {
            id: "x",
            exerciseId: ex.id,
            date: "2026-08-02",
            loggedAt: "2026-08-02T10:00:00.000Z",
            reps: 5,
            weightKg: 100,
            durationSec: 60,
            distanceM: 5000,
          },
          ex,
        ),
      )
      for (const k of keys) expect(units.has(k)).toBe(false)
    }
  })
})

describe("naming a new metric", () => {
  it("refuses what Apple Health already writes", () => {
    // `health_weight` and `health_step` come off an iOS Shortcut. A second writer would mean two
    // lines that disagree, and a delete here would tombstone a HealthKit sample.
    for (const taken of ["Weight", "weight", "Step", "Ingest"]) {
      const r = validateTrackerName(taken, [])
      expect("error" in r, `${taken} should be refused`).toBe(true)
    }
  })

  it("refuses a name an exercise already owns", () => {
    // `Run` slugs to `run`, which is Run's own metric prefix — so `run_deleted` would be shared.
    const r = validateTrackerName("Run", [])
    expect("error" in r).toBe(true)
  })

  it("refuses a duplicate and a name with nothing in it", () => {
    expect("error" in validateTrackerName("Waist", BUILTIN_TRACKERS)).toBe(true)
    expect("error" in validateTrackerName("   ", [])).toBe(true)
    expect("error" in validateTrackerName("!!!", [])).toBe(true)
  })

  it("accepts an ordinary one and slugs it", () => {
    expect(validateTrackerName("Resting Heart Rate", BUILTIN_TRACKERS)).toEqual({
      id: "resting_heart_rate",
    })
  })
})

describe("the slug never moves", () => {
  it("survives a rename", () => {
    // The slug is the metric prefix. If renaming moved it, every sample already stored would be
    // orphaned under a name nothing reads any more.
    const created = validateTrackerName("Creatine", [])
    expect(created).toEqual({ id: "creatine" })
    const tracker: Tracker = { id: "creatine", name: "Creatine", unit: "g", mode: "sum" }
    const renamed: Tracker = { ...tracker, name: "Creatine monohydrate" }
    expect(renamed.id).toBe("creatine")
  })
})

describe("builtins and stored trackers", () => {
  it("lets a stored copy shadow a builtin without duplicating it", () => {
    const merged = allTrackers([
      { id: "waist", name: "Waistline", unit: "cm", mode: "point", target: 80 },
    ])
    expect(merged.filter((t) => t.id === "waist")).toHaveLength(1)
    expect(merged.find((t) => t.id === "waist")?.target).toBe(80)
    // Order is the display order, so a shadowed builtin stays where it was.
    expect(merged[0]?.id).toBe("waist")
  })

  it("appends custom trackers after the builtins", () => {
    const merged = allTrackers([{ id: "creatine", name: "Creatine", unit: "g", mode: "sum" }])
    expect(merged).toHaveLength(BUILTIN_TRACKERS.length + 1)
    expect(merged.at(-1)?.id).toBe("creatine")
  })

  it("ships every builtin with a slug that is already frozen", () => {
    for (const t of BUILTIN_TRACKERS) {
      expect(t.id, `${t.name} slug`).toMatch(/^[a-z0-9_]+$/)
    }
  })
})

describe("rebuilding a tracker from the remote", () => {
  it("titles the prefix back into something readable", () => {
    expect(nameFromPrefix("resting_heart_rate")).toBe("Resting Heart Rate")
    expect(nameFromPrefix("creatine")).toBe("Creatine")
  })

  it("says out loud that its mode is a guess", () => {
    // A number store can't say whether four samples in a day were four meals or four
    // measurements. Marking it beats quietly picking one and being wrong in silence.
    const t = recoveredTracker("creatine", "g")
    expect(t).toMatchObject({ id: "creatine", unit: "g", mode: "sum", recovered: true })
  })
})

describe("search", () => {
  it("finds a metric by name, in any order, and by unit", () => {
    const all = allTrackers([])
    // Waist doesn't get a button in the bottom bar, so search is how it's reached.
    expect(searchTrackers("waist", all)[0]?.id).toBe("waist")
    expect(searchTrackers("cm", all)[0]?.id).toBe("waist")
  })

  it("returns nothing for an empty query or nonsense", () => {
    const all = allTrackers([])
    expect(searchTrackers("", all)).toEqual([])
    expect(searchTrackers("   ", all)).toEqual([])
    expect(searchTrackers("zzzzz", all)).toEqual([])
  })
})
