"use client"

import { useEffect, useRef, useState } from "react"

import { SubPageBar } from "@/components/TopBar"
import { Check } from "@/components/icons"
import { ACCENTS, ACCENT_ORDER, DEFAULT_ACCENT } from "@/lib/accents"
import { todayKey } from "@/lib/date"
import { loadRemote, saveRemote } from "@/lib/remote"
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

        <Section label="Accent">
          <div className="flex flex-wrap gap-2">
            {ACCENT_ORDER.map((key) => {
              const { label, base } = ACCENTS[key]
              const active = (hydrated ? state.prefs.accent : DEFAULT_ACCENT) === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => setPrefs({ accent: key })}
                  className="flex size-8 items-center justify-center rounded-full transition-transform active:scale-95"
                  style={{
                    background: base,
                    // Ring rather than a border, so the swatch itself never changes size.
                    boxShadow: active
                      ? `0 0 0 2px var(--bg), 0 0 0 4px ${base}`
                      : undefined,
                  }}
                >
                  {active && (
                    <span style={{ color: "#fff" }}>
                      <Check size={15} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Section>

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

        <RemoteSection />

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
 * The remote read/write target. Not auth and not a one-way export — the same URL is both
 * where the log goes and where it comes back from, so a new browser can be brought up to
 * date by pointing it here and pressing Load.
 */
function RemoteSection() {
  const { state, replaceAll } = useStore()
  const [config, setConfig] = useState<RemoteConfig>(EMPTY_REMOTE)
  const [busy, setBusy] = useState<"load" | "save" | null>(null)
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null)

  // Kept out of GainsState, so it loads separately from the log document.
  useEffect(() => setConfig(readRemote()), [])

  const patch = (p: Partial<RemoteConfig>) => {
    const next = { ...config, ...p }
    setConfig(next)
    writeRemote(next)
  }

  const stamp = () => {
    const at = new Date().toISOString()
    const next = { ...config, lastSyncedAt: at }
    setConfig(next)
    writeRemote(next)
  }

  const doSave = async () => {
    setBusy("save")
    setStatus(null)
    const res = await saveRemote(config, state)
    setBusy(null)
    if (!res.ok) {
      setStatus({ text: res.error, bad: true })
      return
    }
    stamp()
    setStatus({ text: `Pushed ${state.sets.length} sets.` })
  }

  const doLoad = async () => {
    setBusy("load")
    setStatus(null)
    const res = await loadRemote(config)
    setBusy(null)
    if (!res.ok) {
      setStatus({ text: res.error, bad: true })
      return
    }
    // Keep local prefs: theme and units are per-device, not per-log.
    replaceAll({ ...res.value, prefs: state.prefs })
    stamp()
    setStatus({ text: `Pulled ${res.value.sets.length} sets.` })
  }

  const ready = config.url.trim().length > 0

  return (
    <Section label="Sync">
      <div className="flex flex-col gap-2">
        <Field
          label="URL"
          value={config.url}
          onChange={(url) => patch({ url })}
          placeholder="https://example.com/gains.json"
          type="url"
        />
        <Field
          label="Token"
          value={config.token}
          onChange={(token) => patch({ token })}
          placeholder="Sent as Authorization: Bearer …"
          type="password"
        />
      </div>

      <div className="mt-2.5 flex gap-2">
        <Button onClick={doSave} disabled={!ready || busy !== null}>
          {busy === "save" ? "Pushing…" : "Push to remote"}
        </Button>
        <Button onClick={doLoad} disabled={!ready || busy !== null}>
          {busy === "load" ? "Pulling…" : "Pull from remote"}
        </Button>
      </div>

      {status && <Status bad={status.bad}>{status.text}</Status>}

      {config.lastSyncedAt && !status && (
        <Status>Last synced {new Date(config.lastSyncedAt).toLocaleString()}.</Status>
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
