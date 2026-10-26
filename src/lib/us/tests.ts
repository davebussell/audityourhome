/**
 * US testing guide data layer (/us/tests/).
 *
 * Every fact on those pages comes from src/data/us/tests.json, verified against official
 * sources on October 12, 2026. Page names, one-line summaries and photo labels live in
 * src/data/us/test-pages.json. Source lookups throw at build time when a label can't be
 * found, so a renamed source fails the build instead of shipping a dead citation.
 */
import { stateLine } from './state-text';
import raw from '../../data/us/tests.json';
import climate from '../../data/us/climate.json';
import pagesJson from '../../data/us/test-pages.json';
import { METROS, STATE_NAMES, type Metro } from './data';
import type { ScreenerFacts, StateFacts, StateRule, MetroFacts } from './screener';

export const T = raw as any;

export interface Src {
  label: string;
  href: string;
}

// ---------------------------------------------------------------- catalog
export type TestGroup = 'health' | 'energy';

export interface UsTest {
  slug: string;
  group: TestGroup;
  name: string;
  crumb: string;
  why: string;
  fact: string;
  /** who performs it, one short line */
  who: string;
  src: [Section, string];
  photo: string;
  hud: string;
  related: string[];
}

export const TEST_GROUPS = pagesJson.groups as { id: TestGroup; title: string; chip: string; intro: string }[];
export const US_TESTS = pagesJson.tests as unknown as UsTest[];
export const usTest = (slug: string): UsTest => {
  const t = US_TESTS.find((x) => x.slug === slug);
  if (!t) throw new Error(`tests.ts: unknown US test "${slug}"`);
  return t;
};
export const testsIn = (group: TestGroup) => US_TESTS.filter((t) => t.group === group);
export const guideHref = (slug: string) => `/us/tests/${slug}/`;

// ---------------------------------------------------------------- sources
export type Section =
  | 'radon'
  | 'carbonMonoxide'
  | 'lead'
  | 'asbestos'
  | 'mold'
  | 'wellWater'
  | 'blowerDoor'
  | 'ductLeakage'
  | 'infrared'
  | 'combustionSafety'
  | 'loadCalculation'
  | 'insulation'
  | 'hersIndex'
  | 'billAnalysis';

export function sourcesOf(section: Section): Src[] {
  const list = (T[section] ?? T.energyTests[section])?.sources;
  if (!list) throw new Error(`tests.ts: no sources for section "${section}"`);
  return list;
}

/** A source from a tests.json section, found by a piece of its label. */
export function S(section: Section, needle: string): Src {
  const hit = sourcesOf(section).find((s) => s.label.includes(needle));
  if (!hit) throw new Error(`tests.ts: no source matching "${needle}" in ${section}`);
  return hit;
}

/** Every source in tests.json, for label lookups by URL. */
const ALL_SOURCES: Src[] = (() => {
  const out: Src[] = [];
  const walk = (o: any) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (typeof o.label === 'string' && typeof o.href === 'string') out.push(o);
      else Object.values(o).forEach(walk);
    }
  };
  walk(T);
  return out;
})();

/** Agency or publisher part of a source label: "EPA - Health Risk of Radon (…)" → "EPA". */
export function shortLabel(label: string): string {
  const head = label.split(' - ')[0];
  return head.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

/** A source for a URL taken from a state record, labelled from the matching tests.json source. */
export function srcForUrl(href: string): Src {
  const hit = ALL_SOURCES.find((s) => s.href === href);
  return { href, label: hit ? hit.label : new URL(href).hostname.replace(/^www\./, '') };
}

/** Unique by href, in first-seen order. */
export function uniqSources(list: Src[]): Src[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true)));
}

// ---------------------------------------------------------------- states
export const stateName = (st: string) => STATE_NAMES[st] ?? st;
/** Slug for the planned /us/programs/states/<slug>/ pages: "New York" → "new-york". */
export const stateSlug = (st: string) =>
  stateName(st).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
export const stateProgramsHref = (st: string) => `/us/programs/states/${stateSlug(st)}/`;

const SUMMARY = T.stateSummary as any[];
const byName = (a: string, b: string) => stateName(a).localeCompare(stateName(b));
/** The 20 jurisdictions with a full state summary, alphabetical by name. */
export const SUMMARY_STATES: string[] = SUMMARY.map((s) => s.state).sort(byName);
export const summaryFor = (st: string) => SUMMARY.find((s) => s.state === st);

