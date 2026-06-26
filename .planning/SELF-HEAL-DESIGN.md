# SELF-HEAL / OPS SENTINEL — Architecture Specification

**System:** tlp-services Express monolith (`tlpapps/app`)
**Status:** Design — agreed decisions, not yet built
**Author:** Backend Architect
**Date:** 2026-06-25
**Motivating incident:** the **DND bug** — `GHL_SUPPRESS_AUTOMATION` defaulting ON forced `dnd:true` on every synced contact written into the live GHL location **DW = `2QsifxSEJyjfSPi04UeR`**, muting all SMS/email/calls. It threw **no log error**. The retry/dead-letter/alert machinery never fired because nothing *failed* — the write succeeded and was silently wrong. That class of failure is the primary thing this system must catch.

---

## 0. Grounding — what already exists (reuse, don't rebuild)

| Building block | File | Reuse as |
|---|---|---|
| `/health` (Mongo + PG gated, 503 on degrade) | `app/src/server.ts` | Tier 0 liveness signal for Coolify healthcheck |
| `triggerAlert(type, ctx)` → Telegram (`telegramService`), 10-min per-type dedupe | `app/src/modules/sync/alerts.ts` | The single alert sink for ALL tiers. Add new `AlertType`s. |
| `AlertType` union: `dead_letter \| conflict_queue \| oauth_failure \| loop_detection \| reconciliation_drift` | `alerts.ts` | Extend with `invariant_violation`, `selfheal_action`, `selfheal_escalation` |
| `reapDeadLetters()` (minimal: surfaces `status='failed'` events) | `app/src/modules/sync/engine.ts` | Extend into the Tier-0 bounded auto-replay reaper |
| `MAX_ATTEMPTS` (=5), engine `tick()` loop, leader election | `engine.ts` | Cron host for the invariant pass + auto-replay; exported already |
| `POST /api/sync/events/replay/:id` (202, re-arms an event, no EHR call) | `app/src/modules/sync/routes.ts` | The mechanism Tier-0 auto-replay calls internally |
| `isLocationAllowed()` fail-closed + `FORBIDDEN_LOCATION_IDS` (5 real practices) | `app/src/modules/sync/writers/allowlist.ts` | Source of truth for invariant "writes only hit allowlisted locations" |
| `writeModeForEntity(direction, entity)` (`off/dry/verify/on`) | `app/src/modules/sync/writers/dispatch.ts` | Read by invariants to assert posture matches expectation |
| Tables: `sync_jobs, sync_events, sync_mappings, sync_conflicts, appointment_links, sync_dead_letter, sync_controls, sync_verify_captures` | `app/src/db/pg/schema/sync.ts` | Invariant queries run against these |
| `fetchWithRetries` | `app/src/utils/fetch.ts` | Tier-0 transient retry primitive (already used) |
| Sync runbook | `docs/sync-runbook.md` | The procedure doc the Tier-1 agent reads |

**Known live posture (Coolify app `oksoo4s8c8skwkc4o480o44o`, host `46.224.61.233`):**
`RUN_CRON=off`, `SYNC_WRITE_DRCHRONO_TO_GHL=on`, `SYNC_WRITE_GHL_TO_DRCHRONO=off`, `SYNC_WRITE_LOCATION_ALLOWLIST=wP3Ynm3Z63rIC4zVAgXP,2QsifxSEJyjfSPi04UeR`, `GHL_SUPPRESS_TAG=Existing Patient`.

> ⚠️ **Design flag #1 (important):** the `FORBIDDEN_LOCATION_IDS` allowlist did **not** prevent the DND incident — DW (`2QsifxSEJyjfSPi04UeR`) is an *allowed* live location, and the bug mutated it. So an invariant that only checks "writes hit allowlisted locations" would have passed during the DND bug. The silent-wrong invariants (§3) must assert on the **shape of the data written** (e.g. `dnd` value), not just the destination. This is the core lesson.

