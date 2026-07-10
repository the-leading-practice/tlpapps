/**
 * EDGE-03 T03 — Nyquist coverage for EMOD-01 + EMOD-04 (mocked fetch, no live Edge calls).
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

const ctx = { edgeBusinessId: 'biz-1', token: 'olx_test_token', locationId: 'loc-1' };

test('EMOD-01: createContact maps input and POSTs /api/contacts', async () => {
  const { createContact } = await import('../../src/modules/edge/contacts.js');

  let calledUrl = '';
  let calledMethod = '';
  let calledBody: unknown = null;
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    calledBody = JSON.parse(opts.body as string);
    return mockResponse(200, JSON.stringify({ id: 'c1' }));
  };

  const result = await createContact(
    ctx,
    {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '555-1234',
      tags: ['vip'],
      lifecycleStage: 'lead',
      contactType: 'lead',
      source: 'ghl',
    },
    { fetchImpl: mockFetch as unknown as typeof fetch },
  );

  assert.ok(calledUrl.endsWith('/api/contacts'));
  assert.equal(calledMethod, 'POST');
  assert.deepEqual(calledBody, {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-1234',
    tags: ['vip'],
    lifecycle_stage: 'lead',
    contact_type: 'lead',
    source: 'ghl',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { id: 'c1' });

  // pipeline/custom-field must never be mapped
  assert.equal((calledBody as Record<string, unknown>).pipeline, undefined);
  assert.equal((calledBody as Record<string, unknown>).customField, undefined);
});

test('EMOD-01: updateContact PUTs /api/contacts/{id}', async () => {
  const { updateContact } = await import('../../src/modules/edge/contacts.js');

  let calledUrl = '';
  let calledMethod = '';
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    return mockResponse(200, JSON.stringify({ id: 'c1', name: 'Jane Doe' }));
  };

  const result = await updateContact(ctx, 'c1', { name: 'Jane Doe' }, { fetchImpl: mockFetch as unknown as typeof fetch });

  assert.ok(calledUrl.endsWith('/api/contacts/c1'));
  assert.equal(calledMethod, 'PUT');
  assert.equal(result.status, 200);
});

test('EMOD-01: getContact GETs /api/contacts/{id}', async () => {
  const { getContact } = await import('../../src/modules/edge/contacts.js');

  let calledUrl = '';
  let calledMethod = '';
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    return mockResponse(200, JSON.stringify({ id: 'c1' }));
  };

  const result = await getContact(ctx, 'c1', { fetchImpl: mockFetch as unknown as typeof fetch });

  assert.ok(calledUrl.endsWith('/api/contacts/c1'));
  assert.equal(calledMethod, 'GET');
  assert.equal(result.status, 200);
});

test('EMOD-04: contacts.ts source imports no modules/sync', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const srcPath = path.resolve(__dirname, '../../src/modules/edge/contacts.ts');
  const source = fs.readFileSync(srcPath, 'utf-8');
  assert.doesNotMatch(source, /modules\/sync/);
  assert.doesNotMatch(source, /from ['"]\.\.\/sync/);
});
