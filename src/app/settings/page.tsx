"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { SubPageBar } from "@/components/TopBar"
import { Check } from "@/components/icons"
import { ACCENTS, ACCENT_ORDER, DEFAULT_ACCENT, normaliseHex } from "@/lib/accents"
import { todayKey } from "@/lib/date"
import { buildPush, pushMetrics, resetPushState } from "@/lib/remote"
import { EMPTY_REMOTE, parseState, readRemote, writeRemote } from "@/lib/store"
import type { ClockFormat, RemoteConfig, ThemeChoice, UnitSystem } from "@/lib/types"
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
    if (next.sets.length === 0) {
      setFileStatus("That file has no sets in it — nothing imported.")
      return
    }
    // Replaces rather than merges, for the same reason the remote does. See lib/remote.ts.
    replaceAll({ ...next, prefs: state.prefs })
    setFileStatus(`Imported ${next.sets.length} sets.`)
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
 * The metrics endpoint. Not auth, and not a backup — this is a one-way derived feed. Daily
 * totals cannot be turned back into sets, so the JSON export below remains the only way to
 * recover the log itself.
 *
 * Any host honouring the shim's ingest contract works; metrics.ltran.co is just the default.
 */
function MetricsSection() {
  const { state } = useStore()
  const [config, setConfig] = useState<RemoteConfig>(EMPTY_REMOTE)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null)

  // Kept out of GainsState, so it loads separately from the log document.
  useEffect(() => setConfig(readRemote()), [])

  const save = (next: RemoteConfig) => {
    setConfig(next)
    writeRemote(next)
  }

  const pending = useMemo(
    () => buildPush(config, state.sets).outcome,
    [config, state.sets],
  )

  const push = async () => {
    setBusy(true)
    setStatus(null)
    const res = await pushMetrics(config, state.sets)
    setBusy(false)
    if (!res.ok) {
      setStatus({ text: res.error, bad: true })
      return
    }
    save(res.value.config)
    setStatus({
      text:
        res.value.days.length === 0
          ? "Already up to date."
          : `Pushed ${res.value.samples} samples across ${res.value.days.length} ${
              res.value.days.length === 1 ? "day" : "days"
            }.`,
    })
  }

  const ready = config.url.trim().length > 0

  return (
    <Section label="Metrics">
      <div className="flex flex-col gap-2">
        <Field
          label="Endpoint"
          value={config.url}
          onChange={(url) => save({ ...config, url })}
          placeholder="https://metrics.ltran.co/ingest"
          type="url"
        />
        <Field
          label="Token"
          value={config.token}
          onChange={(token) => save({ ...config, token })}
          placeholder="Bearer token"
          type="password"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button onClick={push} disabled={!ready || busy}>
          {busy ? "Pushing…" : "Push"}
        </Button>
        <Button onClick={() => save(resetPushState(config))} disabled={busy}>
          Re-send all
        </Button>
      </div>

      {status ? (
        <Status bad={status.bad}>{status.text}</Status>
      ) : (
        <Status>
          {pending.days.length === 0
            ? "Nothing to push."
            : `${pending.samples} samples across ${pending.days.length} ${
                pending.days.length === 1 ? "day" : "days"
              } pending.`}
          {config.lastSyncedAt &&
            ` Last pushed ${new Date(config.lastSyncedAt).toLocaleString()}.`}
        </Status>
      )}
    </Section>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (next: string) => void
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
