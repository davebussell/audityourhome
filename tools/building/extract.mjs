// One-off, run on 2026-11-04: moves the commercial and multi-unit building content out of the two
// residential sites into src/data/building/ for audityourbuilding.com.
//
//   node tools/building/extract.mjs           # write src/data/building/* and report (changes nothing else)
//   node tools/building/extract.mjs --strip   # the same, then remove that content from the residential data:
//                                             #   src/data/local/index.json + cities/*.json  (the commercial service)
//                                             #   src/data/articles.json                     (the 2 building articles)
//
// What it writes
//   src/data/building/commercial.json   copy of tools/local-pages/research/commercial.json (reporting rules, incentives)
//   src/data/building/cities.json       the 70 cities, with the text parts of each commercial page and its facts
//   src/data/building/articles.json     the two building articles from src/data/articles.json, links rewritten for the new site
// The third building article (energy audit services in Toronto) is an Astro page and was moved by hand.
//
// Link rewriting (the new site has its own pages; everything else lives on audityourhome.ca):
//   /services/commercial-energy-audit/…  →  /commercial-energy-audit/…
//   /articles/<one of the building articles>/  →  unchanged (the article moved with them)
//   any other root-form link  →  https://audityourhome.ca<path>
//
// tools/local-pages/gen_pages.py still knows how to generate the commercial pages; its output must not go back into
// src/data/local/ (see SKIP_SERVICES there).
//
// DO NOT RE-RUN. src/data/building/* was edited by hand after this ran (titles, descriptions, link fixes), and the
// residential data no longer holds the content it extracts, so a second run would overwrite those edits with a
// stale copy. It is kept as the record of how the data got there; it refuses to run without the flag below.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes('--overwrite-hand-edits')) {
  console.error('tools/building/extract.mjs already ran (2026-11-04) and src/data/building/ has been edited by hand since.');
  console.error('Refusing to overwrite it. (Pass --overwrite-hand-edits only if you mean to throw those edits away.)');
  process.exit(1);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL = path.join(ROOT, 'src', 'data', 'local');
const OUT = path.join(ROOT, 'src', 'data', 'building');
const STRIP = process.argv.includes('--strip');
const SVC = 'commercial-energy-audit';
const BUILDING_ARTICLES = ['commercial-energy-audits-ontario', 'energy-audits-multi-unit-buildings', 'energy-audit-services-toronto'];
const RESIDENTIAL = 'https://audityourhome.ca';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const index = readJson(path.join(LOCAL, 'index.json'));
const research = readJson(path.join(ROOT, 'tools', 'local-pages', 'research', 'commercial.json'));
fs.mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ link rewriting
const stats = { toBuilding: 0, toResidential: 0, kept: 0 };
const residentialTargets = new Map();
function rewriteHref(href) {
  if (!href.startsWith('/') || href.startsWith('//')) { stats.kept++; return href; }
  const m = href.match(/^\/services\/commercial-energy-audit(\/.*)?$/);
  if (m) { stats.toBuilding++; return `/commercial-energy-audit${m[1] ?? '/'}`; }
  if (BUILDING_ARTICLES.some((s) => href.startsWith(`/articles/${s}/`))) { stats.toBuilding++; return href; }
  if (href === '/') { stats.toBuilding++; return '/'; }
  stats.toResidential++;
  residentialTargets.set(href, (residentialTargets.get(href) ?? 0) + 1);
  return `${RESIDENTIAL}${href}`;
}
const rewriteHtml = (html) => (html ?? '').replace(/href="([^"]*)"/g, (_, h) => `href="${rewriteHref(h)}"`);

// ------------------------------------------------------------------ rule/incentive helpers (same logic as gen_pages.py)
const incentives = research.incentives;
const openIncentives = (slug) => (research.cityIncentives[slug] ?? []).filter((k) => incentives[k] && incentives[k].status !== 'closed');
const realRules = (arr) => (arr ?? []).filter((r) => !['none', 'none found', 'not found'].includes(r.status ?? 'in force'));
const isMandatory = (r) => /^mandatory/.test(r.type) && /^in force/.test(r.status);

