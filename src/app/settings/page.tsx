"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { SubPageBar } from "@/components/TopBar"
import { Alert, Check, ChevronDown, Close, Spinner } from "@/components/icons"
import { ACCENTS, ACCENT_ORDER, DEFAULT_ACCENT, normaliseHex } from "@/lib/accents"
import { formatStamp, todayKey } from "@/lib/date"
import { applyPull, planPush, pullLog, pushLog } from "@/lib/remote"
import { syncablesOf } from "@/lib/samples"
import { parseState } from "@/lib/store"
import { isBuiltin, validateTrackerName } from "@/lib/trackers"
import {
  TRACKER_UNITS,
  type ClockFormat,
  type ThemeChoice,
  type Tracker,
  type TrackerMode,
  type TrackerUnit,
  type UnitSystem,
} from "@/lib/types"
import { trackerUnit, trackerValue } from "@/lib/units"
import { useRemote } from "@/providers/RemoteProvider"
import { useStore } from "@/providers/StoreProvider"

export default function Settings() {
  const { state, hydrated, setPrefs, replaceAll } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileStatus, setFileStatus] = useState<string | null>(null)

  const download = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `gains-${todayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFile = async (file: File) => {
    const next = parseState(await file.text())
    if (next.sets.length === 0 && next.readings.length === 0) {
      setFileStatus("That file has nothing logged in it. Nothing imported.")
      return
    }
    // Replaces rather than merges, for the same reason the remote does. See lib/remote.ts.
    replaceAll({ ...next, prefs: state.prefs })
    setFileStatus(
      [
        next.sets.length > 0 && `${next.sets.length} sets`,
        next.readings.length > 0 && `${next.readings.length} entries`,
      ]
        .filter(Boolean)
        .join(" and ") + " imported.",
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <SubPageBar title="Settings" />

      <div className="flex flex-col">
        <Section label="Theme">
          <Segmented<ThemeChoice>
            value={hydrated ? state.prefs.theme : "system"}
            options={[
              ["system", "System"],
              ["light", "Light"],
              ["dark", "Dark"],
            ]}
            onChange={(theme) => setPrefs({ theme })}
          />
        </Section>

        <Section label="Units">
          <Segmented<UnitSystem>
            value={hydrated ? state.prefs.units : "metric"}
            options={[
              ["metric", "Metric"],
              ["imperial", "Imperial"],
            ]}
            onChange={(units) => setPrefs({ units })}
          />
        </Section>

        <AccentSection />

        <Section label="Clock">
          <Segmented<ClockFormat>
            value={hydrated ? state.prefs.clock : "24h"}
            options={[
              ["24h", "24-hour"],
              ["12h", "12-hour"],
            ]}
            onChange={(clock) => setPrefs({ clock })}
          />
        </Section>

        <MetricsSection />

        <StorageSection />

        <Section label="File">
          <div className="flex gap-2">
            <Button onClick={download}>Export JSON</Button>
            <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
              e.target.value = ""
            }}
          />
          {fileStatus && <Status>{fileStatus}</Status>}
        </Section>
      </div>
    </main>
  )
}

/**
 * Seven presets plus anything you can name in hex. The custom swatch opens the platform
 * colour picker; the field beside it takes a pasted hex with or without the `#`, so a value
 * copied out of Figma drops straight in.
 */
