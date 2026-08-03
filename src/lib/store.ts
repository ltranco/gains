import { TRACKER_UNITS } from "./types"
import type {
  FoodEntry,
  GainsState,
  MacroTargets,
  Prefs,
  PushRecord,
  Reading,
  RemoteConfig,
  SetEntry,
  Tracker,
  TrackerUnit,
} from "./types"

/**
 * The whole persistence layer. One localStorage key holding one JSON document, versioned
 * from day one so a future migration has something to switch on rather than having to sniff
 * the shape.
 *
 * Sets and readings are flat arrays rather than maps keyed by day. Grouping by day is cheap to do
 * in memory and this shape is what the remote sync ships verbatim — nesting would mean two
 * representations to keep honest.
 *
 * The document went to `version: 2` when readings arrived, and the storage key stayed at `v1` on
 * purpose: the key is what an existing install reads, so bumping it would silently orphan every
 * logged set. The parser fills what a v1 document is missing, which is all the migration this
 * needs.
 */

export const STORAGE_KEY = "gains.v1"

/**
 * Macro targets ship set rather than blank. A ring needs a whole to be an arc, so shipping them
 * empty would mean the rings show nothing at all until you've been through Settings — a feature
 * that looks broken on first run. Plausible defaults for a lifter, not a recommendation.
 */
export const DEFAULT_MACROS: MacroTargets = { kcal: 2200, protein: 180, carbs: 220, fat: 70 }

export const DEFAULT_PREFS: Prefs = {
  units: "metric",
  theme: "system",
  clock: "24h",
  accent: "indigo",
  macros: DEFAULT_MACROS,
}

export const EMPTY_STATE: GainsState = {
  version: 2,
  sets: [],
  foods: [],
  readings: [],
  trackers: [],
  prefs: DEFAULT_PREFS,
}

/** Never throws. A corrupt or partial document degrades to empty rather than a blank screen. */
export function parseState(raw: string | null): GainsState {
  if (!raw) return EMPTY_STATE
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return EMPTY_STATE
    const doc = parsed as Partial<GainsState>
    const prefs: Partial<Prefs> = doc.prefs ?? {}
    return {
      version: 2,
      sets: Array.isArray(doc.sets) ? doc.sets.filter(isSetEntry) : [],
      // A v1 document has none of these three. Absent is empty, not a failure to load.
      foods: Array.isArray(doc.foods) ? doc.foods.flatMap(asFood) : [],
      readings: Array.isArray(doc.readings) ? doc.readings.filter(isReading) : [],
      trackers: Array.isArray(doc.trackers) ? doc.trackers.flatMap(asTracker) : [],
      prefs: {
        ...DEFAULT_PREFS,
        ...prefs,
        // Merged field by field: spreading a stored `macros` whole would drop a default for any
        // target the document predates, and a missing target silently removes its ring.
        macros: { ...DEFAULT_MACROS, ...asMacros(prefs.macros) },
      },
    }
  } catch {
    return EMPTY_STATE
  }
}

function isSetEntry(v: unknown): v is SetEntry {
  if (typeof v !== "object" || v === null) return false
  const s = v as Partial<SetEntry>
  return (
    typeof s.id === "string" &&
    typeof s.exerciseId === "string" &&
    typeof s.date === "string"
  )
}

/**
 * A stored food. Macros default to 0 rather than dropping the entry: a food whose fat was never
 * recorded is still a food, and a meal vanishing from the log because one field was missing is
 * worse than one that reads 0 g of fat.
 */
function asFood(v: unknown): FoodEntry[] {
  if (typeof v !== "object" || v === null) return []
  const f = v as Partial<FoodEntry>
  if (typeof f.id !== "string" || typeof f.date !== "string") return []
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0)
  return [
    {
      id: f.id,
      date: f.date,
      loggedAt: typeof f.loggedAt === "string" ? f.loggedAt : "",
      name: typeof f.name === "string" ? f.name : "",
      kcal: num(f.kcal),
      proteinG: num(f.proteinG),
      carbsG: num(f.carbsG),
      fatG: num(f.fatG),
      ...(typeof f.note === "string" ? { note: f.note } : {}),
    },
  ]
}

/** Targets, field by field. A junk value drops that one target rather than the whole set. */
function asMacros(raw: unknown): MacroTargets {
  if (typeof raw !== "object" || raw === null) return {}
  const m = raw as Record<string, unknown>
  const out: MacroTargets = {}
  for (const key of ["kcal", "protein", "carbs", "fat"] as const) {
    const v = m[key]
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = v
  }
  return out
}

