#!/usr/bin/env node
/**
 * The publishing gate: the step between "the page builds" and "Google is invited to index it".
 * Runs last in `npm run build`, over dist-ca, dist-us and dist-bu. Rules and exceptions: src/data/index-policy.json.
 * The plan it comes from: claude.ai/artifact/SwT317jHDMUAQhfKAfzQPr (Dave approved it on 2026-11-16).
 *
 * What it checks, per site:
 *   1. Words of its own. A page that is one of a page-per-place set carries at least `floors.ownWords` words in
 *      sentences found on no other place's page of its kind and on none of that place's other pages in the set
 *      (place name blanked, numbers kept). For a one-page-per-place set: words in sentences not on 90%+ of the set.
 *      A kind can be `folded` (noindex, out of the sitemap) or `pending` (an exception with an end date).
 *   2. New sets start hidden. A page type with `floors.newSetPages` or more indexable pages that the policy does not
 *      list is a breach: ship it noindex, and list it once it passes.
 *   3. Thin floor. An indexable page under `floors.pageWords` words of main text needs an entry in `thinOk`.
 *   4. Affiliate links: marked rel="sponsored", only on the page types in `affiliate.allowed` (never a place page),
 *      with the disclosure above the first one.
 *   5. The share of indexable pages that are `repeat` sets may not rise above `repeatShareMax`.
 *   6. Folded pages really are noindex, and nothing noindex is in the sitemap.
 *
 * Until `enforceFrom` a breach is a warning; from that date it fails the build. THIN_GATE=warn or THIN_GATE=fail
 * overrides the date (warn is for an urgent deploy, with Dave's OK; fix or except the breach afterwards).
 *
 *   node tools/thin/gate.mjs            the one-screen report
 *   node tools/thin/gate.mjs --sets     also every kind in every page-per-place set (the plan's table)
 *   node tools/thin/gate.mjs --pages    also list each page that breaks a rule
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const policy = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'index-policy.json'), 'utf8'));
const SITES = { ca: ['dist-ca', 'audityourhome.ca'], us: ['dist-us', 'audityourhome.com'], bu: ['dist-bu', 'audityourbuilding.com'] };
const ARGS = new Set(process.argv.slice(2));
const TODAY = new Date().toISOString().slice(0, 10);
const MODE = process.env.THIN_GATE === 'warn' || process.env.THIN_GATE === 'fail'
  ? process.env.THIN_GATE
  : TODAY >= policy.enforceFrom ? 'fail' : 'warn';

// ---------------------------------------------------------------- reading a built page
const BLOCK = new Set(['p', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'summary', 'dd', 'dt', 'figcaption', 'caption',
  'blockquote', 'div', 'section', 'article', 'tr', 'br', 'details', 'label', 'option']);
const SKIP = new Set(['script', 'style', 'nav', 'header', 'footer', 'svg', 'noscript', 'form', 'select', 'template']);
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', times: '×', deg: '°', middot: '·', rarr: '→', larr: '←', minus: '−', copy: '©',
  bull: '•', laquo: '«', raquo: '»', thinsp: '\u2009', shy: '\u00ad', le: '≤', ge: '≥', sup2: '²', frac12: '½' };
const unknownEntities = new Set();
const decode = (s) => (s.includes('&') ? s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  if (e in NAMED) return NAMED[e];
  unknownEntities.add(e);
  return m;
}) : s);
const attr = (s, name) => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(s);
  return m ? decode(m[1] ?? m[2] ?? m[3]) : null;
};
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;

/** Main-content text (nav, header, footer, forms, scripts and drawings left out), every link, and the robots meta. */
function parse(html) {
  const text = [];
  const links = [];
  let len = 0, skip = 0, inmain = 0, robots = '', i = 0;
  const push = (s) => { text.push(s); len += s.length; };
  const end = (name) => {
    if (name === 'main') inmain = Math.max(0, inmain - 1);
    if (SKIP.has(name)) skip = Math.max(0, skip - 1);
    if (BLOCK.has(name)) push('\n');
  };
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { if (inmain && !skip) push(decode(html.slice(i))); break; }
    if (lt > i && inmain && !skip) push(decode(html.slice(i, lt)));
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); i = e === -1 ? n : e + 3; continue; }
    TAG.lastIndex = lt;
    const m = TAG.exec(html);
    if (!m) {
      if (html[lt + 1] === '!' || html[lt + 1] === '?') { const e = html.indexOf('>', lt); i = e === -1 ? n : e + 1; }
      else { if (inmain && !skip) push('<'); i = lt + 1; }
      continue;
    }
    i = TAG.lastIndex;
    const name = m[2].toLowerCase();
    if (m[1]) { end(name); continue; }
    const attrs = m[3];
    if (name === 'meta' && (attr(attrs, 'name') || '').toLowerCase() === 'robots') robots = (attr(attrs, 'content') || '').toLowerCase();
    if (name === 'main') inmain++;
    if (SKIP.has(name)) skip++;
    if (BLOCK.has(name)) push('\n');
    if (name === 'a') {
      const href = attr(attrs, 'href');
      if (href) links.push({ href, rel: attr(attrs, 'rel') || '', inMain: inmain > 0, at: len });
    }
    if (name === 'script' || name === 'style') {
      const closeRe = name === 'script' ? /<\/script/gi : /<\/style/gi;
      closeRe.lastIndex = i;
      const close = closeRe.exec(html);
      i = close ? close.index : n;
    } else if (/\/\s*$/.test(attrs)) end(name);
  }
  return { text: text.join(''), links, robots };
}

