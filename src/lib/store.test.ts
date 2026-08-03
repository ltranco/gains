import { beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_MACROS, parseState, readRemote, writeRemote } from "./store"
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
    pushed: { s1: { fp: "fp1", at: 1785481200000, prefixes: ["barbell_squat"] } },
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
        { id: "creatine", name: "Creatine", unit: "g", mode: "sum", target: 5, recovered: true },
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

describe("food and macro targets survive storage", () => {
  it("keeps a food whole, and a zero macro as zero", () => {
    const doc = JSON.stringify({
      version: 2,
      foods: [
        {
          id: "f1",
          date: "2026-08-02",
          loggedAt: "2026-08-02T15:12:00.000Z",
          name: "Chicken bowl",
          kcal: 620,
          proteinG: 48,
          carbsG: 61,
          fatG: 0,
        },
      ],
    })
    expect(parseState(doc).foods[0]).toEqual({
      id: "f1",
      date: "2026-08-02",
      loggedAt: "2026-08-02T15:12:00.000Z",
      name: "Chicken bowl",
      kcal: 620,
      proteinG: 48,
      carbsG: 61,
      fatG: 0,
    })
  })

  it("defaults a missing macro to zero rather than dropping the meal", () => {
    const doc = JSON.stringify({
      version: 2,
      foods: [{ id: "f1", date: "2026-08-02", loggedAt: "x", name: "", kcal: 400 }],
    })
    const [f] = parseState(doc).foods
    expect(f?.kcal).toBe(400)
    expect(f?.fatG).toBe(0)
  })

  it("fills in a target the document predates instead of dropping its ring", () => {
    // Spreading a stored `macros` object whole would leave `fat` undefined here, and an undefined
    // target silently removes that ring.
    const doc = JSON.stringify({ version: 2, prefs: { macros: { kcal: 2600 } } })
    const macros = parseState(doc).prefs.macros
    expect(macros.kcal).toBe(2600)
    expect(macros.fat).toBe(DEFAULT_MACROS.fat)
  })

  it("drops a junk target without taking the others with it", () => {
    const doc = JSON.stringify({
      version: 2,
      prefs: { macros: { kcal: "lots", protein: 200 } },
    })
    const macros = parseState(doc).prefs.macros
    expect(macros.protein).toBe(200)
    expect(macros.kcal).toBe(DEFAULT_MACROS.kcal)
  })

  it("reads an old single-prefix push record as a one-element list", () => {
    // Written before a food could touch four series at once. Dropping these instead would orphan
    // the entire remote copy of the log — every set would look unpushed and get re-sent.
    writeRemote({ url: "u", token: "t" })
    const raw = JSON.parse(window.localStorage.getItem("gains.remote.v1")!)
    raw.pushed = { s1: { fp: "x", at: 123, prefix: "barbell_squat" } }
    window.localStorage.setItem("gains.remote.v1", JSON.stringify(raw))
    expect(readRemote().pushed?.s1).toEqual({ fp: "x", at: 123, prefixes: ["barbell_squat"] })
  })
})
