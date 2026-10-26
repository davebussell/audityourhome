// Glossary term matching, shared by the build-time linker (tools/glossary/link.mjs) and the data the
// browser linker (public/gl.js) receives through GlossaryRuntime.astro. Plain ESM so Node can import it
// without a build step. public/gl.js re-implements buildMatchers/findMatches in a few lines: keep the two
// in step if you change the rules here.
//
// An entry's `match` object (see tools/glossary/import.mjs):
//   ci: case-insensitive phrases ("blower door test"); spaces and hyphens match each other, a trailing
//       s/es plural is allowed, and the phrase must start and end on a word boundary.
//   cs: case-sensitive tokens ("ACH50", "EnerGuide", "Bq/m³"), word boundaries at alphanumeric ends.
//   re: raw regular-expression sources (Unicode mode, case-sensitive); they carry their own boundaries.
//   ca / us: { ci, cs, re } extras used on that country's pages only.
// Entries with noLink: true are never linked (they still get a glossary page).

const ALNUM = /[\p{L}\p{N}]/u;
const B_START = '(?<![\\p{L}\\p{N}])';
const B_END = '(?![\\p{L}\\p{N}])';
const SEP = '[\\s\\u00a0\\-\\u2010\\u2011]';

function escapeRe(s) {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

/** Regex source for a case-insensitive phrase. */
export function ciSource(phrase) {
  const p = phrase.trim();
  const words = p.split(/[\s \-‐‑]+/).filter(Boolean).map(escapeRe);
  let src = words.join(SEP);
  const last = p[p.length - 1];
  if (/[a-z]/i.test(last) && !/s$/i.test(p)) src += '(?:es|s)?';
  return (ALNUM.test(p[0]) ? B_START : '') + src + (ALNUM.test(last) ? B_END : '');
}

/** Regex source for a case-sensitive token. */
export function csSource(token) {
  const t = token.trim();
  const src = escapeRe(t).replace(/ /g, '[\\s\\u00a0]');
  return (ALNUM.test(t[0]) ? B_START : '') + src + (ALNUM.test(t[t.length - 1]) ? B_END : '');
}

function weight(s) {
  return s.length;
}

const FIRST_TOKEN = /^[\p{L}\p{N}]+/u;

/**
 * Every pattern an entry contributes on one country's pages, as { slug, kind, src, w, key }:
 * kind "ci" (case-insensitive) or "cs" (case-sensitive; raw `re` patterns are cs too), w = length (longest
 * wins), key = the pattern's first word (lower-case for ci), which is how the matcher finds candidates
 * quickly. Patterns that don't start with a letter or digit, and raw regexes, have key null and are
 * scanned directly.
 */
export function patternsFor(entry, country) {
  const m = entry.match ?? {};
  const extra = m[country] ?? {};
  const out = [];
  for (const p of [...(m.ci ?? []), ...(extra.ci ?? [])]) {
    const t = p.trim();
    const first = FIRST_TOKEN.exec(t);
    const key = first ? first[0].toLowerCase() : null;
    const single = !!first && first[0].length === t.length && /[a-z]$/i.test(t) && !/s$/i.test(t);
    out.push({ slug: entry.slug, kind: 'ci', src: ciSource(t), w: weight(t), key, plural: single });
  }
  for (const p of [...(m.cs ?? []), ...(extra.cs ?? [])]) {
    const t = p.trim();
    const first = FIRST_TOKEN.exec(t);
    out.push({ slug: entry.slug, kind: 'cs', src: csSource(t), w: weight(t), key: first ? first[0] : null });
  }
  for (const p of [...(m.re ?? []), ...(extra.re ?? [])]) out.push({ slug: entry.slug, kind: 'cs', src: p, w: 5, key: null });
  return out;
}

/** Entries that apply to a country and may be linked. */
export function linkableEntries(entries, country) {
  return entries.filter((e) => !e.noLink && (e.countries ?? []).includes(country));
}

function addKey(map, key, item) {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/**
 * Index the patterns for fast matching: candidates are looked up by the word a match would start
 * with, then tested in place with a sticky regex. Returns { ci: Map, cs: Map, loose: [] }.
 */
export function buildMatchers(entries, country) {
  const ci = new Map();
  const cs = new Map();
  const loose = [];
  for (const e of linkableEntries(entries, country)) {
    for (const p of patternsFor(e, country)) {
      if (p.key === null) {
        loose.push({ slug: p.slug, re: new RegExp(p.src, p.kind === 'ci' ? 'giu' : 'gu'), w: p.w });
        continue;
      }
      const item = { slug: p.slug, re: new RegExp(p.src, p.kind === 'ci' ? 'iuy' : 'uy'), w: p.w };
      if (p.kind === 'ci') {
        addKey(ci, p.key, item);
        if (p.plural) {
          addKey(ci, `${p.key}s`, item);
          addKey(ci, `${p.key}es`, item);
        }
      } else addKey(cs, p.key, item);
    }
  }
  for (const map of [ci, cs]) for (const list of map.values()) list.sort((a, b) => b.w - a.w);
  return { ci, cs, loose };
}

const TOKENS = /[\p{L}\p{N}]+/gu;

function tryList(list, text, at, out) {
  if (!list) return;
  for (const c of list) {
    c.re.lastIndex = at;
    const m = c.re.exec(text);
    if (m && m.index === at && m[0].length) {
      out.push({ start: at, end: at + m[0].length, slug: c.slug });
      return; // lists are longest-first
    }
  }
}

/**
 * Matches to link in one run of text. `used` (a Set of slugs already linked on the page) is updated.
 * A match for a term that is already linked still "uses up" its span, so a shorter term inside it
 * isn't linked either. `skip` is a slug never to link (a glossary page's own term).
 */
export function findMatches(text, matchers, used, skip = null) {
  const all = [];
  TOKENS.lastIndex = 0;
  let t;
  while ((t = TOKENS.exec(text))) {
    tryList(matchers.ci.get(t[0].toLowerCase()), text, t.index, all);
    tryList(matchers.cs.get(t[0]), text, t.index, all);
  }
  for (const l of matchers.loose) {
    l.re.lastIndex = 0;
    let m;
    while ((m = l.re.exec(text))) {
      if (!m[0].length) {
        l.re.lastIndex++;
        continue;
      }
      all.push({ start: m.index, end: m.index + m[0].length, slug: l.slug });
    }
  }
  if (!all.length) return [];
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let lastEnd = -1;
  for (const c of all) {
    if (c.start < lastEnd) continue;
    lastEnd = c.end;
    if (used.has(c.slug) || c.slug === skip) continue;
    used.add(c.slug);
    out.push(c);
  }
  return out;
}

// ------------------------------------------------------------------ per-country text

const TO_US = [
  [/\bmould/g, 'mold'], [/\bMould/g, 'Mold'], [/\bvapour/g, 'vapor'], [/\bVapour/g, 'Vapor'],
  [/\bfibreglass/g, 'fiberglass'], [/\bFibreglass/g, 'Fiberglass'], [/\bcentre(s?)\b/g, 'center$1'],
  [/\bCentre(s?)\b/g, 'Center$1'], [/\bmetre/g, 'meter'], [/\bMetre/g, 'Meter'], [/\blitre/g, 'liter'],
  [/\bLitre/g, 'Liter'], [/\bcolour/g, 'color'], [/\bColour/g, 'Color'], [/\bbehaviour/g, 'behavior'],
  [/\borganisation/g, 'organization'], [/\bdepressurisation/g, 'depressurization'], [/\bdraught/g, 'draft'],
  [/\bDraught/g, 'Draft'],
];
const TO_CA = [
  [/\bmold(?=(?:s|y|ing|ed)?\b)/g, 'mould'], [/\bMold(?=(?:s|y|ing|ed)?\b)/g, 'Mould'], [/\bvapor/g, 'vapour'],
  [/\bVapor/g, 'Vapour'], [/\bfiberglass/g, 'fibreglass'], [/\bFiberglass/g, 'Fibreglass'], [/\bcolor/g, 'colour'],
  [/\bColor/g, 'Colour'], [/\bbehavior/g, 'behaviour'], [/\bliter(s?)\b/g, 'litre$1'],
];

/** Canadian or US spelling for text that has no per-country version. */
export function localize(text, country) {
  if (!text) return text;
  let t = text;
  for (const [re, rep] of country === 'us' ? TO_US : TO_CA) t = t.replace(re, rep);
  return t;
}

const pick = (e, base, ca, us, c) => (c === 'us' ? e[us] : e[ca]) ?? localize(e[base], c);

/** Display term for a country; "Mold (mold)" style duplicates collapse to "Mold". */
export function termFor(e, c) {
  const t = pick(e, 'term', 'termCa', 'termUs', c);
  const m = t.match(/^(.+?) \(([^)]+)\)$/);
  return m && m[1].toLowerCase() === m[2].toLowerCase() ? m[1] : t;
}
export const shortFor = (e, c) => pick(e, 'short', 'shortCa', 'shortUs', c);
export const bodyFor = (e, c) => pick(e, 'body', 'bodyCa', 'bodyUs', c);
export const whyFor = (e, c) => (c === 'us' ? e.whyUs : e.whyCa) ?? localize(e.whyItMatters, c);
/** URL segment for a country. */
export const slugFor = (e, c) => (c === 'us' ? e.slugUs : e.slugCa) ?? e.slug;
export const hrefFor = (e, c) => `/${c}/glossary/${slugFor(e, c)}/`;

// ------------------------------------------------------------------ "What is …?" phrasing

const COUNTABLE = /^(?:test|pump|joist|wall|dam|heater|barrier|retarder|bypass|vent|baffle|furnace|system|thermostat|calculation|score|label|rating|dehumidifier|ventilator|evaluation|advisor|organization|organisation|rebate|credit|report|zone|certificate|camera|monitor|rater|program|loan|grant|screen|rainscreen|compressor|split|point|temperature|climate|home|audit|assessment|metre|meter|ton|therm|gigajoule|kilowatt-hour|setback|unit|mini-split|envelope|tier)$/i;
const NOT_PLURAL = /^(?:asbestos|gas|bypass|mass|status|analysis|gross|plus|bonus|lens)$/i;
const THE = /^(?:Program|Grant|Loan|Rebates?|Credit|Act|Index|Network|Institute|Score|Report|System)$/i;
const WORDLIKE = /^(?:MERV|RESNET|NEEP|PACE|HOMES|WAP|HERS|CEE|OBBBA|CEIP|HELP|SEER|SEER2|HSPF|HSPF2|AFUE|UEF)$/;
/** "a" or "an" by sound: spelled-out acronyms (an HRV, an NBC zone), words (a utility, an attic). */
function articleFor(word) {
  const w = word.replace(/^[^\p{L}\p{N}]+/u, '');
  const first = w.split(/[\s\-/]/)[0];
  if (/^[\p{Lu}\d]{2,}$/u.test(first) && !WORDLIKE.test(first)) return /^[AEFHILMNORSX8]/.test(w) ? 'an ' : 'a ';
  if (/^(?:uni|use|usu|uti|ure|uro|eu|one)/i.test(w)) return 'a ';
  return /^[aeiou]/i.test(w) ? 'an ' : 'a ';
}
const acronymLike = (w) => /\p{Lu}.*\p{Lu}|\d/u.test(w);

/**
 * Pieces of the question "What is a blower door test?" for a display term: { lead, paren, acronym }.
 * Ordinary terms get an article and lower case ("a blower door test"), names keep their capitals
 * ("the Inflation Reduction Act"), plurals get "are".
 */
export function questionParts(term) {
  const raw = term.replace(/\s*\((?:closed|ended)\)/gi, '').trim();
  const paren = raw.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;
  let base = raw.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (base.includes(':')) base = base.split(':')[0].trim();
  const slash = base.split(' / ');
  if (slash.length > 1 && slash[0].includes(' ')) base = slash[0].trim();
  const words = base.split(' ');
  const prep = words.findIndex((w, i) => i > 0 && /^(?:of|for|in|at)$/.test(w));
  const head = (prep > 0 ? words[prep - 1] : words[words.length - 1]) ?? '';
  const acronym = acronymLike(words[0] ?? '');
  const proper = !acronym && words.filter((w) => /^\p{Lu}/u.test(w) && w.replace(/[^\p{L}]/gu, '').length >= 3).length >= 2;
  const plural = / and /.test(base) || (/[^s]s$/.test(head) && !/(?:ss|us|is)$/.test(head) && !NOT_PLURAL.test(head));
  const countable = !plural && COUNTABLE.test(head);
  let subject;
  if (proper) subject = (THE.test(head) ? 'the ' : '') + base;
  else if (acronym) {
    const lowerHead = /^\p{Ll}/u.test(head);
    subject = (THE.test(head) && !lowerHead ? 'the ' : countable && lowerHead ? articleFor(base) : '') + base;
  } else {
    const lowered = /^\p{Lu}\p{Ll}+(?:-\p{Ll}*)*$/u.test(words[0] ?? '') ? base.charAt(0).toLowerCase() + base.slice(1) : base;
    subject = (countable ? articleFor(lowered) : '') + lowered;
  }
  const parenIsAcronym = !!paren && acronymLike(paren) && paren.length <= 8 && !/\s/.test(paren);
  if (!acronym && parenIsAcronym) subject += ` (${paren})`;
  return { lead: `What ${plural ? 'are' : 'is'} ${subject}?`, paren, parenIsAcronym, acronym };
}
export const questionFor = (e, c) => questionParts(termFor(e, c)).lead;

/**
 * The compact pattern data public/gl.js needs to link dynamic content on one country's pages:
 * per entry { g: slug, ci?: [phrases], cs?: [tokens], re?: [regex sources] } with the country extras
 * merged in. gl.js turns phrases and tokens into regexes with the same rules as ciSource / csSource.
 */
export function runtimePatterns(entries, country) {
  return linkableEntries(entries, country).map((e) => {
    const m = e.match ?? {};
    const x = m[country] ?? {};
    const out = { g: e.slug };
    const ci = [...(m.ci ?? []), ...(x.ci ?? [])];
    const cs = [...(m.cs ?? []), ...(x.cs ?? [])];
    const re = [...(m.re ?? []), ...(x.re ?? [])];
    if (ci.length) out.ci = ci;
    if (cs.length) out.cs = cs;
    if (re.length) out.re = re;
    return out;
  });
}
