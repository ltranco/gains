"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import Link from "next/link"

import { SubPageBar } from "@/components/TopBar"
import { Alert, Check, Close, Spinner } from "@/components/icons"
import { ACCENTS, ACCENT_ORDER, DEFAULT_ACCENT, normaliseHex } from "@/lib/accents"
import { formatStamp, todayKey } from "@/lib/date"
import { applyPull, planPush, pullLog, pushLog } from "@/lib/remote"
import { syncablesOf } from "@/lib/samples"
import { DEFAULT_PREFS, parseState } from "@/lib/store"
import { MACROS } from "@/lib/food"
import type { ClockFormat, ThemeChoice, Tracker, UnitSystem } from "@/lib/types"
import { useRemote } from "@/providers/RemoteProvider"
import { useStore } from "@/providers/StoreProvider"

export default function Settings() {
  const { state, replaceAll } = useStore()
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
    const counts = [
      next.sets.length > 0 && `${next.sets.length} sets`,
      next.foods.length > 0 && `${next.foods.length} foods`,
      next.readings.length > 0 && `${next.readings.length} entries`,
    ].filter((x): x is string => Boolean(x))

    if (counts.length === 0) {
      setFileStatus("That file has nothing logged in it. Nothing imported.")
      return
    }
    // Replaces rather than merges, for the same reason the remote does. See lib/remote.ts.
    replaceAll({ ...next, prefs: state.prefs })
    setFileStatus(`Imported ${counts.join(", ")}.`)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <SubPageBar title="Settings" />

      <div className="flex flex-col">
        <AppearanceSection />

        <MacroSection />

        <Section label="Metrics">
          <Link
            href="/settings/metrics"
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: "var(--border-strong)" }}
          >
            Manage metrics
          </Link>
        </Section>

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
 * Theme, units, clock and accent as four rows of one section.
 *
 * They were four sections, which gave four headings to a screen where each one carries a single
 * control. A heading per row is all heading and no rows — the same call as the metrics list.
 */
function AppearanceSection() {
  const { state, hydrated, setPrefs } = useStore()
  const prefs = hydrated ? state.prefs : DEFAULT_PREFS

  return (
    <Section label="Appearance">
      <div className="flex flex-col gap-3">
        <Row label="Theme">
          <Segmented<ThemeChoice>
            value={prefs.theme}
            options={[
              ["system", "System"],
              ["light", "Light"],
              ["dark", "Dark"],
            ]}
            onChange={(theme) => setPrefs({ theme })}
          />
        </Row>

        <Row label="Units">
          <Segmented<UnitSystem>
            value={prefs.units}
            options={[
              ["metric", "Metric"],
              ["imperial", "Imperial"],
            ]}
            onChange={(units) => setPrefs({ units })}
          />
        </Row>

        <Row label="Clock">
          <Segmented<ClockFormat>
            value={prefs.clock}
            options={[
              ["24h", "24-hour"],
              ["12h", "12-hour"],
            ]}
            onChange={(clock) => setPrefs({ clock })}
          />
        </Row>

        <Row label="Accent">
          <AccentPicker />
        </Row>
      </div>
    </Section>
  )
}

/**
 * Label above its control, so a segmented group that outgrows the row still fits.
 *
 * `items-start` is load-bearing: a flex column stretches its children by default, which made every
 * segmented control span the full width and turned three small switches into three full-width bars.
 * A two-option toggle should be two options wide.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </div>
  )
}

/**
 * Seven presets plus anything you can name in hex. The custom swatch opens the platform
 * colour picker; the field beside it takes a pasted hex with or without the `#`, so a value
 * copied out of Figma drops straight in.
 */
function AccentPicker() {
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
    <div>
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
    </div>
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
 * What the rings are fractions of.
 *
 * Four numbers in one row, because that's all this is — and because a macro target is a preference
 * rather than a thing you log, which is why it lives here and not on the metrics page. Clearing a
 * field removes that ring rather than setting it to zero.
 */
function MacroSection() {
  const { state, hydrated, setPrefs } = useStore()
  const targets = hydrated ? state.prefs.macros : {}

  return (
    <Section label="Daily targets">
      {/* Fixed columns rather than four stretched ones, so the row is as wide as the numbers it
          holds. Same reason the segmented controls aren't full width. */}
      <div className="flex flex-wrap gap-2">
        {MACROS.map((macro) => (
          <TargetField
            key={macro.key}
            label={macro.label}
            unit={macro.unit}
            value={targets[macro.key]}
            onCommit={(next) =>
              setPrefs({ macros: { ...state.prefs.macros, [macro.key]: next } })
            }
          />
        ))}
      </div>
    </Section>
  )
}

function TargetField({
  label,
  unit,
  value,
  onCommit,
}: {
  label: string
  unit: string
  value: number | undefined
  onCommit: (next: number | undefined) => void
}) {
  // Local draft so a half-typed number doesn't repaint the rings on every keystroke — and so an
  // empty field mid-edit doesn't momentarily read as "no target" and drop the ring.
  const [draft, setDraft] = useState("")
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value])

  const commit = () => {
    const raw = draft.trim().replace(/,/g, "")
    if (!raw) return onCommit(undefined)
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return setDraft(value === undefined ? "" : String(value))
    onCommit(n)
  }

  return (
    <label className="flex w-[76px] flex-col gap-1">
      <span className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        inputMode="numeric"
        placeholder="none"
        aria-label={`${label} target in ${unit}`}
        className="nums w-full rounded-lg border px-2 py-2 text-center text-[14px] outline-none placeholder:font-normal placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
        style={{ background: "var(--bg-subtle)" }}
      />
    </label>
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
    () => syncablesOf(state.sets, state.foods, state.readings, trackers),
    [state.sets, state.foods, state.readings, trackers],
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
