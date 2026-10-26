/**
 * Pure helpers that turn the metro research records (src/data/us/metros/*.json) into short labels
 * for cards and tables. Nothing here adds facts: every label is read out of the record's own
 * wording, and anything the parser doesn't recognise falls back to "see the program".
 * No imports, so the functions can be tested with plain Node.
 */

// ---------------------------------------------------------------- audit program cost
export type CostKind = 'free' | 'fee' | 'discount' | 'varies' | 'unpublished';

export interface CostInfo {
  kind: CostKind;
  /** lowest published out-of-pocket price in US$ (0 = free); null when the provider sets it or it isn't published */
  min: number | null;
  /** short label for cards and tables */
  label: string;
  /** true when only a virtual or online option is free (an in-person visit costs extra) */
  freeOnlyRemote?: boolean;
}

interface CostRule {
  test: RegExp;
  info: CostInfo;
}

/**
 * Tiered or conditional prices, matched on the record's exact wording (checked October 12, 2026).
 * Each pattern includes the dollar figures it summarises, so a changed record falls through to the
 * generic reader instead of keeping a stale label.
 */
const COST_RULES: CostRule[] = [
  { test: /^Virtual: free\. In-home: free for income-qualified.*otherwise a \$49 fee/i, info: { kind: 'free', min: 0, label: 'Virtual free · in-home $49', freeOnlyRemote: true } },
  { test: /'\$50 FREE for a limited time'.*'\$150 Now only \$100/i, info: { kind: 'free', min: 0, label: 'Free for a limited time · Squad Plus $100' } },
  { test: /^You pay the auditor up front, then Xcel rebates 60% of the audit price: up to \$100.*\$160.*\$200/i, info: { kind: 'discount', min: null, label: 'Auditor’s price less 60% (up to $100–$200)' } },
  { test: /^The contractor sets the price\. Georgia Power rebates 50% of the cost up to \$150/i, info: { kind: 'discount', min: null, label: 'Contractor’s price less 50% (up to $150)' } },
  { test: /^The contractor sets the price; DTE's page does not state one\. DTE pays a \$50 rebate/i, info: { kind: 'discount', min: null, label: 'Contractor’s price less a $50 rebate' } },
  { test: /^\$100 off an in-person audit/i, info: { kind: 'discount', min: null, label: 'Contractor’s price less $100' } },
  { test: /^Cost varies by assessor.*\$250 rebate/i, info: { kind: 'discount', min: null, label: 'Assessor’s price less a $250 rebate' } },
  { test: /^Set by the auditor\. Austin Energy estimates about \$200–\$300/i, info: { kind: 'varies', min: null, label: 'Set by the auditor (about $200–$300)' } },
  { test: /Energy Planner visit[^.]*costs \$100\. The Energy Saver visit[^.]*costs \$70.*Minneapolis pays the full cost/i, info: { kind: 'fee', min: 70, label: '$70–$100 · free in Minneapolis while funds last' } },
  { test: /^\$100 \('a \$400 value'\) for homes up to 3,000 sq ft/i, info: { kind: 'fee', min: 100, label: '$100 (homes up to 3,000 sq ft)' } },
  { test: /^Free for eligible income-qualified households\. Other customers[^.]*\. Ameren's page does not state that price/i, info: { kind: 'free', min: 0, label: 'Free if income-qualified; otherwise not published' } },
  { test: /^No-cost or low-cost/i, info: { kind: 'varies', min: null, label: 'No-cost or low-cost' } },
  { test: /^Advice and assessment offered through the program/i, info: { kind: 'unpublished', min: null, label: 'Price not published' } },
  { test: /^Complimentary in-home site visit/i, info: { kind: 'free', min: 0, label: 'Free site visit' } },
  { test: /^No participant cost stated/i, info: { kind: 'unpublished', min: null, label: 'No cost stated' } },
  { test: /does not state a separate assessment fee/i, info: { kind: 'unpublished', min: null, label: 'Not published' } },
  { test: /^Set by each auditor/i, info: { kind: 'varies', min: null, label: 'Set by each auditor' } },
  { test: /^Set by each independent assessor/i, info: { kind: 'varies', min: null, label: 'Set by each assessor' } },
];

const FREE_START = /^(free\b|no cost\b|no-cost\b|\$0\b|no additional cost\b|at no (additional )?cost\b|complimentary\b|the (energy review|assessment) is free)/i;

export function parseCost(text: string | null | undefined): CostInfo {
  const t = (text ?? '').trim();
  if (!t) return { kind: 'unpublished', min: null, label: 'Not published' };
  for (const r of COST_RULES) if (r.test.test(t)) return { ...r.info };
  const bare = t.replace(/^['‘“"]+/, '');
  if (FREE_START.test(bare)) return { kind: 'free', min: 0, label: 'Free' };
  if (/^(not stated|none\b)/i.test(bare) || /does not state/i.test(bare)) return { kind: 'unpublished', min: null, label: 'Not published' };
  if (/^(set by|the contractor sets|cost varies)/i.test(bare)) return { kind: 'varies', min: null, label: 'Set by the provider' };
  const fee = bare.match(/^\$(\d[\d,]*)\b/);
  if (fee) return { kind: 'fee', min: Number(fee[1].replace(/,/g, '')), label: `$${fee[1]}` };
  return { kind: 'unpublished', min: null, label: 'See the program' };
}

// ---------------------------------------------------------------- who and how
export type Audience = 'all' | 'income' | 'area';

const INCOME_ONLY = [
  /^(low-income|income-(eligible|qualified|qualifying))\b/i,
  /household income (must|at or below|at or under|under|below|up to)/i,
  /^households? (up to|under|below|at or below)\b/i,
  /income-eligibility guidelines|\bincome guidelines\b|have income at or below|under \d+% (AMI|MFI)/i,
];
const AREA_ONLY = /Disadvantaged or Low-Income community|in select (areas|neighborhoods)|focus area|pilot areas only/i;

/** Who a program is for, read from its whoQualifies text. */
export function audienceOf(p: { whoQualifies?: string | null; status?: string | null }): Audience {
  const w = p.whoQualifies ?? '';
  if (INCOME_ONLY.some((re) => re.test(w))) return 'income';
  if (AREA_ONLY.test(w) || AREA_ONLY.test(p.status ?? '')) return 'area';
  return 'all';
}

export type AuditFormat = 'visit' | 'unclear' | 'virtual' | 'online' | 'coaching' | 'directory';

/** In-person visit, virtual visit, online tool, coaching or a directory, read from the record. */
export function formatOf(p: { name: string; whatYouGet?: string | null; status?: string | null }): AuditFormat {
  const n = p.name;
  if (/directory/i.test(n)) return 'directory';
  if (/coaching/i.test(n) || /coaching, not an on-site/i.test(p.whatYouGet ?? '')) return 'coaching';
  if (/(do not|don't|does not) say whether it is done in person/i.test(p.whatYouGet ?? '')) return 'unclear';
  if (/\bonline\b|self-assessment|HomeIntel/i.test(n) || /^open \(online tool/i.test(p.status ?? '')) return 'online';
  if (/\bvirtual\b/i.test(n) && !/in-person|in-home|\b(and|or) virtual\b|\bvirtual or\b/i.test(n)) return 'virtual';
  return 'visit';
}

/** Programs labelled as serving another state's part of a multi-state metro. */
export function isOtherSide(name: string): boolean {
  return /\((?:[^)]*\bside\b[^)]*|(?:Maryland|Virginia) suburbs|Clark County, WA)\)/i.test(name);
}

// ---------------------------------------------------------------- utilities
const GENERIC_UTILITY = /^(retail electric providers|other |municipal |psc-certified|electric membership)/i;

/** "Pacific Gas and Electric Company (PG&E)" → "PG&E"; "Con Edison (Consolidated Edison …)" → "Con Edison". */
export function shortUtility(name: string): string | null {
  if (GENERIC_UTILITY.test(name)) return null;
  const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  let base = (m ? m[1] : name).split(',')[0].trim();
  const paren = m?.[2]?.trim();
  if (paren && /^[A-Z][A-Za-z&]{1,9}$/.test(paren) && base.length > 24) base = paren;
  return base || null;
}

// ---------------------------------------------------------------- local rules
export type RuleReach = 'homes' | 'build' | 'indirect' | 'large' | 'proposed' | 'none';

export const RULE_REACH: Record<RuleReach, { label: string; cls: string; homes: boolean }> = {
  homes: { label: 'Affects homeowners', cls: 'chip-info', homes: true },
  build: { label: 'New building or permitted work', cls: 'chip-limited', homes: true },
  indirect: { label: 'Affects homeowners indirectly', cls: 'chip-neutral', homes: true },
  large: { label: 'Not for ordinary homes', cls: 'chip-neutral', homes: false },
  proposed: { label: 'Proposed · not in force', cls: 'chip-neutral', homes: false },
  none: { label: 'No local mandate found', cls: 'chip-neutral', homes: false },
};

/** Sorts a local rule by whether it reaches ordinary homes, using its own appliesTo wording. */
export function ruleReach(r: { name: string; appliesTo?: string | null }): RuleReach {
  const a = r.appliesTo ?? '';
  if (/^no (energy audit|local|mandatory)\b/i.test(r.name)) return 'none';
  if (/\bproposed\b|not adopted/i.test(`${r.name} ${a}`)) return 'proposed';
  if (/indirectly/i.test(a)) return 'indirect';
  if (/^new (construction|buildings)\b|permitted (work|additions)|triggered only by new buildings/i.test(a)) return 'build';
  if (/^(ordinary homeowners|home sellers|every sale)\b/i.test(a) || /affects homeowners who/i.test(a)) return 'homes';
  return 'large';
}

// ---------------------------------------------------------------- research notes
const ABBR_END = /\b(?:U\.S|St|Ft|No|Sec|Inc|Co|Corp|Jr|Mt|Dr|vs|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|e\.g|i\.e|s)\.$/;

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  // a new sentence starts with a capital, a digit, a bracket or a quote, or with a lowercase domain ("mass.gov blocks …")
  for (const part of text.split(/(?<=[.!?]['"’)]?)\s+(?=[A-Z0-9(‘'"]|[a-z][a-z-]*\.(?:gov|com|org|net)\b)/)) {
    buf = buf ? `${buf} ${part}` : part;
    if (ABBR_END.test(buf)) continue;
    out.push(buf.trim());
    buf = '';
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Phrases that describe how the research was done, or speak to the site's builders, not homeowners. */
const PROCESS = [
  /web-search budget|research tool|\bWebFetch\b|\bcurl\b|scripted|automated (access|fetch|readers?|requests?|downloads?)|blocked direct downloads|bot challenge|\bWAF\b|client-side|returned (errors|404|a 404)|\b404\b|HTTP \d{3}|could not be read|could not be reached|failed to load|dynamic page elements|load dynamically/i,
  /before publishing|before listing|before routing|do not list|manual check|new page will be needed|was left out|not listed under|are not included|covered in the|\bfiles?\b|this batch|metros here|is the strongest of|of the six metros|audityourhome|in this metro;|the remaining facts were checked|comparison is made here/i,
  /^MSA:|\bCBSA\b|\bOMB\b|metro definition|delineation|combined statistical area|dropped from states/i,
  /\bnull\b/i,
  /\b25C\b|\b25D\b|^Federal tax credits?:|^Federal (home-efficiency )?tax credits (for home efficiency )?(have ended|are over)|^Neither applies to 2026 projects/i,
  /^Federal rule change for the IRA rebates|^Launched states had to comply/i,
];

const TRIMS: [RegExp, string][] = [
  [/, which is a direct hook for audityourhome\.com/i, ''],
  [/,? so audityourhome\.com should ask which utility is on the bill/i, ', so check which one is on your bill before you book anything'],
  [/ \(the date of this check\)/i, ''],
  [/ \(OHCS's page does not list them in its static text\)/i, ''],
  [/, so [A-Z][\w.' -]+ is the only [^.]*? here where [^.]*/, ''],
  [/^[^:]{0,80} of the six metros:\s*/i, ''],
  [/^As of 2026-10-12:\s*/i, ''],
  [/^\(\d+\)\s*/, ''],
  [/^(Also )?surprising:\s*/i, ''],
];

const NOT_CONFIRMED = /^(not verified|unverified|unverified items):\s*/i;
const PARTLY_UNKNOWN = /\bnot (individually )?(verified|checked|researched|followed up|confirmed|covered)\b|could not be (verified|confirmed)|\bunconfirmed\b|was not verified|not exhaustively/i;
/** Sentences that lean on the one before them ("Its …", "This …"). */
const LEANS_BACK = /^(Its|This|These|That|Only|Neither)\b/;
const TAG_ALONG = /^(The outcome|This|It)\b/;

export interface MetroNotes {
  /** homeowner-relevant sentences, in the record's own words */
  keep: string[];
  /** things the research says it could not confirm */
  unconfirmed: string[];
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const stop = (s: string) => (/[.!?]['"’”)]*$/.test(s) ? s : `${s}.`);

export function notesFor(text: string | null | undefined): MetroNotes {
  const keep: string[] = [];
  const unconfirmed: string[] = [];
  let prevDropped = false;
  for (let s of splitSentences(text ?? '')) {
    for (const [re, to] of TRIMS) s = s.replace(re, to);
    s = s.trim();
    if (!s) continue;
    if (NOT_CONFIRMED.test(s)) {
      const list = s.replace(NOT_CONFIRMED, '').replace(/\.$/, '');
      for (const item of list.split(/;\s+/)) {
        const it = item.trim().replace(/^and\s+/i, '');
        if (it && !PROCESS.some((re) => re.test(it))) unconfirmed.push(stop(cap(it)));
      }
      prevDropped = false;
      continue;
    }
    if (PROCESS.some((re) => re.test(s)) || (prevDropped && LEANS_BACK.test(s))) {
      prevDropped = true;
      continue;
    }
    prevDropped = false;
    if (PARTLY_UNKNOWN.test(s)) {
      if (TAG_ALONG.test(s) && keep.length) keep[keep.length - 1] += ` ${s}`;
      else unconfirmed.push(cap(s));
    } else keep.push(cap(s));
  }
  return { keep, unconfirmed };
}

/** A research paragraph with the research-process sentences taken out, otherwise in order and in its own words. */
export function cleanText(text: string | null | undefined): string {
  const out: string[] = [];
  let prevDropped = false;
  for (let s of splitSentences(text ?? '')) {
    for (const [re, to] of TRIMS) s = s.replace(re, to);
    s = s.trim();
    if (!s) continue;
    if (PROCESS.some((re) => re.test(s)) || (prevDropped && LEANS_BACK.test(s))) {
      prevDropped = true;
      continue;
    }
    prevDropped = false;
    out.push(cap(s));
  }
  return out.join(' ');
}

/** True when a status text says no more than its chip label ("Open" next to an OPEN chip). */
export function sameAsChip(text: string | null | undefined, label: string): boolean {
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return !!text && plain(text) === plain(label);
}

/** True when a cost text only restates "free" ("No cost", "Free ('no-cost energy assessment')"). */
export function trivialFreeText(text: string | null | undefined): boolean {
  const t = (text ?? '').replace(/\([^)]*\)/g, '').replace(/['"‘’“”]/g, '').trim();
  return /^(free|no cost|no-cost|\$0|no additional cost)[\s.]*$/i.test(t);
}

// ---------------------------------------------------------------- small formatters
/** "October 12, 2026" from "2026-10-12" */
export function fmtISO(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "District of Columbia" → "district-of-columbia" */
export const stateSlug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

/** "Housing figures are for Boston city, Massachusetts (Census place …)" → "Boston city, Massachusetts" */
export function housingPlace(notes: string | null | undefined): string | null {
  const m = (notes ?? '').match(/Housing figures are for (.+?) \(Census place/);
  return m ? m[1] : null;
}

/** Capitalizes the first letter and ensures the sentence ends with punctuation. */
export const sentence = (s: string | null | undefined) => (s ? stop(cap(s.trim())) : '');

/** "a, b and c" */
export function andList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
