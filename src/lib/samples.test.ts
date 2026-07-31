import { describe, expect, it } from "vitest"

import { reconstruct } from "./reconstruct"
import { parseMetric, payloadFor, readSelector, tombstonePayload } from "./samples"
import type { SetEntry } from "./types"

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
  const p = payloadFor(SESSION())

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
    const p = payloadFor([
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 }),
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 8 }),
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 3 }),
    ])
    const stamps = Object.keys(p.barbell_squat_reps ?? {})
    expect(stamps).toHaveLength(3)
    expect(Object.values(p.barbell_squat_reps ?? {}).sort((a, b) => a - b)).toEqual([3, 5, 8])
  })

  it("leaves different exercises at the same instant alone", () => {
    n = 0
    const p = payloadFor([
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 }),
      set("bench_press.barbell", "2026-07-31", "16:00:00", { weightKg: 60, reps: 5 }),
    ])
    expect(Object.keys(p.barbell_squat_reps ?? {})[0]).toBe(
      Object.keys(p.barbell_bench_press_reps ?? {})[0],
    )
  })
})

describe("the read selector can't sweep up the rest of the stack", () => {
  it("is anchored on the measure suffix", () => {
    expect(readSelector()).toBe(
      '{__name__=~"health_.+_(weight|reps|volume|seconds|metres|deleted)"}',
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
const exportLines = (sets: SetEntry[]) =>
    Object.entries(payloadFor(sets))
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
