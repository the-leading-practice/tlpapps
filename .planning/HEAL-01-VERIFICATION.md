# HEAL-01 Verification — self-heal invariant layer

**Verified:** 2026-06-25
**Verifier:** independent (gsd-verifier, adversarial)
**Scope:** `app/src/modules/sync/invariants.ts` + alerts/config/index/routes/openapi wiring
**Ship verdict:** **SHIP-WITH-NOTES**

Healthcare-data backend. Goal-backward: layer must observe-only, ship dark, never mutate
EHR/GHL/sync data, never require write creds. All 8 checks evaluated by reading code, not
SUMMARY claims.

---

## Check results

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | READ-ONLY (no EHR/GHL write, SELECT-only DB, only GET out) | **PARTIAL** | see below |
| 2 | Default-OFF / dark, independent of RUN_CRON | **PASS** | |
| 3 | No live-write creds / SYNC_WRITE_* arming | **PASS** | |
| 4 | Fault isolation (one throw ≠ stop others) | **PASS** | |
| 5 | I1 DND-regression logic correct + bounded | **PASS** | |
| 6 | Reuses real FORBIDDEN/allowlist constants (no drift) | **PASS** | |
| 7 | GET /api/sync/invariants auth-gated | **PASS** | |
| 8 | `tsc --noEmit` exit 0 | **PASS** | |

---

### 1. READ-ONLY — PARTIAL (the one real defect)

`invariants.ts` itself is clean: I6/I7 do `db.select({count})` only; no
INSERT/UPDATE/DELETE/upsert; no GHL/DrChrono POST/PUT/PATCH/DELETE. The only outbound
call in the module is GHL `GET /contacts/` (`invariants.ts:302`, method `'GET'`).

**BUT I1 is not strictly read-only.** I1 → `getLocationAccessToken(locationId)`
(`invariants.ts:80`), and that helper performs WRITES:
- `location-token.ts:88` — `ghlTokenService.renewAuthToken(...)` = OAuth **POST** to GHL
  token endpoint (not a GET).
- `location-token.ts:99` — `accessTokenService.updateToken(...)` = **DB UPDATE** on the
  identity token row (re-encrypted rotated refresh token persisted).

So running an invariant pass mutates the identity token table and triggers an OAuth
refresh for each allowlisted location. The code/comment claim "READ-ONLY … only GET
/contacts is called" (`invariants.ts:5,58`) is literally inaccurate.

**Why this is a NOTE, not a BLOCK:**
- The write is token rotation only — NOT patient/appointment/EHR data, NOT sync-state
  (events/conflicts/dead-letter) tables.
- It is bounded to the effective allowlist. `buildAllowlist` strips the 5
  `FORBIDDEN_LOCATION_IDS` and fails closed (null/empty ⇒ no reads). Per project memory
  the live allowlist is demo-only (`wP3Ynm3Z63rIC4zVAgXP`); the 5 real practices are never
  touched by I1.
- Token rotation is the same side-effect that already happens on every login; benign.

**Recommendation (non-blocking):** correct the "READ-ONLY / only GET" wording to
"read-only w.r.t. EHR/GHL/sync data; obtaining a read credential rotates+persists the
location's OAuth token via existing identity services." Optionally cache-only (skip the
`updateToken` persist) inside the invariant path if a truly side-effect-free pass is
desired.

### 2. Default-OFF / dark — PASS
`config.selfheal.runInvariants = process.env.RUN_INVARIANTS === 'on'` (`config.ts:45`).
`initInvariantsCron` returns immediately when false (`invariants.ts:341-343`). It runs on
its own `setInterval` (`invariants.ts:355`), wired separately from `startEngine`/RUN_CRON
in `index.ts:34`. Merge is behavior-neutral until the flag flips. Confirmed.

### 3. No live-write creds — PASS
Layer never reads SYNC_WRITE_* to enable anything. I2 (`invariants.ts:132`) and I9
(`:218-219`) READ `SYNC_WRITE_*` env only to *inspect posture* (assert reverse leg not
`on`, allowlist clean) — inverse of arming. No write path is enabled by this module.

### 4. Fault isolation — PASS
`runInvariants` wraps each `inv.check()` in try/catch (`invariants.ts:250-263`); a throw
becomes `ok:false detail:"check threw: ..."`, fires its own alert, loop continues. One
failing invariant cannot stop the rest. Confirmed.

### 5. I1 DND-regression correctness — PASS
Counts contacts with tag `api` (lowercased) AND `dnd === true` (`invariants.ts:322-325`).
Violation only when `offenders.length > 0 && !suppressOn` where
`suppressOn = config.ghl.suppressAutomation === true` (`:72,106`) — i.e. fires only when a
synced (`api`) contact carries `dnd:true` while `GHL_SUPPRESS_AUTOMATION !== 'true'`. That
matches the real DND incident (synced contacts should not be DND unless suppression is
intentionally on). Logic is NOT inverted — no false positive when suppression is on.
Bounded: single page, `limit = i1MaxContacts` (default 100, `:297`), one GET per
allowlisted location per pass at 15-min cadence — will not hammer GHL. Known limitation
(single-page sample can miss offenders beyond page 1) is acceptable and bounded.

### 6. Real constants, no drift — PASS
Imports `FORBIDDEN_LOCATION_IDS` and `buildAllowlist` from `./writers/allowlist.js`
(`invariants.ts:24-27`). I1 uses `buildAllowlist` (`:67`), I2 uses `FORBIDDEN_LOCATION_IDS`
(`:134`), I3 asserts `FORBIDDEN_LOCATION_IDS.size` (`:152`). No duplicated/literal ID list
in the module. Confirmed.

### 7. Auth-gating — PASS
`server.ts:84`: `app.use('/api', authToken, syncRoutes)`. `GET /sync/invariants`
(`routes.ts:24`) sits behind `authToken` — not public. Confirmed.

### 8. Build — PASS
`cd app && npx tsc --noEmit` → exit 0.

---

## Verdict: SHIP-WITH-NOTES

Layer is dark by default, fault-isolated, uses the real safety constants, auth-gated, and
mutates no patient/EHR/sync data. Build green. The single deviation: I1's read credential
acquisition rotates+persists the location OAuth token (DB UPDATE + OAuth POST), so the
strict "READ-ONLY / only GET" claim is overstated — but the side-effect is benign, bounded
to the (demo-only) allowlist, and never reaches the 5 forbidden real practices. Safe to
ship; fix the wording (and optionally make the I1 token path persist-free) in follow-up.

No BLOCKER. No write path to EHR/GHL patient data or sync state exists.
