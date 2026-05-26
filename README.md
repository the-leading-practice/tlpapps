NOTE This repo is considered WIP and not ready for production.

# TLP Apps Mono-repo

## Overview

Backend Express monolith (`app/`) plus SvelteKit admin frontend (`apps/admin/`)
plus legacy microservices archived under `services/`. See `app/CLAUDE.md` for
the server architecture.

## Building

Each sub-app has its own `package.json` + scripts. Top-level pnpm workspace
wires them up (`pnpm-workspace.yaml`).

```bash
pnpm install                       # install all workspaces
pnpm --filter ./app dev            # backend (Express)
pnpm --filter ./apps/admin dev     # admin frontend (SvelteKit + Vite)
```

## Deployment

Docker compose at the repo root + per-sub-app Dockerfiles.

## Development Notes

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
