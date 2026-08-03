import { describe, expect, it } from "vitest"

import { reconstruct } from "./reconstruct"
import {
  parseMetric,
  payloadFor,
  readSelector,
  syncFoods,
  syncReadings,
  syncSets,
  tombstonePayload,
  type Syncable,
} from "./samples"
import { allTrackers } from "./trackers"
import type { FoodEntry, Reading, SetEntry } from "./types"

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
    const p = tombstonePayload([{ prefixes: ["barbell_squat"], at }])
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


/* ── Food: one thing eaten, four series ─────────────────────────────────────── */

const TRACKERS = allTrackers([])

let fn = 0
const food = (
  date: string,
  time: string,
  name: string,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
): FoodEntry => ({
  id: `f${++fn}`,
  date,
  loggedAt: new Date(`${date}T${time}-07:00`).toISOString(),
  name,
  kcal,
  proteinG,
  carbsG,
  fatG,
})

const EATEN = () => {
  fn = 0
  return [
    food("2026-08-02", "08:12:00", "Porridge", 620, 48, 61, 22),
    food("2026-08-02", "13:40:00", "Chicken bowl", 810, 62, 74, 25),
  ]
}

describe("what a food emits", () => {
  const p = payloadFor(syncFoods(EATEN()))

  it("writes one series per macro", () => {
    expect(Object.values(p.calories_kcal ?? {}).sort((a, b) => a - b)).toEqual([620, 810])
    expect(Object.values(p.protein_g ?? {}).sort((a, b) => a - b)).toEqual([48, 62])
    expect(Object.values(p.carbs_g ?? {}).sort((a, b) => a - b)).toEqual([61, 74])
    expect(Object.values(p.fat_g ?? {}).sort((a, b) => a - b)).toEqual([22, 25])
  })

  it("keeps one meal's four numbers on one timestamp", () => {
    // This is the join. Lose it and there is no way to tell which protein belonged to which meal.
    const at = Object.keys(p.protein_g ?? {}).sort()[0]
    expect(Object.keys(p.carbs_g ?? {}).sort()[0]).toBe(at)
    expect(Object.keys(p.fat_g ?? {}).sort()[0]).toBe(at)
    expect(Object.keys(p.calories_kcal ?? {}).sort()[0]).toBe(at)
  })

  it("never writes HealthKit's own names", () => {
    expect(Object.keys(p)).not.toContain("weight")
    expect(Object.keys(p)).not.toContain("step")
  })
})

describe("two meals in the same millisecond", () => {
  it("move apart together, so neither is torn in half", () => {
    // Nudging is per group, not per series. If the four series were nudged independently, one
    // meal's protein could land on the other's timestamp and both would reassemble wrong.
    fn = 0
    const p = payloadFor(
      syncFoods([
        food("2026-08-02", "12:00:00", "A", 300, 20, 30, 10),
        food("2026-08-02", "12:00:00", "B", 700, 50, 70, 20),
      ]),
    )
    const stamps = (metric: string) => Object.keys(p[metric] ?? {}).sort()
    expect(stamps("calories_kcal")).toHaveLength(2)
    // Every series moved in lockstep, so the pairs still line up.
    expect(stamps("protein_g")).toEqual(stamps("calories_kcal"))
    expect(stamps("carbs_g")).toEqual(stamps("calories_kcal"))
    expect(stamps("fat_g")).toEqual(stamps("calories_kcal"))
  })

  it("leaves a set at the same instant alone", () => {
    fn = 0
    n = 0
    const items = [
      ...syncFoods([food("2026-08-02", "12:00:00", "A", 300, 20, 30, 10)]),
      ...syncSets([set("squat.barbell", "2026-08-02", "12:00:00", { weightKg: 100, reps: 5 })]),
    ]
    const p = payloadFor(items)
    expect(Object.keys(p.calories_kcal ?? {})[0]).toBe(
      Object.keys(p.barbell_squat_weight ?? {})[0],
    )
  })
})

