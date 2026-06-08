# TLP Services — Sync API Reference

> **Generated from `/openapi.json`** (P10 T05 — D-03: sync-module only). Do not edit manually;
> re-generate by running the server and calling `curl /openapi.json | node scripts/gen-api-docs.js`.

**Base URL:** `https://tlpapps.theleadingpractice.com`

**Authentication:** All `/api/sync/*` routes (except `/api/sync/verify-sink`) require a JWT bearer token:
```
Authorization: Bearer <token>
```

---

## Endpoints

### Metrics

#### `GET /api/sync/metrics`

In-process sync counters. Counters reset on process restart; durable counts come from Postgres queries.

**Query parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | `"json" \| "prom"` | `json` | Response format |

**Response `200` — `application/json`:**

```json
{
  "sync_writes_attempted": 0,
  "sync_writes_succeeded": 0,
  "sync_writes_failed": 0,
  "sync_writes_skipped_loop": 0,
  "sync_writes_skipped_off": 0,
  "sync_dry_run_actions": 0,
  "sync_dead_letter_count": 0,
  "sync_conflict_queue_size": 0,
  "patients_dual_write_pg_fail": 0,
  "per_direction": {
    "drchrono_to_ghl": { "attempted": 0, "succeeded": 0, "failed": 0 },
    "ghl_to_drchrono": { "attempted": 0, "succeeded": 0, "failed": 0 }
  }
}
```

**Prometheus format (`?format=prom`):** Returns `text/plain` Prometheus counter lines.

---

### Events

#### `GET /api/sync/events`

List recent sync events with optional status filter.

**Query parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `"pending" \| "processed" \| "failed" \| "dead"` | — | Filter by status |
| `limit` | integer 1–500 | `50` | Max rows |

**Response `200`:**

```json
{
  "events": [
    {
      "id": "uuid",
      "source": "ghl | drchrono",
      "action": "appointment.created",
      "dedupKey": "string",
      "status": "pending | processed | failed | dead",
      "payload": {},
      "error": null,
      "receivedAt": "2026-01-01T00:00:00Z",
      "processedAt": null
    }
  ]
}
```

---

#### `POST /api/sync/events/replay/:id`

Re-arms a failed event to `status=pending` so the engine reprocesses it. Returns `202 Accepted`.

**Path parameter:** `id` — UUID of the event.

**Response `202`:**

```json
{ "status": "pending", "id": "uuid" }
```

**Response `404`:** `{ "error": "event not found" }`

---

### Conflicts

#### `GET /api/sync/conflicts`

List sync conflicts with optional resolution filter.

**Query parameters:**

| Name | Type | Default |
|------|------|---------|
| `resolution` | `"pending" \| "manual-resolved" \| "auto-resolved" \| "skip"` | `pending` |
| `limit` | integer 1–500 | `50` |

**Response `200`:**

```json
{
  "conflicts": [
    {
      "id": "uuid",
      "source": "sync",
      "entity": "appointment",
      "resolution": "pending",
      "resolvedBy": null,
      "resolvedAt": null,
      "diffJson": {},
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

---

#### `POST /api/sync/conflicts/:id/resolve`

Mark a pending conflict manually resolved.

**Path parameter:** `id` — UUID of the conflict.

**Request body:**

```json
{
  "decision": "apply-source | apply-target | skip",
  "resolvedBy": "operator"
}
```

**Response `200`:**

```json
{ "status": "manual-resolved", "id": "uuid", "decision": "apply-source" }
```

**Response `400`:** Invalid decision value.  
**Response `404`:** Pending conflict not found.

---

### Verify Sink

> **Public endpoint** (no auth required). Used by the sync engine in `verify` mode to capture
> would-be outbound writes without calling a live EHR.

#### `POST /api/sync/verify-sink`

Capture a verify-mode outbound write envelope.

**Request body:**

```json
{
  "direction": "drchrono→ghl",
  "eventId": "uuid",
  "wouldHaveSent": {}
}
```

**Response `200`:** `{ "captured": true, "id": "uuid" }`

---

#### `GET /api/sync/verify-sink`

List captured verify-mode envelopes.

**Query parameter:** `limit` (1–500, default 50).

**Response `200`:** `{ "captures": [ { "id": "uuid", "direction": "...", "eventId": "...", "wouldHaveSent": {}, "capturedAt": "..." } ] }`

---

## Alert Rules (Telegram)

The following conditions dispatch a Telegram alert via the notifications module (10-minute dedupe per rule):

| Rule | Trigger |
|------|---------|
| `dead_letter` | Any sync event moves to failed status |
| `conflict_queue` | Pending conflict queue exceeds 50 entries |
| `oauth_failure` | GHL or DrChrono OAuth token refresh fails |
| `loop_detection` | Engine detects a write loop and skips a write |
| `reconciliation_drift` | Reconciliation drift exceeds 0.1% |

---

## Counter Semantics

| Counter | Description |
|---------|-------------|
| `sync_writes_attempted` | Live/verify writes dispatched to a writer |
| `sync_writes_succeeded` | Writer calls that completed without error |
| `sync_writes_failed` | Writer calls that threw (live write errors) |
| `sync_writes_skipped_loop` | Events skipped due to loop detection |
| `sync_writes_skipped_off` | Events skipped because kill switch is `off` |
| `sync_dry_run_actions` | Events processed in `dry` mode (logged, no API call) |
| `sync_dead_letter_count` | Live count from PG `sync_events WHERE status='dead'` |
| `sync_conflict_queue_size` | Live count from PG `sync_conflicts WHERE resolution='pending'` |
| `patients_dual_write_pg_fail` | Patient dual-write PG failures (incremented by patients module) |
