/**
 * EDGE-05 T02 — Nyquist coverage for EMOD-03 + EMOD-04 (mocked fetch, no live Edge calls).
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

test('EMOD-03: listConversations GETs /api/conversations with optional query', async () => {
  const { listConversations } = await import('../../src/modules/edge/conversations.js');

  let calledUrl = '';
  let calledMethod = '';
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    return mockResponse(200, JSON.stringify({ conversations: [] }));
  };

  const result = await listConversations(ctx, { contactId: 'c1', limit: 10 }, { fetchImpl: mockFetch as unknown as typeof fetch });

  assert.ok(calledUrl.includes('/api/conversations?'));
  assert.ok(calledUrl.includes('contactId=c1'));
  assert.ok(calledUrl.includes('limit=10'));
  assert.equal(calledMethod, 'GET');
  assert.equal(result.status, 200);
});

test('EMOD-03: listConversations with no params has no query string', async () => {
  const { listConversations } = await import('../../src/modules/edge/conversations.js');

  let calledUrl = '';
  const mockFetch = async (url: string) => {
    calledUrl = url;
    return mockResponse(200, JSON.stringify({ conversations: [] }));
  };

  await listConversations(ctx, {}, { fetchImpl: mockFetch as unknown as typeof fetch });
  assert.ok(calledUrl.endsWith('/api/conversations'));
});

test('EMOD-03: getConversation GETs /api/conversations/{id}', async () => {
  const { getConversation } = await import('../../src/modules/edge/conversations.js');

  let calledUrl = '';
  let calledMethod = '';
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    return mockResponse(200, JSON.stringify({ id: 'conv1', messages: [] }));
  };

  const result = await getConversation(ctx, 'conv1', { fetchImpl: mockFetch as unknown as typeof fetch });

  assert.ok(calledUrl.endsWith('/api/conversations/conv1'));
  assert.equal(calledMethod, 'GET');
  assert.equal(result.status, 200);
});

test('EMOD-03: postMessage POSTs to /api/conversations/{id}/messages', async () => {
  const { postMessage } = await import('../../src/modules/edge/conversations.js');

  let calledUrl = '';
  let calledMethod = '';
  let calledBody: unknown = null;
  const mockFetch = async (url: string, opts: RequestInit) => {
    calledUrl = url;
    calledMethod = opts.method as string;
    calledBody = JSON.parse(opts.body as string);
    return mockResponse(200, JSON.stringify({ id: 'msg1' }));
  };

  const result = await postMessage(ctx, 'conv1', { text: 'hello', contactId: 'c1' }, { fetchImpl: mockFetch as unknown as typeof fetch });

  assert.ok(calledUrl.endsWith('/api/conversations/conv1/messages'));
  assert.equal(calledMethod, 'POST');
  assert.deepEqual(calledBody, { text: 'hello', contactId: 'c1' });
  assert.equal(result.status, 200);
});

test('EMOD-04: conversations.ts source imports no modules/sync', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const srcPath = path.resolve(__dirname, '../../src/modules/edge/conversations.ts');
  const source = fs.readFileSync(srcPath, 'utf-8');
  assert.doesNotMatch(source, /from ['"][.][.]\/(sync|[.][.]\/sync)/);
  assert.doesNotMatch(source, /import[^\n]*modules\/sync/);
});
