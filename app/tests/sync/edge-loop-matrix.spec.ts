/**
 * EDGE-08 — 4-system loop-prevention matrix (pure origin-tag logic).
 *
 * Proves the tag-carrier loop guard across EHR (drchrono) / GHL / Edge:
 * a self-authored echo is recognized and (by the engine) would be dropped;
 * a foreign-system echo is NOT misclassified; a genuine human/EHR change
 * (no tlp-sync tag) is never dropped.
 *
 * Scope: the CONTACT / tag-carrier path. Appointment echoes have no carrier
 * on EdgeBookingInput (notes HIPAA-excluded) — tracked in EDGE-08-BLOCKER.md;
 * their inbound writeback stays off/fail-closed until a carrier is resolved,
 * so no loop is possible today regardless.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFor, parse, isSelfAuthored } from '../../src/modules/sync/origin.js';

// A payload as it would arrive on an inbound webhook: the entity carries the
// origin tag in a round-trippable carrier field (`tags` for contacts).
const echoPayload = (system: 'ghl' | 'drchrono' | 'edge', eventId: string) => ({
  id: 'x1',
  tags: ['Existing Patient', tagFor(system, eventId)],
});

test('EHR→Edge write echo is self-authored for edge (engine drops)', () => {
  const p = echoPayload('edge', 'E1');
  assert.equal(isSelfAuthored(p, 'edge'), true);
});

test('edge echo is NOT misclassified as ghl or drchrono (no cross-mirror)', () => {
  const p = echoPayload('edge', 'E1');
  assert.equal(isSelfAuthored(p, 'ghl'), false);
  assert.equal(isSelfAuthored(p, 'drchrono'), false);
  assert.equal(parse(p)?.system, 'edge');
});

test('EHR→GHL write echo is self-authored for ghl, not edge', () => {
  const p = echoPayload('ghl', 'G1');
  assert.equal(isSelfAuthored(p, 'ghl'), true);
  assert.equal(isSelfAuthored(p, 'edge'), false);
  assert.equal(parse(p)?.system, 'ghl');
});

test('Edge→EHR write echo is self-authored for drchrono, not edge', () => {
  const p = echoPayload('drchrono', 'D1');
  assert.equal(isSelfAuthored(p, 'drchrono'), true);
  assert.equal(isSelfAuthored(p, 'edge'), false);
  assert.equal(parse(p)?.system, 'drchrono');
});

test('cross-classification: each system parses to itself, never another', () => {
  assert.equal(parse(echoPayload('ghl', 'G1'))?.system, 'ghl');
  assert.equal(parse(echoPayload('edge', 'E1'))?.system, 'edge');
  assert.equal(parse(echoPayload('drchrono', 'D1'))?.system, 'drchrono');
});

test('genuine human/EHR-authored change (no tlp-sync tag) is NOT dropped', () => {
  const human = { id: 'x1', tags: ['Existing Patient'], notes: 'called to reschedule' };
  assert.equal(parse(human), null);
  assert.equal(isSelfAuthored(human, 'edge'), false);
  assert.equal(isSelfAuthored(human, 'ghl'), false);
  assert.equal(isSelfAuthored(human, 'drchrono'), false);
});

test('tag survives in an origin_tag carrier field too (not only tags[])', () => {
  const p = { id: 'x1', origin_tag: tagFor('edge', 'E9') };
  assert.equal(isSelfAuthored(p, 'edge'), true);
});
