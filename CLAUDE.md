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
   belt off yourself, so they're loaded movements. Push Up genuinely is `reps` — nobody logs
   a weighted push up, and the extra field would be noise on every entry.

   **`weightKg` is the real load that moved, always.** A pull up records bodyweight (plus a
   belt if worn), entered by hand — there is no "BW" sentinel and no zero default. An earlier
   version stored 0 and rendered `BW`; that made every bodyweight set contribute nothing to
   derived volume, which is wrong exactly where it matters. Blank weight is an error, never a
   silent 0.

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

## Storage — bring your own

gains is a **client**. It logs, it draws, it pushes; the data lives wherever you point it.
Local state is a cache, not the truth. Any backend honouring the contract works —
`metrics.ltran.co` is one instance. The contract is written down in `CONTRACT.md`.

Two capabilities, the second optional to the backend:

```
push  POST <url>       Authorization: Bearer <token>
      { "barbell_squat_volume": { "2026-07-31T09:14:03.000-07:00": 500 }, ... }

pull  GET  <readUrl>?match[]=...   Authorization: Bearer <token>
      -> VictoriaMetrics export JSON Lines
```

**One sample per set per measure, stamped at the set's own `loggedAt`** — facts, not summaries.
A storage layer can only return what it was sent, and a daily total can't tell you it was
2×100kg×5 rather than 1×200kg×5. This replaced an earlier daily-rollup design that could never
be restored from.

Measures by kind: `weight_reps` → `weight`, `reps`, `volume`; `reps` → `reps`;
`duration` → `seconds`; `distance` → `metres` (+ `seconds` when a time was logged).

**No `_sets` metric.** `count_over_time(x_volume[1d])` already is the set count, and a stored
copy could only disagree with it.

Metric prefix is `slug(displayName(exercise))` — verified collision-free across all 173 catalog
entries, and there's a test that fails if that ever stops being true. **The shim prepends its
measurement name**, so VictoriaMetrics holds `health_barbell_squat_volume`.

Because samples are per-set, the natural Grafana queries are simply correct:

| | |
| --- | --- |
| `sum_over_time(health_barbell_squat_volume[1d])` | daily volume |
| `max_over_time(health_barbell_squat_weight[1d])` | top set, the strength line |
| `count_over_time(health_barbell_squat_volume[1d])` | sets |
| `sum(sum_over_time({__name__=~"health_.+_volume"}[1d]))` | volume across all exercises |

Config lives under **its own** localStorage key, not inside `GainsState` — that document gets
exported, and a bearer token has no business travelling inside it.

### Storage traps

Verified against real VictoriaMetrics on the production flags, the real shim from
`~/dev/metrics/shim`, and the real nginx config. Don't take these on faith; don't undo them.

1. **The store only appends. Edits and deletes do not propagate.** Dedup keeps the *biggest*
   value on a timestamp tie, so re-sending a corrected set can raise a number but never lower
   it, and `delete_series` isn't reachable through nginx. `planPush` therefore refuses to
   re-send a changed set — a half-applied edit, weight rising while reps fall, is worse than a
   stale one — and Settings reports the count instead.

2. **Set timestamps must be unique per exercise.** Two samples of one metric in the same
   millisecond collapse, and the survivor is whichever value is larger. `samplesFor` nudges
   collisions forward a millisecond each. Different exercises at the same instant are left
   alone.

3. **Timestamps must be RFC3339, never epoch millis.** The shim's `toNanos` does
   `int64(float64 * 1e9)`, and at 1.78e18 the mantissa can't hold nanoseconds: a `+1ms` key
   lands at `…000999936ns`, drops into the previous millisecond, and dedup eats it. This
   silently discarded a correction mid-test before RFC3339 fixed it.

4. **A push is not immediately readable.** VictoriaMetrics needs roughly 10–15s to index new
   samples, and back-dated ones take longer. A pull straight after a push will look like data
   went missing. Never treat that as loss.

5. **`note` and `id` do not survive a round trip.** VictoriaMetrics stores numbers only, so
   any textual field is lost and ids are regenerated on pull. This caps what the schema can
   ever hold.

6. **Pull replaces local state wholesale.** There is no merge, because merging needs a rule for
   "both sides changed the same set" and inventing one silently is how a log stops matching
   what happened.

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