// ------------------------------------------------------------------ cities
const cities = [];
const problems = [];
for (const ic of index.cities) {
  const full = readJson(path.join(LOCAL, 'cities', `${ic.slug}.json`));
  const pg = full.pages[SVC];
  if (!pg) { problems.push(`${ic.slug}: no commercial page`); continue; }
  // cross-check the counts the page states against the structured data the new pages render from
  const provRules = research.rules.provinces[ic.prov] ?? [];
  const cityRules = research.rules.cities[ic.slug] ?? [];
  const mandatory = [...provRules, ...cityRules].some(isMandatory);
  const n = openIncentives(ic.slug).length;
  const glanceMand = pg.glance.find((g) => g.k === 'Mandatory reporting')?.v;
  const glanceInc = pg.glance.find((g) => g.k === 'Incentive programs')?.v;
  if ((glanceMand === 'Yes') !== mandatory) problems.push(`${ic.slug}: page says mandatory reporting "${glanceMand}", data says ${mandatory}`);
  if (String(n) !== glanceInc) problems.push(`${ic.slug}: page says ${glanceInc} incentive programs, data says ${n}`);
  const nameOf = (href) => index.cities.find((c) => href.endsWith(`/${c.slug}/`));
  cities.push({
    slug: ic.slug,
    name: ic.name,
    label: ic.label,
    prov: ic.prov,
    provName: ic.provName,
    provSlug: ic.provSlug,
    population: ic.population,
    facts: {
      hdd: ic.facts.hdd,
      designHeat: ic.facts.designHeat,
      station: ic.facts.station,
      stationKm: ic.facts.stationKm,
      electricity: ic.facts.electricity,
      gas: ic.facts.gas,
    },
    page: {
      kicker: pg.kicker,
      title: pg.title,
      description: pg.description,
      h1: pg.h1,
      lede: pg.lede,
      faq: pg.faq,
      nearby: pg.nearby.map((x) => ({ slug: nameOf(x.href)?.slug, name: nameOf(x.href)?.name, km: x.km })).filter((x) => x.slug),
    },
  });
}

// ------------------------------------------------------------------ articles
const allArticles = readJson(path.join(ROOT, 'src', 'data', 'articles.json'));
const articles = allArticles
  .filter((a) => BUILDING_ARTICLES.includes(a.slug))
  .map((a) => ({
    slug: a.slug,
    kicker: a.kicker,
    crumb: a.crumb,
    title: a.title,
    h1: a.h1,
    description: a.description,
    blurb: a.blurb,
    lede: rewriteHtml(a.lede),
    verified: a.verified,
    verifiedISO: a.verifiedISO,
    sections: a.sections.map((s) => ({ h2: s.h2, html: rewriteHtml(s.html) })),
    faq: a.faq,
    sources: a.sources,
    related: a.related.map((r) => ({ href: rewriteHref(r.href), label: r.label })),
  }));

fs.writeFileSync(path.join(OUT, 'commercial.json'), fs.readFileSync(path.join(ROOT, 'tools', 'local-pages', 'research', 'commercial.json')));
fs.writeFileSync(path.join(OUT, 'cities.json'), JSON.stringify(cities, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'articles.json'), JSON.stringify(articles, null, 1) + '\n');
console.log(`wrote src/data/building/: commercial.json, cities.json (${cities.length} cities), articles.json (${articles.length} articles)`);
console.log(`links rewritten: ${stats.toBuilding} stay on the building site, ${stats.toResidential} point to ${RESIDENTIAL}, ${stats.kept} untouched`);
if (residentialTargets.size) console.log('pages on the residential site that the articles link to:\n  ' + [...residentialTargets].map(([h, c]) => `${h} (${c})`).join('\n  '));
if (problems.length) { console.log(`PROBLEMS (${problems.length}):\n  ` + problems.join('\n  ')); }

// ------------------------------------------------------------------ strip the residential data
if (STRIP) {
  if (problems.length) { console.error('not stripping: fix the problems above first'); process.exit(1); }
  const idxPath = path.join(LOCAL, 'index.json');
  const idxText = fs.readFileSync(idxPath, 'utf8');
  const idx = JSON.parse(idxText);
  idx.services = idx.services.filter((s) => s.slug !== SVC);
  for (const c of idx.cities) delete c.metrics[SVC];
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1) + (idxText.endsWith('\n') ? '\n' : ''));
  let relatedDropped = 0;
  for (const ic of index.cities) {
    const p = path.join(LOCAL, 'cities', `${ic.slug}.json`);
    const c = readJson(p);
    delete c.pages[SVC];
    c.hub.services = c.hub.services.filter((s) => s.slug !== SVC);
    for (const pg of Object.values(c.pages)) {
      const before = pg.related.length;
      pg.related = pg.related.filter((r) => !r.href.includes(`/services/${SVC}/`));
      relatedDropped += before - pg.related.length;
    }
    fs.writeFileSync(p, JSON.stringify(c));
  }
  const keep = allArticles.filter((a) => !BUILDING_ARTICLES.includes(a.slug));
  const artPath = path.join(ROOT, 'src', 'data', 'articles.json');
  const artText = fs.readFileSync(artPath, 'utf8');
  fs.writeFileSync(artPath, JSON.stringify(keep, null, artText.startsWith('[\n  ') ? 2 : artText.startsWith('[\n ') ? 1 : 0) + (artText.endsWith('\n') ? '\n' : ''));
  console.log(`stripped: service "${SVC}" from index.json and ${index.cities.length} city files (${relatedDropped} related links dropped), ${allArticles.length - keep.length} articles from articles.json`);
}
