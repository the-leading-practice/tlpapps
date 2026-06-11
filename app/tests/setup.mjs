/**
 * Global test bootstrap — preloaded via `node --import ./tests/setup.mjs` BEFORE any
 * spec or `src/config.ts` is imported.
 *
 * WHY THIS EXISTS:
 * `src/config.ts` THROWS at import time if `DATABASE_URL` is unset (a deliberate
 * fail-fast for prod). Specs each set `process.env.DATABASE_URL ||= <sentinel>` at
 * their own top-of-file, which works when each spec runs in its own process. But in
 * the aggregate in-process `node --test` run, the FIRST spec's transitive
 * `config.ts` import fires before LATER specs' top-of-file assignments execute —
 * so those later specs would crash on the throw. Setting the sentinels here, in a
 * preload that runs before ALL specs, removes the import-ordering dependency.
 *
 * WHY .mjs (NOT .ts): `node --test` runs each spec file in its own worker thread.
 * A `--import ./tests/setup.ts` preload is re-applied inside each worker, but the
 * tsx TypeScript loader is not guaranteed to be registered at the instant the
 * worker resolves the preload — yielding `Unknown file extension ".ts"`. Plain ESM
 * (.mjs) needs no transpile and loads in every worker unconditionally.
 *
 * SAFETY: these are inert sentinels. Nothing connects at import time — the Postgres
 * (`postgres`) and Mongo (`mongoose`) clients connect lazily on first query, and no
 * unit test issues a real query (DB/network-touching assertions are `.skip`-ed).
 * The sentinel DATABASE_URL points at 127.0.0.1:1 (an unroutable port) so any
 * accidental connection attempt fails fast locally rather than reaching real infra.
 */

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:1/tlp_test';
process.env.MONGO_CONN_STRING ||= '';
process.env.MONGO_USER ||= '';
process.env.MONGO_PASS ||= '';
process.env.MONGO_DB ||= '';
process.env.TOKEN_KEY ||= 'test-token-key';

// Allowlist sentinel for tests that exercise on/verify write paths.
// Only synthetic test IDs; never a real-practice GHL location ID.
// Per CR-01 fix, an empty allowlist denies all — tests that issue on/verify
// writes must have the target locationId present here.
process.env.SYNC_WRITE_LOCATION_ALLOWLIST ||=
  'DEMO_LOC_TEST,DEMO_LOC_TEST_A,DEMO_LOC_TEST_B,SAFE_TEST_LOC_001';
