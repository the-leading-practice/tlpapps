# Database — Schema, Migrations, and Patterns

**Last updated:** 2026-06-08 (P12 docs sweep)
**ORM:** Drizzle ORM with `postgres-js` driver
**Cross-ref:** `architecture.md` · `sync-architecture.md` · `.planning/MONGO-EOL.md` · `sync-runbook.md`

---

## Postgres — `tlp-services-pg`

Dedicated Coolify Postgres instance (D-06). `DATABASE_URL` lives in Coolify env — never in repo.
Connection pool (D-06): `max: 10, idle_timeout: 20, connect_timeout: 10`.
Single pool exported from `src/db/pg/client.ts`.

### Schema Layout

All schema defined under `tlpapps/app/src/db/pg/schema/` — one file per domain:

```
src/db/pg/schema/
├── config.ts     — locations, config, location_config_tables
├── patients.ts   — patients, patient_external_ids
├── sync.ts       — sync_jobs, sync_events, sync_mappings, sync_conflicts,
│                   appointment_links, sync_dead_letter, sync_verify_captures
└── index.ts      — re-exports all tables + enums
```

#### Config domain (`config.ts`)

| Table | Key columns | Notes |
|-------|------------|-------|
| `locations` | `id` (serial PK), `location` (UNIQUE), `software`, `mongo_id` | One row per practice/location |
| `config` | `id` (serial PK), `location_id` FK → locations, connection/polling settings, `mongo_id` | One config per location (UNIQUE on `location_id`) |
| `location_config_tables` | `id`, `config_id` FK → config, `name`, `sql_query`, etc. | ChiroTouch SQL poll table definitions |

#### Patients domain (`patients.ts`)

| Table | Key columns | Notes |
|-------|------------|-------|
| `patients` | `id` (UUID PK), `location_id`, `patient_id` (int), `contact_id`, `mongo_id` | UNIQUE on `(location_id, patient_id)` |
| `patient_external_ids` | `id` (UUID PK), `patient_id` FK → patients, `system`, `external_id` | system ∈ `{'ghl','drchrono','embodi','silkone'}`. UNIQUE on `(system, external_id)` |

#### Sync domain (`sync.ts`)

| Table | Key columns | Notes |
|-------|------------|-------|
| `sync_jobs` | `id` (UUID PK), `kind`, `status` (enum), `started_at`, `finished_at`, `summary` (jsonb), `location_id` | Cron/manual job tracking |
| `sync_events` | `id` (UUID PK), `source` (enum), `action`, `payload` (jsonb), `status` (enum), `dedup_key` (UNIQUE), `origin_tag` | Idempotency key = `${source}:${action}:${external_id}:${ver}` |
| `sync_mappings` | `id` (UUID PK), `kind` (enum), `drchrono_id`, `ghl_id`, `location_id`, `version`, `last_hash` | UNIQUE on `(kind, drchrono_id, location_id)` and `(kind, ghl_id, location_id)` |
| `sync_conflicts` | `id` (UUID PK), `source` (enum), `entity`, `*_value` (jsonb columns), `resolution` (enum), `diff_json` (jsonb) | shadow/sync/reconcile sources |
| `appointment_links` | `id` (UUID PK), `ghl_event_id` (UNIQUE), `drchrono_appointment_id` (UNIQUE), `location_id`, `patient_id` FK → patients, `calendar_id` | Cross-system appointment identity |
| `sync_dead_letter` | `id` (UUID PK), `event_id` FK → sync_events, `attempts`, `last_error`, `replayed_at` | Events that exhausted retries |
| `sync_verify_captures` | `id` (UUID PK), `direction`, `event_id`, `would_have_sent` (jsonb) | Verify-mode captures (full outbound envelope) |

---

## Migration Policy

### Tool: `drizzle-kit`

```bash
# Generate migration SQL from schema diff
cd tlpapps/app
npx drizzle-kit generate

# Apply migrations (prod: gated by RUN_MIGRATIONS=true)
npx drizzle-kit migrate
```

Migrations land in `src/db/pg/migrations/` as numbered SQL files. Drizzle tracks applied migrations in `__drizzle_migrations` table.

**Important (D-11):** The prod database had `__drizzle_migrations` created manually (migrations 0000 + 0001 applied without the tracking table). Before running `migrate()` on a fresh prod instance, seed the tracking table with existing migration hashes to prevent "relation already exists" errors. See `.planning/cutovers/sync-deploy.md`.

### Migration naming

Files follow drizzle-kit's auto-naming (`NNNN_adjective_noun.sql`). Applied migrations in prod as of 2026-06-08:

| File | Content | Applied |
|------|---------|---------|
| `0000_config.sql` | locations, config, location_config_tables | P03 (manual) |
| `0001_large_sleeper.sql` | patients, patient_external_ids | P04 (manual) |
| `0002_steady_ikaris.sql` | sync_jobs, sync_events, sync_mappings, sync_conflicts, appointment_links, sync_dead_letter | P07 (pending prod apply) |
| `0003_sleepy_mockingbird.sql` | sync_verify_captures | P09 (pending prod apply) |

### Runner

Migrations run inside the prod container when `RUN_MIGRATIONS=true` is set in Coolify env. The runner (`src/db/pg/run-migrations.ts` or equivalent) is called from the Docker entry point before the server starts. Remove the env var after migrations apply to prevent re-runs.

