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
import type { FoodEntry, GainsState, Prefs, Reading, SetEntry, Tracker } from "@/lib/types"

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
  /**
   * Adds foods.
   *
   * Plural because a photo of a plate can resolve to several items at once, and that path should
   * be one call rather than a loop that stamps each one a millisecond apart.
   */
  addFoods: (foods: Omit<FoodEntry, "id" | "loggedAt">[]) => void
  updateFood: (id: string, patch: Partial<Omit<FoodEntry, "id">>) => void
  deleteFood: (id: string) => void
  restoreFood: (food: FoodEntry) => void
  duplicateFood: (id: string) => void
  addReading: (reading: Omit<Reading, "id" | "loggedAt">) => void
  updateReading: (id: string, patch: Partial<Omit<Reading, "id">>) => void
  duplicateReading: (id: string) => void
  deleteReading: (id: string) => void
  restoreReading: (reading: Reading) => void
  /** Writes a full tracker under its id, shadowing a builtin or replacing a custom one. */
  saveTracker: (tracker: Tracker) => void
  /** Drops a custom tracker. Its readings go with it — a reading with no tracker is unreadable. */
  removeTracker: (id: string) => void
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

  const addFoods = useCallback((foods: Omit<FoodEntry, "id" | "loggedAt">[]) => {
    if (foods.length === 0) return
    setState((s) => ({
      ...s,
      foods: [
        ...s.foods,
        ...foods.map((f) => ({ ...f, id: newId(), loggedAt: instantOn(f.date) })),
      ],
    }))
  }, [])

  const updateFood = useCallback((id: string, patch: Partial<Omit<FoodEntry, "id">>) => {
    setState((s) => ({
      ...s,
      foods: s.foods.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }))
  }, [])

  const deleteFood = useCallback((id: string) => {
    setState((s) => ({ ...s, foods: s.foods.filter((x) => x.id !== id) }))
  }, [])

  const restoreFood = useCallback((food: FoodEntry) => {
    setState((s) =>
      s.foods.some((x) => x.id === food.id) ? s : { ...s, foods: [...s.foods, food] },
    )
  }, [])

  const duplicateFood = useCallback((id: string) => {
    setState((s) => {
      const src = s.foods.find((x) => x.id === id)
      if (!src) return s
      return {
        ...s,
        foods: [...s.foods, { ...src, id: newId(), loggedAt: instantOn(src.date) }],
      }
    })
  }, [])

  const addReading = useCallback((reading: Omit<Reading, "id" | "loggedAt">) => {
    setState((s) => ({
      ...s,
      readings: [...s.readings, { ...reading, id: newId(), loggedAt: instantOn(reading.date) }],
    }))
  }, [])

  const updateReading = useCallback((id: string, patch: Partial<Omit<Reading, "id">>) => {
    setState((s) => ({
      ...s,
      readings: s.readings.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }))
  }, [])

  const duplicateReading = useCallback((id: string) => {
    setState((s) => {
      const src = s.readings.find((x) => x.id === id)
      if (!src) return s
      return {
        ...s,
        readings: [...s.readings, { ...src, id: newId(), loggedAt: instantOn(src.date) }],
      }
    })
  }, [])

  const deleteReading = useCallback((id: string) => {
    setState((s) => ({ ...s, readings: s.readings.filter((x) => x.id !== id) }))
  }, [])

  const restoreReading = useCallback((reading: Reading) => {
    setState((s) =>
      s.readings.some((x) => x.id === reading.id)
        ? s
        : { ...s, readings: [...s.readings, reading] },
    )
  }, [])

  const saveTracker = useCallback((tracker: Tracker) => {
    setState((s) => {
      const has = s.trackers.some((t) => t.id === tracker.id)
      return {
        ...s,
        trackers: has
          ? s.trackers.map((t) => (t.id === tracker.id ? tracker : t))
          : [...s.trackers, tracker],
      }
    })
  }, [])

  const removeTracker = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      trackers: s.trackers.filter((t) => t.id !== id),
      readings: s.readings.filter((r) => r.trackerId !== id),
    }))
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
      addFoods,
      updateFood,
      deleteFood,
      restoreFood,
      duplicateFood,
      addReading,
      updateReading,
      duplicateReading,
      deleteReading,
      restoreReading,
      saveTracker,
      removeTracker,
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
      addFoods,
      updateFood,
      deleteFood,
      restoreFood,
      duplicateFood,
      addReading,
      updateReading,
      duplicateReading,
      deleteReading,
      restoreReading,
      saveTracker,
      removeTracker,
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
