import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './migrations',
  // List the concrete schema files directly (NOT schema/index.ts). The `.js`
  // extensions in schema/index.ts re-exports are correct for NodeNext ESM
  // runtime resolution, but drizzle-kit's CJS bundler cannot rewrite
  // `./config.js` -> `config.ts`. Loading the source files directly sidesteps
  // that. Each future phase appends its domain file here (patients.ts, sync.ts).
  schema: ['./schema/config.ts', './schema/patients.ts', './schema/sync.ts'],
  dialect: 'postgresql',
});
