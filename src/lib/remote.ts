import { parseState } from "./store"
import type { GainsState, RemoteConfig } from "./types"

/**
 * Client side of the configurable remote. Both directions go through `/api/remote` so the
 * endpoint you point this at doesn't need CORS headers.
 *
 * Load replaces local state outright and save overwrites the remote outright — last write
 * wins, no merge. Merging needs a rule for "both sides edited the same set", and inventing
 * one silently is how a log quietly stops matching what you did.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

async function call(
  config: RemoteConfig,
  payload?: GainsState,
): Promise<Result<unknown>> {
  try {
    const res = await fetch("/api/remote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: config.url,
        token: config.token,
        ...(payload !== undefined ? { payload } : {}),
      }),
    })
    const data = (await res.json()) as { error?: string; document?: unknown }
    if (!res.ok) return { ok: false, error: data.error ?? `Request failed (${res.status}).` }
    return { ok: true, value: data.document }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." }
  }
}

export async function loadRemote(config: RemoteConfig): Promise<Result<GainsState>> {
  const res = await call(config)
  if (!res.ok) return res
  // Reuse the same tolerant parser as localStorage: a remote document gets no more trust
  // than a local one.
  const state = parseState(JSON.stringify(res.value ?? {}))
  return { ok: true, value: state }
}

export async function saveRemote(
  config: RemoteConfig,
  state: GainsState,
): Promise<Result<null>> {
  const res = await call(config, state)
  if (!res.ok) return res
  return { ok: true, value: null }
}
