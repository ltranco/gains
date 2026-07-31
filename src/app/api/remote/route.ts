import type { NextRequest } from "next/server"

/**
 * Proxy to the user-configured storage layer. The browser talks to this route; this route
 * talks to whatever URL is set in Settings, forwarding one bearer token either way:
 *
 *   push — POST <url>            body = { "<metric>": { "<timestamp>": <number> } }
 *   pull — GET  <url>?match[]=…   returns VictoriaMetrics export JSON Lines
 *
 * The point is not secrecy — the token lives in localStorage and anyone holding the device can
 * read it. It's that an arbitrary endpoint of your own shouldn't have to serve CORS headers to
 * be usable here. Going through our own origin removes preflight from the picture, so a plain
 * nginx location block works as-is.
 */

interface Body {
  url?: unknown
  token?: unknown
  payload?: unknown
  read?: unknown
}

function target(raw: unknown): { url: URL } | { error: string } {
  const value = typeof raw === "string" ? raw.trim() : ""
  if (!value) return { error: "No endpoint configured." }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { error: "That doesn't parse as a URL." }
  }
  // Refuse to be a general-purpose fetcher.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "Endpoint must be http or https." }
  }
  return { url }
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 })
  }

  const to = target(body.url)
  if ("error" in to) return Response.json({ error: to.error }, { status: 400 })

  const token = typeof body.token === "string" ? body.token : ""
  const auth: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
  const reading = typeof body.read === "object" && body.read !== null

  if (!reading && (typeof body.payload !== "object" || body.payload === null)) {
    return Response.json({ error: "Nothing to send." }, { status: 400 })
  }

  try {
    if (reading) {
      const url = to.url
      for (const [k, v] of Object.entries(body.read as Record<string, unknown>)) {
        if (typeof v === "string") url.searchParams.append(k, v)
      }
      const upstream = await fetch(url, {
        headers: auth,
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      })
      const text = await upstream.text()
      if (!upstream.ok) {
        return Response.json(
          { error: `Endpoint replied ${upstream.status}. ${text.slice(0, 200)}`.trim() },
          { status: 502 },
        )
      }
      // Returned as an opaque string: export is JSON Lines, not a JSON document, so it
      // can't be re-serialised without losing the line framing.
      return Response.json({ ok: true, body: text })
    }

    const upstream = await fetch(to.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify(body.payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
    const text = await upstream.text()
    if (!upstream.ok) {
      return Response.json(
        { error: `Endpoint replied ${upstream.status}. ${text.slice(0, 200)}`.trim() },
        { status: 502 },
      )
    }
    // The shim answers {"written":N} — the only confirmation samples actually landed.
    try {
      const parsed = JSON.parse(text) as { written?: number }
      return Response.json({ ok: true, written: parsed.written })
    } catch {
      return Response.json({ ok: true })
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error"
    return Response.json({ error: `Couldn't reach the endpoint: ${reason}` }, { status: 502 })
  }
}
