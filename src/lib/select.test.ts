import { describe, expect, it } from "vitest"

import { prefixesOf, syncSet, syncSets } from "./samples"
import { dayEntries, dayMetricRows, metricRecordIds, personalRecordIds } from "./select"
import { planPush } from "./remote"
import type { Reading, RemoteConfig, SetEntry, Tracker } from "./types"

let n = 0
const set = (exerciseId: string, date: string, time: string, rest: Partial<SetEntry>): SetEntry => ({
  id: `s${++n}`,
  exerciseId,
  date,
  loggedAt: `${date}T${time}.000Z`,
  ...rest,
})
const reset = () => void (n = 0)

describe("personal records", () => {
  it("marks a heavier set and ignores a lighter one", () => {
    reset()
    const sets = [
      set("squat.barbell", "2026-07-01", "10:00:00", { weightKg: 60, reps: 5 }),
      set("squat.barbell", "2026-07-08", "10:00:00", { weightKg: 60, reps: 5 }),
      set("squat.barbell", "2026-07-15", "10:00:00", { weightKg: 62.5, reps: 5 }),
      set("squat.barbell", "2026-07-22", "10:00:00", { weightKg: 60, reps: 12 }),
      set("squat.barbell", "2026-07-29", "10:00:00", { weightKg: 62.5, reps: 6 }),
    ]
    const pr = personalRecordIds(sets)
    expect(pr.has("s1")).toBe(false) // first set beats nothing
    expect(pr.has("s2")).toBe(false) // equal
    expect(pr.has("s3")).toBe(true) // heavier
    expect(pr.has("s4")).toBe(false) // more reps but lighter
    expect(pr.has("s5")).toBe(true) // same weight, more reps
  })

  it("lets reps decide when the load never changes", () => {
    // Bodyweight-only pull ups sit at one weight forever, so reps are the progression, and
    // strapping on a belt still has to read as the bigger effort.
    reset()
    const pr = personalRecordIds([
      set("pull_up.bodyweight", "2026-07-01", "10:00:00", { weightKg: 80, reps: 8 }),
      set("pull_up.bodyweight", "2026-07-08", "10:00:00", { weightKg: 80, reps: 10 }),
      set("pull_up.bodyweight", "2026-07-15", "10:00:00", { weightKg: 80, reps: 9 }),
      set("pull_up.bodyweight", "2026-07-22", "10:00:00", { weightKg: 85, reps: 6 }),
    ])
    expect([...pr]).toEqual(["s2", "s4"])
  })

  it("handles the other kinds", () => {
    reset()
    const pr = personalRecordIds([
      set("plank.bodyweight", "2026-07-01", "10:00:00", { durationSec: 60 }),
      set("plank.bodyweight", "2026-07-08", "10:00:00", { durationSec: 90 }),
      set("push_up.bodyweight", "2026-07-01", "10:00:00", { reps: 20 }),
      set("push_up.bodyweight", "2026-07-08", "10:00:00", { reps: 30 }),
      set("run.bodyweight", "2026-07-01", "10:00:00", { distanceM: 5000 }),
      set("run.bodyweight", "2026-07-08", "10:00:00", { distanceM: 4000 }),
    ])
    expect([...pr].sort()).toEqual(["s2", "s4"])
  })

  it("keeps exercises independent and respects chronology over insertion order", () => {
    reset()
    const pr = personalRecordIds([
      set("squat.barbell", "2026-07-29", "10:00:00", { weightKg: 100, reps: 5 }),
      set("squat.barbell", "2026-07-01", "10:00:00", { weightKg: 140, reps: 5 }),
    ])
    expect([...pr]).toEqual([]) // the later set is lighter than the earlier one
  })

  it("ignores an exercise the catalog no longer knows", () => {
    reset()
    expect(
      personalRecordIds([
        set("gone.nope", "2026-07-01", "10:00:00", { reps: 5 }),
        set("gone.nope", "2026-07-02", "10:00:00", { reps: 9 }),
      ]).size,
    ).toBe(0)
  })
})

