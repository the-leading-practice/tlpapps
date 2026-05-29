import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './migrations',
  schema: './schema/index.ts',
  dialect: 'postgresql',
});
