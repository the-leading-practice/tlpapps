/**
 * SAFETY guard — automation-suppression tests (no network, no live GHL).
 *
 * Proves synced GHL CONTACT writes carry the suppression tag (merged + deduped) and the
 * flag-gated DND backstop, in dry/verify/on-equivalent paths, while APPOINTMENT bodies
 * stay untouched. All http is mocked; default config touches no network.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ghlWrite } from '../../src/modules/sync/writers/ghl.js';
import { dispatchWrite } from '../../src/modules/sync/writers/dispatch.js';
import { applyContactSuppression, resolveSuppressTag } from '../../src/modules/sync/suppression.js';
import { translateTLPtoGHL } from '../../src/modules/integration/utils.js';
import type { AttemptResult } from '../../src/modules/sync/writers/shared.js';

/** Mock http that records the parsed JSON body of each call and returns 200. */
function captureHttp() {
  const bodies: any[] = [];
  const fn = async (_url: string, options: RequestInit): Promise<AttemptResult> => {
    bodies.push(options.body ? JSON.parse(options.body as string) : undefined);
    return { status: 200, data: { ok: true } };
  };
  return { fn, bodies };
}

// (a) engine contact create body includes "Existing Patient" merged with pre-existing tags, deduped.
test('engine contact create: suppress tag merged with existing tags, deduped', async () => {
  const { fn, bodies } = captureHttp();
  await ghlWrite(
    { eventId: 'ev-a', entity: 'contact', verb: 'create', token: 't', body: { tags: ['VIP'] } },
    fn,
    { delayFactor: 0 },
  );
  assert.deepEqual(bodies[0].tags, ['VIP', 'Existing Patient', 'tlp-sync:ghl:ev-a']);

  // dedupe: pre-existing suppress tag is not duplicated
  const dup = captureHttp();
  await ghlWrite(
    {
      eventId: 'ev-a2',
      entity: 'contact',
      verb: 'create',
      token: 't',
      body: { tags: ['Existing Patient', 'VIP'] },
    },
    dup.fn,
    { delayFactor: 0 },
  );
  assert.deepEqual(dup.bodies[0].tags, ['Existing Patient', 'VIP', 'tlp-sync:ghl:ev-a2']);
});

// engine contact upsert with NO pre-existing tags still gets the suppress tag.
test('engine contact create: tag injected when body has no tags array', async () => {
  const { fn, bodies } = captureHttp();
  await ghlWrite(
    { eventId: 'ev-a3', entity: 'contact', verb: 'create', token: 't', body: { firstName: 'X' } },
    fn,
    { delayFactor: 0 },
  );
  assert.deepEqual(bodies[0].tags, ['Existing Patient', 'tlp-sync:ghl:ev-a3']);
});

// (b) DND backstop: flag on => dnd:true on engine contact; legacy translator dnd:false when off.
test('DND backstop: engine contact dnd:true when GHL_SUPPRESS_AUTOMATION on', async () => {
  const prev = process.env.GHL_SUPPRESS_AUTOMATION;
  process.env.GHL_SUPPRESS_AUTOMATION = 'true';
  try {
    const { fn, bodies } = captureHttp();
    await ghlWrite(
      { eventId: 'ev-b', entity: 'contact', verb: 'create', token: 't', body: { tags: [] } },
      fn,
      { delayFactor: 0 },
    );
    assert.equal(bodies[0].dnd, true);
  } finally {
    if (prev === undefined) delete process.env.GHL_SUPPRESS_AUTOMATION;
    else process.env.GHL_SUPPRESS_AUTOMATION = prev;
  }
});

test('DND backstop: legacy translateTLPtoGHL dnd:false when flag off', async () => {
  const prev = process.env.GHL_SUPPRESS_AUTOMATION;
  process.env.GHL_SUPPRESS_AUTOMATION = 'false';
  try {
    const contact = translateTLPtoGHL(
      { firstName: 'A', lastName: 'B', patientId: 1 } as any,
      'loc1',
    );
    assert.equal(contact.dnd, false);
    assert.ok(contact.tags?.includes('Existing Patient'));
  } finally {
    if (prev === undefined) delete process.env.GHL_SUPPRESS_AUTOMATION;
    else process.env.GHL_SUPPRESS_AUTOMATION = prev;
  }
});

