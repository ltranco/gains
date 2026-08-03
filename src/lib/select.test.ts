import { describe, expect, it } from "vitest"

import { syncSet, syncSets } from "./samples"
import { dayEntries, dayProgress, dayReadings, dayTotal, personalRecordIds } from "./select"
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
        return [s.id, { fp: item.fp, at: Date.parse(s.loggedAt), prefix: item.prefix }]
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
        return [s.id, { fp: item.fp, at: Date.parse(s.loggedAt), prefix: item.prefix }]
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

describe("a day's readings", () => {
  const CAL: Tracker = { id: "calories", name: "Calories", unit: "kcal", mode: "sum", nutrition: true, target: 2200 }
  const WAIST: Tracker = { id: "waist", name: "Waist", unit: "cm", mode: "point" }
  const UNTARGETED: Tracker = { id: "creatine", name: "Creatine", unit: "g", mode: "sum" }

  let rn = 0
  const reading = (trackerId: string, date: string, time: string, value: number): Reading => ({
    id: `r${++rn}`,
    trackerId,
    date,
    loggedAt: `${date}T${time}.000Z`,
    value,
  })

  const DAY = () => {
    rn = 0
    return [
      reading("calories", "2026-08-02", "08:12:00", 620),
      reading("calories", "2026-08-02", "13:40:00", 810),
      reading("calories", "2026-08-01", "12:00:00", 1000),
      reading("waist", "2026-08-02", "07:00:00", 82),
      reading("waist", "2026-08-02", "21:00:00", 81.5),
    ]
  }

  it("adds up a sum and takes the last of a point", () => {
    // Four meals make one calorie total. Two waist measurements make one waist — adding them
    // would be nonsense and averaging them would invent a number nobody measured.
    expect(dayTotal(DAY(), CAL, "2026-08-02")).toBe(1430)
    expect(dayTotal(DAY(), WAIST, "2026-08-02")).toBe(81.5)
  })

  it("keeps days apart", () => {
    expect(dayTotal(DAY(), CAL, "2026-08-01")).toBe(1000)
    expect(dayTotal(DAY(), CAL, "2026-07-31")).toBeUndefined()
  })

  it("does not let float dust leak into a total", () => {
    rn = 0
    const crumbs = [
      reading("creatine", "2026-08-02", "08:00:00", 0.1),
      reading("creatine", "2026-08-02", "09:00:00", 0.2),
    ]
    expect(dayTotal(crumbs, UNTARGETED, "2026-08-02")).toBe(0.3)
  })

  it("groups by tracker order, not by when it was logged", () => {
    // The opposite call from dayEntries. Exercises read as a session; macros are fixed slots,
    // and having them reorder between days makes the block unreadable at a glance.
    const groups = dayReadings(DAY(), [CAL, WAIST], "2026-08-02")
    expect(groups.map((g) => g.tracker.id)).toEqual(["calories", "waist"])
    expect(groups[0]?.readings).toHaveLength(2)
    expect(groups[0]?.total).toBe(1430)
    // A tracker with nothing logged that day isn't a row at all.
    expect(dayReadings(DAY(), [CAL, WAIST, UNTARGETED], "2026-08-02")).toHaveLength(2)
  })
})

describe("ring progress", () => {
  const CAL: Tracker = { id: "calories", name: "Calories", unit: "kcal", mode: "sum", nutrition: true, target: 2000 }
  const NO_TARGET: Tracker = { id: "creatine", name: "Creatine", unit: "g", mode: "sum" }
  const r = (trackerId: string, value: number): Reading => ({
    id: `${trackerId}-${value}`,
    trackerId,
    date: "2026-08-02",
    loggedAt: "2026-08-02T12:00:00.000Z",
    value,
  })

  it("skips a tracker with no target rather than drawing it at zero", () => {
    // An arc is a fraction of something. With no denominator there is nothing truthful to draw.
    expect(dayProgress([r("creatine", 5)], [NO_TARGET], "2026-08-02")).toEqual([])
    expect(dayProgress([], [{ ...CAL, target: 0 }], "2026-08-02")).toEqual([])
  })

  it("draws an empty ring on a day with nothing logged", () => {
    const [p] = dayProgress([], [CAL], "2026-08-02")
    expect(p?.total).toBe(0)
    expect(p?.fraction).toBe(0)
  })

  it("reports over target rather than capping it", () => {
    // Capping would make 3,000 against a 2,000 target look exactly like hitting it.
    const [p] = dayProgress([r("calories", 3000)], [CAL], "2026-08-02")
    expect(p?.fraction).toBe(1.5)
  })
})
