// Pre-Storybook hook: SvelteKit 1.x regenerates `.svelte-kit/tsconfig.json` on
// `svelte-kit sync` with two TS options (`importsNotUsedAsValues`,
// `preserveValueImports`) that were REMOVED in TypeScript 5.5+. svelte-preprocess
// reads this tsconfig during the Storybook build and aborts with TS5102.
//
// This script runs `svelte-kit sync` (so the .svelte-kit/types/* files exist)
// and then patches the generated tsconfig to drop the obsolete options so the
// modern TS compiler is happy. Idempotent.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

const syncResult = spawnSync('pnpm', ['exec', 'svelte-kit', 'sync'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (syncResult.status !== 0) {
  console.warn('[storybook-prep] svelte-kit sync returned non-zero; continuing.');
}

const tsconfigPath = path.join(cwd, '.svelte-kit', 'tsconfig.json');
if (!existsSync(tsconfigPath)) {
  console.warn('[storybook-prep] .svelte-kit/tsconfig.json missing — nothing to patch.');
  process.exit(0);
}

const raw = readFileSync(tsconfigPath, 'utf8');
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.warn('[storybook-prep] could not parse tsconfig — skipping patch:', e?.message);
  process.exit(0);
}

const co = parsed.compilerOptions ?? {};
let mutated = false;
for (const key of ['importsNotUsedAsValues', 'preserveValueImports']) {
  if (key in co) {
    delete co[key];
    mutated = true;
  }
}
if (!('verbatimModuleSyntax' in co)) {
  co.verbatimModuleSyntax = false;
  mutated = true;
}
parsed.compilerOptions = co;
if (mutated) {
  writeFileSync(tsconfigPath, JSON.stringify(parsed, null, '\t') + '\n');
  console.log('[storybook-prep] patched .svelte-kit/tsconfig.json (removed TS 5.5-incompatible options).');
} else {
  console.log('[storybook-prep] .svelte-kit/tsconfig.json already clean.');
}