function AccentSection() {
  const { state, hydrated, setPrefs } = useStore()
  const accent = hydrated ? state.prefs.accent : DEFAULT_ACCENT
  const custom = accent.startsWith("#")

  // Local text state so a half-typed hex doesn't repaint the app on every keystroke.
  const [draft, setDraft] = useState("")
  useEffect(() => setDraft(custom ? accent : ""), [accent, custom])

  const commit = (value: string) => {
    const hex = normaliseHex(value)
    if (hex) setPrefs({ accent: hex })
  }

  return (
    <Section label="Accent">
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_ORDER.map((key) => (
          <Swatch
            key={key}
            color={ACCENTS[key].base}
            label={ACCENTS[key].label}
            active={accent === key}
            onClick={() => setPrefs({ accent: key })}
          />
        ))}

        <label
          className="relative flex size-8 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95"
          title="Custom colour"
          style={{
            background: custom
              ? accent
              : "conic-gradient(#d13438,#c2570c,#2f7d4f,#0e8175,#3e63dd,#8e4ec6,#d13438)",
            boxShadow: custom
              ? `0 0 0 2px var(--bg), 0 0 0 4px ${accent}`
              : undefined,
          }}
        >
          {custom && (
            <span style={{ color: "var(--accent-text)" }}>
              <Check size={15} />
            </span>
          )}
          <input
            type="color"
            value={custom ? accent : "#5e6ad2"}
            onChange={(e) => setPrefs({ accent: e.target.value.toLowerCase() })}
            aria-label="Custom accent colour"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit(draft)
          }
        }}
        placeholder="#5e6ad2"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="nums-quiet mt-2.5 w-32 rounded-lg border px-2.5 py-1.5 text-[13px] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
        style={{ background: "var(--bg-subtle)" }}
      />
    </Section>
  )
}

function Swatch({
  color,
  label,
  active,
  onClick,
}: {
  color: string
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full transition-transform active:scale-95"
      style={{
        background: color,
        // A ring rather than a border, so the swatch never changes size when selected.
        boxShadow: active ? `0 0 0 2px var(--bg), 0 0 0 4px ${color}` : undefined,
      }}
    >
      {active && (
        <span style={{ color: "#fff" }}>
          <Check size={15} />
        </span>
      )}
    </button>
  )
}

/**
 * The metrics you log a single number for.
 *
 * Builtins can be renamed and re-targeted but not removed — they're what the rings are drawn
 * from, and a Calories row you can delete is a rings block that can silently become empty.
 * Custom ones can be removed, which takes their entries with them.
 *
 * **Unit is frozen after creation**, like the slug, and for the same reason: the unit is half the
 * metric name. Changing `waist` from cm to inches wouldn't convert anything, it would start
 * writing `waist_in` and orphan every sample already stored under `waist_cm`.
 */