describe("food round trips", () => {
  it("comes back with every macro, on the right day", () => {
    const original = EATEN()
    const r = reconstruct(exportItems(syncFoods(original)), TRACKERS)
    expect(r.unknownPrefixes).toEqual([])
    expect(r.recovered).toEqual([])
    expect(r.foods).toHaveLength(2)

    for (const want of original) {
      const got = r.foods.find((f) => Date.parse(f.loggedAt) === Date.parse(want.loggedAt))
      expect(got, `recovered ${want.name}`).toBeDefined()
      expect(got?.kcal).toBe(want.kcal)
      expect(got?.proteinG).toBe(want.proteinG)
      expect(got?.carbsG).toBe(want.carbsG)
      expect(got?.fatG).toBe(want.fatG)
      expect(got?.date).toBe(want.date)
    }
  })

  it("loses the name, and says so by leaving it empty", () => {
    // VictoriaMetrics stores numbers. The row falls back to "Food" rather than inventing a label.
    const r = reconstruct(exportItems(syncFoods(EATEN())), TRACKERS)
    expect(r.foods.map((f) => f.name)).toEqual(["", ""])
  })

  it("keeps a zero macro as zero rather than dropping the food", () => {
    fn = 0
    const zeroFat = [food("2026-08-02", "09:00:00", "Rice", 400, 8, 90, 0)]
    const r = reconstruct(exportItems(syncFoods(zeroFat)), TRACKERS)
    expect(r.foods).toHaveLength(1)
    expect(r.foods[0]?.fatG).toBe(0)
    expect(r.foods[0]?.kcal).toBe(400)
  })

  it("never mistakes a macro series for a custom metric", () => {
    // `calories_kcal` is shaped exactly like a metric would be, which is why those four prefixes
    // are reserved. Without the macro check this would invent a "Calories" metric on every pull.
    const r = reconstruct(exportItems(syncFoods(EATEN())), TRACKERS)
    expect(r.recovered).toEqual([])
    expect(r.readings).toEqual([])
  })

  it("is voided by a tombstone on any one of its series", () => {
    fn = 0
    const eaten = [
      food("2026-08-02", "08:12:00", "Porridge", 620, 48, 61, 22),
      food("2026-08-02", "13:40:00", "Chicken bowl", 810, 62, 74, 25),
    ]
    const doomed = Date.parse(eaten[0]!.loggedAt)
    const jsonl = [
      exportItems(syncFoods(eaten)),
      JSON.stringify({
        metric: { __name__: "health_calories_deleted" },
        values: [1],
        timestamps: [doomed],
      }),
    ].join("\n")

    const r = reconstruct(jsonl, TRACKERS)
    expect(r.foods).toHaveLength(1)
    expect(r.foods[0]?.kcal).toBe(810)
  })

  it("carries sets, food and metrics back in one pass", () => {
    fn = 0
    n = 0
    const items = [
      ...syncSets([set("squat.barbell", "2026-08-02", "17:00:00", { weightKg: 100, reps: 5 })]),
      ...syncFoods([food("2026-08-02", "08:12:00", "Porridge", 620, 48, 61, 22)]),
      ...syncReadings(
        [
          {
            id: "r1",
            trackerId: "waist",
            date: "2026-08-02",
            loggedAt: new Date("2026-08-02T09:00:00-07:00").toISOString(),
            value: 81.5,
          },
        ],
        TRACKERS,
      ),
    ]
    const r = reconstruct(exportItems(items), TRACKERS)
    expect(r.sets).toHaveLength(1)
    expect(r.foods).toHaveLength(1)
    expect(r.readings).toHaveLength(1)
    expect(r.sets[0]?.weightKg).toBe(100)
    expect(r.foods[0]?.kcal).toBe(620)
    expect(r.readings[0]?.value).toBe(81.5)
  })
})

describe("metrics round trip", () => {
  const waist = (value: number, time = "09:00:00"): Reading => ({
    id: `w${value}`,
    trackerId: "waist",
    date: "2026-08-02",
    loggedAt: new Date(`2026-08-02T${time}-07:00`).toISOString(),
    value,
  })

  it("recovers a value and its day", () => {
    const r = reconstruct(exportItems(syncReadings([waist(81.5)], TRACKERS)), TRACKERS)
    expect(r.readings).toHaveLength(1)
    expect(r.readings[0]?.value).toBe(81.5)
    expect(r.readings[0]?.date).toBe("2026-08-02")
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
  })

  it("trusts the local definition when the unit disagrees", () => {
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
    expect(r.foods).toEqual([])
    expect(r.sets).toEqual([])
    expect(r.skippedSeries).toBe(2)
  })
})
