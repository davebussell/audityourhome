// Build gate for the top picks (runs before astro build). Fails the build when a heat pump pick no longer holds up:
//   - a zone/situation is missing its performance or value pick, or a DIY slot is empty without a reason
//   - a picked brand isn't confirmed on sale in that country, or we hold no warranty terms for it there
//   - a pick uses an older refrigerant, or (Canada, cold zones) no longer meets NRCan's rebate thresholds
//   - a picked system has dropped out of the ENERGY STAR data the site was built from
//   - the picks are past their review date (warning at 90 days, failure at 180)
// and when a gear pick (src/data/picks/gear.json) is missing a slot, a seller, its facts or its sources.
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

// ---------------------------------------------------------------- gear picks (src/data/picks/gear.json)
const gear = read('src/data/picks/gear.json');
const productSlugs = {
  ca: new Set(read('src/data/products.json').categories.map((c) => c.slug)),
  us: new Set(read('src/data/us/products.json').categories.map((c) => c.slug)),
};
const gearAge = (Date.now() - Date.parse(`${gear.checked}T12:00:00Z`)) / 864e5;
if (gearAge > 180) errors.push(`gear picks were last checked ${gear.checked} (${Math.round(gearAge)} days ago): re-check prices, sellers and listings`);
else if (gearAge > 90) warnings.push(`gear picks were last checked ${gear.checked} (${Math.round(gearAge)} days ago)`);
let g = 0;
for (const [slug, cat] of Object.entries(gear.categories)) {
  const gatesFor = (mk) => (Array.isArray(cat.gates) ? cat.gates : cat.gates?.[mk]) ?? [];
  if (!cat.decidedBy) errors.push(`gear ${slug}: needs decidedBy`);
  for (const mk of ['ca', 'us']) {
    if (!gatesFor(mk).length) errors.push(`gear ${slug}: no gates for ${mk}`);
    if (!(cat.sources ?? []).some((x) => !x.markets || x.markets.includes(mk))) errors.push(`gear ${slug}: no sources for ${mk}`);
  }
  for (const mk of ['ca', 'us']) {
    if (!productSlugs[mk].has(slug)) errors.push(`gear ${slug}: no /products/${slug}/ page on the ${mk} site`);
    const m = cat.markets?.[mk];
    if (!m) { errors.push(`gear ${slug}: no ${mk} picks`); continue; }
    for (const slot of ['performance', 'easy', 'value']) {
      const p = m[slot];
      const where = `gear ${mk}/${slug}/${slot}`;
      if (!p) { errors.push(`${where}: missing`); continue; }
      g++;
      if (!p.name || !p.why || !(p.facts?.length >= 2)) errors.push(`${where}: needs a name, why and at least two facts`);
      const sellers = p.sellers ?? [];
      if (!sellers.length) errors.push(`${where}: no seller`);
      if (sellers.length < 2 && !p.onlySeller) errors.push(`${where}: one seller only; add a second or say why (onlySeller)`);
      for (const sl of sellers) if (!sl.name || !(sl.amazon || /^https:\/\//.test(sl.url ?? ''))) errors.push(`${where}: seller ${sl.name ?? '?'} needs an amazon query or an https url`);
      if (!p.price) warnings.push(`${where}: no price shown`);
    }
  }
}

warnings.forEach((w) => console.warn(`picks: warning: ${w}`));
if (errors.length) {
  console.error(`picks: ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`picks: ${n} heat pump picks across ${Object.values(picks.markets).reduce((a, m) => a + Object.keys(m.zones).length, 0)} zones and ${g} gear picks in ${Object.keys(gear.categories).length} categories check out (checked ${picks.checked}, gear ${gear.checked})`);
