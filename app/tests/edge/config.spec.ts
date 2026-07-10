/**
 * EDGE-01 T02 — Nyquist coverage for ECFG-01/02/03 storage.
 *
 * Two kinds of assertion here:
 *  (a) Pure crypto round-trip proof (ECFG-01) — no DB required, always runs.
 *  (b) Repo-level storage round-trip proof (ECFG-01/02/03) — requires a reachable
 *      Postgres with the EDGE-01 schema migrated. Following the tests/sync/**
 *      harness convention (see idempotency.spec.ts), this is OPT-IN ONLY via
 *      RUN_DB_TESTS=1 so the default offline suite never reaches live infra.
 *      Self-cleaning: scopes all rows to a unique synthetic location and deletes
 *      them on teardown. No Edge network calls anywhere in this file.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
// TOKEN_KEY must be exactly 32 bytes for AES-256-GCM used by cryptoService.
// setup.mjs preloads a 14-byte sentinel (||=) for specs that never call
// cryptoService directly; this spec DOES, so it must unconditionally override
// before any import of crypto.ts/config.ts.
process.env.TOKEN_KEY = 'test-tlp-jwt-key-32bytes-padXXXX';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const HAS_DB = process.env.RUN_DB_TESTS === '1';

// (a) cryptoService round-trip — the same encrypt/decrypt path the repo uses on
// write/no-read. Proves ciphertext != plaintext and decrypts back correctly.
test('cryptoService round-trip: ciphertext != plaintext, decrypts back [ECFG-01]', async () => {
  const { cryptoService } = await import('../../src/utils/crypto.js');
  const plaintext = 'olx_test123';
  const ciphertext = cryptoService.encrypt(plaintext);

  assert.notEqual(ciphertext, plaintext);
  const decrypted = cryptoService.decrypt(Buffer.from(ciphertext, 'hex'));
  assert.equal(decrypted, plaintext);
});

const LOCATION = `edge-test-${Date.now()}`;

test(
  'edgeConfigRepo: upsert cred -> GET masked view, no token/ciphertext field [ECFG-01]',
  { skip: !HAS_DB },
  async () => {
    const { edgeConfigRepo } = await import('../../src/modules/edge/repo.pg.js');

    const upserted = await edgeConfigRepo.upsertConfig(LOCATION, {
      businessId: 'edge_demo_biz',
      token: 'olx_test123',
    });

    assert.equal(upserted.businessId, 'edge_demo_biz');
    assert.equal(upserted.hasToken, true);
    assert.equal((upserted as Record<string, unknown>).token, undefined);
    assert.equal((upserted as Record<string, unknown>).edgeTokenCiphertext, undefined);

    const fetched = await edgeConfigRepo.getConfig(LOCATION);
    assert.ok(fetched);
    assert.equal(fetched!.hasToken, true);
    assert.equal((fetched as Record<string, unknown>).token, undefined);
  },
);

test(
  'edgeConfigRepo: stored ciphertext != plaintext and decrypts back [ECFG-01]',
  { skip: !HAS_DB },
  async () => {
    const { db } = await import('../../src/db/pg/client.js');
    const { eq } = await import('drizzle-orm');
    const { locations } = await import('../../src/db/pg/schema/config.js');
    const { edgeLocationConfig } = await import('../../src/db/pg/schema/edge.js');
    const { cryptoService } = await import('../../src/utils/crypto.js');

    const [loc] = await db.select().from(locations).where(eq(locations.location, LOCATION));
    const [row] = await db
      .select()
      .from(edgeLocationConfig)
      .where(eq(edgeLocationConfig.locationId, loc.id));

    assert.ok(row.edgeTokenCiphertext);
    assert.notEqual(row.edgeTokenCiphertext, 'olx_test123');
    const decrypted = cryptoService.decrypt(Buffer.from(row.edgeTokenCiphertext!, 'hex'));
    assert.equal(decrypted, 'olx_test123');
  },
);

test(
  'edgeConfigRepo: upsert + read a calendar mapping row [ECFG-02]',
  { skip: !HAS_DB },
  async () => {
    const { edgeConfigRepo } = await import('../../src/modules/edge/repo.pg.js');

    await edgeConfigRepo.upsertMappings(LOCATION, [
      {
        ehrDoctorId: 'doc-1',
        ehrCalendarId: 'cal-1',
        edgeBusinessId: 'edge_demo_biz',
        edgeCalendarId: 'edge-cal-1',
      },
    ]);

    const rows = await edgeConfigRepo.listMappings(LOCATION);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ehrCalendarId, 'cal-1');
    assert.equal(rows[0].edgeBusinessId, 'edge_demo_biz');
  },
);

test(
  'edgeConfigRepo: fresh cred defaults edge_signed_off=false; edgeDemoBusinessId wired [ECFG-03]',
  { skip: !HAS_DB },
  async () => {
    const { edgeConfigRepo } = await import('../../src/modules/edge/repo.pg.js');
    const { config } = await import('../../src/config.js');

    const freshLocation = `${LOCATION}-fresh`;
    const view = await edgeConfigRepo.upsertConfig(freshLocation, { businessId: 'edge_demo_biz' });

    assert.equal(view.signedOff, false);
    // Config wiring proof — presence of the key regardless of env value in this run.
    assert.ok('edgeDemoBusinessId' in config);

    // Cleanup this extra location's row.
    const { db } = await import('../../src/db/pg/client.js');
    const { eq } = await import('drizzle-orm');
    const { locations } = await import('../../src/db/pg/schema/config.js');
    const { edgeLocationConfig } = await import('../../src/db/pg/schema/edge.js');
    const [loc] = await db.select().from(locations).where(eq(locations.location, freshLocation));
    if (loc) {
      await db.delete(edgeLocationConfig).where(eq(edgeLocationConfig.locationId, loc.id));
      await db.delete(locations).where(eq(locations.id, loc.id));
    }
  },
);

test('cleanup', { skip: !HAS_DB }, async () => {
  const { db } = await import('../../src/db/pg/client.js');
  const { eq } = await import('drizzle-orm');
  const { locations } = await import('../../src/db/pg/schema/config.js');
  const { edgeLocationConfig, edgeCalendarMap } = await import('../../src/db/pg/schema/edge.js');

  const [loc] = await db.select().from(locations).where(eq(locations.location, LOCATION));
  if (loc) {
    await db.delete(edgeCalendarMap).where(eq(edgeCalendarMap.locationId, loc.id));
    await db.delete(edgeLocationConfig).where(eq(edgeLocationConfig.locationId, loc.id));
    await db.delete(locations).where(eq(locations.id, loc.id));
  }
});
