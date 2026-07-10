/**
 * DrChrono → GHL availability (blocked-time) sync — fail-closed guard matrix.
 *
 * Mirrors tests/drchrono/legacy-path-safety.spec.ts: injectable deps + a fetch/
 * createBlock spy, no module mocking, no live Mongo/GHL/Postgres.
 *
 * Guard matrix (createBlock spy = the GHL write):
 *   mode=off/dry/verify                         → createBlock NOT called
 *   mode=on + allowlisted + mapped provider     → createBlock called w/ mapped ghlUserId + break times
 *   mode=on + provider NOT in map               → createBlock NOT called (no-op)
 *   mode=on + non-allowlisted / absent ghlLoc   → createBlock NOT called (fail-closed)
 *   non-break appointments                      → ignored
 *   stale cleanup                               → deleteBlock attempted for orphaned mapping
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncAvailabilityForLocation,
  type AvailabilityStore,
  type AvailabilityRecord,
  type AvailabilityDeps,
} from '../../src/modules/sync/availability.js';
import type { WriteMode } from '../../src/modules/sync/writers/dispatch.js';
import type { DrChronoAppointment, DrChronoConfigLocation } from '../../src/modules/drchrono/types.js';
import { formatTime } from '../../src/modules/integration/utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_ID = 4242;
const GHL_USER = 'GHL_USER_MAPPED';

function makeLocation(overrides: Partial<DrChronoConfigLocation> = {}): DrChronoConfigLocation {
  return {
    name: 'Test Clinic',
    doctorId: PROVIDER_ID,
    accessToken: 'dc',
    refreshToken: 'dc-r',
    tokenExpiry: Date.now() + 3_600_000,
    tlpLocation: 'TLP_LOC_01',
    tlpToken: 'tok',
    tlpJwt: 'jwt',
    tlpCalendarId: 'cal1',
    ghlLocationId: 'DEMO_LOC_TEST',
    timezone: 'America/Chicago',
    providerAvailabilityMap: { [String(PROVIDER_ID)]: { ghlUserId: GHL_USER, calendarIds: ['cal1'] } },
    ...overrides,
  };
}

function breakAppt(id: number, doctor: number = PROVIDER_ID): DrChronoAppointment {
  return {
    id,
    patient: null as unknown as number,
    doctor,
    office: 1,
    scheduled_time: '2026-07-01T09:00:00',
    duration: 30,
    status: '',
    exam_room: 0,
    notes: '',
    appt_is_break: true,
    reason: 'Vacation',
  };
}

function normalAppt(id: number): DrChronoAppointment {
  return { ...breakAppt(id), appt_is_break: false, patient: 55, reason: 'Adjustment' };
}

function makeCreateBlockSpy(status = 200) {
  let calls = 0;
  let lastBlock: any;
  const fn = async (block: any, _jwt: string) => {
    calls++;
    lastBlock = block;
    return { status, data: { id: `ghl-block-${calls}` } };
  };
  return { fn, get calls() { return calls; }, get lastBlock() { return lastBlock; } };
}

function makeDeleteBlockSpy(status = 200) {
  let calls = 0;
  const deleted: string[] = [];
  const fn = async (eventId: string, _jwt: string) => {
    calls++;
    deleted.push(eventId);
    return { status, data: { ok: true } };
  };
  return { fn, get calls() { return calls; }, deleted };
}

/** In-memory store keyed by `${loc}:${breakId}`. */
function makeStore(seed: AvailabilityRecord[] = []): AvailabilityStore & { all(): AvailabilityRecord[] } {
  const map = new Map<string, AvailabilityRecord>();
  for (const r of seed) map.set(`${r.ghlLocationId}:${r.drchronoBreakId}`, r);
  return {
    async listByLocation(loc) {
      return [...map.values()].filter((r) => r.ghlLocationId === loc);
    },
    async getByBreakId(loc, id) {
      return map.get(`${loc}:${id}`) ?? null;
    },
    async upsert(rec) {
      map.set(`${rec.ghlLocationId}:${rec.drchronoBreakId}`, rec);
    },
    async remove(loc, id) {
      map.delete(`${loc}:${id}`);
    },
    all() {
      return [...map.values()];
    },
  };
}

function baseDeps(opts: {
  mode: WriteMode;
  allowlist?: boolean;
  appts: DrChronoAppointment[];
  createSpy: ReturnType<typeof makeCreateBlockSpy>;
  deleteSpy?: ReturnType<typeof makeDeleteBlockSpy>;
  store?: AvailabilityStore;
}): AvailabilityDeps {
  return {
    getMode: () => opts.mode,
    checkAllowlist: () => opts.allowlist ?? true,
    getAppointments: async () => opts.appts,
    createBlock: opts.createSpy.fn as any,
    deleteBlock: (opts.deleteSpy ?? makeDeleteBlockSpy()).fn as any,
    store: opts.store ?? makeStore(),
    mintToken: (async () => ({ token: 'jwt', ghlAccessToken: 'ghl' })) as any,
  };
}

// ---------------------------------------------------------------------------
// off / dry / verify — no write
// ---------------------------------------------------------------------------

describe('availability: off/dry/verify never write', () => {
  for (const mode of ['off', 'dry', 'verify'] as WriteMode[]) {
    test(`mode=${mode} → createBlock NOT called`, async () => {
      const createSpy = makeCreateBlockSpy();
      const res = await syncAvailabilityForLocation(
        makeLocation(),
        baseDeps({ mode, appts: [breakAppt(1)], createSpy }),
      );
      assert.equal(createSpy.calls, 0, `mode=${mode}: no GHL write`);
      assert.equal(res.reason, `mode-${mode}`);
    });
  }
});

