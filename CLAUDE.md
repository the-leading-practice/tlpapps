# CLAUDE.md — tlpapps mono-repo

This file provides guidance to Claude Code when working in this repo. The outer
`tlp-services` repo (parent of this submodule) has its own CLAUDE.md covering
the .NET / data-shuttle utilities; this one focuses on the Node / Svelte sub-apps.

## Layout

- `app/` — Express monolith (backend; Mongo + WebSocket + cron). Server modules under `app/src/modules/`.
- `apps/admin/` — SvelteKit 1 + Svelte 4 admin UI. Vite 4.
- `apps/cli-tools/` — CLI data conversion utilities.
- `clients/` — Legacy EHR client refs (silkone, drchrono).
- `services/` — Archived per-service deployables (replaced by `app/`).
- `serverContainer/` — Container orchestration helpers.

## Documentation convention (global rule #21)

### Backend (`app/`)

Express monolith — must expose `/openapi.json` + `/docs` (Scalar). Use
`express-zod-api` (Express 4 → `^22`, Express 5 → `^28`). Currently pending
migration; track under `app/TODO.md`.

### Admin (`apps/admin/`)

SvelteKit + Svelte 4 SPA — Storybook 8 is the docs surface; no `/openapi.json`.

- Components under `src/lib/components/**/*.svelte` should ship sibling
  `*.stories.svelte`.
- Stories use the **Svelte 4** `<script context="module">` + `<Template let:args>`
  syntax via `@storybook/addon-svelte-csf@^4.2.0`. Do NOT use the v5 runes
  `defineMeta` API until this app is migrated to Svelte 5.
- Storybook framework is `@storybook/sveltekit@^8.6.18` (NOT
  `@storybook/svelte-vite` — Storybook refuses svelte-vite on SvelteKit
  projects).
- Drift CI lives at the repo-root `.github/workflows/docs-drift.yml` with a
  `drift-admin` job that builds the Storybook static.

### CLI tools (`apps/cli-tools/`)

No HTTP surface; exempt from rule #21.

## Storybook scripts (admin)

```bash
pnpm --filter ./apps/admin storybook         # :6006
pnpm --filter ./apps/admin storybook:build   # static under apps/admin/storybook-static/
pnpm --filter ./apps/admin docs-sync         # placeholder — components.md is hand-maintained
```

## Template reference

This admin migration was bootstrapped from `_templates/sveltekit-app/` (using
the Svelte-4-compatible variant). The newly authored
`_templates/vite-svelte-app/` (Vite 6 + Svelte 5) is the recommended starting
point for any NEW Vite+Svelte SPA in this monorepo — not applicable here because
admin is SvelteKit, not plain Vite+Svelte.

## Pinned versions for admin Storybook (verified npm 2026-05-26)

- `storybook@^8.6.18`
- `@storybook/sveltekit@^8.6.18`
- `@storybook/svelte@^8.6.18`
- `@storybook/addon-essentials@^8.6.18`
- `@storybook/addon-svelte-csf@^4.2.0` (peers Svelte ^4 + vite-plugin-svelte ^2||^3)
- `typescript@~5.4.5` (**pinned to 5.4** because SvelteKit 1.x regenerates
  `.svelte-kit/tsconfig.json` with `importsNotUsedAsValues` and
  `preserveValueImports` — both REMOVED in TS 5.5+. Storybook's sveltekit
  framework re-runs `svelte-kit sync` on every build, undoing any patch. Pinning
  TS to 5.4 is the only stable fix until this app upgrades to SvelteKit 2.)

## Storybook quirks (admin)

- `scripts/storybook-prep.mjs` runs before `storybook dev` / `storybook build`.
  It runs `svelte-kit sync` once and patches `.svelte-kit/tsconfig.json` to drop
  the obsolete TS keys. Even with TS 5.4 pinned, the patch is defensive in case
  another tool in the chain ever bumps TS.
- `@storybook/sveltekit` framework is required (not `@storybook/svelte-vite`) —
  Storybook detects SvelteKit and refuses svelte-vite with a hard error.
- `@storybook/svelte` is an explicit dependency (not just a transitive) because
  the resolver in this pnpm workspace doesn't hoist it from sveltekit's deps.
