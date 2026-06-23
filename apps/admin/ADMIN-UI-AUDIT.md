# TLP Apps Admin UI — Audit & Fix Report

Date: 2026-06-23
Branch: `feat/p05-patients-backfill-shadow` (current branch; not pushed — owner pushes)
Scope: `tlpapps/apps/admin` (SvelteKit, deployed as separate Coolify app `tlp-admin`).
Backend (`tlpapps/app`) inspected read-only only. No changes to `modules/drchrono`,
`modules/sync/writers`, containers, env, or drChronoConfig.

---

## 1. Root causes

### A. `GET /api/sync/controls` → 401

**Auth model (correct, as designed):** GHL SSO → `/embed` POSTs the encrypted blob
to `POST /api/crm/sso` → backend mints a JWT (`mintTokenForLocation`) → stored in
`localStorage.tlp_token` → `apiFetch` sends it as `Authorization: Bearer <token>`.
The JWT minted by `/api/crm/sso` is **identical** to the `/api/login` JWT (same
secret `config.tokenKey`, same claims). `/api/sync/*` is mounted behind `authToken`
(`server.ts`: `app.use('/api', authToken, syncRoutes)`).

**Why 401:** `middleware/auth.ts` returns **401 only when the token is entirely
missing** (empty/absent `Authorization` header); a bad/expired token returns **403**.
So the 401 means **no token was sent** — the SSO handshake had not populated
`tlp_token` at the time of the call (or it had been cleared), yet a request still
fired.

The old `apiFetch` did `localStorage.getItem('tlp_token') || ''` and always sent
`Authorization: Bearer ` (empty) → backend reads `authHeader.split(' ')[1]` = `''`
→ falsy → **401**, surfaced as a raw inline error on the page. The sync
`+layout.svelte` guard only checked for token *presence* (not expiry) and the
`controls/+page.ts` load + `onMount` fetch run independently of the guard, so an
expired/absent token still produced a live 401 fetch.

**Fix (frontend):**
- `apiFetch` now bounces to `/embed?return=<path>` when no token is present, and on
  any `401`/`403` it clears the stale token and re-runs the SSO handshake instead of
  showing a raw error. (`src/lib/api.ts`)
- The sync guard now treats an **expired** JWT as missing (decodes `exp`).
  (`src/routes/(admin)/sync/+layout.svelte` + new `src/lib/utils/session.ts`)

This converts the confusing "401 inline error" into an automatic re-auth. NOTE: if
the GHL embed never delivers SSO data (e.g. `GHL_APP_SSO_KEY` unset, or Custom Menu
Link not configured), `/embed` will surface its own clear error — that is an
owner/config action, not a code bug.

### B. `GET /api/monitor/list` → 500

**Backend cause** (`app/src/modules/monitor/`): `controller.list` does
`const resp = await dockerService.list()` with **no try/catch**. `dockerService`
talks to the Docker daemon over `/var/run/docker.sock`; `docker.ts:requestSync`
`reject()`s with `no such socket /var/run/docker.sock` when the socket is not
mounted (it is **not** mounted in the backend container). The rejected await throws,
Express returns **500** with an empty body. The admin page had no error handling, so
the whole page rendered blank.

This is fundamentally an environment/feature mismatch: `tlp-admin` and `tlpapps` are
separate Coolify apps and the backend container has no Docker socket, so container
monitoring cannot work as-is.

**Fix (frontend):** the Monitor page now wraps the calls in try/catch and renders a
clear error / empty state instead of crashing. (`src/routes/(admin)/server/monitor/+page.svelte`)

**Backend change needed (NOT applied — for owner):** wrap `monitor/controller.ts`
handlers in try/catch returning a JSON 503 (`{ error: 'docker unavailable' }`) so
the endpoint degrades gracefully; and decide whether container monitoring is even in
scope for the separate `tlp-admin` deployment (the socket would have to be mounted
into whichever container actually runs this code).

---

## 2. Frontend bugs fixed (file → what changed)

- **`src/lib/api.ts`** — rewrote `apiFetch`: no token → redirect to `/embed`
  (instead of sending empty Bearer → 401); on 401/403 clear token + re-run SSO.
- **`src/lib/utils/session.ts`** (NEW) — decode `tlp_token` JWT client-side for
  display + expiry checks (`getSession`, `sessionDisplayName`, `getToken`). The
  auth model is location-scoped GHL SSO, **not** Supabase — payload has
  `{ location, name, timezone, software, calendar, push* }`, no email/avatar.
- **`src/lib/utils/stringUtils.ts`** — added `formatDateTime` / `formatTime`:
  null/empty/unparseable → `—` (or custom fallback) instead of "Invalid Date".
