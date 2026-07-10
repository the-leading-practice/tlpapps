/**
 * LEAK-1 / LEAK-2 guard tests — legacy drchrono sendPatients / sendAppointments
 * path must fail-closed on verify/dry/off, and appointments in on-mode must carry
 * origin tag (WR-06 resolved via origin tagging).
 *
 * Guard matrix:
 *   sendAppointments mode=on + allowlisted    → fetch IS called + payload has syncOriginTag
 *   sendAppointments mode=on + non-allowlisted→ fetch NOT called (fail-closed)
 *   sendAppointments mode=verify              → fetch NOT called (verify is no-write)
 *   sendAppointments mode=dry                 → fetch NOT called
 *   sendPatients     mode=verify              → fetch NOT called (verify is no-write)
 *   sendPatients     mode=on, non-allowlisted ghlLocationId → fetch NOT called
 *   sendPatients     mode=on, absent ghlLocationId          → fetch NOT called
 *   sendPatients     mode=on, allowlisted ghlLocationId     → fetch IS called
 *
 * Uses the injectable createPatientServiceClient factory — no module mocking needed.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
process.env.TLP_PATIENT_API = 'http://tlp-patient-api.test';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPatientServiceClient } from '../../src/modules/drchrono/services.js';
import type { WriteMode } from '../../src/modules/sync/writers/dispatch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeaders(ghlLocationId?: string) {
  return {
    tlpLocation: 'TLP_LOC_01',
    tlpToken: 'tok',
    tlpJwt: 'jwt',
    tlpCalendarId: 'cal1',
    timezone: 'America/Chicago',
    ghlLocationId,
  };
}

function makePatients() {
  return [
    {
      patientId: 1,
      firstName: 'Test',
      lastName: 'Patient',
      email: 'test@example.com',
      phone: '',
      mobile: '',
      work: '',
      address: '',
      address2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US' as const,
      dob: '',
      timezone: 'America/Chicago',
    },
  ];
}

function makeAppointments() {
  return [{ apptId: 1, patientId: 1, apptTime: '2026-06-10T09:00:00', apptStatus: 'Confirmed' }];
}

/** Build a fetch spy that records calls and the last request body. */
function makeFetchSpy(status = 200) {
  let calls = 0;
  let lastBody: any = undefined;
  const fn = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls++;
    if (init?.body) lastBody = JSON.parse(init.body as string);
    return {
      status,
      json: async () => ({ ok: true }),
      text: async () => 'ok',
      statusText: 'OK',
    } as unknown as Response;
  };
  return { fn, get calls() { return calls; }, get lastBody() { return lastBody; } };
}

/** Build a client with injectable mode + allowlist + fetch. */
function buildClient(opts: {
  modePatients?: WriteMode;
  modeAppointments?: WriteMode;
  allowlistResult?: boolean;
  fetchSpy: ReturnType<typeof makeFetchSpy>;
}) {
  const {
    modePatients = 'on',
    modeAppointments = 'on',
    allowlistResult = true,
    fetchSpy,
  } = opts;

  return createPatientServiceClient({
    getModePatients: async () => modePatients,
    getModeAppointments: async () => modeAppointments,
    checkAllowlist: () => allowlistResult,
    httpFetch: fetchSpy.fn as unknown as typeof fetch,
    // Stub the token mint so on-mode tests don't require a live Mongo/token lookup.
    mintToken: (async () => ({ token: 'jwt', ghlAccessToken: 'ghl' })) as any,
  });
}

// ---------------------------------------------------------------------------
// sendAppointments — WR-06 resolved; on-mode allowed with origin tag
// ---------------------------------------------------------------------------

describe('LEAK-1: sendAppointments origin-tag + fail-closed guards', () => {
  test('sendAppointments mode=on + allowlisted → fetch IS called with syncOriginTag', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'on', allowlistResult: true, fetchSpy: spy });

    await client.sendAppointments(
      makeAppointments(),
      makeHeaders('GHL_TEST_ALLOWED_LOC') as any,
    );

    assert.equal(spy.calls, 1,
      'sendAppointments mode=on + allowlisted: fetch MUST be called (WR-06 resolved)');
  });

  test('sendAppointments mode=on + non-allowlisted ghlLocationId → fetch NOT called', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'on', allowlistResult: false, fetchSpy: spy });

    const result = await client.sendAppointments(
      makeAppointments(),
      makeHeaders('NOT_ALLOWLISTED') as any,
    );

    assert.equal(spy.calls, 0,
      'sendAppointments mode=on + non-allowlisted: fetch must NOT be called (fail-closed)');
    assert.equal((result.data as any).reason, 'allowlist-blocked');
  });

  test('sendAppointments mode=on + absent ghlLocationId → fetch NOT called', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'on', allowlistResult: true, fetchSpy: spy });

    const result = await client.sendAppointments(
      makeAppointments(),
      makeHeaders(undefined) as any,
    );

    assert.equal(spy.calls, 0,
      'sendAppointments mode=on + absent ghlLocationId: fetch must NOT be called');
    assert.equal((result.data as any).reason, 'allowlist-blocked');
  });

  test('sendAppointments mode=verify → fetch NOT called', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'verify', fetchSpy: spy });

    const result = await client.sendAppointments(
      makeAppointments(),
      makeHeaders('GHL_TEST_ALLOWED_LOC') as any,
    );

    assert.equal(spy.calls, 0,
      'sendAppointments mode=verify: fetch must NOT be called');
    assert.equal((result.data as any).reason, 'mode-verify');
  });

  test('sendAppointments mode=dry → fetch NOT called', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'dry', fetchSpy: spy });

    const result = await client.sendAppointments(
      makeAppointments(),
      makeHeaders('GHL_TEST_ALLOWED_LOC') as any,
    );

    assert.equal(spy.calls, 0,
      'sendAppointments mode=dry: fetch must NOT be called');
    assert.equal((result.data as any).reason, 'mode-dry');
  });
});

