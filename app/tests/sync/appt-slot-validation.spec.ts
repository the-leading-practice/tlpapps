/**
 * Regression: DrChrono -> GHL appointment MIRROR writes must bypass GHL free-slot
 * validation. Our availability sync writes block-slots for DrChrono breaks; without
 * `ignoreFreeSlotValidation: true` GHL rejects the mirrored appointment with
 * 400 "The slot you have selected is no longer available."
 */
process.env.DATABASE_URL ||= 'postgres://sentinel/sentinel';

import test from 'node:test';
import assert from 'node:assert/strict';

import { integrationService, appointmentGHLService } from '../../src/modules/integration/services.js';

type Captured = { url: string; body: Record<string, unknown> };

function stubFetch(): { calls: Captured[]; restore: () => void } {
  const calls: Captured[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, opts: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(opts.body ?? '{}')) });
    return {
      status: 200,
      text: async () => JSON.stringify({ id: 'ghl-appt-1' }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const tlpAppt = {
  contactId: 'c1',
  startTime: '2026-08-11T14:00:00-04:00',
  status: 'confirmed',
  apptId: '20260811_378790343',
  locationId: 'loc1',
  calendarId: 'cal1',
  ghlApptId: 'ghl-appt-1',
};

test('integrationService.createAppointment sends ignoreFreeSlotValidation: true', async () => {
  const { calls, restore } = stubFetch();
  try {
    await integrationService.createAppointment({ ...tlpAppt }, 'tok');
  } finally {
    restore();
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.ignoreFreeSlotValidation, true);
  assert.equal(calls[0].body.calendarId, 'cal1');
});

test('integrationService.updateAppointment sends ignoreFreeSlotValidation: true', async () => {
  const { calls, restore } = stubFetch();
  try {
    await integrationService.updateAppointment({ ...tlpAppt }, 'tok');
  } finally {
    restore();
  }
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/calendars/events/appointments/ghl-appt-1'));
  assert.equal(calls[0].body.ignoreFreeSlotValidation, true);
});

test('raw appointment service keeps slot validation unless opted in (manual booking path)', async () => {
  const { calls, restore } = stubFetch();
  try {
    await appointmentGHLService.createAppointment(
      { calendarId: 'cal1', locationId: 'loc1', contactId: 'c1', startTime: 's' },
      'tok',
    );
  } finally {
    restore();
  }
  assert.equal(calls[0].body.ignoreFreeSlotValidation, undefined);
});
