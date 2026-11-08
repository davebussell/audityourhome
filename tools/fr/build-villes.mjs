#!/usr/bin/env node
/**
 * The data behind the French city pages (/fr/villes/<ville>/): the 11 Québec cities, pulled from the same
 * research the English city pages are generated from (tools/local-pages/out/cities.json, the master file
 * behind tools/local-pages/gen_pages.py) and from the generated city payloads (src/data/local/cities/*.json).
 * Numbers only: the French sentences are composed at build time in src/lib/fr/villes.ts, so the wording
 * lives in one place. Run it again after regenerating the city pages:
 *
 *   node tools/fr/build-villes.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const master = JSON.parse(readFileSync(join(ROOT, 'tools/local-pages/out/cities.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(ROOT, 'src/data/local/index.json'), 'utf8'));

/** French page slug for each city (the English slug otherwise) */
const FR_SLUG = { 'quebec-city': 'quebec' };
const qcIndex = new Map(index.cities.filter((c) => c.prov === 'QC').map((c) => [c.slug, c]));

/** "17.0% (1 in 6) of houses at or above 200 Bq/m3; …" → { pct: 17, oneIn: 6, readings: 313 | null } */
function parseFigure(fig) {
  const pct = /^([\d.]+)%/.exec(fig);
  const oneIn = /\(1 in (\d+)\)/.exec(fig);
  const n = /([\d,]+) long-term readings/.exec(fig);
  const between = /([\d.]+)% between 100 and 200/.exec(fig);
  return {
    pct: pct ? Number(pct[1]) : null,
    oneIn: oneIn ? Number(oneIn[1]) : null,
    between: between ? Number(between[1]) : null,
    readings: n ? Number(n[1].replace(/,/g, '')) : null,
  };
}
/** "city/metro area: Ottawa-Gatineau Metro Area (Ottawa-Gatineau CMA)" → { kind: 'metro', name: 'Ottawa-Gatineau' } */
function parseScope(scope) {
  if (scope.startsWith('city:')) return { kind: 'city', name: scope.slice(5).split('(')[0].trim() };
  const m = /^city\/metro area:\s*(.+?)(?:,\s*QC)?\s*(?:Metro Area)?\s*\(/.exec(scope);
  return { kind: 'metro', name: m ? m[1].trim() : scope };
}

const out = [];
for (const c of master.cities) {
  if (c.prov !== 'QC') continue;
  const ic = qcIndex.get(c.slug);
  if (!ic) throw new Error(`${c.slug} is in the master data but not in src/data/local/index.json`);
  const city = JSON.parse(readFileSync(join(ROOT, 'src/data/local/cities', `${c.slug}.json`), 'utf8'));
  const h = c.heating ?? null;
  const shares = {};
  if (h) for (const k of ['forcedAir', 'baseboard', 'heatPump', 'boiler', 'stove', 'gas', 'electricity', 'oil', 'wood', 'propane']) {
    if (h[k]) shares[k] = { v: Math.round(h[k].v), caution: !!h[k].caution };
  }
  const radon = c.radon ?? null;
  out.push({
    slug: c.slug,
    fr: FR_SLUG[c.slug] ?? c.slug,
    name: c.name,
    population: c.population,
    lat: c.lat,
    lon: c.lon,
    fsas: c.fsas,
    facts: ic.facts,
    heating: h ? { geo: h.geo, isProvince: !!h.isProvince, shares } : null,
    radon: radon
      ? {
          region: radon.region,
          tested: radon.tested,
          pct: radon.pct,
          newer: (radon.newer ?? []).map((n) => ({ ...parseScope(n.scope), ...parseFigure(n.figure) })),
        }
      : null,
    utilities: { electricity: c.utilities?.electricity ?? null, gas: c.utilities?.naturalGas ?? null },
    wells: c.wells?.wells ?? null,
    municipal: (c.municipal ?? []).map((m) => ({ name: m.name, url: m.url, status: m.status, type: m.type })),
    providers: (c.providers ?? []).map((p) => ({ name: p.name, phone: p.phone, coverage: p.coverage })),
    nearby: (city.nearby ?? []).map((n) => ({ slug: n.slug, name: n.name, km: n.km, qc: qcIndex.has(n.slug), fr: FR_SLUG[n.slug] ?? n.slug })),
    programs: (city.programs ?? []).map((p) => ({ href: p.href, status: p.status, kind: p.kind })),
  });
}
out.sort((a, b) => b.population - a.population);

const target = join(ROOT, 'src/data/fr/villes.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify({ checked: index.checked, checkedISO: index.checkedISO, villes: out }, null, 1) + '\n');
console.log(`fr/villes: ${out.length} Québec cities → src/data/fr/villes.json (city data checked ${index.checked})`);
