import { beforeEach, describe, expect, it } from "vitest"

import { parseState, readRemote, writeRemote } from "./store"
import type { RemoteConfig } from "./types"

// store.ts is SSR-safe by checking for `window`, so the node environment needs a stand-in.
const mem = new Map<string, string>()
beforeEach(() => {
  mem.clear()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    },
  }
})

describe("remote config survives a round trip", () => {
  const config: RemoteConfig = {
    url: "https://example.com/ingest",
    readUrl: "https://example.com/api/v1/export",
    token: "abc123",
    autoPush: true,
    lastSyncedAt: "2026-07-31T20:15:00.000Z",
    pushed: { s1: { fp: "fp1", at: 1785481200000, prefix: "barbell_squat" } },
  }

  it("keeps every field", () => {
    // readRemote rebuilds the object field by field, so a field added to the type and the
    // writer but forgotten here is saved and then silently dropped. That happened to readUrl:
    // "Read from" accepted a URL, worked until reload, then emptied itself.
    writeRemote(config)
    expect(readRemote()).toEqual(config)
  })

  it("is stable across repeated save/read cycles", () => {
    writeRemote(config)
    for (let i = 0; i < 3; i++) writeRemote(readRemote())
    expect(readRemote()).toEqual(config)
  })

  it("defaults cleanly for a config written before a field existed", () => {
    mem.set("gains.remote.v1", JSON.stringify({ url: "u", token: "t" }))
    const back = readRemote()
    expect(back.url).toBe("u")
    expect(back.readUrl).toBe("")
    expect(back.autoPush).toBe(false)
    expect(back.pushed).toEqual({})
  })
})

describe("parseState never throws at the user", () => {
  it("reads a well-formed document", () => {
    const doc = {
      version: 1,
      sets: [{ id: "a", exerciseId: "squat.barbell", date: "2026-07-31", loggedAt: "x", reps: 5 }],
      prefs: { units: "imperial", theme: "dark", clock: "12h", accent: "teal" },
    }
    const s = parseState(JSON.stringify(doc))
    expect(s.sets).toHaveLength(1)
    expect(s.prefs.units).toBe("imperial")
  })

  it("degrades to empty rather than a blank screen", () => {
    for (const raw of [null, "", "{", "null", '"a string"', "[1,2,3]"]) {
      expect(parseState(raw as string | null).sets).toEqual([])
    }
  })

  it("drops malformed sets but keeps the good ones", () => {
    const s = parseState(
      JSON.stringify({
        sets: [
          { id: "a", exerciseId: "squat.barbell", date: "2026-07-31" },
          { nope: true },
          "garbage",
        ],
      }),
    )
    expect(s.sets).toHaveLength(1)
  })

  it("fills in preferences that predate a setting", () => {
    const s = parseState(JSON.stringify({ sets: [], prefs: { units: "imperial" } }))
    expect(s.prefs.units).toBe("imperial")
    expect(s.prefs.theme).toBe("system")
    expect(s.prefs.clock).toBe("24h")
  })
})

describe("the document grew readings without a migration", () => {
  it("loads a v1 document and keeps every set", () => {
    // A v1 export has no `readings` and no `trackers`. Absent is empty, not a failure to load —
    // this is the whole migration.
    const v1 = JSON.stringify({
      version: 1,
      sets: [{ id: "s1", exerciseId: "squat.barbell", date: "2026-07-31", loggedAt: "x", weightKg: 100, reps: 5 }],
      prefs: { units: "imperial" },
    })
    const state = parseState(v1)
    expect(state.version).toBe(2)
    expect(state.sets).toHaveLength(1)
    expect(state.readings).toEqual([])
    expect(state.trackers).toEqual([])
    expect(state.prefs.units).toBe("imperial")
  })

  it("keeps a custom tracker whole through a save and load", () => {
    // Every field has to be listed in the parser. This is the shape of bug that silently emptied
    // `readUrl`: written by the writer, absent from the parser, gone on the next load. A target
    // dropped here means a ring that vanishes the first time the app is reopened.
    const doc = JSON.stringify({
      version: 2,
      sets: [],
      readings: [
        { id: "r1", trackerId: "creatine", date: "2026-08-02", loggedAt: "x", value: 5 },
      ],
      trackers: [
        { id: "creatine", name: "Creatine", unit: "g", mode: "sum", target: 5, nutrition: true, recovered: true },
      ],
      prefs: {},
    })
    const state = parseState(doc)
    expect(state.trackers[0]).toEqual({
      id: "creatine",
      name: "Creatine",
      unit: "g",
      mode: "sum",
      target: 5,
      nutrition: true,
      recovered: true,
    })
    expect(state.readings).toHaveLength(1)
  })

  it("drops a tracker it can't trust rather than loading half of one", () => {
    const doc = JSON.stringify({
      version: 2,
      sets: [],
      readings: [
        { id: "r1", trackerId: "x", date: "d", loggedAt: "x", value: "not a number" },
        { id: "r2", trackerId: "x", date: "d", loggedAt: "x", value: 5 },
      ],
      trackers: [
        { id: "nounit", name: "No unit", mode: "sum" },
        { id: "badunit", name: "Bad unit", unit: "furlongs", mode: "sum" },
        { name: "No id", unit: "g", mode: "sum" },
      ],
      prefs: {},
    })
    const state = parseState(doc)
    expect(state.trackers).toEqual([])
    // A reading whose value isn't a number would render as NaN and push NaN.
    expect(state.readings).toHaveLength(1)
    expect(state.readings[0]?.id).toBe("r2")
  })

  it("defaults an unrecognised mode to summing", () => {
    const doc = JSON.stringify({
      version: 2,
      trackers: [{ id: "x", name: "X", unit: "g", mode: "nonsense" }],
    })
    expect(parseState(doc).trackers[0]?.mode).toBe("sum")
  })
})