---

## 1. Three-tier response model (by blast radius)

```
        signal ──> classify by blast radius
                       │
   ┌───────────────────┼───────────────────────────┐
   ▼                   ▼                            ▼
 TIER 0              TIER 1                       TIER 2
 deterministic       Claude investigates          alert-only,
 auto-remediate      + opens a PR                  human-authorized
 (no LLM, no human)  (never touches prod)          (live data / prod config)
```

### Tier 0 — deterministic auto-remediation (NO LLM, NO human)

Pure code in the app. Bounded, idempotent, self-limiting. Four actions:

1. **Health-fail restart** — *delegate to Coolify.* Do not self-kill. `/health` already returns 503 when Mongo or PG is down; configure the Coolify container healthcheck to hit `/health` and let Coolify restart on sustained 503. No new app code beyond ensuring `/health` stays cheap (it already is: `select 1` + mongoose readyState).

2. **Token re-mint** — on a `401/invalid_token` from GHL/DrChrono during a *read* (the agent and cron only read; see §2), call the existing `mintTokenForLocation` path and retry once via `fetchWithRetries`. Emit `triggerAlert('oauth_failure', …)` only if the re-mint itself fails. (This is exactly the legacy-poll 401 gap already noted in memory.)

3. **Bounded auto-replay reaper** — extend `reapDeadLetters()` in `engine.ts`. New behaviour, every loop pass:
   - Select `sync_dead_letter` rows where `auto_replays < AUTO_REPLAY_CAP` (new column, default **2**) **and** `last_auto_replay_at` older than `AUTO_REPLAY_COOLDOWN` (new, default **30 min**).
   - For each, internally invoke the replay path (same code as `POST /api/sync/events/replay/:id`), increment `auto_replays`, set `last_auto_replay_at = now()`.
   - **Hot-loop guard:** a row that reaches `AUTO_REPLAY_CAP` is left dead and fires `triggerAlert('dead_letter', { eventId, exhausted:true })` exactly once → becomes a Tier-1 signal. The cap + cooldown are what structurally prevent a replay storm.
   - **Posture guard:** auto-replay only re-arms events for the engine; if `SYNC_WRITE_* != on` the replayed event still only dry-runs. Auto-replay never escalates write posture.

4. **Transient retry** — already provided by `fetchWithRetries`; no change beyond ensuring 5xx/timeout (not 4xx) are the retry class.

**New columns** (one migration, `selfheal_0001`): `sync_dead_letter.auto_replays integer not null default 0`, `sync_dead_letter.last_auto_replay_at timestamptz`.

### Tier 1 — Claude Code (headless) investigates + opens a PR

