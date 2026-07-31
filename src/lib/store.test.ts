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
    pushed: { s1: "fp1", s2: "fp2" },
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