test('DND backstop: legacy translateTLPtoGHL dnd:true when flag on', async () => {
  const prev = process.env.GHL_SUPPRESS_AUTOMATION;
  process.env.GHL_SUPPRESS_AUTOMATION = 'true';
  try {
    const contact = translateTLPtoGHL(
      { firstName: 'A', lastName: 'B', patientId: 1 } as any,
      'loc1',
    );
    assert.equal(contact.dnd, true);
  } finally {
    if (prev === undefined) delete process.env.GHL_SUPPRESS_AUTOMATION;
    else process.env.GHL_SUPPRESS_AUTOMATION = prev;
  }
});

// (c) Tag appears in the VERIFY-mode captured envelope body (not just on mode).
test('verify mode: suppress tag present in captured sink envelope body', async () => {
  const sink = captureHttp();
  await dispatchWrite(
    {
      eventId: 'ev-c',
      target: 'ghl',
      entity: 'contact',
      verb: 'create',
      body: { tags: ['VIP'] },
    },
    { mode: 'verify', ghlHttp: sink.fn, retryDelayFactor: 0 },
  );
  // sink envelope wraps the would-be GHL body under wouldHaveSent.body
  const envelope = sink.bodies[0];
  assert.deepEqual(envelope.wouldHaveSent.body.tags, ['VIP', 'Existing Patient', 'tlp-sync:ghl:ev-c']);
});

// (d) Appointment bodies are unchanged — no suppress tag, no dnd injection.
test('appointment body unchanged: no suppress tag, no dnd', async () => {
  const prev = process.env.GHL_SUPPRESS_AUTOMATION;
  process.env.GHL_SUPPRESS_AUTOMATION = 'true';
  try {
    const { fn, bodies } = captureHttp();
    await ghlWrite(
      {
        eventId: 'ev-d',
        entity: 'appointment',
        verb: 'create',
        token: 't',
        body: { toNotify: false, calendarId: 'cal1' },
      },
      fn,
      { delayFactor: 0 },
    );
    assert.equal(bodies[0].tags, undefined);
    assert.equal(bodies[0].dnd, undefined);
    assert.equal(bodies[0].toNotify, false);
  } finally {
    if (prev === undefined) delete process.env.GHL_SUPPRESS_AUTOMATION;
    else process.env.GHL_SUPPRESS_AUTOMATION = prev;
  }
});

// Unit: helper merge/dnd semantics directly.
test('applyContactSuppression: merges/dedupes tags and respects flag', () => {
  const on = applyContactSuppression({ tags: ['VIP'] }, undefined, {
    GHL_SUPPRESS_AUTOMATION: 'true',
  } as any);
  assert.deepEqual(on.tags, ['VIP', 'Existing Patient']);
  assert.equal(on.dnd, true);

  const off = applyContactSuppression({ tags: ['VIP'], dnd: false }, undefined, {
    GHL_SUPPRESS_AUTOMATION: 'false',
  } as any);
  assert.deepEqual(off.tags, ['VIP', 'Existing Patient']);
  assert.equal(off.dnd, false);
});

// resolvedTag param wins over env literal (account's exact spelling used).
test('applyContactSuppression: resolvedTag overrides env literal', () => {
  const out = applyContactSuppression({ tags: ['VIP'] }, 'Existing Patients', {
    GHL_SUPPRESS_AUTOMATION: 'true',
    GHL_SUPPRESS_TAG: 'Existing Patient',
  } as any);
  assert.deepEqual(out.tags, ['VIP', 'Existing Patients']);
});

// ── resolveSuppressTag — per-location tag spelling resolver ───────────────────
test('resolveSuppressTag: exact match returns stored spelling, matched true', () => {
  const r = resolveSuppressTag(['VIP', 'Existing Patient'], 'Existing Patient');
  assert.deepEqual(r, { tag: 'Existing Patient', matched: true });
});

test('resolveSuppressTag: case-insensitive match returns account exact spelling', () => {
  const r = resolveSuppressTag(['Existing Patient'], 'existing patient');
  assert.deepEqual(r, { tag: 'Existing Patient', matched: true });
});

test('resolveSuppressTag: trim-insensitive match (trailing space in stored tag)', () => {
  const r = resolveSuppressTag(['Existing Patient '], 'Existing Patient');
  assert.deepEqual(r, { tag: 'Existing Patient ', matched: true });
});

test('resolveSuppressTag: plural mismatch falls back, matched false', () => {
  const r = resolveSuppressTag(['Existing Patients'], 'Existing Patient');
  assert.deepEqual(r, { tag: 'Existing Patient', matched: false });
});

test('resolveSuppressTag: empty location tag list falls back to configured literal', () => {
  const r = resolveSuppressTag([], 'Existing Patient');
  assert.deepEqual(r, { tag: 'Existing Patient', matched: false });
});
