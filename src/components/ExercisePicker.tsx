"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  byId,
  displayName,
  movementGroupsIn,
  search,
  variantLabel,
  type MovementGroup,
} from "@/lib/catalog"
import { recentExerciseIds } from "@/lib/select"
import { GROUP_LABEL, GROUP_ORDER, type Exercise } from "@/lib/types"
import { useStore } from "@/providers/StoreProvider"
import { Sheet } from "./Sheet"
import { ChevronDown, Search } from "./icons"

export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (ex: Exercise) => void
}) {
  const { state } = useStore()
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset per opening: a stale query from last time is never what you want next.
  useEffect(() => {
    if (!open) return
    setQuery("")
    setExpanded(new Set())
    // Focus without the keyboard slamming up before the sheet has finished animating.
    const t = setTimeout(() => inputRef.current?.focus(), 240)
    return () => clearTimeout(t)
  }, [open])

  const results = useMemo(() => search(query), [query])

  const recents = useMemo(() => {
    if (query) return []
    return recentExerciseIds(state.sets, 6)
      .map((id) => byId(id))
      .filter((e): e is Exercise => Boolean(e))
  }, [state.sets, query])

  const toggle = (slug: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <div
        className="sticky top-0 z-10 border-b px-3 py-2.5"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div className="relative">
          <span
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
            style={{ color: "var(--text-faint)" }}
          >
            <Search size={15} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            type="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="w-full rounded-lg border py-2 pr-3 pl-8 text-[15px] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
            style={{ background: "var(--bg-subtle)" }}
          />
        </div>
      </div>

      <div className="pb-2">
        {query ? (
          results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-faint)" }}>
              Nothing matches “{query}”.
            </p>
          ) : (
            <ul>
              {results.map((ex) => (
                <ExerciseRow key={ex.id} ex={ex} onPick={onPick} showGroup />
              ))}
            </ul>
          )
        ) : (
          <>
            {recents.length > 0 && (
              <section>
                <SectionLabel>Recent</SectionLabel>
                <ul>
                  {recents.map((ex) => (
                    <ExerciseRow key={ex.id} ex={ex} onPick={onPick} showGroup />
                  ))}
                </ul>
              </section>
            )}

            {GROUP_ORDER.map((group) => (
              <section key={group}>
                <SectionLabel>{GROUP_LABEL[group]}</SectionLabel>
                <ul>
                  {movementGroupsIn(group).map((mg) => (
                    <MovementRow
                      key={mg.slug}
                      mg={mg}
                      expanded={expanded.has(mg.slug)}
                      onToggle={() => toggle(mg.slug)}
                      onPick={onPick}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </Sheet>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="px-4 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase"
      style={{ color: "var(--text-faint)" }}
    >
      {children}
    </h3>
  )
}

/**
 * A movement with one implement is a single tap. With several it collapses into one row that
 * expands — which is the whole point of splitting the catalog into movement × equipment.
 * Eleven curls as eleven sibling rows is a list you scroll past, not one you read.
 */
function MovementRow({
  mg,
  expanded,
  onToggle,
  onPick,
}: {
  mg: MovementGroup
  expanded: boolean
  onToggle: () => void
  onPick: (ex: Exercise) => void
}) {
  const only = mg.variants.length === 1 ? mg.variants[0] : undefined

  if (only) {
    return <ExerciseRow ex={only} onPick={onPick} label={displayName(only)} />
  }

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]">{mg.movement}</span>
          {!expanded && (
            <span
              className="mt-0.5 block truncate text-[12px]"
              style={{ color: "var(--text-faint)" }}
            >
              {mg.variants.map(variantLabel).join(" · ")}
            </span>
          )}
        </span>
        <span
          className="shrink-0 transition-transform"
          style={{
            color: "var(--text-faint)",
            transform: expanded ? "rotate(180deg)" : undefined,
          }}
        >
          <ChevronDown size={16} />
        </span>
      </button>

      {expanded && (
        <ul className="border-l pb-1 ml-4" style={{ borderColor: "var(--border)" }}>
          {mg.variants.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => onPick(ex)}
                className="w-full px-4 py-2 text-left text-[14px] transition-colors hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]"
              >
                {variantLabel(ex)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ExerciseRow({
  ex,
  onPick,
  label,
  showGroup = false,
}: {
  ex: Exercise
  onPick: (ex: Exercise) => void
  label?: string
  showGroup?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(ex)}
        className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]"
      >
        <span className="min-w-0 flex-1 truncate text-[15px]">
          {label ?? displayName(ex)}
        </span>
        {showGroup && (
          <span className="shrink-0 text-[12px]" style={{ color: "var(--text-faint)" }}>
            {GROUP_LABEL[ex.group]}
          </span>
        )}
      </button>
    </li>
  )
}