---

## Dual-Write Pattern (D-07)

Used during Mongo → PG transition windows. Writes go to PG first, then to Mongo as a warm standby.

```typescript
// Example: writePatientWithDeps (src/modules/patients/helpers/dual-write-patient.ts)
async function writePatientWithDeps(data) {
  // 1. PG write (required when PATIENTS_PRIMARY=pg)
  const pgResult = await upsertPatientPg(data);

  // 2. Mongo write (best-effort warm standby, PATIENTS_LEGACY_WRITE != 'off')
  if (config.patientsLegacyWrite) {
    try {
      await upsertPatientMongo(data);
    } catch (err) {
      logger.error({ err }, 'mongo legacy write failed — continuing');
    }
  }
  return pgResult;
}
```

**Key rules:**
- PG write failure throws (request fails) when PG is primary.
- Mongo write failure logs structured error but **never fails the request** during dual-write mode.
- Feature-flagged per module (e.g. `PATIENTS_PRIMARY`, `CONFIG_PRIMARY`).
- See rollback flags table below.

---

## Shadow-Read Pattern (D-08)

Reads from PG primary; async diff against Mongo; logs drift to `sync_conflicts`.

```typescript
// Example: readPatient (src/modules/patients/helpers/read-patient.ts)
async function readPatient(locationId, patientId) {
  const pgResult = await getPatientPg(locationId, patientId);

  // Async shadow compare — never awaited, never blocks
  setImmediate(async () => {
    const mongoResult = await getPatientMongo(locationId, patientId);
    const diff = computeDiff(pgResult, mongoResult);
    if (diff.realDiffs.length > 0) {
      await logConflict({ source: 'shadow', entity: 'patient', diff });
    }
  });

  return pgResult;
}
```

**Shadow diff classification:**
- `expected` — known schema normalisation (e.g. field name casing, type coercion). Do not count against cutover.
- `real` — actual data divergence. Count against D-09 cutover criterion.

---

## Advisory Lock — Cron Leader Election (D-04)

Prevents multiple replicas from running the sync cron loop simultaneously.

```sql
-- Two-arg form: base key (namespace) + kind hash (per-cron-type lock)
SELECT pg_try_advisory_lock($1, $2)
-- Returns true if lock acquired; false if another session holds it.
-- Session-scoped: auto-released on connection close or crash.
```

Implementation: `src/modules/sync/leader.ts`. Lock base: `SYNC_LEADER_KEY_BASE` (default `910700`).

---

## Rollback Flags (D-10)

Single env var per module controls which store is authoritative. **No code redeploy required** — Coolify env flip + rolling restart.

| Module | Primary flag | Legacy write flag | Rollback value | Warm standby stop |
|--------|-------------|-------------------|----------------|-------------------|
| Config | `CONFIG_PRIMARY` (pg/mongo) | `CONFIG_LEGACY_WRITE` (on/off) | `CONFIG_PRIMARY=mongo` | `CONFIG_LEGACY_WRITE=off` |
| Patients | `PATIENTS_PRIMARY` (pg/mongo) | `PATIENTS_LEGACY_WRITE` (on/off) | `PATIENTS_PRIMARY=mongo` | `PATIENTS_LEGACY_WRITE=off` |
| Patients reads | `PATIENTS_READ_PRIMARY` (pg/mongo) | — | `PATIENTS_READ_PRIMARY=mongo` | — |
| Identity (EOL-04) | `IDENTITY_PRIMARY` (pg/mongo) | `IDENTITY_LEGACY_WRITE` (on/off) | `IDENTITY_PRIMARY=mongo` | `IDENTITY_LEGACY_WRITE=off` |
| DrChrono tokens (EOL-02b) | `DRCHRONO_CONFIG_PRIMARY` (pg/mongo) | `DRCHRONO_CONFIG_LEGACY_WRITE` (on/off) | `DRCHRONO_CONFIG_PRIMARY=mongo` | `DRCHRONO_CONFIG_LEGACY_WRITE=off` |

**Current live state (2026-06-08):**
- `CONFIG_PRIMARY=pg` (P03 live)
- `PATIENTS_PRIMARY=pg` (P06 live)
- `PATIENTS_READ_PRIMARY=mongo` (P05 code shipped; flip at P05 gate)
- All other flags: default (Mongo primary or legacy write on)

---

## Cutover Criteria (D-09)

Before flipping any module's primary flag:

1. 100% backfill verified: row count match + 1% sample hash diff = 0.
2. 0 shadow-diff `real` alerts for 7 consecutive days (14 days for identity auth hot path).
3. Rollback drill executed: flip primary to mongo, verify reads succeed, flip back.
4. Admin sign-off documented in `.planning/cutovers/<module>.md`.

---

## MongoDB — Residual (Transitional)

Connection: `src/db.ts` (Mongoose). Retained only for identity and DrChrono OAuth tokens pending the Residual Mongo EOL milestone.

See `.planning/MONGO-EOL.md` for the complete inventory, retirement schedule, and effort estimates.

**CI guard (after Mongo EOL):** A CI grep step will verify no new `import ... from '../../models/'` appears in `monitor/`, `rpc/`, `integration/`, `embodi/` (these are already clean per P01 §14).
