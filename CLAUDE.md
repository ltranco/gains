# CLAUDE.md

Guidance for Claude Code working in this repo. Read this before touching anything.

## What this is

A workout log. Pick an exercise, log sets, see the day. No stats, no charts, no programme
builder — the daily view is the product.

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · **yarn**. Deployed to
Vercel. State lives in the browser; a user-configured URL reads and writes it as JSON.

## Identity — read this first

**Never use the `gh` CLI in this repo.** It is authenticated as `ctxlong` (the user's
work/mem0 account). This is a personal repo under `ltranco`. There are several GitHub
identities on this host and mixing them up is the failure mode to avoid.

Plain `git` over SSH is correct and already pinned locally:

```
user.name       Long Tran
user.email      ltran.co8@gmail.com
core.sshCommand ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes
```

`~/.ssh/id_ed25519` → **ltranco**. `~/.ssh/id_ed25519_mem0` → ctxlong. Verify with
`ssh -T -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 git@github.com` — it must greet `ltranco`.

For repo secrets or anything else needing the GitHub API, ask the user to do it in the web UI.

**yarn, never npm.** Do not generate a `package-lock.json`. `pnpm` is broken on this host's
Node 20.

## Layout

| Path | |
| --- | --- |
| `src/lib/types.ts` | domain types; `Kind`, `Group`, `Equipment`, `SetEntry`, `Prefs` |
| `src/lib/catalog.ts` | the exercise catalog — movement × equipment, curated by hand |
| `src/lib/store.ts` | localStorage read/write, versioned; remote config under its own key |
| `src/lib/select.ts` | derived views: day grouping, prefill lookup, recents |
| `src/lib/units.ts` | SI ↔ display conversion, formatting, parsing |
| `src/lib/date.ts` | local day keys, day labels, clock formatting |
| `src/lib/remote.ts` | load/save against the configured URL, via `/api/remote` |
| `src/app/api/remote/route.ts` | proxy to that URL, so it needn't serve CORS |
| `src/providers/` | store context, theme bootstrap |
| `src/components/` | all UI; no component library, no icon library |

## Rules that are load-bearing

1. **Everything is stored in SI — kilograms, seconds, metres.** Imperial is a display
   transform applied on the way out and undone on the way in. Nothing imperial is ever
   persisted. `src/lib/units.ts` is the only place conversion happens.

2. **The exercise catalog is two axes: movement × equipment.** `Bicep Curl` × six implements
   is six entries with one shared movement, so the picker can collapse them into one
   expandable row. Pairs are enumerated **by hand** — a cross-product yields "Machine
   Deadlift" and "Barbell Push Up".

3. **`Kind` lives on the variant, not the movement.** A bodyweight crunch is `reps`; a cable
   crunch is `weight_reps`. Same movement, different measurement.

4. **Pull Up, Chin Up, Dip and Inverted Row are `weight_reps`, not `reps`.** You can hang a
   belt off yourself, so bodyweight is `weightKg: 0` on the same continuous scale as +20kg.
   The UI renders 0 as `BW` and anything else as `+15 kg`. Push Up genuinely is `reps` —
   nobody logs a weighted push up, and the extra field would be noise on every entry.

5. **Day keys are local, built by hand.** `toDayKey()` never goes through `toISOString()`,
   which converts to UTC first and would file a 9pm Pacific set under tomorrow.

6. **No touch-only affordances.** No long-press, no swipe-to-delete. This is a responsive
   site, so every action is a visible control that works with a finger, a mouse and a
   keyboard. Delete is one tap, made safe by an undo toast rather than a confirm dialog.

7. **Theming is three-way — system / light / dark.** CSS custom properties, with
   `prefers-color-scheme` as the default and a `data-theme` attribute overriding it in both
   directions. `[data-theme="light"]` must win on a dark OS, hence the explicit block. An
   inline script in `<head>` sets the attribute before first paint; without it the page
   renders in the wrong theme and snaps.

8. **Numbers use the mono face** (`.nums` / `.nums-quiet`). They're measurements read against
   each other down a column, so they get tabular figures and a flatter, heavier face than
   Inter's.

## Remote state

Settings takes a URL and a token. `GET` returns the document, `PUT` overwrites it:

```
GET  <url>  →  { version: 1, sets: [...], prefs: {...} }
PUT  <url>  ←  { version: 1, sets: [...], prefs: {...} }
               Authorization: Bearer <token>
```

Both go through `/api/remote`, so the endpoint doesn't need CORS headers.

**Last write wins, no merge.** Merging requires a rule for "both sides edited the same set",
and inventing one silently is how a log stops matching what actually happened.

The remote config is stored under **its own** localStorage key, not inside `GainsState` — that
document gets exported and pushed, and a bearer token has no business travelling inside it.

## Traps

1. **Safari's ITP clears script-writable storage after 7 days without a visit.** A logger
   opened three times a week is *mostly* fine, and "mostly" is doing real work in that
   sentence. Installing to the home screen moves it out of that bucket; JSON export is the
   manual backstop; the remote URL is the actual fix.

2. **The store hydrates in an effect, so first render is empty.** `hydrated` guards it —
   render a skeleton, never an empty state, or the UI asserts "nothing logged" before it has
   looked.

3. **Prefill in the set sheet is a snapshot taken on open**, deliberately not reactive to
   `state.sets`. Recomputing it as you add sets rewrites the fields under the user's fingers.

4. **`next dev` started as a tracked background task gets SIGTERMed at turn end.** Launch it
   with `nohup ... & disown` if it needs to outlive the turn.

## Local development

```bash
yarn dev -p 3010     # 3000 is usually taken on this host
yarn typecheck
yarn build
```

Preview on the user's phone over Tailscale (HTTPS is not enabled on the tailnet, and plain
HTTP is fine there since the tailnet is WireGuard-encrypted):

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --http=8788 3010
# → http://longs-macbook-air.tail2ad1ae.ts.net:8788
```

That mapping persists across restarts; only `yarn dev` needs restarting.