- **`src/lib/components/UserSetting/UserSetting.svelte`** — was reading dead
  Supabase `$userSession.user.user_metadata.first_name/last_name` → rendered
  "undefined undefined" for name/avatar. Now reads the JWT session
  (`sessionDisplayName` = practice name → location). Logout now clears `tlp_token`
  and returns to `/embed` (was calling Supabase `userService.logoutUser()`).
- **`src/lib/components/Avatar/Avatar.svelte`** — `name[0]` threw / showed
  "undefined" on empty name; now `(name?.[0] ?? '?').toUpperCase()`.
- **`src/routes/(admin)/+page.svelte`** (Dashboard) — practice name / timezone now
  have fallbacks (`name || location || 'Unnamed practice'`, `timezone || '—'`).
  See §3 for the backend gap behind timezone/sync-status.
- **`src/routes/(admin)/practice/config/+page.svelte`** (Client Config) — card
  title was `config.name`, but `/configs` returns `{ location, config }` with **no
  name** → "undefined". Now `config.name || config.config?.Software || location`.
  Added empty state.
- **`src/routes/(admin)/practice/config/[slug]/+page.svelte`** — same undefined
  title on the edit page; fallback added (h2 + toast).
- **`src/routes/(admin)/profile/+page.svelte`** — was a bare "User Profile Stub"
  heading; now renders the real session (practice, location, software, timezone,
  calendar, session expiry).
- **`src/routes/(admin)/sync/controls/+page.{ts,svelte}`** — **field-name bug**:
  page read `row.updated_by` / `row.updated_at` (snake_case) but the Drizzle
  backend returns **camelCase** `updatedBy` / `updatedAt` → "—" and "Invalid Date"
  on every row. Now reads `updatedBy ?? updated_by` and `formatDateTime(updatedAt ?? updated_at)`.
  Live feed time now uses `formatTime`.
- **`src/routes/(admin)/sync/+page.svelte`**, **`events`**, **`conflicts`**,
  **`dead-letter`** — all date cells switched to `formatDateTime(...)` to kill any
  "Invalid Date" on null timestamps (and tolerate camel/snake field names).
- **`src/routes/(admin)/practice/[location]/+page.svelte`** — Last Sync now uses
  `formatDateTime(practice.lastSync, 'Never synced')`.
- **`src/routes/(admin)/server/monitor/+page.svelte`** — added loading/error/empty
  states + per-container stats failures no longer blank the page + safe
  `memory_stats?.usage` deref + page heading.

---

## 3. Needs a BACKEND change and/or deploy (owner)

1. **Dashboard Practice Overview — timezone "undefined" & Sync Status "Never".**
   `app/src/modules/admin/controller.ts:getDashboard` `perPracticeSummary` returns
   only `{ name, location, software, patientCount, appointmentCount }`. It does
   **not** include `timezone` or any `lastSync`. The frontend now shows `—` instead
   of "undefined", but to show real values the backend must add `timezone`
   (available on the AccessToken doc) and a `lastSync` (e.g. latest sync_event /
   last appointment sync time) to each summary row. **Frontend already reads
   `practice.timezone` and `practice.lastSync` — just populate them.**

2. **Monitor 500.** Wrap `app/src/modules/monitor/controller.ts` handlers in
   try/catch → JSON 503 when the Docker socket is absent. Separately decide whether
   container monitoring belongs in the `tlp-admin` deployment at all (no socket in
   the backend container today).

3. **Client Config has no practice name.** `/configs` and `/config/:location`
   (`config` module) return `{ location, config }` only. If a human-readable
   practice name is wanted on the Client Config cards/edit page, the backend should
   join the AccessToken `name` into the config payload. Frontend currently falls
   back to Software → location.

4. **Deploy.** These are frontend-only changes to the `tlp-admin` Coolify app
   (uuid `lwsgoc0gosc4oc40soo4cggc`). Redeploy `tlp-admin` after the owner pushes.
   No backend redeploy required for the frontend fixes; items 1–3 above are backend
   follow-ups.

---

## 4. Build result

`pnpm build` (apps/admin): **✓ built in ~18s**, adapter-node, no errors.

---

## 5. Known issues NOT fixed (and why)

- **Real timezone / sync-status / config name** — require backend payload changes
  (see §3); out of scope (read-only backend) and would need a backend deploy.
- **Monitor actually listing containers** — requires Docker socket + backend
  error-handling change; environment decision for the owner.
- **`src/lib/services/supabase.ts` + `userstore.ts` (Supabase remnants)** — left in
  place. They are dead under the GHL-SSO model but other files (`sign-in`,
  `sign-up`, `welcome`, `profile/options`) may still import them; ripping out the
  whole Supabase auth layer is a larger refactor that deserves its own phase + QC
  rather than a drive-by here. UserSetting (the one embedded-path consumer causing
  the visible "undefined") was migrated off it.
- **`sign-in` / `sign-up` / `welcome` routes** — legacy standalone-auth screens, not
  used in the GHL-embedded flow; not audited/fixed in this pass.
