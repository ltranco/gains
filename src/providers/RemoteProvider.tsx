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

import { planPush, pushLog } from "@/lib/remote"
import { syncablesOf, type Syncable } from "@/lib/samples"
import { EMPTY_REMOTE, readRemote, writeRemote } from "@/lib/store"
import type { RemoteConfig } from "@/lib/types"
import { useStore } from "./StoreProvider"

/**
 * Owns the storage configuration and the auto-push timer.
 *
 * A provider rather than local state in Settings, for two reasons: auto-push has to keep
 * running while you're on the log screen, which is where you actually are; and the timer and
 * the Settings form both mutate the same document, so a second copy of it would go stale the
 * moment one of them wrote.
 */

const AUTO_PUSH_INTERVAL_MS = 60_000

interface RemoteApi {
  config: RemoteConfig
  /** Updates state and persists in one step — they must never diverge. */
  setConfig: (next: RemoteConfig) => void
  /** True while an automatic push is in flight. */
  autoBusy: boolean
  /** Last automatic push failure, cleared by the next success. */
  autoError: string | null
}

const RemoteContext = createContext<RemoteApi | null>(null)

export function RemoteProvider({ children }: { children: React.ReactNode }) {
  const { state, hydrated, trackers } = useStore()
  const [config, setConfigState] = useState<RemoteConfig>(EMPTY_REMOTE)
  const [autoBusy, setAutoBusy] = useState(false)
  const [autoError, setAutoError] = useState<string | null>(null)

  useEffect(() => setConfigState(readRemote()), [])

  const setConfig = useCallback((next: RemoteConfig) => {
    setConfigState(next)
    writeRemote(next)
  }, [])

  // The timer reads these through refs so it can be set up once, rather than being torn down
  // and restarted on every keystroke in the token field or every set you log.
  const configRef = useRef(config)
  configRef.current = config
  const itemsRef = useRef<Syncable[]>([])
  itemsRef.current = useMemo(
    () => syncablesOf(state.sets, state.foods, state.readings, trackers),
    [state.sets, state.foods, state.readings, trackers],
  )
  const inFlight = useRef(false)

  useEffect(() => {
    if (!hydrated) return

    const tick = async () => {
      const current = configRef.current
      if (!current.autoPush || !current.url.trim()) return
      // Overlapping pushes would double-send: the second builds its plan before the first has
      // recorded what it sent.
      if (inFlight.current) return
      if (planPush(current, itemsRef.current).fresh.length === 0) return

      inFlight.current = true
      setAutoBusy(true)
      const res = await pushLog(current, itemsRef.current)
      inFlight.current = false
      setAutoBusy(false)

      if (res.ok) {
        setAutoError(null)
        setConfig(res.value.config)
      } else {
        setAutoError(res.error)
      }
    }

    const id = setInterval(() => void tick(), AUTO_PUSH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [hydrated, setConfig])

  return (
    <RemoteContext.Provider value={{ config, setConfig, autoBusy, autoError }}>
      {children}
    </RemoteContext.Provider>
  )
}

export function useRemote(): RemoteApi {
  const ctx = useContext(RemoteContext)
  if (!ctx) throw new Error("useRemote must be used inside RemoteProvider")
  return ctx
}
