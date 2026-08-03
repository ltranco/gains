import { afterEach, describe, expect, it, vi } from "vitest"

import { applyPull, mergeTrackers, planPush, pushLog } from "./remote"
import { syncReadings, syncSets, type Syncable } from "./samples"
import { EMPTY_STATE } from "./store"
import { allTrackers } from "./trackers"
import type { PullOutcome } from "./remote"
import type { Reading, RemoteConfig, SetEntry, Tracker } from "./types"

/**
 * Pushing is the one part of this that can corrupt the store, because the store can't be
 * corrected: dedup keeps the larger value on a timestamp tie and `delete_series` isn't reachable
 * through nginx. So these tests run the real `pushLog` against a fake endpoint and assert on what
 * it *would have sent*, rather than trusting the plan alone.
 */
function captureFetch() {
  const bodies: Record<string, Record<string, number>>[] = []
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const sent = JSON.parse(init.body) as { payload?: Record<string, Record<string, number>> }
    if (sent.payload) bodies.push(sent.payload)
    const written = sent.payload
      ? Object.values(sent.payload).reduce((n, byTime) => n + Object.keys(byTime).length, 0)
      : 0
    return { ok: true, json: async () => ({ ok: true, written }) }
  })
  return bodies
}

afterEach(() => vi.unstubAllGlobals())

const CONFIG: RemoteConfig = { url: "https://x/ingest", token: "t", pushed: {} }
const TRACKERS = allTrackers([])

const aSet = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: "s1",
  exerciseId: "squat.barbell",
  date: "2026-08-02",
  loggedAt: "2026-08-02T16:00:00.000Z",
  weightKg: 100,
  reps: 5,
  ...over,
})

const aReading = (over: Partial<Reading> = {}): Reading => ({
  id: "r1",
  trackerId: "calories",
  date: "2026-08-02",
  loggedAt: "2026-08-02T15:12:00.000Z",
  value: 620,
  ...over,
})

describe("an edited entry settles instead of re-syncing forever", () => {
  it("records the local fingerprint, not the rewritten copy's", async () => {
    // The bug: an edited entry is rewritten a millisecond past its old samples so the tombstone
    // retracting the original can't swallow the correction. `loggedAt` is part of the
    // fingerprint, so recording the *rewritten* one left the next plan comparing the local entry
    // against a string it could never produce. Every push re-tombstoned it and wrote another
    // copy a millisecond further along, and Settings sat on a permanent "1 edited to sync".
    captureFetch()
    const original = aSet()

    const first = await pushLog(CONFIG, syncSets([original]))
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const edited = aSet({ weightKg: 90 })
    const second = await pushLog(first.value.config, syncSets([edited]))
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.changed).toHaveLength(1)
    expect(second.value.tombstones).toHaveLength(1)

    // The push after the edit has nothing left to do. This is the assertion the bug failed.
    const third = planPush(second.value.config, syncSets([edited]))
    expect(third.changed).toEqual([])
    expect(third.fresh).toEqual([])
    expect(third.tombstones).toEqual([])
  })

  it("writes the correction clear of the tombstone that retracts the original", async () => {
    const bodies = captureFetch()
    const original = aSet()
    const first = await pushLog(CONFIG, syncSets([original]))
    if (!first.ok) return

    bodies.length = 0
    const second = await pushLog(first.value.config, syncSets([aSet({ weightKg: 90 })]))
    if (!second.ok) return

    const tombstoned = Object.keys(bodies[0]?.barbell_squat_deleted ?? {})
    const rewritten = Object.keys(bodies[1]?.barbell_squat_weight ?? {})
    expect(tombstoned).toHaveLength(1)
    expect(rewritten).toHaveLength(1)
    // Same millisecond and the retraction voids the correction with it.
    expect(Date.parse(rewritten[0]!)).toBeGreaterThan(Date.parse(tombstoned[0]!))
  })

  it("sends the tombstone before the rewrite", async () => {
    // If the run dies halfway, the store having forgotten something it should forget is a better
    // resting place than it holding something it shouldn't.
    const bodies = captureFetch()
    const first = await pushLog(CONFIG, syncSets([aSet()]))
    if (!first.ok) return
    bodies.length = 0
    await pushLog(first.value.config, syncSets([aSet({ weightKg: 90 })]))
    expect(Object.keys(bodies[0] ?? {})).toEqual(["barbell_squat_deleted"])
  })
})

describe("readings go down the same pipe", () => {
  it("pushes once and then has nothing to say", async () => {
    captureFetch()
    const items = syncReadings([aReading()], TRACKERS)
    const first = await pushLog(CONFIG, items)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.fresh).toHaveLength(1)
    // Idempotence is what makes auto-push safe to run every minute.
    expect(planPush(first.value.config, items).fresh).toEqual([])
  })

  it("tombstones a deleted reading at the timestamp it actually landed on", async () => {
    const bodies = captureFetch()
    const first = await pushLog(CONFIG, syncReadings([aReading()], TRACKERS))
    if (!first.ok) return
    const landed = Object.keys(bodies[0]?.calories_kcal ?? {})[0]

    bodies.length = 0
    const second = await pushLog(first.value.config, [])
    if (!second.ok) return
    expect(second.value.tombstones[0]?.replaced).toBe(false)
    expect(Object.keys(bodies[0]?.calories_deleted ?? {})[0]).toBe(landed)
  })

  it("carries sets and readings in one push", async () => {
    const bodies = captureFetch()
    const items: Syncable[] = [...syncSets([aSet()]), ...syncReadings([aReading()], TRACKERS)]
    const res = await pushLog(CONFIG, items)
    expect(res.ok).toBe(true)
    const sent = Object.keys(bodies[0] ?? {})
    expect(sent).toContain("barbell_squat_volume")
    expect(sent).toContain("calories_kcal")
  })
})

describe("what a pull does to local state", () => {
  const pulled = (over: Partial<PullOutcome> = {}): PullOutcome => ({
    sets: [],
    readings: [],
    recovered: [],
    voided: 0,
    unknownPrefixes: [],
    config: CONFIG,
    ...over,
  })

  it("replaces both logs and leaves preferences alone", () => {
    // Replace rather than merge, for the same reason as before: merging needs a rule for "both
    // sides changed the same entry", and inventing one silently is how a log stops matching what
    // happened.
    const local = {
      ...EMPTY_STATE,
      sets: [aSet({ id: "old" })],
      readings: [aReading({ id: "old" })],
      prefs: { ...EMPTY_STATE.prefs, units: "imperial" as const },
    }
    const next = applyPull(local, pulled({ sets: [aSet({ id: "new" })] }))
    expect(next.sets.map((s) => s.id)).toEqual(["new"])
    expect(next.readings).toEqual([])
    expect(next.prefs.units).toBe("imperial")
  })

  it("adds a rebuilt tracker without overwriting the local definition", () => {
    // A local definition knows its mode and its target; a rebuilt one guessed both.
    const mine: Tracker = { id: "creatine", name: "Creatine", unit: "g", mode: "point", target: 5 }
    const guess: Tracker = { id: "creatine", name: "Creatine", unit: "g", mode: "sum", recovered: true }
    const other: Tracker = { id: "coffee", name: "Coffee", unit: "count", mode: "sum", recovered: true }

    const merged = mergeTrackers([mine], [guess, other])
    expect(merged).toHaveLength(2)
    expect(merged.find((t) => t.id === "creatine")).toEqual(mine)
    expect(merged.find((t) => t.id === "coffee")).toEqual(other)
  })
})
