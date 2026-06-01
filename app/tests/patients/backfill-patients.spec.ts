/**
 * P05 T01 — backfill arg parsing + external-id derivation unit tests (no DB, no Mongo).
 *
 * Proves: flags parse with safe defaults; deriveExternalIds maps the legacy Mongo
 * id fields to the correct `patient_external_ids` system rows and skips absent/blank
 * ones. These are the pure cores of the backfill — importing them must NOT open any
 * database connection.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, deriveExternalIds } from '../../scripts/backfill-patients.js';

test('parseArgs: safe defaults', () => {
  const a = parseArgs([]);
  assert.equal(a.dryRun, false);
  assert.equal(a.batchSize, 500);
  assert.equal(a.cursorFile, '.cache/backfill-patients-cursor');
  assert.equal(a.resetCursor, false);
});

test('parseArgs: flags parse', () => {
  const a = parseArgs(['--dry-run', '--batch-size', '1000', '--cursor-file', './x', '--reset-cursor']);
  assert.equal(a.dryRun, true);
  assert.equal(a.batchSize, 1000);
  assert.equal(a.cursorFile, './x');
  assert.equal(a.resetCursor, true);
});

test('parseArgs: invalid batch-size falls back to 500', () => {
  assert.equal(parseArgs(['--batch-size', 'nope']).batchSize, 500);
  assert.equal(parseArgs(['--batch-size', '-5']).batchSize, 500);
});

test('deriveExternalIds: ghl contactId only (current model)', () => {
  const rows = deriveExternalIds({ locationId: 'l', patientId: 1, contactId: 'ghl-abc' });
  assert.deepEqual(rows, [{ system: 'ghl', externalId: 'ghl-abc' }]);
});

test('deriveExternalIds: all three systems when present', () => {
  const rows = deriveExternalIds({
    contactId: 'ghl-1',
    drchronoPatientId: 555,
    embodiId: 'emb-9',
  });
  assert.deepEqual(rows, [
    { system: 'ghl', externalId: 'ghl-1' },
    { system: 'drchrono', externalId: '555' },
    { system: 'embodi', externalId: 'emb-9' },
  ]);
});

test('deriveExternalIds: skips null/undefined/blank fields', () => {
  const rows = deriveExternalIds({
    contactId: '',
    drchronoPatientId: null,
    embodiId: undefined,
  });
  assert.deepEqual(rows, []);
});

test('deriveExternalIds: trims whitespace', () => {
  const rows = deriveExternalIds({ contactId: '  c-1  ' });
  assert.deepEqual(rows, [{ system: 'ghl', externalId: 'c-1' }]);
});
