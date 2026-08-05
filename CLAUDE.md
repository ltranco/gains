# CLAUDE.md

Guidance for Claude Code working in this repo. Read this before touching anything.

## What this is

A workout log that also tracks what you ate. Pick an exercise, log sets; log the food, with its
macros; see the day. No stats, no programme builder — the daily view is the product. The only
chart is the macro rings, and they show today, not a trend.

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
| `src/lib/types.ts` | domain types; `SetEntry`, `FoodEntry`, `Reading`, `Tracker`, `Prefs` |
| `src/lib/catalog.ts` | the exercise catalog — movement × equipment, curated by hand |
| `src/lib/food.ts` | the four macros, and what a logged food is |
| `src/lib/trackers.ts` | metrics: slug validation, search, rebuild-from-remote. No catalog — they're all yours |
| `src/lib/store.ts` | localStorage read/write, versioned; remote config under its own key |
| `src/lib/select.ts` | derived views: day grouping, prefill lookup, recents, records, ring progress |
| `src/lib/samples.ts` | the wire format all three kinds of entry go through — `Syncable` |
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

   **An edited `loggedAt` goes through `editedInstant()`, which is in `lib/date.ts` and tested.**
   The rule — nothing in the future, an untouched field is not an instruction — used to be one
   inline expression repeated in all three entry sheets, where `null` meant both "nothing to do"
   and "no, that's in the future". Picking a time later than the clock therefore saved every other
   field and left the time alone without a word. If you add a fourth sheet, call the function.

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

9. **There are three kinds of thing to log, and one pipeline.** A `SetEntry` belongs to an
   exercise and carries up to three measures under one prefix; a `FoodEntry` carries four macros
   under four prefixes; a `Reading` belongs to a `Tracker` and carries one number. All three
   become a `Syncable` in `lib/samples.ts` — an instant, a collision group, and values keyed by
   full metric name — and everything downstream is written once against that. Don't add a second
   copy of the push path; the millisecond nudging, RFC3339 stamping and tombstone rules took too
   long to get right to have two of them.

   `Syncable.group` is what makes food work. Nudging colliding timestamps happens per *group*, not
   per series, so two meals logged in the same millisecond move apart **together** and each keeps
   its four macros on one instant. Nudge the series independently and one meal's protein lands on
   the other's timestamp; both then reassemble wrong, and nothing about the stored data says so.

10. **Macros are not metrics.** Calories, protein, carbs and fat are fields of a `FoodEntry`.
    An earlier version made them four separate trackers you logged independently, which meant
    recording one chicken bowl was four trips through a picker and left nothing in the log that
    remembered it was one bowl. Nobody eats 48 g of protein. It also blocks the thing that comes
    next: a photo of a plate resolves to one item with four figures, which is exactly a
    `FoodEntry` and nothing else has to change. Those four prefixes are reserved names.

11. **gains never writes `health_weight` or `health_step`.** An iOS Shortcut already pushes those
    from HealthKit. Two writers on one series means two lines that disagree, and a delete here
    would tombstone a HealthKit sample. `weight`, `step` and `ingest` are reserved slugs and
    `validateTrackerName` refuses them, alongside the four macro names.

12. **No metric ships with the app.** Waist did for a while, so the list wouldn't be empty on
    first run, and it cost a two-tier system — a shadowing merge rule and a can't-be-removed
    exception — to privilege one circumference over thigh and neck for no defensible reason. Macros
    are in code because they need special handling; a circumference needs none. The list starts
    empty and every row in it is data.

13. **A metric's slug and unit are frozen at creation; its name and target are not.** The slug is
    the metric prefix and the unit is the suffix, so together they *are* the series name. Renaming
    is free — which is also why a food's name is absent from its fingerprint, so retitling a meal
    costs nothing. Changing a slug or a unit would orphan every sample already stored.

14. **Macro targets live in `Prefs`, not in the log.** They're a preference: nothing is recorded
    when you change one, and no target means that ring simply isn't drawn. An arc is a fraction of
    something.