function isReading(v: unknown): v is Reading {
  if (typeof v !== "object" || v === null) return false
  const r = v as Partial<Reading>
  return (
    typeof r.id === "string" &&
    typeof r.trackerId === "string" &&
    typeof r.date === "string" &&
    typeof r.value === "number" &&
    Number.isFinite(r.value)
  )
}

/**
 * A stored tracker, field by field — flatMap so an unusable one drops out rather than arriving
 * half-formed.
 *
 * Every field has to be listed. This is the same shape of bug that silently emptied `readUrl`:
 * written by the writer, absent from the parser, so it vanished on the next load. A tracker
 * missing its `target` here would lose its ring the first time the app was reopened.
 */
function asTracker(v: unknown): Tracker[] {
  if (typeof v !== "object" || v === null) return []
  const t = v as Partial<Tracker>
  if (typeof t.id !== "string" || !t.id) return []
  if (typeof t.name !== "string" || !t.name) return []
  if (!TRACKER_UNITS.includes(t.unit as TrackerUnit)) return []
  return [
    {
      id: t.id,
      name: t.name,
      unit: t.unit as TrackerUnit,
      mode: t.mode === "point" ? "point" : "sum",
      ...(typeof t.target === "number" && Number.isFinite(t.target) ? { target: t.target } : {}),
      ...(t.recovered === true ? { recovered: true } : {}),
    },
  ]
}

/** Reads storage. Returns empty state during SSR, where `window` doesn't exist. */
export function readState(): GainsState {
  if (typeof window === "undefined") return EMPTY_STATE
  try {
    return parseState(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return EMPTY_STATE
  }
}

export function writeState(state: GainsState): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private-mode Safari and a full quota both land here. Losing the write is bad but
    // throwing mid-render is worse; the JSON export is the backstop.
  }
}

/* ── Remote config, stored apart from the log document ─────────────────────── */

export const REMOTE_KEY = "gains.remote.v1"

export const EMPTY_REMOTE: RemoteConfig = { url: "", token: "" }

export function readRemote(): RemoteConfig {
  if (typeof window === "undefined") return EMPTY_REMOTE
  try {
    const raw = window.localStorage.getItem(REMOTE_KEY)
    if (!raw) return EMPTY_REMOTE
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return EMPTY_REMOTE
    const c = parsed as Partial<RemoteConfig>
    // Every field of RemoteConfig has to be listed here. `readUrl` was added to the type and
    // to the writer but not to this parser, so it was saved and then silently dropped on the
    // next load — the field just emptied itself.
    return {
      url: typeof c.url === "string" ? c.url : "",
      readUrl: typeof c.readUrl === "string" ? c.readUrl : "",
      token: typeof c.token === "string" ? c.token : "",
      autoPush: c.autoPush === true,
      ...(typeof c.lastSyncedAt === "string" ? { lastSyncedAt: c.lastSyncedAt } : {}),
      pushed: normalisePushed(c.pushed),
    }
  } catch {
    return EMPTY_REMOTE
  }
}

/**
 * Tolerates two older shapes.
 *
 * The first was a bare fingerprint string with no record of when the samples were written. Those
 * can still detect an edit but can't be tombstoned, so they're dropped rather than kept in a state
 * that would silently do nothing.
 *
 * The second held a single `prefix`, from before a food could write four series at once. One
 * prefix is a one-element list, and reading it that way keeps every already-pushed set
 * tombstonable — dropping them instead would orphan the entire remote copy of the log.
 */
function normalisePushed(raw: unknown): Record<string, PushRecord> {
  if (typeof raw !== "object" || raw === null) return {}
  const out: Record<string, PushRecord> = {}
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue
    const e = v as { fp?: unknown; at?: unknown; prefix?: unknown; prefixes?: unknown }
    if (typeof e.fp !== "string" || typeof e.at !== "number") continue
    const prefixes = Array.isArray(e.prefixes)
      ? e.prefixes.filter((p): p is string => typeof p === "string")
      : typeof e.prefix === "string"
        ? [e.prefix]
        : []
    if (prefixes.length === 0) continue
    out[id] = { fp: e.fp, at: e.at, prefixes }
  }
  return out
}

export function writeRemote(config: RemoteConfig): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(REMOTE_KEY, JSON.stringify(config))
  } catch {
    // Same reasoning as writeState: never throw out of a click handler.
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