Triggered by a real signal (an invariant violation, an exhausted dead-letter, or an `oauth_failure` that re-mint couldn't fix). The agent:

- Reads logs (read-only), `/health`, sync state via the **read replica / read-only DB role** (§2), the runbook, and the repo.
- Root-causes, writes a fix on a fresh branch `fix/selfheal-<signal>-<date>`, opens a PR via `gh`.
- **Never mutates prod.** Output is a reviewable branch/PR only.
- **Auto-merge** allowed only when: CI green **AND** the diff is **code-only** (no `.env`, no migration touching existing data, no Coolify config, no allowlist/forbidden-id edits) **AND** the rule-13 QC verifier passes. Anything outside that → PR stays open, `triggerAlert('selfheal_escalation', …)`.

### Tier 2 — alert-only, human-authorized

Any condition whose remediation would **mutate live patient/contact data or prod config affecting the 5 real practices**. The DND reversal (writing `dnd:false` back onto live contacts) is the canonical Tier-2 action. Claude may **diagnose and recommend** (draft the maintenance script, compute the blast radius, write the PR for the *code* fix) but **never applies** the live mutation. A human runs the live write, exactly as was done for the DND recovery.

**Classifier rule of thumb:** does fixing it require an HTTP write to `services.leadconnectorhq.com` or `drchrono.com`, or an env/allowlist change on the prod app? → **Tier 2**. Does it only require re-arming an event, restarting, or re-minting a read token? → **Tier 0**. Everything in between (the bug is in our code) → **Tier 1**.

---

## 2. Hard guardrail — agent has READ-ONLY prod + git-write only

**The rule that prevents an autonomous agent from ever repeating the DND mass-mutation.**

Structural enforcement (not policy — wiring):

1. **Separate DB role.** Provision a Postgres role `tlp_selfheal_ro` with `GRANT SELECT` only (ideally pointed at a read replica). The agent's `DATABASE_URL` uses this role. It physically cannot `INSERT/UPDATE/DELETE` — including into `sync_dead_letter` or `sync_controls`. (Tier-0 auto-replay runs **inside the app process** with the normal role; the *agent* never does.)

2. **No SYNC_WRITE creds in the agent env.** The agent process gets **no** `TOKEN_KEY`, no GHL `CLIENT_SECRET`, no DrChrono OAuth secret, and `SYNC_WRITE_DRCHRONO_TO_GHL` / `SYNC_WRITE_GHL_TO_DRCHRONO` are **unset/absent** in its environment. Even if the agent somehow invoked a writer, `writeModeForEntity` reads env → absent → not `on` → no live write. Layered with `isLocationAllowed` fail-closed (empty allowlist → deny all). Three independent gates, all default-deny.

3. **Git write only.** The agent holds a `gh`/git credential scoped to open branches + PRs on `the-leading-practice/tlpapps`. No Coolify API token capable of `deploy`/`env-set` (deploys remain a human/rule-15 delivery-loop step, or a separately-credentialed verifier — never the diagnosing agent).

4. **No prod shell with write.** Log access is read-only (Coolify log API / `docker logs`), not an interactive root shell that could `docker exec … node maintenance.js`.

| Credential | Agent holds? |
|---|---|
| Read-replica `SELECT`-only `DATABASE_URL` | ✅ |
| Read-only log access | ✅ |
| `gh` / git push (branch + PR scope) | ✅ |
| `TOKEN_KEY`, GHL/DrChrono OAuth secrets | ❌ never |
| `SYNC_WRITE_*` env vars | ❌ absent |
| Coolify deploy/env-set token | ❌ never |
| Interactive prod root shell | ❌ never |

---

## 3. Silent-wrong detection — the INVARIANT-CHECK layer

The cron asserts a set of cheap invariants **every pass** (piggybacks the existing `engine.ts` tick loop / leader election). Each invariant = one cheap query that must always hold. Violation → `triggerAlert('invariant_violation', { invariant, detail })` → becomes a Tier-1 signal (or Tier-2 if it implies live data is already wrong). Results persisted to a new `selfheal_invariant_runs` table (timestamp, invariant, passed, observed) for trend/audit.

> The DND bug is invariant **I1** below — had it existed, the bug would have been caught on the first cron pass instead of by a customer noticing muted messages.

### Starter invariant set (10)

| # | Invariant (must always hold) | Table / field checked | Tier on violation |
|---|---|---|---|
| **I1** | No synced contact write carries `dnd:true` unless `GHL_SUPPRESS_AUTOMATION=true`. Assert on the **written payload shape** captured in `sync_verify_captures` (and/or a sampled GHL read of recently-synced contacts), NOT just destination. | `sync_verify_captures.payload->>'dnd'` vs `config.GHL_SUPPRESS_AUTOMATION` | **Tier 2** (live data already wrong) |
| **I2** | Every live write destination is in `SYNC_WRITE_LOCATION_ALLOWLIST` and never in `FORBIDDEN_LOCATION_IDS`. | `sync_events.location_id` of rows with write outcome vs `isLocationAllowed()` | **Tier 2** |
| **I3** | Zero writes (any outcome) ever target the 5 forbidden real-practice IDs. | `sync_events` / `sync_verify_captures` `location_id ∈ FORBIDDEN_LOCATION_IDS` | **Tier 2** (alarm) |
| **I4** | Every synced GHL contact carries the suppression tag (`GHL_SUPPRESS_TAG`, default `Existing Patient`) so owner workflows filter it. | sampled GHL contact read vs `sync_mappings` (kind=`patient`) | **Tier 1** |
| **I5** | Every synced appointment carries an origin tag; `sync_events.origin` is non-null for all processed write events (loop-prevention depends on it). | `sync_events.origin IS NULL AND status='processed'` count = 0 | **Tier 1** |
| **I6** | `sync_dead_letter` total count below threshold (default 25). | `count(sync_dead_letter)` | **Tier 1** |
| **I7** | `sync_conflicts` with `resolution='pending'` is not growing unbounded (delta over 24h below threshold, default +50). | `sync_conflicts` pending count, windowed | **Tier 1** |
| **I8** | No `sync_events` stuck `processing` longer than N minutes (default 15) — detects a hung/leaked event. | `sync_events.status='processing' AND updated_at < now()-15m` | **Tier 0→1** (auto-replay first, then alert) |
| **I9** | Write posture matches the declared baseline: `SYNC_WRITE_GHL_TO_DRCHRONO` is **not** `on` unless an explicit `sync_controls` go-live row says so (guards an accidental env flip arming the reverse leg). | env vs `sync_controls` | **Tier 2** |
| **I10** | Reconciliation drift between DrChrono and GHL appointment counts per allowlisted location below 0.1% (reuses the existing `reconciliation_drift` alert threshold). | `appointment_links` vs source counts | **Tier 1** |

Optional/extended (add as data supports): **I11** no `sync_mappings` row with both ids still `pending:` after 1h (orphaned mapping); **I12** OAuth token for each active location refreshed within its `token_refresh_milliseconds` window (pre-empts `oauth_failure`).

Each invariant is a single indexed query (sub-20ms target). The whole pass is bounded (e.g. ≤12 queries) and runs at the cron cadence, gated by a new `RUN_INVARIANTS=on` flag so it can ship dark and be flipped on independently of `RUN_CRON`.

---

## 4. Trigger bridge — alert → headless Claude run

Keep it minimal. Alerts already webhook out (Telegram). Add the smallest possible bridge:

- **Path A (preferred, least new infra):** `triggerAlert` for the Tier-1-eligible types additionally `POST`s a compact JSON signal (`{ signal, invariant, detail, severity }`) to the **claude-code-cli-gateway** / **remo-code** headless endpoint, which spawns a headless Claude session in a worktree of `tlpapps` with the read-only profile (§2,§5). One new function `dispatchSelfHeal(signal)` called from `alerts.ts`, fire-and-forget, behind a `SELFHEAL_DISPATCH_URL` env (absent → no-op, so it ships dark).
- **Dedupe:** reuse the existing 10-min per-type dedupe in `alerts.ts` so a flapping invariant spawns at most one investigation per window.
- **Tier-2 signals do NOT spawn an applying agent** — they post to Telegram with a `[HUMAN-AUTH REQUIRED]` prefix and (optionally) spawn a *diagnose-only* Claude run that produces a recommendation + draft PR, never a deploy.

No queue, no broker. The alert is the event; the gateway is the runner.

---

## 5. Agent tool-scope contract

**GRANTED:**
- Read-only log access (Coolify log API / `docker logs`, read-only).
- `GET /health`, `GET /api/sync/metrics`, `GET /api/sync/events`, `GET /api/sync/conflicts` (read views).
- Read-replica / `SELECT`-only Postgres (`tlp_selfheal_ro`).
- Repo working tree (worktree of `tlpapps`), `git`, `gh` (branch + PR scope only).
- `docs/sync-runbook.md` and this spec.
- Ability to open/auto-merge a PR **only** on CI-green, code-only diffs (§1 Tier-1 rule).

**DENIED:**
- Any GHL/DrChrono **write** token or OAuth secret; `TOKEN_KEY`.
- `SYNC_WRITE_*` env (absent from its environment).
- DB write (no `INSERT/UPDATE/DELETE`; cannot touch `sync_controls`, `sync_dead_letter`, allowlist).
- Coolify deploy / env-set / container-destroy / restart.
- Editing `allowlist.ts` `FORBIDDEN_LOCATION_IDS`, `.env`, or any data migration in an auto-merged PR (forces human review).
- Interactive prod shell.

---

## 6. Phased roadmap (Tier 0 + invariants first, Tier 2 last)

Milestone CODE prefix: **HEAL**. Each phase independently shippable, ships dark behind a flag, flipped on after its QC gate.

### HEAL-01 — Invariant-check harness (read-only, dark)
- **Goal:** invariant runner on the cron tick, behind `RUN_INVARIANTS=on` (default off). Ships I5, I6, I7, I2, I3 (the pure-PG, no-external-read invariants).
- **Files:** new `app/src/modules/sync/invariants.ts`; wire into `engine.ts` tick; new `selfheal_invariant_runs` table (migration `selfheal_0001`); extend `AlertType` with `invariant_violation` in `alerts.ts`.
- **Success:** with `RUN_INVARIANTS=on` on a dev DB seeded with a forbidden-id write row, I3 fires a Telegram alert; clean DB → all pass, one `selfheal_invariant_runs` row per pass. No write path touched.
- **SAFETY:** read-only queries; behavior-neutral until flag flipped. No EHR calls.

### HEAL-02 — The DND-class invariants (I1, I9, I10)
- **Goal:** the silent-wrong assertions that would have caught the DND bug — payload-shape `dnd` check (I1), posture-baseline (I9), reconciliation drift (I10).
- **Files:** `invariants.ts` (+ read of `sync_verify_captures`); reuse `reconciliation_drift` alert.
- **Success:** synthetic capture row with `dnd:true` while `GHL_SUPPRESS_AUTOMATION=false` → I1 fires **Tier-2-tagged** alert. Posture flip of reverse leg → I9 fires.
- **SAFETY:** still read-only. I1 is the regression test for the actual incident — add a unit test that reproduces the DND payload and asserts I1 catches it.

### HEAL-03 — Tier-0 bounded auto-replay reaper
- **Goal:** extend `reapDeadLetters()` with cap + cooldown auto-replay; add `auto_replays` / `last_auto_replay_at` columns.
- **Files:** `engine.ts`, schema migration `selfheal_0002`, internal reuse of replay path from `routes.ts`.
- **Success:** a dead-letter row auto-replays ≤2× at ≥30-min spacing, then is left dead with a single `dead_letter exhausted:true` alert. Unit test proves no hot-loop (3rd pass does not replay).
- **SAFETY:** replay only re-arms events; with `SYNC_WRITE_*` not `on`, replays dry-run. Cap/cooldown bound the blast radius. No new live write.

### HEAL-04 — Tier-0 token re-mint + transient hardening
- **Goal:** on read-path 401, re-mint via `mintTokenForLocation` + single retry; `oauth_failure` alert only on re-mint failure. Confirm `fetchWithRetries` retries 5xx/timeout only.
- **Files:** legacy-poll read path, `utils/fetch.ts` review.
- **Success:** simulated 401 → one re-mint + success, no alert; persistent 401 → `oauth_failure` alert once.
- **SAFETY:** re-mint scoped to **reads**; no write token introduced.

### HEAL-05 — Read-only agent identity + DB role
- **Goal:** provision `tlp_selfheal_ro` (SELECT-only / replica), define the agent env profile (no `SYNC_WRITE_*`, no `TOKEN_KEY`), `gh` branch+PR-scoped credential.
- **Files:** infra (Coolify/Postgres) + `docs/selfheal-agent-profile.md` documenting the scope contract (§5).
- **Success:** agent profile can `SELECT` sync tables and `git push` a branch, and **provably cannot** `UPDATE sync_dead_letter` (returns permission denied) nor reach an EHR write (no token).
- **SAFETY:** this phase *is* the guardrail — verify the denials explicitly before any agent is wired.

### HEAL-06 — Trigger bridge + Tier-1 diagnose-and-PR
- **Goal:** `dispatchSelfHeal(signal)` in `alerts.ts` behind `SELFHEAL_DISPATCH_URL`; headless Claude run (read-only profile) that root-causes from logs + read replica and opens a `fix/selfheal-*` PR. Auto-merge only on CI-green code-only diff + rule-13 verifier.
- **Files:** `alerts.ts`, gateway runner config, agent prompt/runbook.
- **Success:** firing I6 (dead-letter threshold) on staging spawns one headless run that produces a PR with a plausible fix and a VERIFICATION; non-code-only diff stays open + `selfheal_escalation` alert.
- **SAFETY:** agent runs with HEAL-05 profile; cannot deploy or write prod. Dedupe via existing 10-min window. Ships dark (URL absent → no-op).

### HEAL-07 — Tier-2 alert-only + recommend (no apply)
- **Goal:** classifier routes live-data/prod-config signals (I1, I2, I3, I9) to `[HUMAN-AUTH REQUIRED]` Telegram alerts + an optional diagnose-only run that drafts the recommendation/maintenance script and the code-fix PR — never applies the live mutation.
- **Files:** classifier in `invariants.ts`/`alerts.ts`; runbook section for the human-apply step (mirrors the DND recovery procedure).
- **Success:** a simulated I1 violation produces a human-auth alert + a draft recovery script in a PR, and **no** live write occurs.
- **SAFETY:** the deliberate stopping point — Tier-2 always halts for explicit human authorization (rule-12 destructive/outward-facing bar). This is where the DND-style mass-mutation is structurally impossible for the agent to perform.

### HEAL-08 — Hardening, dashboards, runbook closeout
- **Goal:** `selfheal_invariant_runs` trend view in admin; update `docs/sync-runbook.md` with tier matrix + invariant catalog; tune thresholds from real data; version bump + release per rule 18.
- **Success:** operator can see invariant pass/fail history; runbook documents every tier, signal, and the human-auth Tier-2 procedure.
- **SAFETY:** docs-only + read views; no behavior change.

---

## 7. Open issues / flags for the owner

1. **(flagged in §0/§3)** The forbidden-id allowlist would NOT have caught the DND bug — DW is an *allowed* live location. I1 must assert on written **payload shape**, which requires reliable capture of synced contact writes (`sync_verify_captures`) or a sampled GHL read. Confirm `sync_verify_captures` actually records the `dnd` field on the live `on` direction (drchrono→ghl); if it only captures `verify`-mode sink writes, I1 needs a sampled read-back of recently-synced GHL contacts instead.
2. `reapDeadLetters()` is currently a **stub** (it counts `status='failed'` events; full dead-letter persistence was deferred). HEAL-03 must first make `sync_dead_letter` actually populated, or auto-replay has nothing to act on.
3. Read replica may not exist on the Coolify single-Postgres setup — `tlp_selfheal_ro` as a SELECT-only role on the primary is the pragmatic fallback (still satisfies the no-write guarantee; loses read-load isolation).
4. `RUN_CRON=off` in prod today — the invariant pass needs a cron host. Either flip `RUN_CRON=on` (changes sync behavior) or run invariants on an independent `RUN_INVARIANTS` timer decoupled from the sync loop. **Recommend the latter** so invariants run without arming sync.
