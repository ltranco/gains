import type { GainsState, Prefs, RemoteConfig, SetEntry } from "./types"

/**
 * The whole persistence layer. One localStorage key holding one JSON document, versioned
 * from day one so a future migration has something to switch on rather than having to sniff
 * the shape.
 *
 * Sets are a flat array rather than a map keyed by day. Grouping by day is cheap to do in
 * memory and this shape is what the remote sync ships verbatim — nesting would mean two
 * representations to keep honest.
 */

export const STORAGE_KEY = "gains.v1"

export const DEFAULT_PREFS: Prefs = {
  units: "metric",
  theme: "system",
  clock: "24h",
  accent: "indigo",
}

export const EMPTY_STATE: GainsState = { version: 1, sets: [], prefs: DEFAULT_PREFS }

/** Never throws. A corrupt or partial document degrades to empty rather than a blank screen. */
export function parseState(raw: string | null): GainsState {
  if (!raw) return EMPTY_STATE
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return EMPTY_STATE
    const doc = parsed as Partial<GainsState>
    return {
      version: 1,
      sets: Array.isArray(doc.sets) ? doc.sets.filter(isSetEntry) : [],
      prefs: { ...DEFAULT_PREFS, ...(doc.prefs ?? {}) },
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
 * Tolerates the older shape, where each entry was a bare fingerprint string with no record of
 * when the samples were written. Those entries can still detect an edit; they just can't be
 * tombstoned, so they're dropped rather than kept in a state that would silently do nothing.
 */
function normalisePushed(
  raw: unknown,
): Record<string, { fp: string; at: number; prefix: string }> {
  if (typeof raw !== "object" || raw === null) return {}
  const out: Record<string, { fp: string; at: number; prefix: string }> = {}
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue
    const e = v as { fp?: unknown; at?: unknown; prefix?: unknown }
    if (typeof e.fp === "string" && typeof e.at === "number" && typeof e.prefix === "string") {
      out[id] = { fp: e.fp, at: e.at, prefix: e.prefix }
    }
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