function MetricsSection() {
  const { state, trackers, saveTracker, removeTracker } = useStore()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <Section label="Metrics">
      <ul className="flex flex-col">
        {trackers.map((tracker) => (
          <li key={tracker.id} className="border-b last:border-b-0">
            <button
              type="button"
              onClick={() => setExpanded((id) => (id === tracker.id ? null : tracker.id))}
              aria-expanded={expanded === tracker.id}
              className="flex w-full items-center gap-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[14px]">{tracker.name}</span>
              <span
                className="nums-quiet shrink-0 text-[12px]"
                style={{ color: "var(--text-faint)" }}
              >
                {tracker.target === undefined
                  ? trackerUnit(tracker.unit, state.prefs.units)
                  : `${trackerValue(tracker.target, tracker.unit, state.prefs.units)} ${trackerUnit(
                      tracker.unit,
                      state.prefs.units,
                    )}`}
              </span>
              <span
                className="shrink-0 transition-transform"
                style={{
                  color: "var(--text-faint)",
                  transform: expanded === tracker.id ? "rotate(180deg)" : undefined,
                }}
              >
                <ChevronDown size={15} />
              </span>
            </button>

            {expanded === tracker.id && (
              <TrackerEditor
                tracker={tracker}
                units={state.prefs.units}
                onSave={saveTracker}
                onRemove={() => {
                  removeTracker(tracker.id)
                  setExpanded(null)
                }}
              />
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <NewTracker
          existing={trackers}
          onCancel={() => setAdding(false)}
          onCreate={(tracker) => {
            saveTracker(tracker)
            setAdding(false)
            setExpanded(tracker.id)
          }}
        />
      ) : (
        <div className="mt-3">
          <Button onClick={() => setAdding(true)}>Add metric</Button>
        </div>
      )}
    </Section>
  )
}

function TrackerEditor({
  tracker,
  units,
  onSave,
  onRemove,
}: {
  tracker: Tracker
  units: UnitSystem
  onSave: (next: Tracker) => void
  onRemove: () => void
}) {
  // Local drafts so a half-typed name or target doesn't rewrite state on every keystroke —
  // the target especially, since an empty field would momentarily read as "no target" and drop
  // the ring.
  const [name, setName] = useState(tracker.name)
  const [target, setTarget] = useState(
    tracker.target === undefined ? "" : trackerValue(tracker.target, tracker.unit, units),
  )

  const commitName = () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === tracker.name) return setName(tracker.name)
    // The id never moves. That's the point of it being separate from the name.
    onSave({ ...tracker, name: trimmed })
  }

  const commitTarget = () => {
    const raw = target.trim()
    if (!raw) {
      const { target: _drop, ...rest } = tracker
      return onSave(rest)
    }
    const n = Number(raw.replace(/,/g, ""))
    if (!Number.isFinite(n) || n <= 0) {
      return setTarget(
        tracker.target === undefined ? "" : trackerValue(tracker.target, tracker.unit, units),
      )
    }
    // Stored in the tracker's own unit, so an imperial-entered waist target lands as cm.
    onSave({ ...tracker, target: tracker.unit === "cm" && units === "imperial" ? n * 2.54 : n })
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <Field label="Name" value={name} onChange={setName} onBlur={commitName} />

      <div className="flex flex-col gap-1">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Daily target
        </span>
        <div className="flex items-center gap-2">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            inputMode="decimal"
            placeholder="none"
            className="nums w-28 rounded-lg border px-2.5 py-2 text-[14px] outline-none placeholder:font-normal placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
            style={{ background: "var(--bg-subtle)" }}
          />
          <span className="text-[13px]" style={{ color: "var(--text-faint)" }}>
            {trackerUnit(tracker.unit, units)}
          </span>
        </div>
        <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          No target, no ring — an arc needs something to be a fraction of.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          A day&apos;s entries
        </span>
        <Segmented<TrackerMode>
          value={tracker.mode}
          options={[
            ["sum", "Add up"],
            ["point", "Latest wins"],
          ]}
          onChange={(mode) => onSave({ ...tracker, mode, ...(tracker.recovered ? { recovered: false } : {}) })}
        />
      </div>

      {!isBuiltin(tracker.id) && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--danger)", borderColor: "var(--border-strong)" }}
          >
            Remove
          </button>
          <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            Deletes its entries here too.
          </span>
        </div>
      )}
    </div>
  )
}

