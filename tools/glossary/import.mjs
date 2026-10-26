// Validate a glossary JSON file and write it to src/data/glossary.json.
// Usage: node tools/glossary/import.mjs <path/to/glossary.json> [--check]
//
// Schema (one object per entry, wrapped as { checked, entries: [...] }):
//   slug             kebab-case id, unique (also the default URL segment)
//   slugCa / slugUs  optional URL segment for one country (e.g. slugUs "mold" for slug "mould")
//   term             display name; termCa / termUs override it per country
//   aka              other names as they appear on pages; akaCa / akaUs replace the list shown on one
//                    country's pages ("Also called", search), e.g. without CSA standard names on US pages
//   category         testing | envelope | hvac | water | bills | health | programs | climate
//   countries        ["ca"], ["us"] or both
//   short            one sentence, ≤ 160 characters (tooltip); shortCa / shortUs override
//   body             2–4 plain sentences; bodyCa / bodyUs override
//   whyItMatters     1–2 sentences on its role in an audit; whyCa / whyUs override
//   values           [{ label, value, source, countries? }]  typical / good / poor numbers, with a source URL
//   caNote / usNote  how the two countries differ
//   related          slugs of other entries
//   sources          URLs
//   match            { ci: [phrases], cs: [tokens], re: [regex sources], ca: {ci,cs,re}, us: {ci,cs,re},
//                      scoped: {ci,cs,re} (only on pages in scope.provinces) }
//   scope            { provinces: ["ON", ...] }  (optional; two-letter codes)
//                    generated from term + aka when missing (see genMatch below)
//   noLink           true = never auto-link the term (it still gets a glossary page)
// Text fields without a country override are localized at render time (mould/mold, vapour/vapor, …)
// by localize() in src/lib/glossary-patterns.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ciSource, csSource } from '../../src/lib/glossary-patterns.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'data', 'glossary.json');
const CATEGORIES = ['testing', 'envelope', 'hvac', 'water', 'bills', 'health', 'safety', 'programs', 'climate'];

/** Phrases too generic or ambiguous to auto-link (compared lower-case). */
const AMBIGUOUS = new Set([
  'draft', 'draught', 'drafts', 'draughts', 'zoning', 'setback', 'setbacks', 'ton', 'tons', 'condensation',
  'co', 'ac', 'er', 'ef', 'rn', 'lic', 'so', 'ci', 'rh', 'envelope', 'furnace room', 'mechanical room',
  'utility room', 'attic ventilation', 'bypasses', 'half wall', 'modulating', 'two-stage', 'multi-stage', 'marine',
  'mildew', 'formaldehyde', 'indoor air', 'bacteria test', 'utility program', 'energy efficiency rebate',
  'hybrid system', 'cycling on and off', 'region v', 'region iv', 'thm', 'pre-audit', 'post-audit',
  'initial assessment', 'energy rating', 'electric furnace', 'baseboard heaters', 'baseboard heat',
  'electric baseboard', 'electric baseboards', 'energy audit', 'home energy audit', 'energy audit report',
  'asbestos', 'asbestos insulation', 'lead paint', 'water testing', '25c', '25d', 'header', 'thermal', 'hybrid',
  'off-peak', 'on-peak', 'mid-peak', 'coastal climate', 'cooling climate', 'heating climate', 'mixed climate',
  'inch of water', 'in. w.c.', 'frost in the attic', 'sweating windows', 'mold', 'mould', 'molds', 'moulds',
  'black mold', 'black mould', 'mold growth', 'mould growth', 'programmable thermostat', 'canada', 'doe', 'closed',
  'ended', 'geothermal system', 'energy star', 'kwh', 'inverter', 'hes', 'sealed combustion',
]);

/** Entries never auto-linked in the draft (broadly understood words); a curated file can set noLink itself. */
const DRAFT_NO_LINK = new Set(['carbon-monoxide', 'kwh', 'mould', 'energy-star', 'dehumidifier', 'smart-thermostat', 'utility-rebate']);

/** URL segments that read better per country (draft only). */
const DRAFT_SLUGS = { mould: { slugUs: 'mold' }, 'vapour-barrier': { slugUs: 'vapor-barrier' } };