describe("day grouping", () => {
  it("keeps exercises in the order they were first logged", () => {
    reset()
    const entries = dayEntries(
      [
        set("plank.bodyweight", "2026-07-31", "10:00:00", { durationSec: 60 }),
        set("bench_press.barbell", "2026-07-31", "10:05:00", { weightKg: 60, reps: 5 }),
        set("plank.bodyweight", "2026-07-31", "10:10:00", { durationSec: 70 }),
      ],
      "2026-07-31",
    )
    expect(entries.map((e) => e.exercise.id)).toEqual(["plank.bodyweight", "bench_press.barbell"])
    expect(entries[0]?.sets).toHaveLength(2)
  })

  it("shows only the requested day", () => {
    reset()
    const sets = [
      set("squat.barbell", "2026-07-30", "10:00:00", { weightKg: 80, reps: 8 }),
      set("squat.barbell", "2026-07-31", "10:00:00", { weightKg: 100, reps: 5 }),
    ]
    expect(dayEntries(sets, "2026-07-30")[0]?.sets[0]?.weightKg).toBe(80)
    expect(dayEntries(sets, "2026-07-31")[0]?.sets[0]?.weightKg).toBe(100)
    expect(dayEntries(sets, "2026-07-29")).toEqual([])
  })
})

describe("push planning", () => {
  const base: RemoteConfig = { url: "https://x/ingest", token: "t", pushed: {} }
  const pushedState = (sets: SetEntry[]): RemoteConfig => ({
    ...base,
    pushed: Object.fromEntries(
      sets.map((s) => {
        const item = syncSet(s)!
        return [
          s.id,
          { fp: item.fp, at: Date.parse(s.loggedAt), prefixes: prefixesOf(item) },
        ]
      }),
    ),
  })

  it("sends everything the first time and nothing the second", () => {
    reset()
    const sets = [
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 }),
      set("plank.bodyweight", "2026-07-31", "16:10:00", { durationSec: 60 }),
    ]
    expect(planPush(base, syncSets(sets)).fresh).toHaveLength(2)
    // Idempotence is what makes auto-push safe to run every minute.
    expect(planPush(pushedState(sets), syncSets(sets)).fresh).toHaveLength(0)
  })

  it("reports edits and deletes instead of re-sending them", () => {
    // The store only appends and keeps the biggest value on a tie, so a re-send could raise a
    // number but never lower one. Half-applying an edit is worse than leaving it stale.
    reset()
    const sets = [
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 }),
      set("plank.bodyweight", "2026-07-31", "16:10:00", { durationSec: 60 }),
    ]
    const config = pushedState(sets)
    const edited = [{ ...sets[0]!, weightKg: 90 }, sets[1]!]

    const plan = planPush(config, syncSets(edited))
    expect(plan.changed).toHaveLength(1)
    expect(plan.fresh).toHaveLength(0)

    const deleted = planPush(config, syncSets([sets[0]!]))
    expect(deleted.tombstones.map((t) => t.id)).toEqual(["s2"])
  })
})

describe("an edit repairs itself on the next push", () => {
  const base: RemoteConfig = { url: "https://x/ingest", token: "t", pushed: {} }
  const pushedState = (sets: SetEntry[]): RemoteConfig => ({
    ...base,
    pushed: Object.fromEntries(
      sets.map((s) => {
        const item = syncSet(s)!
        return [
          s.id,
          { fp: item.fp, at: Date.parse(s.loggedAt), prefixes: prefixesOf(item) },
        ]
      }),
    ),
  })

  it("retracts the old samples and rewrites clear of them", () => {
    // Re-sending in place can't work: dedup keeps the larger value per field, so a lowered
    // weight beside raised reps would leave a set that never happened. And the rewrite has to
    // clear the tombstone's timestamp, or the retraction swallows the correction too.
    reset()
    const original = set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 })
    const config = pushedState([original])
    const edited = [{ ...original, weightKg: 90 }]

    const plan = planPush(config, syncSets(edited))
    expect(plan.changed).toHaveLength(1)
    expect(plan.tombstones).toHaveLength(1)
    expect(plan.tombstones[0]!.at).toBe(Date.parse(original.loggedAt))
    // Flagged as a rewrite rather than a removal, so the UI can say "edited" not "deleted".
    expect(plan.tombstones[0]!.replaced).toBe(true)
  })

  it("marks a genuine delete as not replaced", () => {
    reset()
    const sets = [
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 }),
      set("plank.bodyweight", "2026-07-31", "16:10:00", { durationSec: 60 }),
    ]
    const plan = planPush(pushedState(sets), syncSets([sets[0]!]))
    expect(plan.tombstones).toHaveLength(1)
    expect(plan.tombstones[0]!.id).toBe("s2")
    expect(plan.tombstones[0]!.replaced).toBe(false)
  })

  it("treats a changed time as an edit, since the timestamp is the set's identity", () => {
    reset()
    const original = set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 })
    const config = pushedState([original])
    const moved = [{ ...original, loggedAt: new Date("2026-07-31T18:30:00-07:00").toISOString() }]

    const plan = planPush(config, syncSets(moved))
    expect(plan.changed).toHaveLength(1)
    expect(plan.tombstones[0]!.at).toBe(Date.parse(original.loggedAt))
  })
})