15. **The day view has one row grammar, used three times.** Exercise sets, food and metrics are
    each a section with a heading and rows of *time, name, value, duplicate, delete*, and the row
    itself opens the editor. Three kinds of thing are logged here and there is exactly one way to
    read a row back — don't invent a fourth layout for the next one.

16. **A record is a record at the moment it was logged**, for both sets and metrics, so old ones
    stay badged and the day reads as a history of when you moved the needle. A metric's direction
    is `better: "higher" | "lower"`, and *absent* is a real answer: a creatine dose is not a
    personal best, and a PR badge on every entry is noise.

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

**One sample per entry per measure, stamped at its own `loggedAt`** — facts, not summaries.
A storage layer can only return what it was sent, and a daily total can't tell you it was
2×100kg×5 rather than 1×200kg×5. This replaced an earlier daily-rollup design that could never
be restored from. The same reasoning covers food: four meals are four samples, not one total.

Measures by kind: `weight_reps` → `weight`, `reps`, `volume`; `reps` → `reps`;
`duration` → `seconds`; `distance` → `metres` (+ `seconds` when a time was logged).

A food contributes one sample per macro, all at its own instant — `health_calories_kcal`,
`health_protein_g`, `health_carbs_g`, `health_fat_g`. Four series rather than one, because that's
what a dashboard wants to sum; one timestamp, because that's what lets a reader join them back into
a single meal.

A metric contributes one sample under its own unit: `kcal`, `g`, `mg`, `ml`, `cm`, `count`, `pct`.
So `health_waist_cm`, `health_creatine_g`.

**The naming scheme is unambiguous by construction.** Metric names split at their *last*
underscore, so `bench_press_g` can only ever be prefix `bench_press` plus suffix `g`. Because the
tracker units are disjoint from the exercise measures, the suffix alone says which kind of entry
it is — and two things can only collide by sharing a prefix outright, which
`validateTrackerName` refuses. `_deleted` is the sharp edge: it names no measure, so an exercise
and a metric sharing a prefix would void each other's samples.

**Deleting writes one tombstone per series the entry wrote**, so a removed food voids all four of
its macros. Four samples where a single `food_deleted` marker would cost one — and worth it, because
every reader already replays exactly one rule: drop whatever sits at `prefix@timestamp`.

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

1. **The store only appends, so an edit is a retraction plus a rewrite.** Dedup keeps the
   *biggest* value on a timestamp tie, so re-sending a correction in place can raise a number but
   never lower it, and `delete_series` isn't reachable through nginx. An edited entry therefore
   gets a tombstone at its old timestamp and its new values written **at least a millisecond
   later** — same instant and the retraction swallows the correction too.

   **The fingerprint recorded in `pushed` must be the local entry's, never the rewritten copy's.**
   `fp` is computed once when a `Syncable` is built and carried across the rewrite for exactly
   this reason. Recomputing it from the shifted `loggedAt` made every edited set look edited
   forever: each push re-tombstoned it, wrote another copy a millisecond further along, and
   Settings sat on a permanent "1 edited to sync". `remote.test.ts` holds the line.

2. **Timestamps must be unique per series prefix.** Two samples of one metric in the same
   millisecond collapse, and the survivor is whichever value is larger. `buildSamples` nudges
   collisions forward a millisecond each. Different prefixes at the same instant are left
   alone — which is what lets a meal be calories plus three macros on one shared instant.

3. **Timestamps must be RFC3339, never epoch millis.** The shim's `toNanos` does
   `int64(float64 * 1e9)`, and at 1.78e18 the mantissa can't hold nanoseconds: a `+1ms` key
   lands at `…000999936ns`, drops into the previous millisecond, and dedup eats it. This
   silently discarded a correction mid-test before RFC3339 fixed it.

4. **A push is not immediately readable.** VictoriaMetrics needs roughly 10–15s to index new
   samples, and back-dated ones take longer. A pull straight after a push will look like data
   went missing. Never treat that as loss.

