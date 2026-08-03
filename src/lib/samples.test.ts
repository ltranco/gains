import { describe, expect, it } from "vitest"

import { reconstruct } from "./reconstruct"
import {
  parseMetric,
  payloadFor,
  readSelector,
  syncReadings,
  syncSets,
  tombstonePayload,
  type Syncable,
} from "./samples"
import { allTrackers } from "./trackers"
import type { Reading, SetEntry, Tracker } from "./types"

let n = 0
const set = (exerciseId: string, date: string, time: string, rest: Partial<SetEntry>): SetEntry => ({
  id: `s${++n}`,
  exerciseId,
  date,
  loggedAt: new Date(`${date}T${time}-07:00`).toISOString(),
  ...rest,
})

const SESSION = () => {
  n = 0
  return [
    set("squat.barbell", "2026-07-31", "09:14:03", { weightKg: 100, reps: 5 }),
    set("pull_up.bodyweight", "2026-07-31", "09:35:00", { weightKg: 80, reps: 9 }),
    set("plank.bodyweight", "2026-07-31", "09:45:00", { durationSec: 90 }),
    set("push_up.bodyweight", "2026-07-31", "09:50:00", { reps: 30 }),
    set("run.bodyweight", "2026-07-30", "07:00:00", { distanceM: 5000, durationSec: 1500 }),
  ]
}

describe("what each kind emits", () => {
  const p = payloadFor(syncSets(SESSION()))

  it("emits weight, reps and volume for a loaded movement", () => {
    expect(Object.values(p.barbell_squat_volume ?? {})[0]).toBe(500)
    expect(Object.values(p.barbell_squat_weight ?? {})[0]).toBe(100)
    expect(Object.values(p.barbell_squat_reps ?? {})[0]).toBe(5)
  })

  it("gives a pull up real volume rather than zero", () => {
    expect(Object.values(p.pull_up_volume ?? {})[0]).toBe(720)
  })

  it("emits only what applies", () => {
    expect(Object.values(p.plank_seconds ?? {})[0]).toBe(90)
    expect(p.plank_volume).toBeUndefined()
    expect(Object.values(p.push_up_reps ?? {})[0]).toBe(30)
    expect(p.push_up_weight).toBeUndefined()
  })

  it("emits metres and seconds for a run", () => {
    expect(Object.values(p.run_metres ?? {})[0]).toBe(5000)
    expect(Object.values(p.run_seconds ?? {})[0]).toBe(1500)
  })

  it("never emits a _sets metric", () => {
    // count_over_time already is the set count; a stored copy could only disagree with it.
    expect(Object.keys(p).filter((k) => k.endsWith("_sets"))).toEqual([])
  })
})

describe("timestamps must be unique per exercise", () => {
  it("nudges colliding sets a millisecond apart", () => {
    // Two samples of one metric at the same millisecond collapse under dedup, and the
    // survivor is whichever value is larger, so a duplicated set would eat its twin.
    n = 0
    const p = payloadFor(syncSets([
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 }),
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 8 }),
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 3 }),
    ]))
    const stamps = Object.keys(p.barbell_squat_reps ?? {})
    expect(stamps).toHaveLength(3)
    expect(Object.values(p.barbell_squat_reps ?? {}).sort((a, b) => a - b)).toEqual([3, 5, 8])
  })

  it("leaves different exercises at the same instant alone", () => {
    n = 0
    const p = payloadFor(syncSets([
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 }),
      set("bench_press.barbell", "2026-07-31", "16:00:00", { weightKg: 60, reps: 5 }),
    ]))
    expect(Object.keys(p.barbell_squat_reps ?? {})[0]).toBe(
      Object.keys(p.barbell_bench_press_reps ?? {})[0],
    )
  })
})

describe("the read selector can't sweep up the rest of the stack", () => {
  it("is anchored on the measure suffix", () => {
    expect(readSelector()).toBe(
      '{__name__=~"health_.+_(weight|reps|volume|seconds|metres|kcal|g|mg|ml|cm|count|pct|deleted)"}',
    )
  })

  it("ignores the iOS health metrics", () => {
    // health_weight in particular looks a lot like one of ours.
    expect(parseMetric("health_step")).toBeNull()
    expect(parseMetric("health_weight")).toBeNull()
    expect(parseMetric("health_ingest")).toBeNull()
  })

  it("recognises our own", () => {
    expect(parseMetric("health_barbell_squat_volume")).toEqual({
      prefix: "barbell_squat",
      measure: "volume",
      kind: "measure",
    })
  })
})

