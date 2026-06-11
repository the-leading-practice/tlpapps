/**
 * LEAK-1 / LEAK-2 guard tests — legacy drchrono sendPatients / sendAppointments
 * path must fail-closed on verify, and appointments must NEVER write in any mode.
 *
 * Guard matrix:
 *   sendAppointments mode=on       → fetch NOT called (WR-06 block)
 *   sendAppointments mode=verify   → fetch NOT called (verify is no-write)
 *   sendPatients     mode=verify   → fetch NOT called (verify is no-write)
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

/** Build a fetch spy that records calls. */
function makeFetchSpy(status = 200) {
  let calls = 0;
  const fn = async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    calls++;
    return {
      status,
      json: async () => ({ ok: true }),
      text: async () => 'ok',
      statusText: 'OK',
    } as unknown as Response;
  };
  return { fn, get calls() { return calls; } };
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
  });
}

// ---------------------------------------------------------------------------
// sendAppointments — must NEVER issue a live write in any mode
// ---------------------------------------------------------------------------

describe('LEAK-1: sendAppointments never writes in any mode', () => {
  test('sendAppointments mode=on → fetch NOT called (WR-06 block)', async () => {
    const spy = makeFetchSpy();
    const client = buildClient({ modeAppointments: 'on', fetchSpy: spy });

    const result = await client.sendAppointments(
      makeAppointments(),
      makeHeaders('GHL_TEST_ALLOWED_LOC') as any,
    );

    assert.equal(spy.calls, 0,
      'sendAppointments mode=on: fetch must NOT be called (WR-06 block)');
    assert.equal((result.data as any).reason, 'appt-wr06-blocked');
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