/** Sentences of four words or more, one block at a time. */
function sentences(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.split(/\s+/).filter(Boolean).join(' ');
    if (!line) continue;
    // not after "St." and the like, or "St. Catharines" is cut in two and the city's name is never seen whole
    for (const s of line.split(/(?<=[.!?])(?<!\b(?:St|Ste|Mt|Ft|Dr|No|vs|Inc|Ltd|Co|approx)\.)\s+(?=[A-ZÀ-Ý0-9“"(])/)) {
      const t = s.trim();
      if (t.split(/\s+/).length >= 4) out.push(t);
    }
  }
  return out;
}
const words = (s) => s.split(/\s+/).filter(Boolean).length;
/** A sentence with the place's name blanked, so "…in Winnipeg" and "…in Regina" compare as the same sentence.
 *  Accents, apostrophes, periods, commas and hyphens are dropped first, so "St. John's" matches the slug st-johns and
 *  "Washington, DC" matches washington-dc. This matters more than it looks: if one place in ten keeps its name, a
 *  sentence every page shares falls under the 90% line and counts as every page's own (the first measure did that). */
function keyOf(s, names) {
  let t = s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.,'’]/g, '').replace(/[-–—]/g, ' ').replace(/\s+/g, ' ');
  for (const nm of names) if (nm && nm.length > 2) t = t.split(nm).join('@');
  return t.replace(/\s+/g, ' ');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === 'index.html') out.push(p);
  }
  return out;
}
const glob = (pattern) => new RegExp('^' + pattern.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+') + '$');
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const fmt = (x) => Math.round(x).toLocaleString('en-CA');
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ---------------------------------------------------------------- one site
function checkSite(site) {
  const [distName, domain] = SITES[site];
  const dist = join(ROOT, distName);
  if (!existsSync(dist)) return null;
  const sets = (policy.sets[site] || []).map((s) => ({ ...s, re: glob(s.match), pages: [] }));
  const thinOk = (policy.thinOk[site] || []).map((t) => ({ ...t, re: glob(t.match), used: 0 }));
  const affRe = new RegExp(policy.affiliate.links);
  const discRe = new RegExp(policy.affiliate.disclosure, 'i');
  const allowedAff = (policy.affiliate.allowed[site] || []).map(glob);
  const breaches = [];   // { rule, path, msg }
  const notes = [];      // warnings that never fail the build (pending exceptions and the like)

  const pages = [];
  for (const file of walk(dist)) {
    const html = readFileSync(file, 'utf8');
    if (/http-equiv="refresh"/i.test(html.slice(0, 2000))) continue;
    const path = file.slice(dist.length).replace(/\\/g, '/').replace(/index\.html$/, '') || '/';
    const p = parse(html);
    const sents = sentences(p.text);
    const page = { path, seg: path.split('/').filter(Boolean), noindex: p.robots.includes('noindex'), sents,
      words: sents.reduce((a, s) => a + words(s), 0), text: p.text, links: p.links };
    page.set = sets.find((s) => s.re.test(path)) || null;
    if (page.set) page.set.pages.push(page);
    pages.push(page);
  }
  const idx = pages.filter((p) => !p.noindex);

  // 6. the sitemap holds exactly the indexable pages
  const sm = join(dist, 'sitemap.xml');
  if (existsSync(sm)) {
    const locs = new Set([...readFileSync(sm, 'utf8').matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1]));
    for (const p of pages) if (p.noindex && locs.has(p.path)) breaches.push({ rule: 'sitemap', path: p.path, msg: 'noindex page is in the sitemap' });
  }

  // 1. words of its own
  const kinds = [];      // { set, kind, pages, median, short, state }
  for (const set of sets) {
    if (set.type !== 'grid' && set.type !== 'place') continue;
    const folded = policy.folded?.[site]?.[set.match] || {};
    const pending = policy.pending?.[site]?.[set.match] || {};
    const kindOf = (p) => (set.type === 'grid' ? p.seg[set.kind - 1] : set.name);
    const placeOf = (p) => p.seg[set.place - 1];
    const byKind = new Map(), kc = new Map(), pc = new Map(), unnamed = new Set();
    for (const p of set.pages) {
      const names = [placeOf(p).replace(/-/g, ' '), ...(Array.isArray((policy.alias || {})[placeOf(p)]) ? policy.alias[placeOf(p)] : []).map((a) => keyOf(a, []))].sort((a, b) => b.length - a.length);
      p.keys = p.sents.map((s) => [keyOf(s, names), words(s)]);
      if (!p.keys.some((x) => x[0].includes('@'))) unnamed.add(placeOf(p));
      const k = kindOf(p), pl = placeOf(p);
      if (!byKind.has(k)) { byKind.set(k, []); kc.set(k, new Map()); }
      byKind.get(k).push(p);
      if (!pc.has(pl)) pc.set(pl, new Map());
      for (const key of new Set(p.keys.map((x) => x[0]))) {
        kc.get(k).set(key, (kc.get(k).get(key) || 0) + 1);
        pc.get(pl).set(key, (pc.get(pl).get(key) || 0) + 1);
      }
    }
    for (const [k, list] of byKind) {
      const n = list.length;
      for (const p of list) {
        let own = 0;
        for (const [key, w] of p.keys) {
          if (kc.get(k).get(key) >= 0.9 * n) continue;                                  // the same on every place's page
          if (set.type === 'grid' && pc.get(placeOf(p)).get(key) >= 2) continue;        // that place's shared block
          own += w;
        }
        p.own = own;
      }
      const isFolded = set.type === 'grid' && k in folded;
      const pend = set.type === 'grid' ? pending[k] : null;
      const live = list.filter((p) => !p.noindex);
      const short = live.filter((p) => p.own < policy.floors.ownWords);
      const state = isFolded ? 'folded' : pend ? (TODAY <= pend.until ? `pending until ${pend.until}` : `exception ended ${pend.until}`) : 'indexed';
      kinds.push({ set, kind: k, n, live: live.length, median: median(list.map((p) => p.own)), short: short.length, state });
      if (isFolded) {
        for (const p of live) breaches.push({ rule: 'folded', path: p.path, msg: 'the policy folds this set, but the page is indexable' });
      } else if (pend && TODAY <= pend.until) {
        if (short.length) notes.push(`${short.length} ${k} pages are under ${policy.floors.ownWords} words of their own; the exception ends ${pend.until}`);
      } else {
        for (const p of short) breaches.push({ rule: 'own words', path: p.path, msg: `${p.own} words of its own (needs ${policy.floors.ownWords})` });
      }
    }
    if (unnamed.size) notes.push(`${set.match}: the place's name was not found on its own page for ${[...unnamed].sort().join(', ')}; add the name it is written with to "alias" in the policy, or the measure is skewed`);
    for (const k of Object.keys(folded)) if (!byKind.has(k)) breaches.push({ rule: 'policy', path: set.match, msg: `folded kind "${k}" does not exist` });
    for (const k of Object.keys(pending)) if (!byKind.has(k)) breaches.push({ rule: 'policy', path: set.match, msg: `pending kind "${k}" does not exist` });
  }

  // 2. new sets start hidden
  const loose = new Map();
  for (const p of idx) {
    if (p.set || p.seg.length < 2) continue;
    const t = `/${p.seg[0]}/` + '*/'.repeat(p.seg.length - 1);
    loose.set(t, (loose.get(t) || 0) + 1);
  }
  for (const [t, c] of loose) {
    if (c >= policy.floors.newSetPages) breaches.push({ rule: 'new set', path: t, msg: `${c} indexable pages of a type the policy does not list: ship it noindex, and list it in src/data/index-policy.json once it passes` });
  }

  // 3. thin floor
  let thinAllowed = 0;
  for (const p of idx) {
    if (p.words >= policy.floors.pageWords) continue;
    const ok = thinOk.find((t) => t.re.test(p.path));
    if (ok) { ok.used++; thinAllowed++; } else breaches.push({ rule: 'thin page', path: p.path, msg: `${p.words} words of main text (needs ${policy.floors.pageWords}, or a reason in thinOk)` });
  }

  // 4. affiliate links
  let affLinks = 0;
  const affPages = new Set();
  for (const p of pages) {
    const aff = p.links.filter((l) => /^https?:/i.test(l.href) && affRe.test(l.href));
    if (!aff.length) continue;
    affLinks += aff.length;
    affPages.add(p.path);
    if (!allowedAff.some((re) => re.test(p.path))) breaches.push({ rule: 'affiliate', path: p.path, msg: `${aff.length} affiliate link(s) on a page type that may not carry them` });
    const unmarked = aff.filter((l) => !/\bsponsored\b/.test(l.rel)).length;
    if (unmarked) breaches.push({ rule: 'affiliate', path: p.path, msg: `${unmarked} affiliate link(s) without rel="sponsored"` });
    const first = Math.min(...aff.filter((l) => l.inMain).map((l) => l.at));
    const d = p.text.search(discRe);
    if (Number.isFinite(first) && (d === -1 || d > first)) breaches.push({ rule: 'affiliate', path: p.path, msg: d === -1 ? 'no affiliate disclosure on the page' : 'the disclosure sits below the first affiliate link' });
  }

  // 5. the share of repeat sets
  const repeat = idx.filter((p) => p.set?.repeat).length;
  const share = idx.length ? repeat / idx.length : 0;
  const cap = policy.repeatShareMax?.[site];
  if (cap != null && share > cap + 0.005) breaches.push({ rule: 'repeat share', path: '(site)', msg: `page-per-place sets are ${pct(share)} of indexable pages; the cap is ${pct(cap)}` });

  return { site, domain, pages, idx, kinds, breaches, notes, thinAllowed, thinOk, affLinks, affPages, repeat, share, cap,
    folded: pages.filter((p) => p.noindex && p.set && (policy.folded?.[site]?.[p.set.match] || {})[p.seg[(p.set.kind || 1) - 1]]).length };
}