/** Re-encodes a payload the way VictoriaMetrics' export endpoint emits it. */
const exportItems = (items: Syncable[]) =>
    Object.entries(payloadFor(items))
      .map(([metric, byTime]) => {
        const pairs = Object.entries(byTime)
          .map(([at, v]) => [Date.parse(at), v] as const)
          .sort((a, b) => a[0] - b[0])
        return JSON.stringify({
          metric: { __name__: `health_${metric}`, src: "ios" },
          values: pairs.map((x) => x[1]),
          timestamps: pairs.map((x) => x[0]),
        })
      })
    .join("\n")

const exportLines = (sets: SetEntry[]) => exportItems(syncSets(sets))

describe("round trip through the storage format", () => {
  it("recovers every set exactly", () => {
    const original = SESSION()
    const { sets, unknownPrefixes } = reconstruct(exportLines(original))
    expect(unknownPrefixes).toEqual([])
    expect(sets).toHaveLength(original.length)

    for (const want of original) {
      const got = sets.find(
        (s) => s.exerciseId === want.exerciseId && Date.parse(s.loggedAt) === Date.parse(want.loggedAt),
      )
      expect(got, `recovered ${want.exerciseId}`).toBeDefined()
      expect(got?.weightKg).toBe(want.weightKg)
      expect(got?.reps).toBe(want.reps)
      expect(got?.durationSec).toBe(want.durationSec)
      expect(got?.distanceM).toBe(want.distanceM)
      // Recomputed from the instant in local time, so an evening set keeps its own day.
      expect(got?.date).toBe(want.date)
    }
  })

  it("ignores foreign series instead of inventing sets from them", () => {
    const foreign = [
      '{"metric":{"__name__":"health_step"},"values":[6151],"timestamps":[1785481200000]}',
      '{"metric":{"__name__":"health_weight"},"values":[146.9],"timestamps":[1785481200000]}',
    ].join("\n")
    const r = reconstruct(foreign)
    expect(r.sets).toEqual([])
    expect(r.skippedSeries).toBe(2)
  })

  it("reports an exercise the catalog no longer knows", () => {
    const r = reconstruct('{"metric":{"__name__":"health_nonsense_move_volume"},"values":[1],"timestamps":[1]}')
    expect(r.unknownPrefixes).toEqual(["nonsense_move"])
    expect(r.sets).toEqual([])
  })

  it("survives malformed input", () => {
    expect(reconstruct("").sets).toEqual([])
    expect(reconstruct("not json\n{").sets).toEqual([])
  })
})

describe("deletion is an append, not a delete", () => {
  it("writes a tombstone at the voided set's own timestamp", () => {
    const at = Date.parse("2026-07-31T09:14:03.000-07:00")
    const p = tombstonePayload([{ prefix: "barbell_squat", at }])
    expect(Object.keys(p)).toEqual(["barbell_squat_deleted"])
    const stamps = Object.keys(p.barbell_squat_deleted ?? {})
    expect(Date.parse(stamps[0]!)).toBe(at)
    // The value is only ever 1: the timestamp is the identifier, so nothing depends on a
    // number surviving float formatting on the way through the shim.
    expect(Object.values(p.barbell_squat_deleted ?? {})).toEqual([1])
  })

  it("is fetched by the read selector", () => {
    expect(readSelector()).toContain("deleted")
    expect(parseMetric("health_barbell_squat_deleted")).toEqual({
      prefix: "barbell_squat",
      kind: "tombstone",
    })
  })

  it("suppresses the set it points at, and only that one", () => {
    n = 0
    const sets = [
      set("squat.barbell", "2026-07-31", "09:14:03", { weightKg: 100, reps: 5 }),
      set("squat.barbell", "2026-07-31", "09:21:11", { weightKg: 100, reps: 5 }),
      set("plank.bodyweight", "2026-07-31", "09:45:00", { durationSec: 90 }),
    ]
    const doomed = Date.parse(sets[0]!.loggedAt)

    const jsonl = [
      exportLines(sets),
      JSON.stringify({
        metric: { __name__: "health_barbell_squat_deleted" },
        values: [1],
        timestamps: [doomed],
      }),
    ].join("\n")

    const r = reconstruct(jsonl)
    expect(r.voided).toBe(1)
    expect(r.sets).toHaveLength(2)
    expect(r.sets.some((s) => Date.parse(s.loggedAt) === doomed)).toBe(false)
    // The other squat set and the plank are untouched.
    expect(r.sets.filter((s) => s.exerciseId === "squat.barbell")).toHaveLength(1)
    expect(r.sets.filter((s) => s.exerciseId === "plank.bodyweight")).toHaveLength(1)
  })

  it("does not void a different exercise sharing that timestamp", () => {
    n = 0
    const sets = [
      set("squat.barbell", "2026-07-31", "09:14:03", { weightKg: 100, reps: 5 }),
      set("bench_press.barbell", "2026-07-31", "09:14:03", { weightKg: 60, reps: 5 }),
    ]
    const at = Date.parse(sets[0]!.loggedAt)
    const jsonl = [
      exportLines(sets),
      JSON.stringify({
        metric: { __name__: "health_barbell_squat_deleted" },
        values: [1],
        timestamps: [at],
      }),
    ].join("\n")
    const r = reconstruct(jsonl)
    expect(r.sets.map((s) => s.exerciseId)).toEqual(["bench_press.barbell"])
  })
})

