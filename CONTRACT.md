# The storage contract

gains is a client. It logs workouts and what you ate, draws them, and pushes them somewhere — but
it does not own storage. Local state is a cache; the backend you configure is the truth.

This document is what a backend has to do to be that truth. `metrics.ltran.co` is one
implementation, not the definition.

## Configuration

Three fields, in Settings:

| Field | Meaning |
| --- | --- |
| **Push to** | where samples are written. Required. |
| **Read from** | where they're read back. Optional — without it, Pull is unavailable. |
| **Token** | one bearer token, sent on both. |

What gets logged is configured nearby: exercises come from a fixed catalog, macro targets are a
preference, and the metrics logged as a single number — a waist measurement, a supplement dose —
live on their own page, with your own added there.

Both requests are proxied through gains' own `/api/remote` route, so **your endpoint does not
need to serve CORS headers**. That's the only reason the proxy exists; the token is in
`localStorage` and is not a secret from the device holder.

## Push

```http
POST <push-url>
Authorization: Bearer <token>
Content-Type: application/json

{
  "barbell_squat_weight": { "2026-07-31T09:14:03.000-07:00": 100 },
  "barbell_squat_reps":   { "2026-07-31T09:14:03.000-07:00": 5   },
  "barbell_squat_volume": { "2026-07-31T09:14:03.000-07:00": 500 },
  "calories_kcal":        { "2026-07-31T08:12:00.000-07:00": 620 },
  "protein_g":            { "2026-07-31T08:12:00.000-07:00": 48  },
  "waist_cm":             { "2026-07-31T09:00:00.000-07:00": 81.5 }
}
```

A JSON object of `metric name → { timestamp → number }`. Nothing else.

- **One sample per entry per measure**, stamped at the moment it was logged. Not a daily
  aggregate — a backend can only return what it was sent, and a day's total cannot be resolved
  back into the individual sets or meals that made it.
- Metric name is `<thing>_<suffix>`, where `<thing>` is a display name lowercased with
  non-alphanumerics collapsed to `_` (`Barbell Squat` → `barbell_squat`).
- Three kinds of entry:
  - a **set** contributes `weight` (kg), `reps`, `volume` (kg, = weight × reps), `seconds`,
    `metres` — several suffixes under one prefix. Which apply depends on the exercise: a plank
    sends only `seconds`, a push up only `reps`.
  - a **food** contributes its four macros, one under each of four reserved prefixes:
    `calories_kcal`, `protein_g`, `carbs_g`, `fat_g`. All four share the food's own instant, and
    that shared timestamp is the only thing that says they were one meal.
  - a **metric** — a body measurement, a supplement dose — contributes exactly one sample under
    its own unit: `kcal`, `g`, `mg`, `ml`, `cm`, `count`, `pct`.
- Names are split at their **last** underscore, and the suffix sets are disjoint, so every name has
  exactly one reading. `bench_press_g` can only be prefix `bench_press`, suffix `g`.
- Timestamps are **RFC3339 with milliseconds and a real local offset**. Epoch numbers are not
  used, deliberately — see trap 3 below.
- Everything is SI. Kilograms, seconds, metres, centimetres. Never imperial.
- Several samples sharing one timestamp across different metrics is meaningful, not incidental —
  it is what makes a meal one meal. A backend must not coalesce or re-stamp them.
- Requests are batched at 150 entries each to stay under a 1MB body limit.

gains never writes `weight` or `step` (or, with the reference backend's prefix, `health_weight`
and `health_step`). Those are HealthKit's, pushed by an iOS Shortcut, and a backend may hold them
alongside these without gains touching or misreading them. `calories`, `protein`, `carbs` and `fat`
are the other way round: they belong to food, and no user-defined metric may claim one.

A response body of `{"written": N}` is surfaced in the UI if present. Any 2xx is treated as
success.

## Pull

```http
GET <read-url>?match[]={__name__=~"health_.+_(weight|reps|volume|seconds|metres|kcal|g|mg|ml|cm|count|pct|deleted)"}
              &start=2000-01-01T00:00:00Z&end=<tomorrow>
Authorization: Bearer <token>
```

