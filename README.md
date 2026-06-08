# TLP Apps Mono-repo

## Overview

Backend Express monolith (`app/`) plus SvelteKit admin frontend (`apps/admin/`)
plus legacy microservices archived under `services/`.

### Database architecture (current)

- **Postgres** (`tlp-services-pg` on Coolify) — **primary datastore** for config, patients, and all sync state. ORM: [Drizzle](https://orm.drizzle.team) (`app/src/db/pg/`).
- **MongoDB** (Coolify `mongo-tlp`) — transitional; retained for identity/auth tokens and DrChrono OAuth config. EOL scheduled in the "Residual Mongo EOL" follow-up milestone. See `.planning/MONGO-EOL.md`.

See `docs/architecture.md` for the full module + data-store layout.

## Building

Each sub-app has its own `package.json` + scripts. Top-level pnpm workspace
wires them up (`pnpm-workspace.yaml`).

```bash
pnpm install                       # install all workspaces
pnpm --filter ./app dev            # backend (Express)
pnpm --filter ./apps/admin dev     # admin frontend (SvelteKit + Vite)
```

## Deployment

Docker compose at the repo root + per-sub-app Dockerfiles. Coolify builds from GitHub `the-leading-practice/tlpapps main` (see project memory `project_deploy_source_github.md`).

### Key environment variables (added P02–P10)

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | Postgres connection (required) | — |
| `CONFIG_PRIMARY` | `pg` or `mongo` for config reads | `mongo` |
| `CONFIG_LEGACY_WRITE` | `off` to stop Mongo config writes | `on` |
| `PATIENTS_PRIMARY` | `pg` or `mongo` for patient writes | `mongo` |
| `PATIENTS_LEGACY_WRITE` | `off` to stop Mongo patient writes | `on` |
| `PATIENTS_READ_PRIMARY` | `pg` or `mongo` for patient reads | `mongo` |
| `RUN_MIGRATIONS` | Set `true` to apply DB migrations on boot | `false` |
| `RUN_CRON` | Set `on` to enable sync cron loop | `off` |
| `SYNC_LEADER_KEY_BASE` | PG advisory lock namespace for cron leader | `910700` |
| `SYNC_WRITE_DRCHRONO_TO_GHL` | Kill switch: `off`/`dry`/`verify`/`on` | `dry` |
| `SYNC_WRITE_GHL_TO_DRCHRONO` | Kill switch: `off`/`dry`/`verify`/`on` | `dry` |
| `SYNC_VERIFY_SINK_URL` | Override verify-mode capture target | built-in |
| `DRCHRONO_WEBHOOK_SECRET` | HMAC secret for DrChrono webhook verification | — |
| `GHL_SUPPRESS_TAG` | Tag applied to all synced GHL contacts | `Existing Patient` |
| `GHL_SUPPRESS_AUTOMATION` | Force dnd on synced contacts | `true` |

## Documentation

- `docs/architecture.md` — full module + data-store layout
- `docs/sync-architecture.md` — GHL ↔ DrChrono sync flow, kill-switch matrix
- `docs/database.md` — Drizzle schema, migration policy, dual-write/shadow-read patterns
- `docs/sync-runbook.md` — operational runbook (flip gates, replay dead-letters, rollback)
- `docs/api-sync.md` — generated sync API reference
- `.planning/MONGO-EOL.md` — Mongo retirement schedule

## Documentation convention (global rule #21)

Every sub-app exposes documentation according to its stack:

| Sub-app | Stack | Docs surface |
|---------|-------|--------------|
| `app/` | Express monolith | `/openapi.json` + `/docs` (Scalar) — pending migration |
| `apps/admin/` | SvelteKit 1 + Svelte 4 + Vite 4 | Storybook 8 + `docs/components.md`; no `/openapi.json` (it's the UI) |
| `apps/cli-tools/` | CLI utilities | n/a (no HTTP surface) |
| `clients/*` | Legacy EHR clients | n/a (archived) |

Drift CI lives at `.github/workflows/docs-drift.yml` and runs one job per sub-app:

- `drift-admin` — builds the admin Storybook, warns on missing sibling
  `*.stories.svelte` for every component under `src/lib/components/`. Will flip
  to a hard fail once backfill is complete.

### Admin sub-app — docs convention

- Components under `apps/admin/src/lib/components/**/*.svelte` should ship a
  sibling `*.stories.svelte` (Storybook addon-svelte-csf v4 syntax, since the
  app is on Svelte 4).
- `apps/admin/docs/components.md` is the human-readable index.
- Run `pnpm --filter ./apps/admin storybook` to browse interactively, or
  `pnpm --filter ./apps/admin storybook:build` to produce a static export under
  `apps/admin/storybook-static/`.
- This app is a SPA (admin UI for the backend Express monolith); it has no
  `/openapi.json` route. API docs belong with the backend in `app/`.

## Templates

The convention is bootstrapped from `_templates/sveltekit-app/` (in the parent
`finedesignz/_templates` repo). A parallel `_templates/vite-svelte-app/` is also
available for non-SvelteKit Svelte SPAs.
