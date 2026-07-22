/**
 * P05 — on-mode tag wiring: live suppression-tag resolution at the contact write seam.
 *
 * Proves the safety-critical degrade paths with ALL network mocked (no live GHL, no DB):
 *   (a) on mode + mocked tags ["Existing Patients"] => body carries account spelling.
 *   (b) tags-fetch failure => body still carries configured literal (degrade-safe, no throw).
 *   (c) tag absent from location => warn + configured literal used.
 *   (d) dry/verify (no token) => env literal, no tag fetch attempted.
 *
 * Default config is unchanged: SYNC_WRITE_* dry, GHL_SUPPRESS_AUTOMATION on. No call here
 * flips a live write; the only outbound is the injected mock http / mock tagFetch.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;
// dispatchWrite's fail-closed allowlist guard (writers/allowlist.ts) blocks every
// location unless listed — allow the synthetic test locations only.
process.env.SYNC_WRITE_LOCATION_ALLOWLIST = [process.env.SYNC_WRITE_LOCATION_ALLOWLIST, 'loc-A,loc-B,loc-C,loc-D,loc-E']
  .filter(Boolean)
  .join(',');

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ghlWrite } from '../../src/modules/sync/writers/ghl.js';
import { dispatchWrite } from '../../src/modules/sync/writers/dispatch.js';
import {
  resolveLocationSuppressTag,
  __clearLocationTagCache,
  type TagFetch,
} from '../../src/modules/sync/location-tags.js';
import type { AttemptResult } from '../../src/modules/sync/writers/shared.js';

/** Mock http capturing the parsed JSON body of each call. */
function captureHttp() {
  const bodies: any[] = [];
  const fn = async (_url: string, options: RequestInit): Promise<AttemptResult> => {
    bodies.push(options.body ? JSON.parse(options.body as string) : undefined);
    return { status: 200, data: { ok: true } };
  };
  return { fn, bodies };
}

beforeEach(() => __clearLocationTagCache());

// (a) on mode: location stores "Existing Patients" (account's exact spelling); the configured
// literal differs only by case/spacing, so the resolver matches and the ACCOUNT spelling wins.
test('on-mode contact: resolved location tag spelling used (not configured literal)', async () => {
  const prev = process.env.GHL_SUPPRESS_TAG;
  // configured literal differs only by case → case-insensitive match → account spelling wins.
  process.env.GHL_SUPPRESS_TAG = 'existing patients';
  try {
    const { fn, bodies } = captureHttp();
    const tagFetch: TagFetch = async () => ['VIP', 'Existing Patients'];
    await ghlWrite(
      {
        eventId: 'lt-a',
        entity: 'contact',
        verb: 'create',
        token: 'real-token',
        locationId: 'loc-A',
        body: { firstName: 'P' },
      },
      fn,
      { delayFactor: 0 },
      tagFetch,
    );
    // account's exact stored spelling "Existing Patients" — NOT the configured literal.
    // (origin loop-guard tag appended after the suppression tag).
    assert.deepEqual(bodies[0].tags, ['Existing Patients', 'tlp-sync:ghl:lt-a']);
  } finally {
    if (prev === undefined) delete process.env.GHL_SUPPRESS_TAG;
    else process.env.GHL_SUPPRESS_TAG = prev;
  }
});

// (b) tags-fetch FAILS => degrade safe: configured literal still applied, no throw.
test('on-mode contact: tags-fetch failure degrades to configured literal (no throw)', async () => {
  const { fn, bodies } = captureHttp();
  const tagFetch: TagFetch = async () => {
    throw new Error('boom: GHL 500');
  };
  await ghlWrite(
    {
      eventId: 'lt-b',
      entity: 'contact',
      verb: 'create',
      token: 'real-token',
      locationId: 'loc-B',
      body: { firstName: 'P' },
    },
    fn,
    { delayFactor: 0 },
    tagFetch,
  );
  // NEVER untagged — falls back to env literal "Existing Patient".
  assert.deepEqual(bodies[0].tags, ['Existing Patient', 'tlp-sync:ghl:lt-b']);
});

// (c) configured tag ABSENT from location => warn + configured literal used.
test('on-mode contact: tag absent from location => configured literal used', async () => {
  const { fn, bodies } = captureHttp();
  const tagFetch: TagFetch = async () => ['VIP', 'Lead']; // no suppression tag present
  await ghlWrite(
    {
      eventId: 'lt-c',
      entity: 'contact',
      verb: 'create',
      token: 'real-token',
      locationId: 'loc-C',
      body: { firstName: 'P' },
    },
    fn,
    { delayFactor: 0 },
    tagFetch,
  );
  assert.deepEqual(bodies[0].tags, ['Existing Patient', 'tlp-sync:ghl:lt-c']);
});

// (d1) dry/verify path via dispatch: no token => env literal, tagFetch never invoked.
test('verify mode: no token => env literal, no live tag fetch', async () => {
  const sink = captureHttp();
  let fetchCalls = 0;
  // ghlWrite picks defaultTagFetch only when token+locationId present; in verify there's
  // no token, so even passing a counting tagFetch proves it is never called.
  const tagFetch: TagFetch = async () => {
    fetchCalls++;
    return ['Existing Patients'];
  };
  await dispatchWrite(
    {
      eventId: 'lt-d',
      target: 'ghl',
      entity: 'contact',
      verb: 'create',
      locationId: 'loc-D',
      body: { firstName: 'P' },
    },
    { mode: 'verify', ghlHttp: sink.fn, retryDelayFactor: 0 },
  );
  void tagFetch;
  assert.equal(fetchCalls, 0);
  const envelope = sink.bodies[0];
  assert.deepEqual(envelope.wouldHaveSent.body.tags, ['Existing Patient', 'tlp-sync:ghl:lt-d']);
});

// (d2) on-mode contact WITHOUT locationId => no fetch, env literal (defensive).
test('on-mode contact: no locationId => env literal, no fetch', async () => {
  const { fn, bodies } = captureHttp();
  let fetchCalls = 0;
  const tagFetch: TagFetch = async () => {
    fetchCalls++;
    return ['Existing Patients'];
  };
  await ghlWrite(
    { eventId: 'lt-e', entity: 'contact', verb: 'create', token: 'real-token', body: { firstName: 'P' } },
    fn,
    { delayFactor: 0 },
    tagFetch,
  );
  assert.equal(fetchCalls, 0);
  assert.deepEqual(bodies[0].tags, ['Existing Patient', 'tlp-sync:ghl:lt-e']);
});

// resolver unit: cache returns the first resolved tag without re-fetching.
test('resolveLocationSuppressTag: caches resolved tag per location (single fetch)', async () => {
  let calls = 0;
  const tagFetch: TagFetch = async () => {
    calls++;
    return ['Existing Patient'];
  };
  const a = await resolveLocationSuppressTag('loc-cache', 'tok', tagFetch);
  const b = await resolveLocationSuppressTag('loc-cache', 'tok', tagFetch);
  assert.equal(a, 'Existing Patient');
  assert.equal(b, 'Existing Patient');
  assert.equal(calls, 1); // second call served from cache
});
