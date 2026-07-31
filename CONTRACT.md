# The storage contract

gains is a client. It logs workouts, draws them, and pushes them somewhere — but it does not
own storage. Local state is a cache; the backend you configure is the truth.

This document is what a backend has to do to be that truth. `metrics.ltran.co` is one
implementation, not the definition.

## Configuration

Three fields, in Settings:

| Field | Meaning |
| --- | --- |
| **Push to** | where samples are written. Required. |
| **Read from** | where they're read back. Optional — without it, Pull is unavailable. |
| **Token** | one bearer token, sent on both. |

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
  "barbell_squat_volume": { "2026-07-31T09:14:03.000-07:00": 500 }
}
```

A JSON object of `metric name → { timestamp → number }`. Nothing else.

- **One sample per set per measure**, stamped at the moment the set was logged. Not a daily
  aggregate — a backend can only return what it was sent, and a day's total cannot be resolved
  back into individual sets.
- Metric name is `<exercise>_<measure>`, where `<exercise>` is the display name lowercased with
  non-alphanumerics collapsed to `_` (`Barbell Squat` → `barbell_squat`).
- Measures: `weight` (kg), `reps`, `volume` (kg, = weight × reps), `seconds`, `metres`. Which
  apply depends on the exercise: a plank sends only `seconds`, a push up only `reps`.
- Timestamps are **RFC3339 with milliseconds and a real local offset**. Epoch numbers are not
  used, deliberately — see trap 3 below.
- Everything is SI. Kilograms, seconds, metres. Never imperial.
- Requests are batched at 150 sets each to stay under a 1MB body limit.

A response body of `{"written": N}` is surfaced in the UI if present. Any 2xx is treated as
success.

## Pull

```http
GET <read-url>?match[]={__name__=~"health_.+_(weight|reps|volume|seconds|metres)"}
              &start=2000-01-01T00:00:00Z&end=<tomorrow>
Authorization: Bearer <token>
```

Expected response is **VictoriaMetrics export format**: JSON Lines, one object per series.

```json
{"metric":{"__name__":"health_barbell_squat_volume"},"values":[500,500,315],"timestamps":[...]}
```

A set is reassembled by joining every measure that shares one timestamp under one exercise
prefix. The `health_` prefix is tolerated but not required — it's what the reference backend's
shim prepends.

Series that don't match the measure suffixes are ignored, so a backend holding unrelated
metrics alongside these is fine. Prefixes naming no known exercise are counted and skipped.

## What a backend is allowed to be bad at

The reference implementation is append-only, and gains is built to tolerate that:

1. **Edits and deletes need not propagate.** gains never re-sends a set whose values changed,
   because a store that can raise a number but not lower it would half-apply the edit. It
   reports the divergence in Settings instead.
2. **Reads may lag writes.** Roughly 10–15 seconds for the reference backend. gains does not
   treat a missing recent set as loss.
3. **Text need not be stored.** `note` is dropped and `id` is regenerated on pull, because the
   reference backend stores numbers only.

## What a backend must not do

- **Must not silently keep the larger of two values at one timestamp** without gains knowing —
  this is exactly what VictoriaMetrics' `-dedup.minScrapeInterval` does, and it's why set
  timestamps are made unique per exercise before sending.
- **Must not require a second credential.** One bearer token covers both directions.

## Reference implementation

`~/dev/metrics` — nginx terminating at Cloudflare, a small Go shim translating this JSON to
Influx line protocol, VictoriaMetrics at 100-year retention, Grafana Cloud as the UI.

Push lands on the shim's `/ingest`; pull reads VictoriaMetrics' `/api/v1/export`, which is on
nginx's read allowlist and accepts the same bearer token.
