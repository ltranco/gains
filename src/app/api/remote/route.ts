import type { NextRequest } from "next/server"

/**
 * Proxy to the user-configured metrics endpoint. The browser talks to this route; this route
 * talks to whatever URL is set in Settings, forwarding the shim's ingest contract verbatim:
 *
 *   POST <url>   Authorization: Bearer <token>
 *   { "<metric>": { "<timestamp>": <number> } }
 *
 * The point is not secrecy — the token lives in localStorage and anyone holding the device can
 * read it. It's that an arbitrary endpoint of your own shouldn't have to serve CORS headers to
 * be usable here. Going through our origin removes preflight from the picture, so a plain
 * nginx location block or a small Go handler works as-is.
 */

interface Body {
  url?: unknown
  token?: unknown
  payload?: unknown
}

function target(body: Body): { url: string; token: string } | { error: string } {
  const raw = typeof body.url === "string" ? body.url.trim() : ""
  const token = typeof body.token === "string" ? body.token : ""
  if (!raw) return { error: "No endpoint configured." }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { error: "That doesn't parse as a URL." }
  }
  // Refuse to be a general-purpose fetcher.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Endpoint must be http or https." }
  }
  return { url: parsed.toString(), token }
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 })
  }

  const to = target(body)
  if ("error" in to) return Response.json({ error: to.error }, { status: 400 })

  if (typeof body.payload !== "object" || body.payload === null) {
    return Response.json({ error: "Nothing to push." }, { status: 400 })
  }

  try {
    const upstream = await fetch(to.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(to.token ? { authorization: `Bearer ${to.token}` } : {}),
      },
      body: JSON.stringify(body.payload),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      return Response.json(
        { error: `Endpoint replied ${upstream.status}. ${text.slice(0, 200)}`.trim() },
        { status: 502 },
      )
    }

    // The shim answers {"written":N}. Pass it through when present — it's the only
    // confirmation that samples actually landed rather than being silently skipped.
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