function NewTracker({
  existing,
  onCancel,
  onCreate,
}: {
  existing: Tracker[]
  onCancel: () => void
  onCreate: (tracker: Tracker) => void
}) {
  const [name, setName] = useState("")
  const [unit, setUnit] = useState<TrackerUnit>("g")
  const [nutrition, setNutrition] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = () => {
    // The slug is the metric prefix and can never move, so it's validated here and only here:
    // against Apple Health's own names, against all 173 exercise prefixes, and against what you
    // already have. See lib/trackers.ts for why a collision is unrecoverable.
    const checked = validateTrackerName(name, existing)
    if ("error" in checked) return setError(checked.error)
    onCreate({
      id: checked.id,
      name: name.trim(),
      unit,
      mode: nutrition ? "sum" : "point",
      ...(nutrition ? { nutrition: true } : {}),
    })
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border p-3">
      <Field label="Name" value={name} onChange={setName} placeholder="Creatine" />

      <div className="flex flex-col gap-1">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Unit
        </span>
        <div className="flex flex-wrap gap-1.5">
          {TRACKER_UNITS.map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={u === unit}
              onClick={() => setUnit(u)}
              className="nums-quiet rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors"
              style={
                u === unit
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {u}
            </button>
          ))}
        </div>
        <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          Can&apos;t be changed later — it&apos;s half the metric name in storage.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Where it goes
        </span>
        <Segmented<"food" | "other">
          value={nutrition ? "food" : "other"}
          options={[
            ["food", "Nutrition"],
            ["other", "Body & other"],
          ]}
          onChange={(v) => setNutrition(v === "food")}
        />
      </div>

      {error && <Status bad>{error}</Status>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={create}
          className="rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          Create
        </button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

/**
 * The storage layer. gains is a client — it logs, draws and pushes; the data lives wherever
 * you point it. Anything honouring the contract works, so the placeholders name no host.
 *
 * The remote is append-only, so this has to be honest about what can't propagate: a set you
 * edited or deleted after pushing stays as it was remotely. We deliberately don't re-send
 * changed sets — a partial application, weight rising while reps fall, is worse than a stale
 * one.
 */
function StorageSection() {
  const { state, trackers, replaceAll } = useStore()
  const { config, setConfig, autoBusy, autoError } = useRemote()
  const [push, setPush] = useState<ActionState>({ kind: "idle" })
  const [pull, setPull] = useState<ActionState>({ kind: "idle" })
  const [armed, setArmed] = useState(false)
  const [recovered, setRecovered] = useState<Tracker[]>([])

  // Sets and readings travel as one list of samples — see lib/samples.ts.
  const items = useMemo(
    () => syncablesOf(state.sets, state.readings, trackers),
    [state.sets, state.readings, trackers],
  )
  const plan = useMemo(() => planPush(config, items), [config, items])

  const doPush = async () => {
    setPush({ kind: "busy" })
    const res = await pushLog(config, items)
    if (!res.ok) return setPush({ kind: "error", message: res.error })
    setConfig(res.value.config)
    setPush({ kind: "ok" })
  }

  const doPull = async () => {
    setPull({ kind: "busy" })
    const res = await pullLog(config, trackers)
    if (!res.ok) return setPull({ kind: "error", message: res.error })
    replaceAll(applyPull(state, res.value))
    setConfig(res.value.config)
    setRecovered(res.value.recovered)
    setPull({ kind: "ok" })
  }

  const canPush = config.url.trim().length > 0
  const canPull = (config.readUrl ?? "").trim().length > 0
  const error =
    push.kind === "error" ? push.message : pull.kind === "error" ? pull.message : autoError

  const pending = plan.fresh.length + plan.changed.length + plan.tombstones.length

  return (
    <Section label="Storage">
      <div className="flex flex-col gap-2">
        <Field
          label="Push to"
          value={config.url}
          onChange={(url) => setConfig({ ...config, url })}
          placeholder="https://<host>/ingest"
          type="url"
        />
        <Field
          label="Read from"
          value={config.readUrl ?? ""}
          onChange={(readUrl) => setConfig({ ...config, readUrl })}
          placeholder="https://<host>/api/v1/export"
          type="url"
        />
        <Field
          label="Token"
          value={config.token}
          onChange={(token) => setConfig({ ...config, token })}
          placeholder="Bearer token, used both ways"
          type="password"
        />
      </div>

      {/* Pull replaces everything logged here, so it asks first. Inline rather than a dialog:
          it's one decision, and a sheet for a yes/no is heavier than the question. */}
      {armed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Replace everything logged here?
          </span>
          <button
            type="button"
            onClick={() => {
              setArmed(false)
              void doPull()
            }}
            className="rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors"
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            Replace
          </button>
          <Button onClick={() => setArmed(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton label="Push" state={push} onClick={doPush} disabled={!canPush} />
          <ActionButton
            label="Pull"
            state={pull}
            onClick={() => setArmed(true)}
            disabled={!canPull}
            title={canPull ? undefined : "Needs a read endpoint"}
          />
        </div>
      )}

      {/* State of play sits with the buttons that change it. */}
      {error && (
        <Note tone="bad">
          <Alert size={14} />
          {error}
        </Note>
      )}

      {!error && pending > 0 && (
        <Status>
          {[
            plan.fresh.length > 0 && `${plan.fresh.length} new`,
            plan.changed.length > 0 && `${plan.changed.length} edited`,
            plan.tombstones.filter((t) => !t.replaced).length > 0 &&
              `${plan.tombstones.filter((t) => !t.replaced).length} deleted`,
          ]
            .filter(Boolean)
            .join(", ")}{" "}
          to sync
        </Status>
      )}

      {/* A pull can rebuild a metric this device had forgotten, but the store holds numbers, so
          it can't say whether the entries were meals or measurements. Saying so is better than
          quietly guessing and letting a waist reading render as a running total. */}
      {recovered.length > 0 && (
        <Status>
          Rebuilt {recovered.map((t) => t.name).join(", ")} from the remote — check whether each
          one sums or is a single reading.
        </Status>
      )}

      <div className="mt-4 flex flex-col items-start gap-1.5">
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Auto push
          {autoBusy && <Spinner size={12} />}
        </span>
        <Segmented<"off" | "on">
          value={config.autoPush ? "on" : "off"}
          options={[
            ["off", "Off"],
            ["on", "Every minute"],
          ]}
          onChange={(v) => setConfig({ ...config, autoPush: v === "on" })}
        />
      </div>

      {config.lastSyncedAt && (
        <p className="nums-quiet mt-4 text-[12px]" style={{ color: "var(--text-faint)" }}>
          Synced {formatStamp(config.lastSyncedAt)}
        </p>
      )}

    </Section>
  )
}

type ActionState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok" }
  | { kind: "error"; message: string }

/**
 * A button that reports its own outcome inline, rather than pushing a sentence into the page.
 * The result sticks until the next attempt — a tick that fades after two seconds is a tick you
 * miss when you look away.
 */
function ActionButton({
  label,
  state,
  onClick,
  disabled,
  title,
}: {
  label: string
  state: ActionState
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  const tone =
    state.kind === "ok" ? "#1f9d55" : state.kind === "error" ? "var(--danger)" : undefined

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state.kind === "busy"}
      title={title}
      aria-busy={state.kind === "busy"}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40"
      style={{ borderColor: tone ?? "var(--border-strong)", color: tone }}
    >
      {label}
      {state.kind === "busy" && <Spinner size={13} />}
      {state.kind === "ok" && <Check size={14} />}
      {state.kind === "error" && <Close size={14} />}
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (next: string) => void
  /** Commit point for fields whose value shouldn't be written on every keystroke. */
  onBlur?: () => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={
          onBlur
            ? (e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }
            : undefined
        }
        placeholder={placeholder}
        type={type}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-lg border px-2.5 py-2 text-[14px] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
        style={{ background: "var(--bg-subtle)" }}
      />
    </label>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-4 last:border-b-0">
      <h2 className="mb-2.5 text-[14px] font-semibold">{label}</h2>
      {children}
    </section>
  )
}

function Note({
  children,
  tone,
  title,
}: {
  children: React.ReactNode
  tone?: "bad"
  title?: string
}) {
  return (
    <p
      className="mt-2 flex items-center gap-1.5 text-[13px]"
      style={{ color: tone === "bad" ? "var(--danger)" : "var(--text-muted)" }}
      title={title}
    >
      {children}
    </p>
  )
}

function Status({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return (
    <p
      className="mt-2 text-[13px]"
      style={{ color: bad ? "var(--danger)" : "var(--text-muted)" }}
    >
      {children}
    </p>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange: (next: T) => void
}) {
  return (
    <div
      className="inline-flex rounded-lg border p-0.5"
      style={{ background: "var(--bg-subtle)" }}
      role="group"
    >
      {options.map(([key, label]) => {
        const active = key === value
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors"
            style={
              active
                ? { background: "var(--bg-elevated)", boxShadow: "var(--shadow-pop)" }
                : { color: "var(--text-muted)" }
            }
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Button({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40"
      style={{ borderColor: "var(--border-strong)" }}
    >
      {children}
    </button>
  )
}
