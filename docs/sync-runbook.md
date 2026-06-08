# Sync Engine Operational Runbook

**Scope:** GHL ↔ DrChrono bidirectional sync engine (`tlpapps/app/src/modules/sync/`).
**Last updated:** 2026-06-08 (P11 hardening)

---

## Procedure Index

| # | Procedure | Trigger | MTTR |
|---|-----------|---------|------|
| 1 | Flip kill switch (disable a write direction) | Loops / dead-letters / anomaly | < 5 min |
| 2 | Replay dead-letters | False dead-letter / transient outage | 15–30 min |
| 3 | Re-issue DrChrono OAuth token | OAuth expiry / revocation / 401s on DrChrono | 10–20 min |
| 4 | Force location re-sync | Drift after outage / missed webhooks | 30–60 min |
| 5 | Rollback patient DB to Mongo | PG corruption / data loss | 5 min (env flip) |
| 6 | PG failover | PG pod crash / storage failure | 10–20 min |

---

## Procedure 1 — Flip Kill Switch (disable write direction)

**Trigger:** Sync loops detected, unexpected dead-letters, data corruption, anomaly during 24h obs window.

**Steps:**
1. In Coolify → `tlpapps` service → Environment variables, set:
   - `SYNC_WRITE_DRCHRONO_TO_GHL=off` (disable DrChrono→GHL writes) **and/or**
   - `SYNC_WRITE_GHL_TO_DRCHRONO=off` (disable GHL→DrChrono writes)
2. Click "Save + Redeploy" (zero-downtime rolling restart).
3. Verify `/api/sync/metrics` (JSON): `sync_writes_attempted` counter stops incrementing for the disabled direction.
4. Check dead-letter queue via admin UI at `/admin/dead-letter` or:
   ```sql
   SELECT count(*), max(created_at) FROM sync_dead_letter WHERE created_at > now() - interval '1 hour';
   ```
5. Investigate root cause before re-enabling.

**Expected outcome:** Writes halt within 1 redeploy cycle (~30–60s). In-flight writes that started before redeploy may complete or dead-letter.

**Escalation:** If dead-letters persist after kill switch, check PG connectivity and GHL/DrChrono API status pages.

**MTTR:** < 5 min to halt writes; root cause investigation separate.

---

## Procedure 2 — Replay Dead-Letters

**Trigger:** Dead-letter rows exist in `sync_dead_letter` after a transient outage that has since cleared (GHL/DrChrono API recovered, PG restored).

**Steps:**
1. Confirm the underlying issue is resolved (API status, PG health).
2. Identify dead-letter rows:
   ```sql
   SELECT id, event_id, attempts, last_error, created_at
   FROM sync_dead_letter
   WHERE replayed_at IS NULL
   ORDER BY created_at ASC
   LIMIT 100;
   ```
3. Replay via admin API:
   ```bash
   curl -X POST https://tlp.example.com/api/sync/dead-letter/<id>/replay \
     -H "Authorization: Bearer <admin-jwt>"
   ```
   Or bulk replay from admin UI at `/admin/dead-letter`.
4. Monitor `/api/sync/metrics`: `sync_writes_succeeded` should increment; `sync_dead_letter_count` should decrease.
5. After replay, verify no new dead-letters appear within 5 minutes.

**Expected outcome:** Each replayed event re-enters the write queue; succeeds or re-dead-letters (in which case the underlying error is not transient — escalate).

**Escalation:** If > 10% of replayed events re-dead-letter, halt replay, investigate `last_error` column.

**MTTR:** 15–30 min (depending on volume; bulk replay is automated).

---

## Procedure 3 — Re-issue DrChrono OAuth Token

**Trigger:** DrChrono API returns 401 on write attempts; `sync_dead_letter.last_error` contains `401` or `invalid_token`; DrChrono OAuth dashboard shows token revoked.

**Steps:**
1. Navigate to DrChrono developer portal → OAuth apps → find the TLP integration app.
2. Revoke the current access token if still listed.
3. Initiate re-authorization:
   - Visit `https://tlp.example.com/api/drchrono/auth` (starts the OAuth flow).
   - Authorize with the clinic's DrChrono admin credentials.
4. After redirect, confirm token stored: `GET /api/drchrono/token-status` returns `{ valid: true }`.
5. If using Coolify env (`DRCHRONO_CLIENT_ID` / `DRCHRONO_CLIENT_SECRET`): verify vars are correct; tokens are stored in DB (`drChronoConfig` collection / PG after migration).
6. Set `DRCHRONO_WEBHOOK_SECRET` if re-registering webhooks (see P13-03 pre-flight checklist).
7. Test: `POST /api/drchrono/poll` → should return `{ polled: true }` without 401.

**Expected outcome:** Token refreshed; subsequent DrChrono API calls succeed; dead-letters for 401 events can be replayed (Procedure 2).

**Escalation:** If OAuth flow fails (DrChrono server error), contact DrChrono support with the app ID. Do NOT store tokens in the repo.

**MTTR:** 10–20 min.

---

## Procedure 4 — Force Location Re-sync

**Trigger:** Location experienced a webhook outage (GHL or DrChrono missed events); patient/appointment data drifted; after a rollback; after a manual DB repair.