/* ── Readings: the other thing that goes down the same pipe ─────────────────── */

const TRACKERS = allTrackers([])
const trackerNamed = (id: string): Tracker => TRACKERS.find((t) => t.id === id)!

let rn = 0
const reading = (trackerId: string, date: string, time: string, value: number): Reading => ({
  id: `r${++rn}`,
  trackerId,
  date,
  loggedAt: new Date(`${date}T${time}-07:00`).toISOString(),
  value,
})

const MEAL = () => {
  rn = 0
  return [
    // One meal: four numbers at one instant, which is also the shape an inference service
    // will hand back from a photo.
    reading("calories", "2026-08-02", "08:12:00", 620),
    reading("protein", "2026-08-02", "08:12:00", 48),
    reading("carbs", "2026-08-02", "08:12:00", 61),
    reading("fat", "2026-08-02", "08:12:00", 22),
    reading("calories", "2026-08-02", "13:40:00", 810),
    reading("waist", "2026-08-02", "09:00:00", 81.5),
  ]
}

describe("what a reading emits", () => {
  const p = payloadFor(syncReadings(MEAL(), TRACKERS))

  it("writes one series per metric, named by unit", () => {
    expect(Object.values(p.calories_kcal ?? {}).sort((a, b) => a - b)).toEqual([620, 810])
    expect(Object.values(p.protein_g ?? {})).toEqual([48])
    expect(Object.values(p.waist_cm ?? {})).toEqual([81.5])
  })

  it("never touches HealthKit's own names", () => {
    // The whole reason `weight` and `step` are reserved slugs.
    expect(Object.keys(p).some((k) => k === "weight" || k === "step")).toBe(false)
  })

  it("leaves a meal's four numbers on one timestamp", () => {
    // Nudging is per series, so calories and its three macros keep the instant that ties them
    // together. Only a collision *within* one series has to move.
    const at = Object.keys(p.protein_g ?? {})[0]
    expect(Object.keys(p.carbs_g ?? {})[0]).toBe(at)
    expect(Object.keys(p.fat_g ?? {})[0]).toBe(at)
    expect(Object.keys(p.calories_kcal ?? {})).toContain(at)
  })
})

describe("two readings of one metric in the same millisecond", () => {
  it("get nudged apart, like sets do", () => {
    rn = 0
    const p = payloadFor(
      syncReadings(
        [
          reading("calories", "2026-08-02", "12:00:00", 300),
          reading("calories", "2026-08-02", "12:00:00", 700),
        ],
        TRACKERS,
      ),
    )
    // Without the nudge, dedup keeps the larger and the 300 kcal snack vanishes.
    expect(Object.keys(p.calories_kcal ?? {})).toHaveLength(2)
    expect(Object.values(p.calories_kcal ?? {}).sort((a, b) => a - b)).toEqual([300, 700])
  })
})

