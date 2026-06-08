/**
 * P06 T03 — dual-write-patient pg-primary mode unit tests (no DB, no Mongo).
 *
 * Tests via the exported `writePatientWithDeps` which accepts injectable
 * writers — same no-external-dep pattern as shadow.spec.ts + backfill.spec.ts.
 *
 * Three required behaviours:
 *   (a) PATIENTS_PRIMARY=pg, PG throws → request throws (PG is required).
 *   (b) PATIENTS_PRIMARY=pg, Mongo throws → request succeeds + error logged.
 *   (c) PATIENTS_PRIMARY=mongo (default) → existing mongo-primary path unchanged.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writePatientWithDeps,
  dualWriteCounters,
  type WritePatientArgs,
  type WritePatientDeps,
} from '../../src/modules/patients/helpers/dual-write-patient.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const baseArgs: WritePatientArgs = {
  op: 'upsert',
  locationId: 'loc-1',
  mapping: { patientId: 99, contactId: 'ghl-contact-1' },
};

const fakeDoc = { _id: 'mongo-id-1', locationId: 'loc-1', patientId: 99 };

function makeCounters() {
  return { ...dualWriteCounters };
}

function makeLog() {
  const errors: Array<{ data: Record<string, unknown>; msg: string }> = [];
  const debugs: Array<{ data: Record<string, unknown>; msg: string }> = [];
  const log = {
    error: (data: Record<string, unknown>, msg: string) => errors.push({ data, msg }),
    debug: (data: Record<string, unknown>, msg: string) => debugs.push({ data, msg }),
  };
  return { log, errors, debugs };
}

function pgOk(_args: WritePatientArgs, _mongoId: string | null): Promise<void> {
  return Promise.resolve();
}

function pgFails(_args: WritePatientArgs, _mongoId: string | null): Promise<void> {
  return Promise.reject(new Error('PG connection refused'));
}

function mongoOk(_args: WritePatientArgs): Promise<unknown> {
  return Promise.resolve(fakeDoc);
}

function mongoFails(_args: WritePatientArgs): Promise<unknown> {
  return Promise.reject(new Error('Mongo not connected'));
}

// ── (a) pg-primary: PG throws → request throws ───────────────────────────────

test('pg-primary: PG write throws → writePatientWithDeps rejects (request fails)', async () => {
  const { log } = makeLog();
  const counters = makeCounters();
  const deps: WritePatientDeps = { pgWriter: pgFails, mongoWriter: mongoOk, log, counters };
  await assert.rejects(
    () => writePatientWithDeps(baseArgs, 'pg', false, true, deps),
    /PG connection refused/,
    'should propagate PG error when primary=pg',
  );
});

// ── (b) pg-primary: Mongo throws → request succeeds + error logged ────────────

test('pg-primary: Mongo warm-standby throws → resolves (request succeeds) + error logged', async () => {
  const { log, errors } = makeLog();
  const counters = makeCounters();
  const deps: WritePatientDeps = { pgWriter: pgOk, mongoWriter: mongoFails, log, counters };
  const result = await writePatientWithDeps(baseArgs, 'pg', false, true, deps);
  assert.equal(result, null, 'returns null when Mongo standby fails (PG succeeded)');
  assert.equal(errors.length, 1, 'exactly one error logged');
  assert.ok(
    errors[0].msg.includes('warm-standby failed'),
    `error message should mention warm-standby, got: "${errors[0].msg}"`,
  );
  assert.equal(counters.patients_dual_write_mongo_fail, 1, 'mongo_fail counter incremented');
  assert.equal(counters.patients_dual_write_pg_ok, 1, 'pg_ok counter incremented');
});

test('pg-primary: Mongo warm-standby disabled (legacyWrite=false) → no Mongo call', async () => {
  const { log, errors } = makeLog();
  const counters = makeCounters();
  // mongoFails would throw if called — passing it proves it's never invoked
  const deps: WritePatientDeps = { pgWriter: pgOk, mongoWriter: mongoFails, log, counters };
  const result = await writePatientWithDeps(baseArgs, 'pg', false, false, deps);
  assert.equal(result, null, 'returns null when legacyWrite=off');
  assert.equal(errors.length, 0, 'no errors: Mongo writer never called');
  assert.equal(counters.patients_dual_write_pg_ok, 1, 'pg_ok counter incremented');
});

// ── (c) mongo-primary: existing behaviour preserved ───────────────────────────

test('mongo-primary (default): Mongo write succeeds → returns mongoDoc', async () => {
  const { log, errors } = makeLog();
  const counters = makeCounters();
  const deps: WritePatientDeps = { pgWriter: pgFails, mongoWriter: mongoOk, log, counters };
  // pgFails would throw if called; pgDualWriteEnabled=false ensures it's skipped
  const result = await writePatientWithDeps(baseArgs, 'mongo', false, true, deps);
  assert.deepEqual(result, fakeDoc, 'returns the Mongo document');
  assert.equal(errors.length, 0, 'no errors for successful mongo-primary write');
});

test('mongo-primary: Mongo write throws → rejects', async () => {
  const { log } = makeLog();
  const counters = makeCounters();
  const deps: WritePatientDeps = { pgWriter: pgOk, mongoWriter: mongoFails, log, counters };
  await assert.rejects(
    () => writePatientWithDeps(baseArgs, 'mongo', false, true, deps),
    /Mongo not connected/,
    'should propagate Mongo error when primary=mongo',
  );
});

test('mongo-primary with pgDualWrite: PG shadow failure logs but does not throw', async () => {
  const { log, errors } = makeLog();
  const counters = makeCounters();
  const deps: WritePatientDeps = { pgWriter: pgFails, mongoWriter: mongoOk, log, counters };
  const result = await writePatientWithDeps(baseArgs, 'mongo', true, true, deps);
  assert.deepEqual(result, fakeDoc, 'returns Mongo doc despite PG shadow failure');
  assert.equal(errors.length, 1, 'PG shadow failure logged');
  assert.ok(
    errors[0].msg.includes('PG mirror failed'),
    `error message should mention PG mirror, got: "${errors[0].msg}"`,
  );
  assert.equal(counters.patients_dual_write_pg_fail, 1, 'pg_fail counter incremented');
});
