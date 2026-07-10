/**
 * EDGE-07 T02 — edge.ts receiver unit tests (Nyquist).
 *
 * DB is never touched — ingestEvent is monkey-patched via dynamic import + property
 * override on the module namespace object is not possible for ESM named exports, so
 * instead we drive real ingestEvent calls through a stubbed db is avoided entirely:
 * these tests target signature-gate branching (which never reaches ingestEvent on
 * the reject paths) and the no-external-id / dedup-shaped acks, matching the level
 * of coverage crm-webhook.spec.ts uses for the sibling receiver.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
process.env.EDGE_WEBHOOK_SECRET = 'edge-test-secret';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { edgeSyncWebhook } from '../../src/modules/webhooks/edge.js';

const SECRET = 'edge-test-secret';

function sign(timestamp: string, rawBody: Buffer, secret = SECRET): string {
  const signedBytes = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  return `sha256=${crypto.createHmac('sha256', secret).update(signedBytes).digest('hex')}`;
}

function makeReq(opts: {
  body?: Record<string, unknown>;
  rawBody?: Buffer;
  sigHeader?: string;
  tsHeader?: string;
  deliveryHeader?: string;
}): any {
  return {
    body: opts.body ?? {},
    rawBody: opts.rawBody,
    header: (name: string) => {
      const n = name.toLowerCase();
      if (n === 'x-edge-signature') return opts.sigHeader;
      if (n === 'x-edge-timestamp') return opts.tsHeader;
      if (n === 'x-edge-delivery') return opts.deliveryHeader;
      return undefined;
    },
  };
}

function makeRes(): { status: (n: number) => any; _code: number; _body: any } {
  const res: any = {
    _code: 0,
    _body: null,
    status(n: number) {
      res._code = n;
      return { json(b: any) { res._body = b; } };
    },
  };
  return res;
}

test('edgeSyncWebhook: no signature header -> 200, ingested=false, reason=no-signature', async () => {
  const req = makeReq({ body: { event: 'edge.contact.changed', id: 'c1', verb: 'update' } });
  const res = makeRes();
  await edgeSyncWebhook(req as any, res as any);
  assert.equal(res._code, 200);
  assert.equal(res._body.ingested, false);
  assert.equal(res._body.reason, 'no-signature');
});

test('edgeSyncWebhook: bad signature -> 401, no ack of ingest', async () => {
  const bodyObj = { event: 'edge.contact.changed', id: 'c2', verb: 'update' };
  const rawBody = Buffer.from(JSON.stringify(bodyObj));
  const nowSec = Math.floor(Date.now() / 1000);
  const req = makeReq({
    body: bodyObj,
    rawBody,
    sigHeader: 'sha256=deadbeef',
    tsHeader: String(nowSec),
  });
  const res = makeRes();
  await edgeSyncWebhook(req as any, res as any);
  assert.equal(res._code, 401);
  assert.ok(res._body.error);
});

test('edgeSyncWebhook: timestamp skew > 300s -> 401', async () => {
  const bodyObj = { event: 'edge.contact.changed', id: 'c3', verb: 'update' };
  const rawBody = Buffer.from(JSON.stringify(bodyObj));
  const nowSec = Math.floor(Date.now() / 1000);
  const staleTs = String(nowSec - 400);
  const req = makeReq({
    body: bodyObj,
    rawBody,
    sigHeader: sign(staleTs, rawBody),
    tsHeader: staleTs,
  });
  const res = makeRes();
  await edgeSyncWebhook(req as any, res as any);
  assert.equal(res._code, 401);
  assert.equal(res._body.reason, 'timestamp-skew');
});

test('edgeSyncWebhook: valid signature but missing external id -> 200, ingested=false, no-external-id (ingest never reached)', async () => {
  const bodyObj = { event: 'edge.contact.changed', verb: 'update' }; // no id
  const rawBody = Buffer.from(JSON.stringify(bodyObj));
  const nowSec = Math.floor(Date.now() / 1000);
  const ts = String(nowSec);
  const req = makeReq({
    body: bodyObj,
    rawBody,
    sigHeader: sign(ts, rawBody),
    tsHeader: ts,
    deliveryHeader: 'dlv-1',
  });
  const res = makeRes();
  await edgeSyncWebhook(req as any, res as any);
  assert.equal(res._code, 200);
  assert.equal(res._body.ingested, false);
  assert.equal(res._body.reason, 'no-external-id');
});

test('edgeSyncWebhook: valid signature + external id -> attempts ingest, acks 200 (ingested false on DB-unreachable, never throws)', async () => {
  const bodyObj = { event: 'edge.appointment.changed', entity: 'appointment', id: 'appt-1', verb: 'update' };
  const rawBody = Buffer.from(JSON.stringify(bodyObj));
  const nowSec = Math.floor(Date.now() / 1000);
  const ts = String(nowSec);
  const req = makeReq({
    body: bodyObj,
    rawBody,
    sigHeader: sign(ts, rawBody),
    tsHeader: ts,
    deliveryHeader: 'dlv-2',
  });
  const res = makeRes();
  // Never throws — DB is unreachable in this unit-test env (DATABASE_URL sentinel),
  // so ingestEvent's own DB call fails; the handler still acks 200 (never crashes).
  await edgeSyncWebhook(req as any, res as any);
  assert.equal(res._code, 200);
  assert.equal(res._body.ok, true);
});