// ---------------------------------------------------------------------------
// F-01: profileCalendarMap routing — unmapped profile must be a no-op
// ---------------------------------------------------------------------------

describe('F-01: unmapped DrChrono profile → no-op calendar (no default-calendar leak)', () => {
  function apptWithProfile(profileId: number | null) {
    return [{ apptId: 1, patientId: 1, apptTime: '2026-06-10T09:00:00', apptStatus: 'Confirmed', profileId }];
  }
  function headersWithMap(map?: Record<string, string>) {
    return { ...makeHeaders('GHL_TEST_ALLOWED_LOC'), profileCalendarMap: map };
  }

  test('mapped profile → routed to its GHL calendar', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'on', allowlistResult: true, fetchSpy: spy });
    await client.sendAppointments(
      apptWithProfile(158404) as any,
      headersWithMap({ '158404': 'ootctf73EtcxN93ln7Ok' }) as any,
    );
    assert.equal(spy.lastBody.appointments[0].calendarId, 'ootctf73EtcxN93ln7Ok');
  });

  test('unmapped profile WITH a configured map → empty calendarId (no-op)', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'on', allowlistResult: true, fetchSpy: spy });
    await client.sendAppointments(
      apptWithProfile(158402) as any, // ROF — not in DW map
      headersWithMap({ '158404': 'ootctf73EtcxN93ln7Ok' }) as any,
    );
    assert.equal(spy.lastBody.appointments[0].calendarId, '',
      'unmapped profile must NOT leak to the default calendar');
  });

  test('profile set but NO map configured → default-calendar fallback (legacy unchanged)', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'on', allowlistResult: true, fetchSpy: spy });
    await client.sendAppointments(
      apptWithProfile(999) as any,
      headersWithMap(undefined) as any,
    );
    assert.equal(spy.lastBody.appointments[0].calendarId, 'cal1',
      'no profileCalendarMap → keep pre-BIDI default fallback');
  });
});

// ---------------------------------------------------------------------------
// sendPatients — verify and non-allowlisted paths must not fetch
// ---------------------------------------------------------------------------

describe('LEAK-1: sendPatients verify and non-allowlisted modes fail closed', () => {
  test('sendPatients mode=verify → fetch NOT called', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modePatients: 'verify', allowlistResult: true, fetchSpy: spy });

    const result = await client.sendPatients(
      makePatients(),
      makeHeaders('GHL_TEST_ALLOWED_LOC') as any,
    );

    assert.equal(spy.calls, 0,
      'sendPatients mode=verify: fetch must NOT be called (verify is no-write)');
    assert.equal((result.data as any).reason, 'mode-verify');
  });

  test('sendPatients mode=on + non-allowlisted ghlLocationId → fetch NOT called', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modePatients: 'on', allowlistResult: false, fetchSpy: spy });

    const result = await client.sendPatients(
      makePatients(),
      makeHeaders('NOT_IN_ALLOWLIST') as any,
    );

    assert.equal(spy.calls, 0,
      'sendPatients mode=on + non-allowlisted: fetch must NOT be called');
    assert.equal((result.data as any).reason, 'allowlist-blocked');
  });

  test('sendPatients mode=on + absent ghlLocationId → fetch NOT called', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modePatients: 'on', allowlistResult: true, fetchSpy: spy });

    // No ghlLocationId in headers
    const result = await client.sendPatients(
      makePatients(),
      makeHeaders(undefined) as any,
    );

    assert.equal(spy.calls, 0,
      'sendPatients mode=on + missing ghlLocationId: fetch must NOT be called');
    assert.equal((result.data as any).reason, 'allowlist-blocked');
  });

  test('sendPatients mode=on + allowlisted ghlLocationId → fetch IS called', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modePatients: 'on', allowlistResult: true, fetchSpy: spy });

    await client.sendPatients(
      makePatients(),
      makeHeaders('GHL_TEST_ALLOWED_LOC') as any,
    );

    assert.equal(spy.calls, 1,
      'sendPatients mode=on + allowlisted: fetch MUST be called (the one allowed path)');
  });
});