/** Extra patterns the aka lists can't express safely. */
const B0 = '(?<![\\p{L}\\p{N}])';
const B1 = '(?![\\p{L}\\p{N}])';
const EXTRA = {
  'pascal-50-pa': { re: [`${B0}\\d{1,3}[\\s\\u00a0]?Pa${B1}`] },
  gigajoule: { cs: ['GJ'] },
  'r-value': { re: [`${B0}R-?(?!22(?!\\d))(?!32(?!\\d))[1-9]\\d?(?:\\.\\d)?${B1}`] },
  rsi: { re: [`${B0}RSI[\\s\\u00a0\\-]?\\d+(?:\\.\\d+)?${B1}`] },
  ton: { re: [`${B0}\\d(?:\\.\\d)?[\\s\\u00a0\\-]?tons?${B1}`] },
  btu: { cs: ['Btu', 'Btu/h', 'Btu/hr', 'BTU/h'] },
  'tax-credit-25c': { re: [`${B0}(?:Section[\\s\\u00a0])?25C(?=[\\s\\u00a0]+(?:tax[\\s\\u00a0]+)?credit)`] },
  'tax-credit-25d': { re: [`${B0}(?:Section[\\s\\u00a0])?25D(?=[\\s\\u00a0]+(?:tax[\\s\\u00a0]+)?credit)`] },
  'cubic-metre-gas': { re: [`(?<=[\\d/][\\s\\u00a0]?)m³${B1}`, `(?<=[\\d/][\\s\\u00a0]?)m3${B1}`] },
};

const upperCount = (s) => (s.match(/\p{Lu}/gu) ?? []).length;

/** Term variants worth matching: the term without parenthetical asides, plus useful asides. */
function termCandidates(t) {
  if (!t || / \/ | and | vs\.? |: /.test(t)) return [];
  const out = [];
  const base = t.replace(/\s*\([^)]*\)/g, '').trim();
  if (base) out.push(base);
  for (const m of t.matchAll(/\(([^)]+)\)/g)) {
    const inner = m[1].trim();
    if (/[,]| and | vs\.? /.test(inner) || /^(of|for|in|the|a|an)\b/i.test(inner)) continue;
    out.push(inner);
  }
  return out;
}

function genMatch(e) {
  const ci = new Set();
  const cs = new Set();
  const cands = [...termCandidates(e.term), ...termCandidates(e.termCa), ...termCandidates(e.termUs), ...(e.aka ?? [])];
  for (const raw of cands) {
    const s = String(raw).trim().replace(/^["“]|["”]$/g, '');
    if (!s) continue;
    const lc = s.toLowerCase();
    if (AMBIGUOUS.has(lc)) continue;
    if (s.replace(/[^\p{L}\p{N}]/gu, '').length <= 2) continue;
    const hasDigit = /\d/.test(s);
    if (upperCount(s) >= 2 || (hasDigit && !/\s/.test(s))) cs.add(s);
    else ci.add(lc);
  }
  const m = { ci: [...ci], cs: [...cs] };
  const extra = EXTRA[e.slug];
  if (extra) {
    if (extra.cs) m.cs.push(...extra.cs.filter((x) => !m.cs.includes(x)));
    if (extra.re) m.re = [...extra.re];
  }
  return m;
}

function fail(msg) {
  console.error(`glossary import: ${msg}`);
  process.exitCode = 1;
}

