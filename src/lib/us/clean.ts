/**
 * Homeowner wording for the US research records.
 *
 * The research files (src/data/us/metros/*.json, federal.json) were written as working notes:
 * "blocked automated access", "were not researched", "TDHCA's WAP subrecipient",
 * "From Xcel's … Rebate Summary (form 26-04-601)". Pages show the same facts as guidance: what the
 * program is, who runs it and what to check. Provenance stays in each record's sources list (links and
 * the date they were checked), so nothing here removes a fact a homeowner can act on.
 *
 * cleanNote() works sentence by sentence: notes about our own research are dropped or turned into
 * an action ("Confirm current amounts with the program"), and agency shorthand is spelled out.
 * tools/us/clean-test.ts prints every rewrite for review.
 */

/** Sentences that only describe how the research was done: dropped. */
const DROP = [
  /\bblocked automated access\b/i,
  /\b(?:refused|blocks?|blocked) (?:automated|scripted) (?:access|fetching|fetches|reading|readers|requests)\b/i,
  /\bautomated (?:access|fetch(?:es|ing)?|readers|requests)\b/i,
  /\bscripted requests?\b/i,
  /\bWebFetch\b/,
  /\bcurl\b/,
  /\bdirect (?:HTTP )?requests? (?:were|was) denied\b/i,
  /\bblocked direct downloads\b/i,
  /\breturned errors\b/i,
  /\bresearch tool\b/i,
  /\bweb-search budget\b|\bsearch budget\b/i,
  /\b(?:could not|couldn['’]t) be (?:read|loaded|opened|fetched|retrieved)\b/i,
  /\b(?:was|were) not (?:read|readable|opened|loaded)\b/i,
  /\bnot readable\b/i,
  /\bthe statute text was not opened\b/i,
  /\bour (?:state-by-state )?check(?:,| but|;)? (?:couldn['’]t|could not)\b/i,
  /\bcouldn['’]t be reached for our\b/i,
  /^Could not verify\b/i,
  /^Provider directories not verified\.?$/i,
  /\bbefore publishing\b/i,
  /\bThe brief['’]s\b/,
  /\bload dynamically\b/i,
  /\bguessed (?:IRA )?page URL\b/i,
  /\bfailed to load\b/i,
  /\b(?:left|are|is) null\b|\bnull with a note\b/i,
  /\bwere checked by fetching\b/i,
  /\bno before\/after comparison\b/i,
];

/** Dropped research sentences that should not turn into an action either. */
const SILENT = /\bprovider directories\b|\bno before\/after comparison\b/i;

/** Wording that says a detail wasn't confirmed. */
const CAVEAT = String.raw`not (?:independently |individually )?(?:been )?(?:verified|confirmed|checked)|(?:was|were|is|are)n['’]t (?:verified|confirmed|checked)|unverified|unconfirmed|could(?:n['’]t| not) be (?:verified|confirmed|checked)|not re-?confirmed|Not verifiable|no [^.;,()]*? (?:was|were) checked`;
const UNCONFIRMED = new RegExp(String.raw`\b(?:${CAVEAT})\b|^No\b[^.]*\b(?:was|were|could be) (?:verified|confirmed)\b`, 'i');
const HEAD_SPLIT = new RegExp(String.raw`[;,]\s*(?=[^;,]*\b(?:${CAVEAT})\b)`, 'i');

/** A bracketed note about how a page was read: removed. */
const RESEARCH_PAREN = /\b(?:blocked automated access|automated|WebFetch|fetch errors?|Cloudflare|scripted)\b|\bpage (?:not )?found\b|\bno rebate program page\b|\bnot reachable\b/i;

/** Clauses that describe a web page rather than the program (dropped inside unconfirmed sentences). */
const PAGE_TALK = /\b(?:page|website|web site|site|map|PDF)\b/i;

function actionFor(sentence: string): string {
  const s = sentence.toLowerCase();
  if (/\badministrator\b|\bwho runs\b|\brun by\b|\bimplement(?:er|ed by)\b|\bbrand(?:s|ed|ing)?\b/.test(s)) return '';
  if (/\bamounts?\b|\bdollar|\$|\bper (?:ton|unit|measure|kw)\b|\bhow much\b|\bcaps?\b|\bpercent\b|%/.test(s)) return 'Confirm current amounts with the program before you buy.';
  if (/eligib|requirement|\brules?\b|qualif|income limit/.test(s)) return 'Check the eligibility rules with the program before you apply.';
  if (/territory|count(?:y|ies)|coverage|boroughs|service area|\bserves?\b|\btowns\b|\bcities\b|which (?:one|utility)/.test(s)) return 'Check your bill or the utility’s website to confirm it serves your address.';
  if (/status|\bopen\b|enrol|accepting|waitlist|application|launch|passed|in effect/.test(s)) return 'Ask the program whether it is taking applications now.';
  return '';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Phrase-level rewrites applied to every sentence. */
const REWRITES: [RegExp, string | ((...a: string[]) => string)][] = [
  [/^(?:Also )?[Ss]urprising:\s*/, ''],
  [/^Note:\s*/, ''],
  [/,? but this was not exhaustively searched/gi, ''],
  [/,? that I could find\b/gi, ''],
  [/\s*for this file\b/gi, ''],
  [/\bthis file\b/gi, 'this guide'],
  [/,? which is a direct hook for audityourhome\.com/gi, ''],
  [/\baudityourhome\.com should ask which utility is on the bill\b/gi, 'check which utility is on your bill'],
  [/\bConfirm the utility by address before showing programs\b/g, 'Check your bill to see which utility serves your address'],
  [/\bcheck (?:those|them|these) before publishing amounts\b/gi, 'confirm current amounts with the utility before you count on them'],
  [/\bDo not list either as a current incentive\b/g, 'Neither credit is available for work done in 2026 or later'],
  [/^(\S.*?) is the only metro in this batch where (.+)$/, (_m, who, rest) => `In ${who}, ${rest}`],
  [/^(\S.*?) is the only metro in this batch with (.+)$/, (_m, who, rest) => `${who} has ${rest}`],
  [/\bhas the thinnest market-rate rebate picture of the six metros\b/g, 'has a thin market-rate rebate picture'],
  [/\bof the Texas metros here\b/g, 'of the Texas metros we cover'],
  [/^No (.+?) (?:was|were) found on the (.+?) pages reviewed\b/, (_m, what, where) => `The ${where} websites list no ${what}`],
  [/\bpages opened\b/g, 'pages'],
  [/^No (?:[A-Z]{2,5} |public )?directory(?: URL)? (?:was )?verified\.?$/, ''],
  [/^No (.+?) (?:(?:was|were|could be) )?(?:verified|confirmed|found)\.?$/, 'We know of no $1.'],
  [/^Only (?:(\w+)['’]s )?(.+?) (?:is|are) verified\.?$/, (_m, who: string | undefined, what: string) =>
    `${who ? `${who} publishes` : 'The program publishes'} only ${/^the\b/i.test(what) ? what : `the ${what}`}; confirm amounts for each upgrade with the program.`],
  [/^Not re-checked on [A-Z][a-z]+ \d+ \([^)]*\):\s*/, ''],
  [/\b(?:in|during|from) our (October \d+) check\b/g, 'as of $1'],
  [/\bour (October \d+) check\b/g, '$1'],
  [/\s*[—–-]\s*program page not reachable\b/g, ''],
  [/^No Home Energy Rebates page found on the (.+?) site\b/, 'The $1 site has no Home Energy Rebates page'],
  [/;\s*no (\d{4}) update found\b/g, '; it has no $1 update'],
  [/^(.+?) pages returned 'No content found'(?: \([^)]*\))?;\s*its\b/, '$1’s'],
  [/\bI (?:could not|couldn['’]t) find (?:an? )?(?:current |official )*(?:[A-Z][\w.&/-]* )?(?:page|source) confirming (?:that )?(.+?)(?=[.;]|$)/g, 'Check whether $1'],
  [/\bI (?:could not|couldn['’]t) find\b/g, 'There is no sign of'],
  [/\b(?:were|are) not researched(?: here| in detail)?\b/gi, 'aren’t covered in this guide'],
  [/\b(?:was|is) not researched(?: here| in detail)?\b/gi, 'isn’t covered in this guide'],
  [/\bnot researched(?: here| in detail)?\b/gi, 'not covered in this guide'],
  [/\bIts programs aren’t covered in this guide\b/g, 'Ask it directly about its programs'],
  [/\bTDHCA['’]?s? WAP subrecipient for ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)? County)/g, 'the local Weatherization Assistance Program provider for $1'],
  [/\bTDHCA WAP subrecipient\b/g, 'the local Weatherization Assistance Program provider'],
  [/\bWAP subrecipient\b/g, 'local Weatherization Assistance Program provider'],
  [/^TDHCA subrecipients(?: \(list updated [^)]*\))?$/, 'Local agencies funded by TDHCA'],
  [/\bTDHCA['’]s (?:\d{1,2}\/\d{1,2}\/\d{4} )?subrecipient list(?: updated \d{1,2}\/\d{1,2}\/\d{4})?/g, 'TDHCA’s list of local providers'],
  [/\bsubrecipients\b/g, 'local providers'],
  [/\bsubrecipient\b/g, 'local provider'],
  [/,? as stated on [^.;]+?page\b/gi, ''],
  [/\bFrom [A-Z][\w&.' -]+ Rebate Summary \((?:PDF, )?form [\d-]+(?:, '[^']*')?\)\.\s*/g, ''],
  [/\s*\((?:PDF, )?form \d{2}-\d{2}-\d{3}[^)]*\)/g, ''],
  [/\bin our research\b/gi, 'in the programs we track'],
  [/\bTwo in our research do\b/g, 'Two programs we track do'],
  [/\bour research found\b/gi, 'we found'],
  [/\bour research rated\b/gi, 'we rate'],
  [/\bper our research\b/gi, 'by our count'],
  [/\b(\d+) programs? in our research\b/gi, '$1 programs we track'],
  [/^Status: (?:Unverified|Unconfirmed)\.\s*/i, ''],
  [/\bThe (\w+) page links an active online application but (?:does not say|says nothing about) whether (.+?)(?=[.;]|$)/g, 'The $1 page has an online application; ask the program whether $2'],
  [/\b[Tt]he (?:[\w-]+ )?page (?:does not say|says nothing about) whether (.+?)(?=[.;]|$)/g, 'Ask the program whether $1'],
  [/\bopen\/closed status not stated\b/g, 'ask whether it is open'],
  [/\bThe ([\w -]+?) is not stated on the page\b/g, 'Ask the program for the $1'],
  [/\b[Ii]t does not say whether (.+?)(?=[.;]|$)/g, 'Ask whether $1'],
  [/\bTreat (?:it|status|the status) as pending or unverified\b/g, 'Treat it as pending'],
  [/\bTreat (?:status|the status|it) as unverified\b/g, 'Check with the program before you count on it'],
  [/\bNo radon-specific credential found(?: \([^)]*\))?/g, 'No state radon license'],
  [/\bNo state license found\b/g, 'No state license'],
  [/\bNRPP\/NRSB\b/g, 'National Radon Proficiency Program (NRPP) or National Radon Safety Board (NRSB)'],
  [/\bNone found\b/g, 'None'],
  [/\bAs of (20\d\d)-(\d\d)-(\d\d)\b/g, (_m, y, mo, d) => `As of ${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}`],
  [/\bas of (20\d\d)-(\d\d)-(\d\d)\b/g, (_m, y, mo, d) => `as of ${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}`],
];

/** Agency and program shorthand spelled out on first use in a note ([abbr, name, takes "the"]). */
const EXPAND: [string, string, boolean][] = [
  ['TDHCA', 'Texas Department of Housing and Community Affairs', true],
  ['WAP', 'Weatherization Assistance Program', true],
  ['LIHEAP', 'Low Income Home Energy Assistance Program', false],
  ['PUCT', 'Public Utility Commission of Texas', true],
];
const ARTICLE_BEFORE = /\b(?:routes|through|for|in|from|via|with|under|by|about|per|to|runs|offers|funds|Under|Per)\s+$/;

/** Spell out `abbr` on its first use in `text` ("TDHCA" → "the Texas Department of … (TDHCA)"), unless the name is already there. */
export function expandFirst(text: string, abbr: string, name: string, article = true): string {
  if (text.includes(name)) return text;
  const esc = abbr.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const m = new RegExp(String.raw`(?<![(\w-])${esc}(['’]s)?(?![\w-]|\))`).exec(text);
  if (!m) return text;
  const before = text.slice(0, m.index);
  const atStart = before.trim() === '' || /[.!?:]\s+$/.test(before);
  const afterSemi = /;\s+$/.test(before);
  const hasArticle = /\bthe\s+$/i.test(before);
  const possessive = !!m[1];
  const lead = article && !hasArticle && (atStart || afterSemi || possessive || ARTICLE_BEFORE.test(before)) ? (atStart ? 'The ' : 'the ') : '';
  const own = possessive ? (name.endsWith('s') ? '’' : '’s') : '';
  return before + `${lead}${name}${own} (${abbr})` + text.slice(m.index + m[0].length);
}

const ABBREV = /\b(?:e\.g|i\.e|etc|vs|No|Inc|Corp|Co|Ltd|St|Mt|Ft|Dept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|D\.C|H\.R|P\.L|Sec|Stat|Gov|Ann|Rev|approx|Ave|Blvd|Rd|a\.m|p\.m|in|sq|ft|lb|oz)\.$/;

/** Split prose into sentences (on . ! ?) without breaking abbreviations, decimals or ellipses. */
function sentences(t: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if ((ch === '.' || ch === '!' || ch === '?') && (i + 1 === t.length || /\s/.test(t[i + 1]))) {
      if (ch === '.' && t[i - 1] === '.') continue; // "…pilot... with two agencies"
      const piece = t.slice(start, i + 1);
      if (ch === '.' && ABBREV.test(piece.trim().split(/\s+/).slice(-1)[0] ?? '')) continue;
      out.push(piece.trim());
      start = i + 1;
    }
  }
  const rest = t.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

const STARTS_UPPER = /^['‘"“(]?[A-Z0-9$]/;
const cap = (s: string) => s.replace(/^(['‘"“(]?)([a-z])/, (_m, q: string, c: string) => q + c.toUpperCase());

/** Plain-language version of a research note (empty string when nothing actionable is left). */
export function cleanNote(input: string | null | undefined): string {
  if (!input) return input ?? '';
  const raw = String(input);
  if (/^(https?:\/\/\S+|\d{4}-\d{2}-\d{2})$/.test(raw.trim())) return raw;
  const kept: string[] = [];
  const actions = new Set<string>();
  for (const original of sentences(raw)) {
    let s = original.replace(/\s*\(([^()]*)\)/g, (m, inner: string) => {
      if (RESEARCH_PAREN.test(inner)) return '';
      if (!UNCONFIRMED.test(inner)) return m;
      const a = actionFor(inner);
      if (a) actions.add(a);
      const rest = inner.split(/[,;]\s*/).filter((c) => !UNCONFIRMED.test(c)).join(', ').trim();
      return rest.split(/\s+/).length >= 2 ? ` (${rest})` : '';
    });
    if (DROP.some((re) => re.test(s))) {
      if (UNCONFIRMED.test(s) && !SILENT.test(s)) { const a = actionFor(s); if (a) actions.add(a); }
      const tail = s.match(/,\s*so\s+((?:verify|check|confirm|ask|call)\b[^.]*?)\.?$/i);
      if (tail && !/\bthere$/i.test(tail[1])) kept.push(cap(tail[1]) + '.');
      continue;
    }
    for (const [re, rep] of REWRITES) s = s.replace(re, rep as never);
    s = s.trim();
    if (STARTS_UPPER.test(original) && /^['‘"“(]?[a-z]/.test(s)) s = cap(s);
    if (UNCONFIRMED.test(s)) {
      const a = actionFor(s);
      if (a) actions.add(a);
      const clauses = s.split(/;\s+|,\s+(?=(?:and|but|so|while)\s)/);
      const good = clauses.filter((c) => !UNCONFIRMED.test(c) && !PAGE_TALK.test(c));
      if (clauses.length > 1 && good.length) {
        const joined = good.map((c, i) => (i === 0 ? c.replace(/^(?:and|but|so|while)\s+/i, '') : c)).join('; ');
        kept.push(cap(joined.replace(/[.!?]?$/, '.')));
      } else if (clauses.length === 1) {
        // a fact before a trailing caveat: "split among A, B and C, plus others that were not verified"
        const head = s.split(HEAD_SPLIT)[0];
        if (head !== s && head.split(/\s+/).length >= 5 && !UNCONFIRMED.test(head) && !PAGE_TALK.test(head)) {
          kept.push(head.replace(/[,;]\s*$/, '').replace(/[.!?]?$/, '.'));
        }
      }
      continue;
    }
    if (s && !/^[.;,:]+$/.test(s)) kept.push(s);
  }
  const text = kept.join(' ');
  for (const a of actions) {
    if (kept.includes(a)) continue;
    if (/your bill/.test(a) && /your bill|by address/i.test(text)) continue;
    kept.push(a);
  }
  let out = kept.join(' ').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s*\)/g, '').replace(/(?<!\.)\.\.(?!\.)/g, '.').trim();
  for (const [abbr, name, article] of EXPAND) out = expandFirst(out, abbr, name, article);
  return out;
}

/** Keys whose string values are links, dates, ids, names or citations: never rewritten. */
const KEEP = new Set(['href', 'url', 'urls', 'label', 'checked', 'category', 'slug', 'states', 'source', 'sources', 'findAProUrl', 'name',
  'findUrl', 'date', 'id', 'law', 'asOf', 'preparedBy', 'method', 'fieldNotes', 'title', 'state', 'stateName', 'status',
  'metroName', 'principalCity', 'urlLabel', 'event', 'lastEligible']);

/**
 * Deep copy of a research record with every display string run through cleanNote. Status fields,
 * links and names stay raw; source lists stay exactly as recorded. A KEEP key protects strings
 * (and lists of strings) only, so `homeEnergyRebates.states`, a list of records, is still cleaned.
 */
export function cleanRecord<T>(o: T, key = ''): T {
  if (typeof o === 'string') return (KEEP.has(key) ? o : cleanNote(o)) as T;
  if (Array.isArray(o)) return o.map((v) => cleanRecord(v, key)) as T;
  if (o && typeof o === 'object') {
    if (key === 'sources' || key === 'source') return o;
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cleanRecord(v, k)])) as T;
  }
  return o;
}

/** Status wording for display: the raw text drives the chip, this is what people read next to it. */
export function cleanStatus(text: string | null | undefined): string {
  if (!text) return '';
  const c = cleanNote(text);
  return c || 'Ask the program whether it is taking applications now.';
}