// ---------------------------------------------------------------- report
const results = Object.keys(SITES).map(checkSite).filter(Boolean);
if (!results.length) { console.error('gate: no built site found (dist-ca, dist-us, dist-bu). Run it after the build.'); process.exit(1); }
const line = (s = '') => console.log(s);
line(`Publishing gate · ${MODE === 'fail' ? 'breaches fail the build' : `warning only until ${policy.enforceFrom}`} · rules decided ${policy.decided}`);
let total = 0;
for (const r of results) {
  total += r.breaches.length;
  const hidden = r.pages.length - r.idx.length;
  line(`\n${r.domain}: ${fmt(r.idx.length)} pages offered to Google, ${fmt(hidden)} hidden${r.folded ? ` (${fmt(r.folded)} folded on purpose)` : ''}`);
  if (r.cap != null) line(`  page-per-place sets: ${fmt(r.repeat)} pages, ${pct(r.share)} of the site (cap ${pct(r.cap)})`);
  const judged = r.kinds.filter((k) => k.state !== 'folded');
  if (judged.length) {
    const label = (k) => (k.set.type === 'grid' ? `${k.kind} (${k.set.match.split('/')[1]})` : k.kind);
    const thin = [...judged].sort((a, b) => a.median - b.median).slice(0, 5).map((k) => `${label(k)} ${fmt(k.median)}`);
    line(`  thinnest sets, words only that page has: ${thin.join(' · ')}`);
    const short = judged.reduce((a, k) => a + k.short, 0);
    const pend = judged.filter((k) => k.state.startsWith('pending')).reduce((a, k) => a + k.short, 0);
    line(`  pages under ${policy.floors.ownWords} words of their own: ${fmt(short)}${pend ? ` (${fmt(pend)} under an exception with an end date)` : ''}`);
  }
  line(`  pages under ${policy.floors.pageWords} words: ${fmt(r.thinAllowed)} with a reason on file`);
  line(`  affiliate links: ${fmt(r.affLinks)} on ${fmt(r.affPages.size)} pages`);
  for (const nte of r.notes) line(`  note: ${nte}`);
  if (r.breaches.length) {
    const by = new Map();
    for (const b of r.breaches) { if (!by.has(b.rule)) by.set(b.rule, []); by.get(b.rule).push(b); }
    for (const [rule, list] of by) {
      line(`  ${MODE === 'fail' ? 'BREACH' : 'would fail'}: ${rule}: ${fmt(list.length)}${list.length === 1 ? ` (${list[0].path}: ${list[0].msg})` : ''}`);
      if (ARGS.has('--pages') || (list.length > 1 && list.length <= 6)) for (const b of list) line(`      ${b.path}  ${b.msg}`);
      else if (list.length > 6) line(`      e.g. ${list[0].path}  ${list[0].msg}   (--pages lists them all)`);
    }
  }
  if (ARGS.has('--sets')) {
    line(`  ${'set'.padEnd(30)} ${'kind'.padEnd(30)} ${'pages'.padStart(5)} ${'own words'.padStart(9)} ${'short'.padStart(5)}  state`);
    for (const k of [...r.kinds].sort((a, b) => a.set.match.localeCompare(b.set.match) || b.median - a.median)) {
      line(`  ${k.set.match.padEnd(30)} ${String(k.kind).slice(0, 30).padEnd(30)} ${String(k.n).padStart(5)} ${fmt(k.median).padStart(9)} ${String(k.short).padStart(5)}  ${k.state}`);
    }
  }
}
if (unknownEntities.size) line(`\nnote: HTML entities the gate does not decode: ${[...unknownEntities].join(', ')} (add them to NAMED in tools/thin/gate.mjs)`);
if (!total) { line('\nPublishing gate: clean.'); process.exit(0); }
if (MODE === 'fail') {
  line(`\nPublishing gate: ${fmt(total)} breach${total === 1 ? '' : 'es'}. Fix them, fold the set, or record an exception with an end date in src/data/index-policy.json (Dave's OK needed).`);
  process.exit(1);
}
line(`\nPublishing gate: ${fmt(total)} thing${total === 1 ? '' : 's'} would fail the build from ${policy.enforceFrom}.`);
