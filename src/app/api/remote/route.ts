import type { NextRequest } from "next/server"

/**
 * Proxy for the user-configured remote store. The browser talks to this route; this route
 * talks to whatever URL you set in Settings.
 *
 * The point is not secrecy — the token lives in localStorage and anyone holding the device
 * can read it. It's that an arbitrary endpoint of your own shouldn't have to serve CORS
 * headers to be usable here. Going through the origin removes preflight from the picture
 * entirely, so a plain nginx location block or a one-file Go handler works as-is.
 */

interface Body {
  url?: unknown
  token?: unknown
  payload?: unknown
}

function targetFrom(body: Body): { url: string; token: string } | { error: string } {
  const url = typeof body.url === "string" ? body.url.trim() : ""
  const token = typeof body.token === "string" ? body.token : ""
  if (!url) return { error: "No remote URL configured." }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { error: "That doesn't parse as a URL." }
  }
  // Refuse to be a general-purpose fetcher. http/https only.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Remote URL must be http or https." }
  }
  return { url: parsed.toString(), token }
}

function headersFor(token: string): HeadersInit {
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

/** Pull the stored document down. */
export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 })
  }

  const target = targetFrom(body)
  if ("error" in target) return Response.json({ error: target.error }, { status: 400 })

  const writing = body.payload !== undefined

  try {
    const upstream = await fetch(target.url, {
      method: writing ? "PUT" : "GET",
      headers: headersFor(target.token),
      ...(writing ? { body: JSON.stringify(body.payload) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      return Response.json(
        { error: `Remote replied ${upstream.status}. ${text.slice(0, 200)}`.trim() },
        { status: 502 },
      )
    }
    if (writing) return Response.json({ ok: true })

    try {
      return Response.json({ ok: true, document: JSON.parse(text) })
    } catch {
      return Response.json({ error: "Remote didn't return JSON." }, { status: 502 })
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error"
    return Response.json({ error: `Couldn't reach the remote: ${reason}` }, { status: 502 })
  }
}
