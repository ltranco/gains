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

## Metrics push

Settings takes an endpoint and a token. gains derives **per-exercise daily scalars** and posts
them in the metrics shim's ingest format (see `~/dev/metrics`):

```
POST <url>   Authorization: Bearer <token>
{ "barbell_squat_volume": { "2026-07-31T00:00:00.000-07:00": 1000 },
  "barbell_squat_sets":   { "2026-07-31T00:00:00.000-07:00": 2 } }
```

The host is configuration — anything honouring that contract works; `metrics.ltran.co/ingest`
is only the default placeholder. It goes through `/api/remote` so the endpoint needn't serve
CORS headers.

Measures, by exercise kind — `volume` (Σ kg × reps), `sets`, `reps`, `seconds`, `metres`.
Metric prefix is `slug(displayName(exercise))`, verified collision-free across all 173 entries.
**The shim prepends its measurement name**, so what lands in VictoriaMetrics is
`health_barbell_squat_volume`.

**This is a one-way derived feed, not a backup.** Daily totals cannot be turned back into sets.
JSON export is the only route to recovering the log.

Config lives under **its own** localStorage key, not inside `GainsState` — that document gets
exported, and a bearer token has no business travelling inside it.

### Why timestamps carry a millisecond offset

All of this was verified against real VictoriaMetrics with the production flags and the real
shim built from `~/dev/metrics/shim`. Don't take it on faith; don't undo it either.

1. **A re-post at the same timestamp cannot correct a value downward.**
   `-dedup.minScrapeInterval=1ms` keeps the **biggest** value on a tie. Posting 5400 → 4000 →
   9999 leaves exactly one sample: 9999. Delete a set, re-post the smaller total, and the old
   larger number is what the dashboard shows forever — `admin/tsdb/delete_series` isn't
   reachable through nginx, so it needs SSH.

2. **So each revision of a day lands one millisecond later**, and `last_over_time` returns the
   newest. `rollupTimestamp(day, rev)` does this; `rev` is tracked per day in the remote config.

3. **The timestamp must be RFC3339, never epoch millis.** The shim's `toNanos` does
   `int64(float64 * 1e9)`, and at 1.78e18 the mantissa can't hold nanoseconds: key
   `…200001` becomes `…000999936ns`, drops into the *previous* millisecond bucket, and dedup
   discards it as a tie. This silently ate a correction mid-test. `time.ParseInLocation` on an
   RFC3339 string is exact integer arithmetic.

4. **Never query these with `sum_over_time`.** Multiple samples per day means it counts every
   revision — a corrected day summed to 6600 when the true value was 1200. Use
   `last_over_time(metric[1h])`, and `sum(last_over_time({__name__=~"health_.*_volume"}[1h]))`
   to aggregate across exercises. Note that the existing steps-to-goal stat in the metrics repo
   *does* use `sum_over_time`; gains metrics must not inherit that pattern.

5. **Push only days whose fingerprint changed.** Otherwise every push appends a sample to every
   day ever logged, bloating the series and compounding trap 4.

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
