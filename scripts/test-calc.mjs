// Runs src/lib/calc/engine.test.ts with Node's built-in test runner.
// esbuild (already a dependency of Astro) bundles the TypeScript and JSON imports first.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'calc-test-'));
const out = path.join(dir, 'engine.test.mjs');
await build({
  entryPoints: [path.join(root, 'src/lib/calc/engine.test.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.json': 'json' },
  logLevel: 'warning',
});
const r = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
