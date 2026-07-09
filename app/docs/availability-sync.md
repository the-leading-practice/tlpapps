# DrChrono → GHL Availability (Blocked-Time) Sync

Mirrors DrChrono blocked/break time into GHL as **block-slots** so times a provider
is unavailable in DrChrono (vacation, lunch, admin blocks) disappear from GHL online
booking — including Conversation AI slot offers. DrChrono is the scheduling source of
truth; this closes the gap where its blocked time never reached GHL.

> **Ships OFF.** Default `SYNC_WRITE_AVAILABILITY=off` and no `providerAvailabilityMap`
> configured → the sync is a no-op end to end. It cannot write to any live practice
> until an operator both enables the kill switch for an allowlisted location **and**
> supplies the provider→GHL-user map.

## Flow

1. **Source** — DrChrono appointments in the existing poll window (yesterday →
   `LookAheadDays`), filtered to `appt_is_break === true`. Those are the blocks to mirror.
2. **Provider → GHL mapping** — per-location `drChronoConfig.locations[].providerAvailabilityMap`:

   ```jsonc
   {
     // key = DrChrono provider/doctor id (the `doctor` field on the break record)
     "4242": { "ghlUserId": "GHL_USER_ID", "calendarIds": ["ghlCalendarId1"] }
   }
   ```

   A break for a mapped provider creates a GHL block-slot assigned to that provider's
   `ghlUserId`. A break whose provider is **not** in the map → skipped (no-op). An
   empty/absent map → the whole location is a no-op.
3. **Write** — for each mapped break, POST a GHL block-slot
   (`/calendars/events/block-slots`) with `locationId` (GHL), `assignedUserId`
   (`ghlUserId`), and the break's `startTime`/`endTime` (`duration` mins, default 60).
4. **Idempotency** — each created block is persisted in Postgres
   (`availability_blocks`, unique on `ghl_location_id + drchrono_break_id`). Re-runs skip
   breaks that already have a block.
5. **Stale cleanup** — on every run, any persisted block whose source DrChrono break no
   longer exists is **deleted** from GHL (`DELETE /calendars/events/:id`) and the mapping
   row removed — so a cancelled vacation reopens GHL availability. A 404 on delete is
   treated as already-gone (mapping removed).

## Kill switch & gating (fail-closed)

| Guard | Behavior |
|-------|----------|
| `SYNC_WRITE_AVAILABILITY` | `off` (default) → no-op · `dry`/`verify` → log intent, **no write** · `on` → write. Any unknown/absent value → `off`. |
| Write allowlist (`SYNC_WRITE_LOCATION_ALLOWLIST`) | Location's `ghlLocationId` must be present and allowlisted. Absent/not-allowlisted → **skip** (fail-closed). Forbidden real-practice IDs are hard-blocked. |
| `providerAvailabilityMap` | Unmapped provider → skip that break. Empty/absent map → whole-location no-op. |

All three must pass before any GHL write. This mirrors the fail-closed pattern of the
patients/appointments writers (`writeModeForEntity` + `isLocationAllowed`).

## Triggers

- **On-demand:** `POST /api/sync/availability` (auth required, like other `/api/sync`
  routes) → runs `runAvailabilitySync()` across all locations and returns per-location
  results (`created`, `deleted`, `intended`, `skippedExisting`, `unmappedProviders`,
  `reason`).
- **Cron:** runs after `runFullPoll` inside the DrChrono poll cron, only when
  `RUN_CRON=on`. Does not auto-run on boot. Behavior-neutral until the kill switch is on.

## Env / config knobs

| Knob | Where | Default | Purpose |
|------|-------|---------|---------|
| `SYNC_WRITE_AVAILABILITY` | env (Coolify) | `off` | Availability kill switch (`off`/`dry`/`verify`/`on`). |
| `SYNC_WRITE_LOCATION_ALLOWLIST` | env | empty (deny-all) | Allowlisted GHL location ids (shared with other writers). |
| `RUN_CRON` | env | `off` | Gates the cron trigger. |
| `providerAvailabilityMap` | `drChronoConfig.locations[]` (Mongo) | absent | DrChrono provider id → `{ ghlUserId, calendarIds }`. |

## What an operator must supply before go-live

1. **Therapists as GHL users** — each DrChrono provider that takes blocked time must
   exist as a GHL user; capture their GHL `userId`.
2. **`providerAvailabilityMap`** on each location in `drChronoConfig`, keyed by the
   DrChrono provider/doctor id, mapping to that user's `ghlUserId` (+ the relevant
   `calendarIds`).
3. **Allowlist** the location's `ghlLocationId` in `SYNC_WRITE_LOCATION_ALLOWLIST`
   (start with the GHL demo location for verification).
4. Flip `SYNC_WRITE_AVAILABILITY` `off → dry`/`verify` to confirm intended blocks in
   logs, then `→ on`.

## Storage

`availability_blocks` (Drizzle, migration `0005_availability_blocks.sql`): DrChrono
break → GHL block-slot map for dedup + stale reaping. PG greenfield, behavior-neutral
until the sync writes.