describe("readings round trip", () => {
  it("comes back with every value and the right day", () => {
    const original = MEAL()
    const r = reconstruct(exportItems(syncReadings(original, TRACKERS)), TRACKERS)
    expect(r.unknownPrefixes).toEqual([])
    expect(r.recovered).toEqual([])
    expect(r.readings).toHaveLength(original.length)

    for (const want of original) {
      const got = r.readings.find(
        (x) =>
          x.trackerId === want.trackerId && Date.parse(x.loggedAt) === Date.parse(want.loggedAt),
      )
      expect(got, `recovered ${want.trackerId}`).toBeDefined()
      expect(got?.value).toBe(want.value)
      expect(got?.date).toBe(want.date)
    }
  })

  it("rebuilds a metric this device has never heard of", () => {
    // Safari's ITP wipes storage after seven idle days. Without this, a custom metric's history
    // would come back as a prefix nothing could place and get dropped on the floor.
    const jsonl =
      '{"metric":{"__name__":"health_creatine_g"},"values":[5],"timestamps":[1785481200000]}'
    const r = reconstruct(jsonl, TRACKERS)
    expect(r.recovered).toHaveLength(1)
    expect(r.recovered[0]).toMatchObject({ id: "creatine", name: "Creatine", unit: "g" })
    expect(r.readings).toHaveLength(1)
    expect(r.readings[0]?.trackerId).toBe("creatine")
  })

  it("trusts the local definition when the unit disagrees", () => {
    // Two incompatible histories under one name is not something an automatic rule can fix, and
    // the stored definition is the one that knows its mode and target.
    const jsonl =
      '{"metric":{"__name__":"health_waist_count"},"values":[3],"timestamps":[1785481200000]}'
    const r = reconstruct(jsonl, TRACKERS)
    expect(r.readings).toEqual([])
    expect(r.unknownPrefixes).toEqual(["waist"])
  })

  it("still ignores the iOS series sitting alongside", () => {
    const foreign = [
      '{"metric":{"__name__":"health_step"},"values":[6151],"timestamps":[1785481200000]}',
      '{"metric":{"__name__":"health_weight"},"values":[146.9],"timestamps":[1785481200000]}',
    ].join("\n")
    const r = reconstruct(foreign, TRACKERS)
    expect(r.readings).toEqual([])
    expect(r.sets).toEqual([])
    expect(r.skippedSeries).toBe(2)
  })

  it("survives a tombstone voiding one entry and nothing else", () => {
    rn = 0
    const readings = [
      reading("calories", "2026-08-02", "08:12:00", 620),
      reading("calories", "2026-08-02", "13:40:00", 810),
      reading("waist", "2026-08-02", "09:00:00", 81.5),
    ]
    const doomed = Date.parse(readings[0]!.loggedAt)
    const jsonl = [
      exportItems(syncReadings(readings, TRACKERS)),
      JSON.stringify({
        metric: { __name__: "health_calories_deleted" },
        values: [1],
        timestamps: [doomed],
      }),
    ].join("\n")

    const r = reconstruct(jsonl, TRACKERS)
    expect(r.voided).toBe(1)
    expect(r.readings).toHaveLength(2)
    expect(r.readings.some((x) => x.value === 620)).toBe(false)
    expect(r.readings.some((x) => x.value === 810)).toBe(true)
    expect(r.readings.some((x) => x.trackerId === "waist")).toBe(true)
  })

  it("carries sets and readings back in one pass", () => {
    rn = 0
    n = 0
    const sets = [set("squat.barbell", "2026-08-02", "17:00:00", { weightKg: 100, reps: 5 })]
    const readings = [reading("calories", "2026-08-02", "08:12:00", 620)]
    const jsonl = exportItems([...syncSets(sets), ...syncReadings(readings, TRACKERS)])

    const r = reconstruct(jsonl, TRACKERS)
    expect(r.sets).toHaveLength(1)
    expect(r.readings).toHaveLength(1)
    expect(r.sets[0]?.weightKg).toBe(100)
    expect(r.readings[0]?.value).toBe(620)
  })
})

describe("a reading's fingerprint", () => {
  it("changes when the value does, and not otherwise", () => {
    rn = 0
    const one = reading("calories", "2026-08-02", "08:12:00", 620)
    const same = { ...one, note: "porridge" }
    const changed = { ...one, value: 640 }
    const tracker = trackerNamed("calories")

    const fp = (r: Reading) => syncReadings([r], [tracker])[0]!.fp
    // A note is not stored remotely, so it cannot make the remote copy stale.
    expect(fp(same)).toBe(fp(one))
    expect(fp(changed)).not.toBe(fp(one))
  })
})
