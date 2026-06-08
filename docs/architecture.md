# Architecture — TLP Services Monolith

**Last updated:** 2026-06-08 (P12 docs sweep)
**Stack:** Node.js 20 · Express 4 · TypeScript · Drizzle ORM · Mongoose (transitional)

---

## Overview

TLP Services is a **unified Express monolith** that bridges multiple EHR systems (DrChrono, Embodi, ChiroTouch, SilkOne) with GoHighLevel (GHL) CRM. All backend services run in a single process deployed as a Docker container on Coolify.

### Database Architecture

```
┌─────────────────────────────────────────────────────┐
│                Express Monolith                     │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │          Postgres (PRIMARY)                  │  │
│  │  tlp-services-pg (Coolify managed)           │  │
│  │  ORM: Drizzle (src/db/pg/)                   │  │
│  │  Schema: config · patients · sync            │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  MongoDB (TRANSITIONAL — EOL scheduled)      │  │
│  │  Coolify: mongo-tlp / tlp_practice           │  │
│  │  ORM: Mongoose (src/db.ts + src/models/)     │  │
│  │  Residual: identity · drchronoConfig         │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Postgres is the authoritative primary.** Config and patient data live there. Sync state was born on PG (P07). MongoDB is retained only for identity/auth tokens and DrChrono OAuth config pending the "Residual Mongo EOL" milestone. See `.planning/MONGO-EOL.md` for the retirement schedule.

---

## Module Map

```
src/
├── index.ts           — Entry point: DB connect, HTTP server, WebSocket, cron
├── server.ts          — Express app factory, mounts all module routers
├── config.ts          — All env vars in one typed export (re-read on each call for hot-flip)
├── db.ts              — MongoDB connection (Mongoose)
├── db/pg/             — Postgres (Drizzle ORM) — see database.md
├── logger.ts          — Pino structured logger
├── middleware/        — JWT auth, error handling
├── models/            — Mongoose models (transitional residual)
├── utils/             — Shared helpers (crypto, ghlFetch, etc.)
└── modules/
    ├── identity/      — Auth, JWT, login, GHL OAuth tokens (Mongo — EOL scheduled)
    ├── config/        — Per-location config (PG PRIMARY since P03)
    ├── patients/      — Patient CRUD, GHL contact mapping (PG PRIMARY since P06)
    ├── sync/          — GHL ↔ DrChrono engine (PG only, born P07)
    ├── integration/   — GHL API wrapper (no Mongo footprint)
    ├── webhooks/      — GHL webhook receivers (no own storage)
    ├── drchrono/      — DrChrono OAuth + polling (drchronoConfig on Mongo — EOL scheduled)
    ├── embodi/        — Embodi EHR (no Mongo; in-memory registry)
    ├── notifications/ — Telegram + ClickUp (no Mongo)
    ├── monitor/       — Docker container monitoring (no Mongo)
    └── rpc/           — WebSocket sessions (in-memory, no Mongo)
```

---

## Data Stores

### Postgres — `tlp-services-pg`

Provisioned in Coolify per D-06. Connection via `DATABASE_URL` env (never in repo).

| Domain | Tables | Primary Since |
|--------|--------|---------------|
| Config | `locations`, `config`, `location_config_tables` | P03 |
| Patients | `patients`, `patient_external_ids` | P06 |
| Sync | `sync_jobs`, `sync_events`, `sync_mappings`, `sync_conflicts`, `appointment_links`, `sync_dead_letter`, `sync_verify_captures` | P07 (born on PG) |

Schema: `src/db/pg/schema/` (one file per domain). Migrations: `src/db/pg/migrations/` (`drizzle-kit generate/migrate`, gated by `RUN_MIGRATIONS=true`).

### MongoDB — `mongo-tlp / tlp_practice`

Retained only for:

| Model file | Collection | Module | EOL milestone |
|-----------|-----------|--------|---------------|
| `accessToken.ts`, `account.ts`, `appConfig.ts` | `accessTokens`, `adminUsers`, `clientAppConfigs` | `identity` | EOL-04 (HARD gate) |
| `drchronoConfig.ts` | `drChronoConfig` | `drchrono` | EOL-02b |
| `appointment.ts` | `appointments` | `patients`/`sync` | EOL-02 |
| `silkOneConfig.ts` | `silkOneConfig` | `admin` reads | EOL-02 (drop if unused) |

`clientAppConfigs` is PG primary (P03); only the legacy write tail (`CONFIG_LEGACY_WRITE`) remains until admin/identity direct-reads are migrated (EOL-01).

---

## Request Flow

```
Client → JWT middleware (identity.accessToken) → Module router → Controller → Service → DB
```

- **Unauthenticated routes:** `/api/login`, `/api/drchrono/webhook`, `/api/webhooks/*`, `/health`
- **Authenticated routes:** all others — JWT validated by `src/middleware/auth.ts`; `req.payload` populated with `{ location, calendar, timezone, token, push flags }`
- **Sync engine:** event-driven; triggered by GHL webhooks (`POST /api/webhooks/appointment`) and DrChrono webhooks (`POST /webhook/drchrono`), plus cron (`RUN_CRON=on`)

---

## EHR Integration Summary

| EHR | Integration type | Direction | Storage |
|-----|-----------------|-----------|---------|
| DrChrono | Webhooks + OAuth polling | Bidirectional via sync engine | OAuth tokens: Mongo (EOL-02b); sync state: PG |
| Embodi | Webhooks + daily cron | Embodi → GHL | In-memory only; no persistent state |
| ChiroTouch | SQL polling | ChiroTouch → GHL | Via `data-shuttle/` C# service |
| SilkOne | Config only (not yet built) | — | `silkOneConfig` on Mongo (EOL-02) |

---

## Cross-references

- Database schema and migration policy: `tlpapps/docs/database.md`
- GHL ↔ DrChrono sync flow and kill-switch matrix: `tlpapps/docs/sync-architecture.md`
- Mongo EOL schedule: `.planning/MONGO-EOL.md`
- Sync operational runbook: `tlpapps/docs/sync-runbook.md`
- API reference (sync module): `tlpapps/docs/api-sync.md`
