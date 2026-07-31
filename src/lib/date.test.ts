import { describe, expect, it } from "vitest"

import {
  formatStamp,
  formatTime,
  fromDayKey,
  instantOn,
  rfc3339Local,
  shiftDay,
  toDayKey,
  todayKey,
} from "./date"

// Tests run with TZ=America/Los_Angeles (see package.json). Several of these are only
// meaningful at a non-zero UTC offset.

describe("day keys are local, not UTC", () => {
  it("keeps a late-evening set on the day it was done", () => {
    // 23:30 Pacific is already tomorrow in UTC. toISOString().slice(0,10) would file this
    // under the next day, which is the bug this function exists to avoid.
    expect(toDayKey(new Date(2026, 6, 31, 23, 30))).toBe("2026-07-31")
  })

  it("keeps an early-morning set on the right day too", () => {
    expect(toDayKey(new Date(2026, 6, 31, 0, 30))).toBe("2026-07-31")
  })

  it("parses a key back to local midnight", () => {
    const d = fromDayKey("2026-07-31")
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 6, 31, 0])
  })

  it("shifts across month boundaries", () => {
    expect(shiftDay("2026-08-01", -1)).toBe("2026-07-31")
    expect(shiftDay("2026-07-31", 1)).toBe("2026-08-01")
  })
})

describe("instantOn", () => {
  it("stamps a set on its own day, not today", () => {
    // The original bug: loggedAt was always new Date(), so a set logged against yesterday
    // produced a metric sample stamped today and every back-dated session collapsed onto one
    // point in Grafana.
    for (const back of [0, 1, 3, 30, 400]) {
      const day = shiftDay(todayKey(), -back)
      expect(toDayKey(new Date(instantOn(day)))).toBe(day)
    }
  })

  it("uses the current time of day, so today's instant is now", () => {
    expect(Math.abs(Date.parse(instantOn(todayKey())) - Date.now())).toBeLessThan(2000)
  })

  it("survives the autumn DST transition", () => {
    // 1 Nov 2026 is the US fall-back. A naive setHours on a date built at local midnight can
    // land on the wrong side of the repeated hour.
    for (const day of ["2026-10-31", "2026-11-01", "2026-11-02"]) {
      expect(toDayKey(new Date(instantOn(day)))).toBe(day)
    }
  })

  it("survives the spring DST transition", () => {
    // 8 Mar 2026 is spring-forward: 02:00 to 03:00 does not exist locally.
    for (const day of ["2026-03-07", "2026-03-08", "2026-03-09"]) {
      expect(toDayKey(new Date(instantOn(day)))).toBe(day)
    }
  })
})

describe("rfc3339Local", () => {
  it("emits milliseconds and a real local offset", () => {
    const s = rfc3339Local(new Date(2026, 6, 31, 9, 14, 3, 7))
    expect(s).toMatch(/^2026-07-31T09:14:03\.007[+-]\d{2}:\d{2}$/)
  })

  it("round-trips to the same instant", () => {
    const d = new Date(2026, 6, 31, 9, 14, 3, 123)
    expect(Date.parse(rfc3339Local(d))).toBe(d.getTime())
  })

  it("reports the right offset either side of DST", () => {
    // Getting this wrong shifts a sample by an hour, silently, for half the year.
    expect(rfc3339Local(new Date(2026, 6, 15, 12, 0))).toContain("-07:00") // PDT
    expect(rfc3339Local(new Date(2026, 0, 15, 12, 0))).toContain("-08:00") // PST
  })
})

describe("formatStamp", () => {
  it("is 24-hour with seconds and never am/pm", () => {
    const s = formatStamp(new Date(2026, 6, 31, 14, 32, 58).toISOString())
    expect(s).toBe("2026-07-31 14:32:58")
    expect(s).not.toMatch(/[ap]m/i)
  })

  it("pads a morning time rather than dropping to 12-hour", () => {
    expect(formatStamp(new Date(2026, 6, 31, 9, 5, 4).toISOString())).toBe("2026-07-31 09:05:04")
  })

  it("degrades to a placeholder rather than Invalid Date", () => {
    expect(formatStamp(undefined)).toBe("·")
    expect(formatStamp("nonsense")).toBe("·")
  })
})

describe("formatTime", () => {
  it("honours the clock preference", () => {
    const iso = new Date(2026, 6, 31, 14, 32).toISOString()
    expect(formatTime(iso, "24h")).toBe("14:32")
    expect(formatTime(iso, "12h")).toBe("2:32 pm")
  })

  it("renders midnight as 12 in 12-hour", () => {
    expect(formatTime(new Date(2026, 6, 31, 0, 15).toISOString(), "12h")).toBe("12:15 am")
  })

  it("returns null for a set with no usable timestamp", () => {
    expect(formatTime(undefined, "24h")).toBeNull()
    expect(formatTime("nonsense", "24h")).toBeNull()
  })
})
