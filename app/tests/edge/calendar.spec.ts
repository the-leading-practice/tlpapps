/**
 * EDGE-04 T02 — Nyquist coverage for EMOD-02 + EMOD-04 (mocked fetch, no live Edge calls).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
process.env.TOKEN_KEY = process.env.TOKEN_KEY || 'test-tlp-jwt-key-32bytes-padXXXX';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function mockResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return {
    status,
    text: async () => body,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Response;
}

const ctx = { edgeBusinessId: 'biz-1', token: 'olx_test_token', calendarId: 'cal-9', locationId: 'loc-1' };

test('EMOD-02: createBooking maps start/end/provider/patient and POSTs /api/bookings', async () => {
  const { createBooking } = await import('../../src/modules/edge/calendar.js');

  let calledUrl = '';
  let calledMethod = '';
  let calledBody: unknown = null;
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    calledBody = JSON.parse(opts.body as string);
    return mockResponse(200, JSON.stringify({ id: 'b1' }));
  };

  const result = await createBooking(
    ctx,
    { start: '2026-07-10T14:00:00Z', end: '2026-07-10T14:30:00Z', contactId: 'c1', appointmentType: 'consult' },
    { fetchImpl: mockFetch as unknown as typeof fetch },
  );

  assert.ok(calledUrl.endsWith('/api/bookings'));
  assert.equal(calledMethod, 'POST');
  assert.deepEqual(calledBody, {
    start: '2026-07-10T14:00:00Z',
    end: '2026-07-10T14:30:00Z',
    calendar_id: 'cal-9',
    contact_id: 'c1',
    appointment_type: 'consult',
  });
  assert.equal(result.status, 200);
});

test('EMOD-02: updateBooking PUTs /api/bookings/{id}', async () => {
  const { updateBooking } = await import('../../src/modules/edge/calendar.js');

  let calledUrl = '';
  let calledMethod = '';
  let calledBody: unknown = null;
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    calledBody = JSON.parse(opts.body as string);
    return mockResponse(200, JSON.stringify({ id: 'b1' }));
  };

  const result = await updateBooking(ctx, 'b1', { start: '2026-07-10T15:00:00Z' }, { fetchImpl: mockFetch as unknown as typeof fetch });

  assert.ok(calledUrl.endsWith('/api/bookings/b1'));
  assert.equal(calledMethod, 'PUT');
  assert.deepEqual(calledBody, { start: '2026-07-10T15:00:00Z', calendar_id: 'cal-9' });
  assert.equal(result.status, 200);
});

test('EMOD-02: cancelBooking DELETEs /api/bookings/{id}', async () => {
  const { cancelBooking } = await import('../../src/modules/edge/calendar.js');

  let calledUrl = '';
  let calledMethod = '';
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    return mockResponse(200, JSON.stringify({ id: 'b1', cancelled: true }));
  };

  const result = await cancelBooking(ctx, 'b1', { fetchImpl: mockFetch as unknown as typeof fetch });

  assert.ok(calledUrl.endsWith('/api/bookings/b1'));
  assert.equal(calledMethod, 'DELETE');
  assert.equal(result.status, 200);
});

test('EMOD-02: a 409 conflict from Edge is surfaced verbatim, not swallowed', async () => {
  const { createBooking } = await import('../../src/modules/edge/calendar.js');

  const mockFetch = async () => mockResponse(409, JSON.stringify({ error: 'booking_conflict' }));

  const result = await createBooking(
    ctx,
    { start: '2026-07-10T14:00:00Z', end: '2026-07-10T14:30:00Z', contactId: 'c1' },
    { fetchImpl: mockFetch as unknown as typeof fetch },
  );

  assert.equal(result.status, 409);
  assert.deepEqual(result.data, { error: 'booking_conflict' });
});

test('EMOD-04: calendar.ts source imports no modules/sync', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const srcPath = path.resolve(__dirname, '../../src/modules/edge/calendar.ts');
  const source = fs.readFileSync(srcPath, 'utf-8');
  assert.doesNotMatch(source, /from ['"][.][.]\/(sync|[.][.]\/sync)/);
  assert.doesNotMatch(source, /import[^\n]*modules\/sync/);
});
