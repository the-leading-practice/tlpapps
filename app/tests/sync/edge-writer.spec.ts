/**
 * EDGE-06 Plan 02 — edge-map.ts + edge.ts unit tests.
 *
 * Mappers are pure (no mocking needed). edgeWrite is tested with injected wrapper fns
 * so NO network occurs — mirrors tests/sync/writers.spec.ts's mockHttp pattern but at
 * the wrapper-function level (createContact/updateContact/createBooking/etc.), since
 * edge.ts calls typed wrapper fns rather than a raw HttpFn.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapPatientToEdgeContact, mapAppointmentToEdgeBooking } from '../../src/modules/sync/writers/edge-map.js';
import { edgeWrite } from '../../src/modules/sync/writers/edge.js';
import type { EdgeCtx } from '../../src/modules/edge/types.js';

const ctx: EdgeCtx = { edgeBusinessId: 'biz_demo', token: 'tok_demo', calendarId: 'cal_demo' };

// ---------------------------------------------------------------------------
// edge-map.ts
// ---------------------------------------------------------------------------

describe('mapPatientToEdgeContact', () => {
  test('strips clinical fields — only allowlisted keys present', () => {
    const patient = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '555-1234',
      tags: ['vip'],
      // clinical-shaped keys that must NEVER cross the boundary
      diagnosis: 'hypertension',
      notes: 'patient reports chest pain',
      chart: { allergies: ['penicillin'] },
    } as any;
    const contact = mapPatientToEdgeContact(patient);
    assert.equal((contact as any).diagnosis, undefined);
    assert.equal((contact as any).notes, undefined);
    assert.equal((contact as any).chart, undefined);
    assert.equal(contact.firstName, 'Jane');
    assert.equal(contact.email, 'jane@example.com');
    assert.equal(contact.phone, '555-1234');
    assert.ok(contact.tags?.includes('vip'));
  });

  test('always includes the suppression-tag analog in tags', () => {
    const contact = mapPatientToEdgeContact({ firstName: 'A' });
    assert.ok(contact.tags?.includes('Existing Patient'));
  });

  test('ESYNC-04: opportunityStage remapped to lifecycleStage when provided, else dropped', () => {
    const remapped = mapPatientToEdgeContact(
      { firstName: 'A', opportunityStage: 'qualified' } as any,
      { lifecycleStage: 'lead' },
    );
    assert.equal(remapped.lifecycleStage, 'lead');

    const dropped = mapPatientToEdgeContact({ firstName: 'A', opportunityStage: 'qualified' } as any);
    assert.equal(dropped.lifecycleStage, undefined);
  });

  test('ESYNC-04: customFields never appear on the mapped output (dropped, logged)', () => {
    const contact = mapPatientToEdgeContact({
      firstName: 'A',
      customFields: { insuranceId: 'XYZ123' },
    } as any);
    assert.equal((contact as any).customFields, undefined);
    assert.equal((contact as any).insuranceId, undefined);
  });
});

describe('mapAppointmentToEdgeBooking', () => {
  test('outputs start/end/contactId(+appointmentType); never a notes field', () => {
    const booking = mapAppointmentToEdgeBooking({
      start: '2026-08-01T10:00:00Z',
      end: '2026-08-01T10:30:00Z',
      contactId: 'contact_1',
      appointmentType: 'checkup',
      notes: 'confidential clinical note',
    } as any);
    assert.equal(booking.start, '2026-08-01T10:00:00Z');
    assert.equal(booking.end, '2026-08-01T10:30:00Z');
    assert.equal(booking.contactId, 'contact_1');
    assert.equal(booking.appointmentType, 'checkup');
    assert.equal((booking as any).notes, undefined);
  });
});

// ---------------------------------------------------------------------------
// edge.ts — edgeWrite
// ---------------------------------------------------------------------------

describe('edgeWrite routing (mocked wrappers, zero network)', () => {
  test('create contact -> createContact called once', async () => {
    let calls = 0;
    const res = await edgeWrite(
      { eventId: 'e1', entity: 'contact', verb: 'create', ctx, body: { firstName: 'A' } },
      {
        createContact: async () => {
          calls++;
          return { status: 200, data: { id: 'c1' } };
        },
        retryDelayFactor: 0,
      },
    );
    assert.equal(calls, 1);
    assert.equal(res.status, 200);
  });

  test('update contact -> updateContact(id) called once', async () => {
    let seenId: string | undefined;
    await edgeWrite(
      { eventId: 'e2', entity: 'contact', verb: 'update', id: 'c1', ctx, body: { firstName: 'A' } },
      {
        updateContact: async (_ctx, id) => {
          seenId = id;
          return { status: 200, data: {} };
        },
        retryDelayFactor: 0,
      },
    );
    assert.equal(seenId, 'c1');
  });

  test('cancel contact -> no-op, no wrapper called', async () => {
    let called = false;
    const res = await edgeWrite(
      { eventId: 'e3', entity: 'contact', verb: 'cancel', id: 'c1', ctx },
      {
        updateContact: async () => {
          called = true;
          return { status: 200, data: {} };
        },
        retryDelayFactor: 0,
      },
    );
    assert.equal(called, false);
    assert.equal(res.status, 200);
  });

  test('create appointment -> createBooking called once', async () => {
    let calls = 0;
    const res = await edgeWrite(
      {
        eventId: 'e4',
        entity: 'appointment',
        verb: 'create',
        ctx,
        body: { start: 's', end: 'e', contactId: 'c1' },
      },
      {
        createBooking: async () => {
          calls++;
          return { status: 200, data: { id: 'b1' } };
        },
        retryDelayFactor: 0,
      },
    );
    assert.equal(calls, 1);
    assert.equal(res.status, 200);
  });

  test('update appointment -> updateBooking(id) called once', async () => {
    let seenId: string | undefined;
    await edgeWrite(
      { eventId: 'e5', entity: 'appointment', verb: 'update', id: 'b1', ctx, body: { start: 's2' } },
      {
        updateBooking: async (_ctx, id) => {
          seenId = id;
          return { status: 200, data: {} };
        },
        retryDelayFactor: 0,
      },
    );
    assert.equal(seenId, 'b1');
  });

  test('cancel appointment -> cancelBooking(id) called once', async () => {
    let seenId: string | undefined;
    await edgeWrite(
      { eventId: 'e6', entity: 'appointment', verb: 'cancel', id: 'b1', ctx },
      {
        cancelBooking: async (_ctx, id) => {
          seenId = id;
          return { status: 200, data: {} };
        },
        retryDelayFactor: 0,
      },
    );
    assert.equal(seenId, 'b1');
  });

  test('500 from wrapper retries via withRetry then dead-letters on exhaustion', async () => {
    let calls = 0;
    await assert.rejects(
      edgeWrite(
        { eventId: 'e7', entity: 'contact', verb: 'create', ctx, body: { firstName: 'A' } },
        {
          createContact: async () => {
            calls++;
            return { status: 500, data: 'boom' };
          },
          retryDelayFactor: 0,
        },
      ),
    );
    // MAX_RETRIES = 3 -> 4 total attempts
    assert.equal(calls, 4);
  });

  test('origin tag injected into contact tags', async () => {
    let capturedTags: string[] | undefined;
    await edgeWrite(
      { eventId: 'e8', entity: 'contact', verb: 'create', ctx, body: { firstName: 'A' } },
      {
        createContact: async (_ctx, input) => {
          capturedTags = input.tags;
          return { status: 200, data: {} };
        },
        retryDelayFactor: 0,
      },
    );
    assert.ok(capturedTags?.some((t) => t.startsWith('tlp-sync:edge:e8')));
  });
});
