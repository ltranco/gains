"use client"

import Link from "next/link"
import { useRef, useState } from "react"

import { ChevronLeft } from "@/components/icons"
import { todayKey } from "@/lib/date"
import { parseState } from "@/lib/store"
import type { ThemeChoice, UnitSystem } from "@/lib/types"
import { useStore } from "@/providers/StoreProvider"

export default function Settings() {
  const { state, hydrated, setPrefs, replaceAll } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

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
    const text = await file.text()
    const next = parseState(text)
    if (next.sets.length === 0) {
      setStatus("That file has no sets in it — nothing imported.")
      return
    }
    // Replaces rather than merges. Merging needs a rule for two edits to the same set, and
    // guessing one silently is worse than making you choose which copy wins.
    replaceAll({ ...next, prefs: state.prefs })
    setStatus(`Imported ${next.sets.length} sets.`)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col border-x">
      <header
        className="sticky top-0 z-20 flex items-center gap-1 border-b px-2 py-2"
        style={{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top)" }}
      >
        <Link
          href="/"
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-muted)" }}
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-[15px] font-semibold">Settings</h1>
      </header>

      <div className="flex flex-col">
        <Section
          label="Theme"
          note="System follows whatever your phone or laptop is set to."
        >
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

        <Section
          label="Units"
          note="Stored in kilograms and metres either way — this only changes what's on screen."
        >
          <Segmented<UnitSystem>
            value={hydrated ? state.prefs.units : "metric"}
            options={[
              ["metric", "Metric"],
              ["imperial", "Imperial"],
            ]}
            onChange={(units) => setPrefs({ units })}
          />
        </Section>

        <Section
          label="Data"
          note={`${state.sets.length} ${state.sets.length === 1 ? "set" : "sets"} logged, held in this browser.`}
        >
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
          {status && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
              {status}
            </p>
          )}
        </Section>

        <div className="px-4 py-5">
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
            Everything lives in this browser&apos;s local storage. Safari clears
            script-writable storage after seven days without a visit, so export now and then
            — or add this to your home screen, which takes it out of that bucket. Syncing to a
            URL of your own is next.
          </p>
        </div>
      </div>
    </main>
  )
}

function Section({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b px-4 py-4">
      <h2 className="text-[14px] font-semibold">{label}</h2>
      {note && (
        <p className="mt-0.5 mb-2.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
          {note}
        </p>
      )}
      {children}
    </section>
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

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-hover)]"
      style={{ borderColor: "var(--border-strong)" }}
    >
      {children}
    </button>
  )
}