function tidy(s: string | null | undefined, st?: string): string {
  let t = (s ?? '').replace(/\s*\(null\)/g, '').trim();
  if (!t) return '';
  t = t[0].toUpperCase() + t.slice(1);
  t = /[.!?)]$/.test(t) ? t : `${t}.`;
  // agencies spelled out, statute cites introduced, research notes ("no state license found") made plain
  return st ? stateLine(t, st) : t;
}

/** Split a stateSummary note ("Radon: … Mold: … CO: …") into its topic parts. */
function noteParts(notes: string, st: string): Partial<Record<'Radon' | 'Mold' | 'CO', string>> {
  const parts = notes.split(/(?:^|\s)(Radon|Mold|CO):\s/);
  const out: Partial<Record<'Radon' | 'Mold' | 'CO', string>> = {};
  for (let i = 1; i < parts.length; i += 2) out[parts[i] as 'Radon' | 'Mold' | 'CO'] = tidy(parts[i + 1], st);
  return out;
}

export type RuleStatus = 'yes' | 'no' | 'unknown';

export interface StateRow {
  st: string;
  name: string;
  status: RuleStatus;
  /** short summary of the rule */
  text: string;
  /** fuller rule text, when the topic list has one */
  detail?: string;
  src: Src;
  /** true when the source is NCSL's compilation rather than the statute itself */
  perNcsl?: boolean;
}

/** Radon credential laws for the 20 summary jurisdictions. */
export function radonStateRows(): StateRow[] {
  return SUMMARY_STATES.map((st) => {
    const s = summaryFor(st);
    const lic = (T.radon.stateLicensing as any[]).find((x) => x.state === st);
    return {
      st,
      name: stateName(st),
      status: s.radonLicensing ? 'yes' : 'no',
      text: noteParts(s.notes, st).Radon ?? '',
      detail: lic ? tidy(lic.requirement, st) : undefined,
      src: lic ? srcForUrl(lic.url) : s.sources[0],
    } as StateRow;
  });
}

/** States outside the 20 summaries whose radon credential laws are in the licensing list. */
export function otherRadonStates(): StateRow[] {
  return (T.radon.stateLicensing as any[])
    .filter((x) => !SUMMARY_STATES.includes(x.state))
    .sort((a, b) => byName(a.state, b.state))
    .map((x) => ({ st: x.state, name: stateName(x.state), status: 'yes', text: tidy(x.requirement, x.state), src: srcForUrl(x.url) }));
}

/** Statewide carbon monoxide alarm laws for the 20 summary jurisdictions. */
export function coStateRows(): StateRow[] {
  return SUMMARY_STATES.map((st) => {
    const s = summaryFor(st);
    const law = (T.carbonMonoxide.stateLaws as any[]).find((x) => x.state === st);
    const status: RuleStatus = s.coAlarmLaw === true ? 'yes' : s.coAlarmLaw === false ? 'no' : 'unknown';
    const src = srcForUrl(law.url);
    return {
      st,
      name: stateName(st),
      status,
      text: noteParts(s.notes, st).CO ?? '',
      detail: tidy(law.requirement ?? law.notes, st),
      src,
      perNcsl: /ncsl\.org/.test(law.url),
    };
  });
}

const ELI_MOLD = (): Src => S('mold', 'Mold Excerpt');

/** Mold licensing for the 20 summary jurisdictions. */
export function moldStateRows(): StateRow[] {
  return SUMMARY_STATES.map((st) => {
    const s = summaryFor(st);
    const lic = (T.mold.stateLicensing as any[]).find((x) => x.state === st);
    return {
      st,
      name: stateName(st),
      status: s.moldLicensing ? 'yes' : 'no',
      text: noteParts(s.notes, st).Mold ?? 'No state mold licensing law.',
      detail: lic ? tidy(lic.requirement, st) : undefined,
      src: lic ? srcForUrl(lic.url) : ELI_MOLD(),
    } as StateRow;
  });
}

/** Mold rules outside the 20 summaries (Louisiana, New Hampshire, Connecticut, Tennessee). */
export function otherMoldStates(): StateRow[] {
  return (T.mold.stateLicensing as any[])
    .filter((x) => !SUMMARY_STATES.includes(x.state))
    .sort((a, b) => byName(a.state, b.state))
    .map((x) => ({ st: x.state, name: stateName(x.state), status: 'yes', text: tidy(x.requirement, x.state), src: srcForUrl(x.url) }));
}

