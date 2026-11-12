// Build gate for the top picks (runs before astro build). Fails the build when a pick no longer holds up:
//   - a zone/situation is missing its performance or value pick, or a DIY slot is empty without a reason
//   - a picked brand isn't confirmed on sale in that country, or we hold no warranty terms for it there
//   - a pick uses an older refrigerant, or (Canada, cold zones) no longer meets NRCan's rebate thresholds
//   - a picked system has dropped out of the ENERGY STAR data the site was built from
//   - the picks are past their review date (warning at 90 days, failure at 180)
// Usage: node tools/picks/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const picks = read('src/data/picks/heatpumps.json');
const brands = read('src/data/heatpumps/brands.json').brands;
const estar = read('src/data/heatpumps/estar.json');

const errors = [];
const warnings = [];
const A2L = new Set(['R-454B', 'R-32']);

// every system the site holds, per market
const certified = {};
for (const mk of ['ca', 'us']) {
  const m = estar.markets[mk];
  const set = new Set();
  for (const b of Object.values(m.brands)) {
    for (const lst of Object.values(b.top ?? {})) if (Array.isArray(lst)) lst.forEach((r) => set.add(`${r.outdoor}|${r.indoor ?? ''}`));
    (b.topCooling ?? []).forEach((r) => set.add(`${r.outdoor}|${r.indoor ?? ''}`));
  }
  for (const lst of Object.values(m.leaders)) lst.forEach((r) => set.add(`${r.outdoor}|${r.indoor ?? ''}`));
  certified[mk] = set;
}

const ageDays = (Date.now() - Date.parse(`${picks.checked}T12:00:00Z`)) / 864e5;
if (ageDays > 180) errors.push(`picks were last checked ${picks.checked} (${Math.round(ageDays)} days ago): re-run tools/picks/build_heatpumps.py and review`);
else if (ageDays > 90) warnings.push(`picks were last checked ${picks.checked} (${Math.round(ageDays)} days ago)`);

const coldKinds = new Set(picks.method.coldRequired);
let n = 0;
for (const [mk, market] of Object.entries(picks.markets)) {
  for (const [zk, z] of Object.entries(market.zones)) {
    for (const [sit, s] of Object.entries(z.situations)) {
      const where = `${mk}/${zk}/${sit}`;
      for (const slot of ['performance', 'value']) if (!s[slot]) errors.push(`${where}: no ${slot} pick`);
      if (!s.diy && !s.diyReason) errors.push(`${where}: empty do-it-yourself slot with no reason`);
      for (const slot of ['performance', 'value', 'diy']) {
        const p = s[slot];
        if (!p) continue;
        n++;
        const b = brands[p.slug];
        if (!b) { errors.push(`${where} ${slot}: unknown brand ${p.slug}`); continue; }
        if (b.soldIn?.[mk] !== true) errors.push(`${where} ${slot}: ${b.name} is not confirmed on sale in ${mk}`);
        const w = b.warranty?.[mk] ?? {};
        if (!(w.parts || w.compressor)) errors.push(`${where} ${slot}: no ${mk} warranty terms on file for ${b.name}`);
        if (!A2L.has(p.refrig)) errors.push(`${where} ${slot}: ${p.outdoor} uses ${p.refrig}`);
        if (mk === 'ca' && coldKinds.has(z.kind) && slot !== 'diy' && !p.nrcanLike) errors.push(`${where} ${slot}: ${p.outdoor} is below NRCan's thresholds`);
        if (!certified[mk].has(`${p.outdoor}|${p.indoor ?? ''}`)) errors.push(`${where} ${slot}: ${p.outdoor} is no longer in the ENERGY STAR data`);
      }
    }
  }
}

warnings.forEach((w) => console.warn(`picks: warning: ${w}`));
if (errors.length) {
  console.error(`picks: ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`picks: ${n} picks across ${Object.values(picks.markets).reduce((a, m) => a + Object.keys(m.zones).length, 0)} zones check out (checked ${picks.checked})`);
