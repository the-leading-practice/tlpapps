import { defineConfig } from 'vitest/config';

/**
 * EDGE-10 Plan 03 (ECUT-03) — vitest config for the new destination/cutover
 * suites. Reuses the existing node:test bootstrap (tests/setup.mjs) so
 * DATABASE_URL etc. sentinels are set before src/config.ts is imported
 * transitively (allowlist.ts / cutover.ts import the real db client at module
 * scope; DB reads/writes themselves are always injected/mocked in tests —
 * these sentinels only satisfy config.ts's fail-fast throw at import time).
 */
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.mjs'],
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