**Steps:**
1. Identify the location ID (e.g., demo: `wP3Ynm3Z63rIC4zVAgXP`).
2. Check last successful sync event:
   ```sql
   SELECT max(created_at) FROM sync_events WHERE location_id = '<locationId>';
   ```
3. Trigger backfill via admin API:
   ```bash
   curl -X POST https://tlp.example.com/api/sync/backfill \
     -H "Authorization: Bearer <admin-jwt>" \
     -H "Content-Type: application/json" \
     -d '{"locationId": "<locationId>", "since": "<ISO8601 start>"}'
   ```
4. Monitor `sync_events` insert rate and `sync_writes_attempted` counter.
5. After backfill completes (no new events ingested for 2 min), verify patient count:
   ```sql
   SELECT count(*) FROM patients WHERE location_id = '<locationId>';
   ```
   Compare against GHL contact count for the location.
6. Spot-check 3–5 random patients in both systems for field agreement.

**Expected outcome:** All missed events replayed; patient/appointment parity restored within 60 min for typical location size.

**Escalation:** If counts diverge by > 1% after backfill, open a conflict queue investigation. Do not force-update records without audit trail.

**MTTR:** 30–60 min (depends on backfill volume).

---

## Procedure 5 — Rollback Patient DB to Mongo

**Trigger:** PG patient data corrupted or lost; PG pod failure during writes; data integrity failure discovered post-cutover.

**Steps:**
1. In Coolify → `tlpapps` service → Environment variables, set:
   ```
   PATIENTS_PRIMARY=mongo
   ```
2. Click "Save + Redeploy".
3. Verify `/health` returns `{ mongo: "ok" }` and patient reads resolve from Mongo.
4. Audit PG `patients` table for corruption scope:
   ```sql
   SELECT count(*), max(updated_at) FROM patients;
   ```
5. Do NOT delete PG patient rows — preserve for forensics and re-migration.
6. Alert engineering: PG patient state is now stale; dual-write to PG continues (behavior-neutral) so PG will self-heal as writes flow through.
7. When PG is stable and audited: revert `PATIENTS_PRIMARY=pg` and repeat D-09 soak criteria.

**Expected outcome:** Rollback takes effect in < 1 redeploy cycle (~60s); app serves patients from Mongo warm standby. Zero downtime.

**Escalation:** If Mongo is also unavailable, both primaries are down — escalate to Coolify infrastructure immediately (`coolify.titaniumlabs.us`).

**MTTR:** 5 min (env flip + redeploy).

---

## Procedure 6 — PG Failover

**Trigger:** PG pod crash; storage volume failure; `DATABASE_URL` unreachable; `/health` returns `{ pg: "error" }`.

**Steps:**
1. Check Coolify → `tlp-services-pg` service status. If crashed, click "Restart".
2. If storage failure: Coolify → `tlp-services-pg` → Volumes → check volume health. If volume corrupted, restore from latest backup.
3. While PG is down:
   - Flip `PATIENTS_PRIMARY=mongo` (Procedure 5) to serve patient reads from Mongo.
   - Kill switches: set `SYNC_WRITE_DRCHRONO_TO_GHL=off` and `SYNC_WRITE_GHL_TO_DRCHRONO=off` (Procedure 1) — sync writes require PG advisory lock.
4. After PG recovers:
   - Verify migrations are current: `GET /api/health` should return `{ pg: "ok", migrations: "current" }`.
   - Run a quick sanity query:
     ```sql
     SELECT count(*) FROM patients; SELECT count(*) FROM sync_events;
     ```
   - Re-enable write directions (Procedure 1, re-flip to `on`).
   - Revert `PATIENTS_PRIMARY=pg`.
5. Replay any dead-letters that accumulated during the outage (Procedure 2).

**Expected outcome:** PG restored within 10–20 min for pod-crash (Coolify auto-restart usually < 5 min); storage restore may take longer depending on backup age.

**Escalation:** If PG volume is unrecoverable: restore latest `pg_dump` backup from Coolify R2 bucket or S3. Contact Coolify support if volume is managed. Patient Mongo data is the warm standby and should be intact.

**MTTR:** 10–20 min (pod restart); up to 60 min (backup restore).

---

## Appendix: Useful Queries

```sql
-- Dead-letter count by hour
SELECT date_trunc('hour', created_at) AS hour, count(*)
FROM sync_dead_letter GROUP BY 1 ORDER BY 1 DESC LIMIT 24;

-- Recent sync event failures
SELECT event_type, source, status, created_at
FROM sync_events WHERE status = 'failed'
ORDER BY created_at DESC LIMIT 20;

-- Advisory lock holders (PG)
SELECT pid, granted, locktype, classid, objid
FROM pg_locks WHERE locktype = 'advisory';

-- Duplicate mapping check
SELECT external_id, source_system, count(*)
FROM sync_mappings GROUP BY 1,2 HAVING count(*) > 1;
```

## Appendix: Metrics Endpoint

`GET /api/sync/metrics` — JSON counters (all directions, all event types).
`GET /api/sync/metrics?format=prom` — Prometheus text exposition.

Key counters:
- `sync_writes_attempted`, `sync_writes_succeeded`, `sync_writes_failed`
- `sync_writes_skipped_loop` — loop-prevention suppression count
- `sync_dead_letter_count` — total events sent to dead-letter queue
- `sync_conflict_queue_size` — EHR-wins conflicts awaiting review