Expected response is **VictoriaMetrics export format**: JSON Lines, one object per series.

```json
{"metric":{"__name__":"health_barbell_squat_volume"},"values":[500,500,315],"timestamps":[...]}
```

A set is reassembled by joining every measure that shares one timestamp under one exercise prefix;
a food by joining the four macro series at one timestamp. A metric is a single value, so it needs no
join. The `health_` prefix is tolerated but not required — it's what the reference backend's shim
prepends.

Series that don't match the suffixes are ignored, so a backend holding unrelated metrics
alongside these is fine — `health_step` and `health_weight` have no second underscore and never
match. Prefixes naming no known exercise are counted and skipped.

A prefix carrying a *metric* suffix that names nothing known is different: the suffix is proof gains
wrote it, so the definition is rebuilt rather than dropped, with the slug title-cased and its type
guessed. That is the one thing a pull can recover that a number store shouldn't be able
to — and it's why losing local storage isn't losing your custom metrics.

## Deleting, without a delete

A backend needs no delete API, and the reference one deliberately doesn't expose its own. A
removed entry is recorded as an **append**: a `<prefix>_deleted` sample carrying the value `1`,
stamped at the voided entry's own timestamp.

```
health_barbell_squat_deleted  1  @ 09:14:03   <- voids whatever is at 09:14:03
health_calories_deleted       1  @ 08:12:00   <- one per series, so a deleted food
health_protein_deleted        1  @ 08:12:00      writes four of these
health_carbs_deleted          1  @ 08:12:00
health_fat_deleted            1  @ 08:12:00
```

**One tombstone per series the entry wrote.** A food touched four, so all four are retracted;
voiding one and leaving three would leave the store holding a meal with no calories rather than no
meal. It costs four samples where a single marker would cost one, and buys exactly one rule for
every reader to replay.

The timestamp is the identifier, so nothing depends on a value surviving float formatting. Every
reader replays the same rule — fetch the tombstones, drop the samples they point at — which is why
they're in the read selector. The server keeps the whole event log and stays authoritative; no
reader is allowed a private opinion about what was deleted.

**An edit is a retraction plus a rewrite.** A tombstone at the old timestamp, and the new values
written **at least a millisecond later**. Re-sending in place cannot work when the backend keeps
the larger value per field: lowering a weight while raising the reps would leave a set that never
happened. And the rewrite has to clear the tombstone's own timestamp, or the retraction voids the
correction with it.

## What a backend is allowed to be bad at

The reference implementation is append-only, and gains is built to tolerate that:

1. **Nothing need ever be mutable.** gains only ever appends — corrections and deletions both
   arrive as new samples, per the section above.
2. **Reads may lag writes.** Roughly 10–15 seconds for the reference backend, longer for
   back-dated samples. gains does not treat a missing recent entry as loss.
3. **Text need not be stored.** `note` is dropped and `id` is regenerated on pull, because the
   reference backend stores numbers only. A food's **name** goes the same way — a pulled meal is its
   macros and nothing else, and the app labels it "Food". A custom metric's name and type also go,
   and are guessed back from its slug.

## What a backend must not do

- **Must not silently keep the larger of two values at one timestamp** without gains knowing —
  this is exactly what VictoriaMetrics' `-dedup.minScrapeInterval` does, and it's why timestamps
  are made unique per metric prefix before sending.
- **Must not require a second credential.** One bearer token covers both directions.
- **Must not reorder or coalesce a tombstone with the sample it voids.** They are separate series
  at one timestamp, and both have to survive.

## Reference implementation

`~/dev/metrics` — nginx terminating at Cloudflare, a small Go shim translating this JSON to
Influx line protocol, VictoriaMetrics at 100-year retention, Grafana Cloud as the UI.

Push lands on the shim's `/ingest`; pull reads VictoriaMetrics' `/api/v1/export`, which is on
nginx's read allowlist and accepts the same bearer token.