/** Pulls a list of state codes out of a sentence, checking the count the sentence states. */
function codesAfter(text: string, marker: string, expect: number): string[] {
  const i = text.indexOf(marker);
  if (i < 0) throw new Error(`tests.ts: marker "${marker}" not found`);
  const tail = text.slice(i + marker.length).split(/[(;.]/)[0];
  const codes = (tail.match(/\b[A-Z]{2}\b/g) ?? []).filter((c) => c in STATE_NAMES);
  if (codes.length !== expect) throw new Error(`tests.ts: expected ${expect} states after "${marker}", got ${codes.length}`);
  return codes;
}

/** States that run their own lead Renovation, Repair and Painting program (EPA-authorized). */
export const RRP_STATES = codesAfter(T.lead.rrpRule, 'instead of EPA:', 15);
/** States where EPA itself runs lead abatement, inspection and risk assessment. */
export const EPA_LEAD_ABATEMENT_STATES = codesAfter(T.lead.inspectionVsRiskAssessment, 'program directly in', 11);
/** AARST's ten states with homebuyer radon awareness-notification laws (June 2024). */
export const RADON_NOTICE_STATES = codesAfter(T.radon.realEstate, 'as of June 2024:', 10);

/** Who runs the lead programs in a state, derived from EPA's authorization lists. */
export function leadPrograms(st: string) {
  return {
    rrp: RRP_STATES.includes(st) ? 'state' : 'EPA',
    abatement: EPA_LEAD_ABATEMENT_STATES.includes(st) ? 'EPA' : 'state',
  } as const;
}

export function leadStateRows(): StateRow[] {
  return SUMMARY_STATES.map((st) => {
    const s = summaryFor(st);
    return {
      st,
      name: stateName(st),
      status: 'unknown',
      text: tidy(s.leadProgram, st),
      src: S('lead', 'RRP Firm Certification'),
    } as StateRow;
  });
}

export const listStates = (codes: string[]) => {
  const names = [...codes].sort(byName).map(stateName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
};

// ---------------------------------------------------------------- metros
export const metroName = (m: Metro) => (m.data?.name as string) ?? m.msa;
export const metroHref = (m: Metro) => `/us/cities/${m.slug}/`;

/** Metros grouped by IECC 2021 climate zone of the principal county, coldest last. */
export function metrosByClimateZone(): { zone: string; num: number; metros: Metro[] }[] {
  const map = new Map<string, Metro[]>();
  for (const m of METROS) {
    const z = m.climate?.iecc2021ClimateZone;
    if (!z) continue;
    (map.get(z) ?? map.set(z, []).get(z)!).push(m);
  }
  return [...map.entries()]
    .map(([zone, metros]) => ({ zone, num: parseInt(zone, 10), metros: metros.sort((a, b) => metroName(a).localeCompare(metroName(b))) }))
    .sort((a, b) => a.num - b.num || a.zone.localeCompare(b.zone));
}

/** Metros grouped by the EPA radon zone of the principal county. */
export function metrosByRadonZone(): { zone: number; metros: Metro[] }[] {
  return [1, 2, 3].map((zone) => ({
    zone,
    metros: METROS.filter((m) => m.climate?.epaRadonZone === zone).sort((a, b) => metroName(a).localeCompare(metroName(b))),
  }));
}

function climateSource(needle: string, label: string): Src {
  const hit = ((climate as any).sources as Src[]).find((s) => s.label.includes(needle));
  if (!hit) throw new Error(`tests.ts: no climate.json source matching "${needle}"`);
  return { label, href: hit.href };
}

/** Sources behind each metro's climate zone and radon zone (src/data/us/climate.json). */
export const ZONE_SOURCES = {
  climate: climateSource('PNNL-33270', 'DOE/PNNL - Guide to Determining Climate Zones by County (PNNL-33270, IECC 2021 zones)'),
  radon: climateSource('text version spreadsheet', 'EPA - Map of Radon Zones, county list (text version spreadsheet)'),
};

export { METROS };

// ---------------------------------------------------------------- screener payload

const rule = (r: StateRow | undefined, on: boolean | null): StateRule | undefined =>
  r ? { on, text: r.text, src: { label: r.src.label, href: r.src.href, short: shortLabel(r.src.label) } } : undefined;
const named = (s: Src, short: string) => ({ ...s, short });

/** ENERGY STAR attic targets per climate-zone number: { bare: 'R60', topped: 'R49' } */
export function atticTargets(): Record<string, { bare: string; topped: string }> {
  const out: Record<string, { bare: string; topped: string }> = {};
  for (const r of T.energyTests.insulation.recommendedRValues as { zone: string; attic: string }[]) {
    const m = r.attic.match(/^(R\d+) if uninsulated; (R\d+) if already/);
    if (!m) throw new Error(`tests.ts: unexpected attic text for zone ${r.zone}`);
    out[r.zone] = { bare: m[1], topped: m[2] };
  }
  return out;
}

/** Compact, build-time payload for the client-side screener (no tests.json in the browser). */
export function screenerFacts(verified: string): ScreenerFacts {
  const attic = atticTargets();
  const radon = new Map(radonStateRows().map((r) => [r.st, r]));
  const radonOther = new Map(otherRadonStates().map((r) => [r.st, r]));
  const mold = new Map(moldStateRows().map((r) => [r.st, r]));
  const moldOther = new Map(otherMoldStates().map((r) => [r.st, r]));
  const co = new Map(coStateRows().map((r) => [r.st, r]));

  const states: Record<string, StateFacts> = {};
  for (const st of Object.keys(STATE_NAMES)) {
    const checked = SUMMARY_STATES.includes(st);
    const s = checked ? summaryFor(st) : null;
    const mo = mold.get(st) ?? moldOther.get(st);
    states[st] = {
      name: stateName(st),
      checked,
      slug: stateSlug(st),
      radon: checked ? rule(radon.get(st), !!s?.radonLicensing) : rule(radonOther.get(st), true),
      mold: checked ? rule(mo, !!s?.moldLicensing) : rule(mo, mo ? !/^Not mold-specific/.test(mo.text) : null),
      co: checked ? rule(co.get(st), s?.coAlarmLaw ?? null) : undefined,
      lead: leadPrograms(st),
      radonNotice: RADON_NOTICE_STATES.includes(st),
    };
  }

  const metros: MetroFacts[] = METROS.map((m) => {
    const z = m.climate?.iecc2021ClimateZone ?? null;
    return {
      slug: m.slug,
      name: metroName(m),
      st: (m.data?.states ?? [])[0] ?? '',
      county: m.climate?.principalCounty ?? null,
      radonZone: m.climate?.epaRadonZone ?? null,
      climateZone: z,
      attic: z ? attic[String(parseInt(z, 10))] ?? null : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const zones = Object.keys(attic).sort();
  return {
    verified,
    metros,
    states,
    atticRange: `${attic[zones[0]].bare} to ${attic[zones[zones.length - 1]].bare}`,
    src: {
      radonAction: named(S('radon', 'Action Level'), 'EPA action level'),
      radonCitizen: named(S('radon', "Citizen's Guide"), 'EPA Citizen’s Guide'),
      radonZones: named(S('radon', 'EPA Map of Radon Zones (updated'), 'EPA radon zones'),
      radonSales: named(S('radon', "Home Buyer's and Seller's Guide"), 'EPA buyer’s and seller’s guide'),
      aarst: named(S('radon', 'AARST - Homebuyer'), 'AARST'),
      cpsc: named(S('carbonMonoxide', 'Questions and Answers'), 'CPSC'),
      leadSources: named(S('lead', 'Protect Your Family from Sources of Lead'), 'EPA, sources of lead'),
      rrp: named(S('lead', 'Lead Renovation, Repair and Painting Program ('), 'EPA RRP rule'),
      disclosure: named(S('lead', 'Real Estate Disclosures'), 'EPA disclosure rule'),
      leadStates: named(S('lead', 'RRP Firm Certification'), 'EPA authorized states'),
      asbestos: named(S('asbestos', 'Exposures to Asbestos'), 'EPA asbestos'),
      vermiculite: named(S('asbestos', 'Vermiculite'), 'EPA vermiculite'),
      mold: named(S('mold', 'Brief Guide'), 'EPA mold guide'),
      wellTest: named(S('wellWater', "Protect Your Home's Water"), 'EPA well testing'),
      wellContaminants: named(S('wellWater', 'Potential Well Water Contaminants'), 'EPA well contaminants'),
      labs: named(S('wellWater', 'Contact Information for Certification Programs'), 'EPA lab certification'),
      caz: named(S('combustionSafety', 'Combustion Appliance Zone'), 'DOE Building America'),
      acca: named(S('loadCalculation', 'Manual J Residential Load Calculation'), 'ACCA Manual J'),
      accaCode: named(S('loadCalculation', '2018 Model Code References'), 'ACCA code references'),
      doeAssess: named(S('blowerDoor', 'Professional Home Energy Assessments'), 'DOE Energy Saver'),
      energyStar: named(S('insulation', 'Recommended Home Insulation R-Values'), 'ENERGY STAR R-values'),
    },
  };
}
