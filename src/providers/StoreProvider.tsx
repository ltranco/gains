"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { instantOn } from "@/lib/date"
import { EMPTY_STATE, newId, readState, STORAGE_KEY, parseState, writeState } from "@/lib/store"
import type { GainsState, Prefs, SetEntry } from "@/lib/types"

interface StoreApi {
  state: GainsState
  /** False until localStorage has been read on the client. Guards SSR/first-paint mismatch. */
  hydrated: boolean
  addSet: (set: Omit<SetEntry, "id" | "loggedAt">) => void
  updateSet: (id: string, patch: Partial<Omit<SetEntry, "id">>) => void
  deleteSet: (id: string) => void
  /** Puts a deleted set back exactly as it was, id included. Backs the undo toast. */
  restoreSet: (set: SetEntry) => void
  duplicateSet: (id: string) => void
  setPrefs: (patch: Partial<Prefs>) => void
  replaceAll: (state: GainsState) => void
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GainsState>(EMPTY_STATE)
  const [hydrated, setHydrated] = useState(false)

  // Skip the persist effect on the hydrating render, so an empty pre-hydration state can't
  // overwrite real stored data.
  const loaded = useRef(false)

  useEffect(() => {
    setState(readState())
    loaded.current = true
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    writeState(state)
  }, [state])

  // Another tab writing the same key. Cheap to support and stops two open tabs silently
  // diverging until one of them is reloaded.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      setState(parseState(e.newValue))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const addSet = useCallback((set: Omit<SetEntry, "id" | "loggedAt">) => {
    setState((s) => ({
      ...s,
      sets: [...s.sets, { ...set, id: newId(), loggedAt: instantOn(set.date) }],
    }))
  }, [])

  const updateSet = useCallback((id: string, patch: Partial<Omit<SetEntry, "id">>) => {
    setState((s) => ({
      ...s,
      sets: s.sets.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }))
  }, [])

  const deleteSet = useCallback((id: string) => {
    setState((s) => ({ ...s, sets: s.sets.filter((x) => x.id !== id) }))
  }, [])

  const restoreSet = useCallback((set: SetEntry) => {
    setState((s) =>
      s.sets.some((x) => x.id === set.id) ? s : { ...s, sets: [...s.sets, set] },
    )
  }, [])

  const duplicateSet = useCallback((id: string) => {
    setState((s) => {
      const src = s.sets.find((x) => x.id === id)
      if (!src) return s
      return {
        ...s,
        sets: [...s.sets, { ...src, id: newId(), loggedAt: instantOn(src.date) }],
      }
    })
  }, [])

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setState((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }))
  }, [])

  const replaceAll = useCallback((next: GainsState) => setState(next), [])

  const api = useMemo<StoreApi>(
    () => ({
      state,
      hydrated,
      addSet,
      updateSet,
      deleteSet,
      restoreSet,
      duplicateSet,
      setPrefs,
      replaceAll,
    }),
    [
      state,
      hydrated,
      addSet,
      updateSet,
      deleteSet,
      restoreSet,
      duplicateSet,
      setPrefs,
      replaceAll,
    ],
  )

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used inside StoreProvider")
  return ctx
}

export function usePrefs(): Prefs {
  return useStore().state.prefs
}
