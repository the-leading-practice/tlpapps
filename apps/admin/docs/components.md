# Components

> Index of Storybook entries. Source: `src/lib/components/**/*.stories.svelte`.

This is the `tlpapps/apps/admin` SvelteKit app's component reference. Build the
static Storybook for browsing:

```bash
pnpm storybook         # interactive on :6006
pnpm storybook:build   # static export → storybook-static/
```

## Storied

- `Avatar` — circular/square avatar with name initial or image. See `src/lib/components/Avatar.stories.svelte`.

## Pending stories (one-per-component sibling)

> Migration target: every `.svelte` under `src/lib/components/` gets a sibling
> `.stories.svelte`. Drift CI (`mode: frontend`) will eventually enforce this; the
> initial migration ships ONE story (Avatar) to validate the toolchain.

- `AppBar/AppBar`
- `AppShell/AppShell`
- `Avatar/Avatar` (folder variant — distinct from the top-level `Avatar.svelte`)
- `DashboardCard/AsanaList`, `DashboardCard.svelte`, `StatCard`, `SupportList`
- `DataList/DataItem`, `DataList/DataList`
- `Editor/SqlEditor`, `Editors/CodeEditor`
- `EventCalendar/EventCalendar`, `EventDetail`, `EventEditor`, `RecurranceEditor`
- `Hamburgers/Hamburger`
- `Input/FloatingLabelInput`, `InputChip`, `Password`, `Toggle`
- `PaletteList/PaletteList`
- `SignInForm/SignInForm`
- `SignUpForm/SignUpForm`
- `Toast/icons/CloseIcon`

## Conventions

- **Svelte 4 codebase** — stories use the legacy `<script context="module">` +
  `<Template let:args>` syntax via `@storybook/addon-svelte-csf@^4.2.0`. When this
  app migrates to Svelte 5, switch to the runes `defineMeta` API
  (`@storybook/addon-svelte-csf@^5`).
- This is a SvelteKit app, so Storybook framework is `@storybook/sveltekit` (NOT
  `@storybook/svelte-vite` — Storybook refuses svelte-vite on SvelteKit projects).
- No `/openapi.json` and no `/docs` route on the admin app itself — admin is the
  UI surface for the backend `tlpapps/app/` Express server. API docs belong with
  the server, not here.