describe("a day's metrics", () => {
  const WAIST: Tracker = { id: "waist", name: "Waist", unit: "cm", mode: "point", better: "lower" }
  const CREATINE: Tracker = { id: "creatine", name: "Creatine", unit: "g", mode: "sum" }

  const r = (trackerId: string, date: string, time: string, value: number): Reading => ({
    id: `${trackerId}-${date}-${time}`,
    trackerId,
    date,
    loggedAt: `${date}T${time}.000Z`,
    value,
  })

  it("lists a day flat, oldest first, whatever metric each row is", () => {
    const rows = dayMetricRows(
      [
        r("creatine", "2026-08-02", "20:00:00", 5),
        r("waist", "2026-08-02", "07:00:00", 81),
        r("waist", "2026-08-01", "07:00:00", 82),
      ],
      [WAIST, CREATINE],
      "2026-08-02",
    )
    expect(rows.map((x) => x.tracker.id)).toEqual(["waist", "creatine"])
  })

  it("drops a reading whose metric is gone rather than showing a bare number", () => {
    // Without the definition there is no name, no unit, and no way to say what it measured.
    const rows = dayMetricRows([r("gone", "2026-08-02", "07:00:00", 5)], [WAIST], "2026-08-02")
    expect(rows).toEqual([])
  })
})

describe("metric records", () => {
  const WAIST: Tracker = { id: "waist", name: "Waist", unit: "cm", mode: "point", better: "lower" }
  const GRIP: Tracker = { id: "grip", name: "Grip", unit: "count", mode: "point", better: "higher" }
  const CREATINE: Tracker = { id: "creatine", name: "Creatine", unit: "g", mode: "sum" }

  const r = (trackerId: string, date: string, value: number): Reading => ({
    id: `${trackerId}-${date}`,
    trackerId,
    date,
    loggedAt: `${date}T07:00:00.000Z`,
    value,
  })

  it("marks a smaller waist and ignores a bigger one", () => {
    const ids = metricRecordIds(
      [
        r("waist", "2026-07-01", 84),
        r("waist", "2026-07-08", 83),
        r("waist", "2026-07-15", 83.5),
        r("waist", "2026-07-22", 82),
      ],
      [WAIST],
    )
    // The first beats nothing, so it is never marked — same rule as a set's first entry.
    expect([...ids].sort()).toEqual(["waist-2026-07-08", "waist-2026-07-22"])
  })

  it("runs the other way for a metric where higher is progress", () => {
    const ids = metricRecordIds(
      [r("grip", "2026-07-01", 40), r("grip", "2026-07-08", 45), r("grip", "2026-07-15", 42)],
      [GRIP],
    )
    expect([...ids]).toEqual(["grip-2026-07-08"])
  })

  it("badges nothing when the metric has no direction", () => {
    // A creatine dose is not a personal best, and a badge on every entry is noise.
    const ids = metricRecordIds([r("creatine", "2026-07-01", 5), r("creatine", "2026-07-02", 10)], [
      CREATINE,
    ])
    expect(ids.size).toBe(0)
  })

  it("respects chronology over insertion order, and keeps metrics independent", () => {
    const ids = metricRecordIds(
      [r("waist", "2026-07-22", 84), r("waist", "2026-07-01", 80), r("grip", "2026-07-22", 50)],
      [WAIST, GRIP],
    )
    // The later waist reading is bigger, so nothing is a record; grip's first beats nothing.
    expect(ids.size).toBe(0)
  })
})
