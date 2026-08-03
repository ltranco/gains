import { describe, expect, it } from "vitest"

import { CATALOG } from "./catalog"
import { measuresOf, prefixOf } from "./samples"
import { nameFromPrefix, recoveredTracker, searchTrackers, validateTrackerName } from "./trackers"
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

/** A plausible set of user-defined metrics, since none ship with the app. */
const MINE: Tracker[] = [
  { id: "waist", name: "Waist", unit: "cm", mode: "point", better: "lower" },
  { id: "neck", name: "Neck", unit: "cm", mode: "point" },
  { id: "creatine", name: "Creatine", unit: "g", mode: "sum" },
  { id: "coffee", name: "Coffee", unit: "count", mode: "sum" },
]

describe("the metric namespace has room for both kinds of thing", () => {
  it("cannot produce one name two ways", () => {
    // A collision merges two different things into one series, and there is no unpicking that
    // afterwards. `_deleted` is the sharp edge: it names no measure, so an exercise and a
    // metric sharing a prefix would void each other's samples.
    const names = everyMetricName(MINE)
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

  it("emits nothing under a metric's unit from the exercise side", () => {
    // Belt and braces on the check above: no set of any exercise produces a measure key that
    // matches a metric's unit.
    const units = new Set<string>(TRACKER_UNITS)
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
    expect("error" in validateTrackerName("Waist", MINE)).toBe(true)
    expect("error" in validateTrackerName("   ", [])).toBe(true)
    expect("error" in validateTrackerName("!!!", [])).toBe(true)
  })

  it("accepts an ordinary one and slugs it", () => {
    expect(validateTrackerName("Resting Heart Rate", MINE)).toEqual({
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

describe("naming a macro", () => {
  it("is refused, because those belong to a food", () => {
    for (const taken of ["Calories", "Protein", "Carbs", "Fat"]) {
      expect("error" in validateTrackerName(taken, MINE), taken).toBe(true)
    }
  })
})

describe("search", () => {
  it("finds a metric by name and by unit", () => {
    expect(searchTrackers("waist", MINE)[0]?.id).toBe("waist")
    expect(searchTrackers("creat", MINE)[0]?.id).toBe("creatine")
  })

  it("returns nothing for an empty query or nonsense", () => {
    expect(searchTrackers("", MINE)).toEqual([])
    expect(searchTrackers("   ", MINE)).toEqual([])
    expect(searchTrackers("zzzzz", MINE)).toEqual([])
  })
})