// ---------------------------------------------------------------------------
// on — happy path + no-op gates
// ---------------------------------------------------------------------------

describe('availability: mode=on write paths', () => {
  test('allowlisted + mapped provider → createBlock with mapped ghlUserId + break times', async () => {
    const createSpy = makeCreateBlockSpy();
    const res = await syncAvailabilityForLocation(
      makeLocation(),
      baseDeps({ mode: 'on', allowlist: true, appts: [breakAppt(1)], createSpy }),
    );
    assert.equal(createSpy.calls, 1, 'exactly one block created');
    assert.equal(createSpy.lastBlock.assignedUserId, GHL_USER);
    // DrChrono scheduled_time is naive practice-local; the engine must apply the
    // location's tz offset (formatTime) before sending to GHL, else the block is
    // shifted by the UTC offset and misses the real break window.
    const expectedStart = formatTime('2026-07-01T09:00:00', 'America/Chicago');
    assert.equal(createSpy.lastBlock.startTime, expectedStart);
    assert.notEqual(createSpy.lastBlock.startTime, '2026-07-01T09:00:00', 'must NOT pass naive time through raw');
    assert.equal(createSpy.lastBlock.locationId, 'DEMO_LOC_TEST');
    // 30-min break → +30min end, computed from the tz-corrected start.
    assert.equal(createSpy.lastBlock.endTime, new Date(new Date(expectedStart).getTime() + 30 * 60_000).toISOString());
    assert.equal(res.created, 1);
  });

  test('provider NOT in providerAvailabilityMap → no createBlock (no-op)', async () => {
    const createSpy = makeCreateBlockSpy();
    const res = await syncAvailabilityForLocation(
      makeLocation(),
      baseDeps({ mode: 'on', allowlist: true, appts: [breakAppt(1, 9999)], createSpy }),
    );
    assert.equal(createSpy.calls, 0, 'unmapped provider: no write');
    assert.equal(res.created, 0);
    assert.equal(res.unmappedProviders, 1);
  });

  test('empty providerAvailabilityMap → whole-location no-op', async () => {
    const createSpy = makeCreateBlockSpy();
    const res = await syncAvailabilityForLocation(
      makeLocation({ providerAvailabilityMap: {} }),
      baseDeps({ mode: 'on', allowlist: true, appts: [breakAppt(1)], createSpy }),
    );
    assert.equal(createSpy.calls, 0);
    assert.equal(res.reason, 'no-provider-map');
  });

  test('non-allowlisted ghlLocationId → no createBlock (fail-closed)', async () => {
    const createSpy = makeCreateBlockSpy();
    const res = await syncAvailabilityForLocation(
      makeLocation(),
      baseDeps({ mode: 'on', allowlist: false, appts: [breakAppt(1)], createSpy }),
    );
    assert.equal(createSpy.calls, 0);
    assert.equal(res.reason, 'allowlist-blocked');
  });

  test('absent ghlLocationId → no createBlock (fail-closed)', async () => {
    const createSpy = makeCreateBlockSpy();
    const res = await syncAvailabilityForLocation(
      makeLocation({ ghlLocationId: undefined }),
      baseDeps({ mode: 'on', allowlist: true, appts: [breakAppt(1)], createSpy }),
    );
    assert.equal(createSpy.calls, 0);
    assert.equal(res.reason, 'allowlist-blocked');
  });

  test('non-break appointments are ignored', async () => {
    const createSpy = makeCreateBlockSpy();
    const res = await syncAvailabilityForLocation(
      makeLocation(),
      baseDeps({ mode: 'on', allowlist: true, appts: [normalAppt(1), normalAppt(2)], createSpy }),
    );
    assert.equal(createSpy.calls, 0, 'no breaks → no writes');
    assert.equal(res.intended, 0);
  });

  test('dedup — existing mapping skips re-create', async () => {
    const createSpy = makeCreateBlockSpy();
    const store = makeStore([
      { ghlLocationId: 'DEMO_LOC_TEST', drchronoBreakId: '1', ghlBlockId: 'ghl-block-existing', ghlUserId: GHL_USER },
    ]);
    const res = await syncAvailabilityForLocation(
      makeLocation(),
      baseDeps({ mode: 'on', allowlist: true, appts: [breakAppt(1)], createSpy, store }),
    );
    assert.equal(createSpy.calls, 0, 'already-synced break: no re-create');
    assert.equal(res.skippedExisting, 1);
  });
});

// ---------------------------------------------------------------------------
// stale cleanup
// ---------------------------------------------------------------------------

describe('availability: stale cleanup', () => {
  test('previously-synced block whose source break is gone → deleteBlock attempted', async () => {
    const createSpy = makeCreateBlockSpy();
    const deleteSpy = makeDeleteBlockSpy();
    const store = makeStore([
      { ghlLocationId: 'DEMO_LOC_TEST', drchronoBreakId: '777', ghlBlockId: 'ghl-block-stale', ghlUserId: GHL_USER },
    ]);
    // Current DrChrono breaks no longer include break 777.
    const res = await syncAvailabilityForLocation(
      makeLocation(),
      baseDeps({ mode: 'on', allowlist: true, appts: [breakAppt(1)], createSpy, deleteSpy, store }),
    );
    assert.equal(deleteSpy.calls, 1, 'orphaned block deleted');
    assert.deepEqual(deleteSpy.deleted, ['ghl-block-stale']);
    assert.equal(res.deleted, 1);
    // The still-live break 1 was created.
    assert.equal(createSpy.calls, 1);
    // Store no longer holds the stale mapping.
    assert.ok(!store.all().some((r) => r.drchronoBreakId === '777'));
  });
});