const [, , inPath, flag] = process.argv;
if (!inPath) {
  console.error('usage: node tools/glossary/import.mjs <glossary.json> [--check]');
  process.exit(2);
}
const raw = JSON.parse(readFileSync(inPath, 'utf8'));
const list = Array.isArray(raw) ? raw : raw.entries;
if (!Array.isArray(list) || !list.length) {
  fail('no entries found');
  process.exit(1);
}
const isDraft = list.every((e) => !e.match);
const slugs = new Set();
const warnings = [];
const entries = [];
for (const e0 of list) {
  const e = { ...e0 };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.slug ?? '')) fail(`bad slug "${e.slug}"`);
  if (slugs.has(e.slug)) fail(`duplicate slug "${e.slug}"`);
  slugs.add(e.slug);
  for (const k of ['term', 'short', 'body']) if (!e[k]) fail(`${e.slug}: missing ${k}`);
  if (!e.whyItMatters && !(e.whyCa || e.whyUs)) fail(`${e.slug}: missing whyItMatters`);
  e.countries = (e.countries ?? []).filter((c) => c === 'ca' || c === 'us');
  if (!e.countries.length) fail(`${e.slug}: no countries`);
  if (!CATEGORIES.includes(e.category)) warnings.push(`${e.slug}: unknown category "${e.category}"`);
  for (const k of ['short', 'shortCa', 'shortUs']) if (e[k] && e[k].length > 160) warnings.push(`${e.slug}: ${k} is ${e[k].length} characters`);
  e.aka = (e.aka ?? []).map(String);
  for (const k of ['akaCa', 'akaUs']) if (e[k] !== undefined) e[k] = (Array.isArray(e[k]) ? e[k] : [e[k]]).map(String);
  e.values = (e.values ?? []).filter((v) => v && v.label && v.value);
  e.related = e.related ?? [];
  e.sources = (e.sources ?? []).filter((u) => /^https?:\/\//.test(u));
  if (isDraft) {
    if (DRAFT_NO_LINK.has(e.slug)) e.noLink = true;
    Object.assign(e, DRAFT_SLUGS[e.slug] ?? {});
  }
  if (!e.match) e.match = genMatch(e);
  entries.push(e);
}
// related slugs must exist
for (const e of entries) {
  const missing = e.related.filter((r) => !slugs.has(r));
  if (missing.length) warnings.push(`${e.slug}: dropped unknown related ${missing.join(', ')}`);
  e.related = e.related.filter((r) => slugs.has(r) && r !== e.slug);
}
// every pattern must compile; flag phrases claimed by two entries
const owner = new Map();
for (const e of entries) {
  const m = e.match;
  const groups = [m, m.ca ?? {}, m.us ?? {}, m.scoped ?? {}];
  if (m.scoped && !e.scope?.provinces?.length) warnings.push(`${e.slug}: match.scoped has no scope.provinces, so it never links`);
  for (const g of groups) {
    for (const p of g.ci ?? []) {
      try { new RegExp(ciSource(p), 'iu'); } catch (err) { fail(`${e.slug}: bad ci "${p}": ${err.message}`); }
      for (const c of e.countries) {
        const k = `${c}:ci:${p.toLowerCase()}`;
        if (owner.has(k) && owner.get(k) !== e.slug) warnings.push(`"${p}" claimed by ${owner.get(k)} and ${e.slug} (${c})`);
        owner.set(k, e.slug);
      }
    }
    for (const p of g.cs ?? []) {
      try { new RegExp(csSource(p), 'u'); } catch (err) { fail(`${e.slug}: bad cs "${p}": ${err.message}`); }
      for (const c of e.countries) {
        const k = `${c}:cs:${p}`;
        if (owner.has(k) && owner.get(k) !== e.slug) warnings.push(`"${p}" claimed by ${owner.get(k)} and ${e.slug} (${c})`);
        owner.set(k, e.slug);
      }
    }
    for (const p of g.re ?? []) {
      try { new RegExp(p, 'u'); } catch (err) { fail(`${e.slug}: bad re "${p}": ${err.message}`); }
    }
  }
}
for (const w of warnings) console.warn(`glossary import: warning: ${w}`);
const out = {
  checked: raw.checked ?? null,
  imported: new Date().toISOString().slice(0, 10),
  source: isDraft ? 'draft (match patterns generated by tools/glossary/import.mjs)' : 'curated',
  entries,
};
const counts = { ca: entries.filter((e) => e.countries.includes('ca')).length, us: entries.filter((e) => e.countries.includes('us')).length };
if (process.exitCode) {
  console.error('glossary import: not written (fix the errors above)');
} else if (flag === '--check') {
  console.log(`glossary import: ${entries.length} entries OK (ca ${counts.ca}, us ${counts.us}); --check, nothing written`);
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`glossary import: wrote ${entries.length} entries (ca ${counts.ca}, us ${counts.us}) to src/data/glossary.json`);
}
