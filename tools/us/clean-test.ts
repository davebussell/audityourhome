// Prints how cleanNote() rewrites the US research text (a review aid, not part of the build).
// Usage: npx tsx tools/us/clean-test.ts [outFile]
import fs from 'node:fs';
import path from 'node:path';
import { cleanNote } from '../../src/lib/us/clean';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SKIP = new Set(['href', 'url', 'label', 'checked', 'category', 'slug', 'states', 'status', 'source', 'title', 'state',
  'stateName', 'metroName', 'principalCity', 'urlLabel']);
let changed = 0, emptied = 0, total = 0;
const samples: string[] = [];
function walk(o: unknown, key = ''): void {
  if (typeof o === 'string') {
    if (SKIP.has(key)) return;
    total++;
    const c = cleanNote(o);
    if (c !== o) {
      changed++;
      if (!c) emptied++;
      samples.push(`[${key}] ${o}\n   => ${c || '(EMPTY)'}`);
    }
    return;
  }
  if (Array.isArray(o)) { o.forEach((v) => walk(v, key)); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, k);
}
const dir = path.join(ROOT, 'src/data/us/metros');
for (const f of fs.readdirSync(dir)) walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
walk(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/us/federal.json'), 'utf8')));
console.log({ total, changed, emptied });
if (process.argv[2]) fs.writeFileSync(process.argv[2], samples.join('\n'));
