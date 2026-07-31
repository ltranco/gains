import { describe, expect, it } from "vitest"

import { byId } from "./catalog"
import { fingerprint } from "./samples"
import { dayEntries, personalRecordIds } from "./select"
import { planPush } from "./remote"
import type { RemoteConfig, SetEntry } from "./types"

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
      sets.map((s) => [s.id, fingerprint(s, byId(s.exerciseId)!)]),
    ),
  })

  it("sends everything the first time and nothing the second", () => {
    reset()
    const sets = [
      set("squat.barbell", "2026-07-31", "16:00:00", { weightKg: 100, reps: 5 }),
      set("plank.bodyweight", "2026-07-31", "16:10:00", { durationSec: 60 }),
    ]
    expect(planPush(base, sets).fresh).toHaveLength(2)
    // Idempotence is what makes auto-push safe to run every minute.
    expect(planPush(pushedState(sets), sets).fresh).toHaveLength(0)
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

    const plan = planPush(config, edited)
    expect(plan.changed).toHaveLength(1)
    expect(plan.fresh).toHaveLength(0)

    const deleted = planPush(config, [sets[0]!])
    expect(deleted.deletedIds).toEqual(["s2"])
  })
})