5. **`note` and `id` do not survive a round trip.** VictoriaMetrics stores numbers only, so
   any textual field is lost and ids are regenerated on pull. This caps what the schema can
   ever hold — and it's why a custom tracker's *name* can't come back either. A pull rebuilds an
   unknown prefix into a tracker with the slug title-cased and `mode: "sum"` guessed, marked
   `recovered` so Settings can say the type is a guess rather than pretend it knows.

6. **Pull replaces local state wholesale.** There is no merge, because merging needs a rule for
   "both sides changed the same entry" and inventing one silently is how a log stops matching
   what happened. Trackers are the exception: those are definitions rather than history, so a
   rebuilt one is appended and a local one always wins — it knows its mode and target.

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

5. **Don't test the wire format against `metrics.ltran.co`.** It's append-only and its delete API
   isn't exposed, so a junk sample is there for a hundred years. Stand up the real stack locally
   instead — the metrics repo's `## Local development` section is four commands, and it runs the
   same Go shim and the same `-dedup.minScrapeInterval=1ms` that make the traps above real. That
   is where the sync layer was actually verified.

6. **The over-target ring took three goes, and only a screenshot could judge any of them.** A
   translucent arc over an opaque arc of the same hue is invisible — it's just that hue. Dimming
   the lap underneath made it visible but said the wrong thing: at 1.2× the only bright arc left
   was the 20% overflow, so a day well past its target read as barely started. What works is a
   full-strength completed lap with the overflow tinted towards white. If you touch the rings, look
   at a screenshot at 1.3×.

## Tests

```bash
yarn test          # vitest, TZ pinned to America/Los_Angeles
yarn test:watch
```

157 assertions in `src/lib/*.test.ts`, and they are not decorative: **every one covers a bug
that actually shipped during this project.** Before adding a behaviour, check whether a test
would have caught the last thing that broke in that file.

| File | Guards against |
| --- | --- |
| `date.test.ts` | UTC day drift, `loggedAt` ignoring the selected day, DST either side, 24-hour stamps, a future time being silently ignored |
| `units.test.ts` | imperial display corrupting stored kg or cm, comma grouping breaking re-parse, a blank field parsing as zero |
| `catalog.test.ts` | duplicate metric prefixes, kind misclassification, fuzzy ranking |
| `trackers.test.ts` | one metric name producible two ways, HealthKit's or a macro's slug being claimed, a rename moving a slug, rebuild-from-remote |
| `food.test.ts` | a row summary that bleeds, sum-vs-day totals, a ring drawn with no target |
| `samples.test.ts` | wrong measures per kind, colliding timestamps tearing a meal in half, `health_weight` being mistaken for ours, round trip through export for all three kinds |
| `store.test.ts` | a field saved but not parsed back (this is what silently emptied "Read from"), a v1 document losing its sets, an old single-prefix push record being dropped |
| `select.test.ts` | personal records for sets and for metrics, direction, day grouping, a reading whose metric is gone |
| `remote.test.ts` | an edited entry looking edited forever, a tombstone landing on the wrong timestamp or missing three of a food's four series, a renamed food costing a retraction, a pull overwriting a local metric definition |

**The TZ is pinned** in the npm script. Several date tests are meaningless at UTC, and CI
would otherwise disagree with your laptop.

CI runs typecheck, tests and build on every push to `main` and every PR. Vercel builds
independently, so a red CI does not block a deploy; treat it as the signal, not a gate.

## Local development

```bash
yarn dev -p 3010     # 3000 is usually taken on this host
yarn typecheck
yarn test
yarn build
```

Preview on the user's phone over Tailscale (HTTPS is not enabled on the tailnet, and plain
HTTP is fine there since the tailnet is WireGuard-encrypted):

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --http=8788 3010
# → http://longs-macbook-air.tail2ad1ae.ts.net:8788
```

That mapping persists across restarts; only `yarn dev` needs restarting.
