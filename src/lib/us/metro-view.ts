/**
 * View helpers for the US metro pages (/us/cities/…), the US home page and the cost and find
 * pages. Everything is read from the research records through src/lib/us/data.ts; this file only
 * sorts, groups and labels. Labels come from metro-text.ts, which never adds facts.
 */
import climate from '../../data/us/climate.json';
import prices from '../../data/us/prices.json';
import testsData from '../../data/us/tests.json';
import { METROS, metrosInState, statusChip, stateRebateRow, statePrices, STATE_NAMES, PRICE_META } from './data';
import type { Metro, NormStatus } from './data';
import {
  parseCost, audienceOf, formatOf, isOtherSide, shortUtility, ruleReach, RULE_REACH, notesFor, housingPlace, stateSlug,
} from './metro-text';
import type { CostInfo, Audience, AuditFormat, RuleReach, MetroNotes } from './metro-text';
import { stateByCode, stateLede, metroProgramsFor, type ProgView, type StateView } from './programs';
import { cleanStatus } from './clean';

export { fmtISO, stateSlug, sentence, andList } from './metro-text';
export type { CostInfo, Audience, AuditFormat, RuleReach, MetroNotes } from './metro-text';

const STATUS_ORDER: Record<NormStatus, number> = { open: 0, limited: 1, unknown: 2, 'not-open': 3, closed: 4 };
/**
 * Taking applications now: an Open chip, or a limited one that is still open ("limits apply",
 * "partly open", "ending soon", "short window"). Paused and waitlist-only don't count.
 */
export const isOpenChip = (c: { status: NormStatus; label: string }) =>
  c.status === 'open' || (c.status === 'limited' && !/^(Paused|Waitlist)$/.test(c.label));

// ---------------------------------------------------------------- states
export interface StateRef {
  code: string;
  name: string;
  slug: string;
  /** planned US state rebate page */
  href: string;
}

export function stateRef(code: string): StateRef {
  const name = STATE_NAMES[code] ?? code;
  const slug = stateSlug(name);
  return { code, name, slug, href: `/us/programs/states/${slug}/` };
}

export const metroStates = (m: Metro): StateRef[] => ((m.data.states ?? []) as string[]).map(stateRef);

/** Other metros that share a state with this one, in Census rank order. */
export function relatedMetros(m: Metro): Metro[] {
  const seen = new Set<string>([m.slug]);
  const out: Metro[] = [];
  for (const st of m.data.states ?? []) {
    for (const o of metrosInState(st)) {
      if (!seen.has(o.slug)) {
        seen.add(o.slug);
        out.push(o);
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

// ---------------------------------------------------------------- regions (for grouping the city index)
export type Region = 'Northeast' | 'Midwest' | 'South' | 'West';
const REGION_STATES: Record<Region, string[]> = {
  Northeast: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  Midwest: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  South: ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX'],
  West: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA'],
};
export const REGION_ORDER: Region[] = ['Northeast', 'Midwest', 'South', 'West'];

export function regionOf(m: Metro): Region {
  const st = (m.data.states ?? [])[0];
  return REGION_ORDER.find((r) => REGION_STATES[r].includes(st)) ?? 'South';
}

export function metrosByRegion(): { region: Region; id: string; metros: Metro[] }[] {
  return REGION_ORDER.map((region) => ({ region, id: region.toLowerCase(), metros: METROS.filter((m) => regionOf(m) === region) }));
}

// ---------------------------------------------------------------- audit programs
export interface AuditView {
  name: string;
  runBy: string | null;
  cost: CostInfo;
  costText: string | null;
  whoQualifies: string | null;
  whatYouGet: string | null;
  howToBook: string | null;
  url: string | null;
  statusText: string | null;
  status: NormStatus;
  chip: { cls: string; label: string };
  /** taking applications now (see isOpenChip) */
  live: boolean;
  checked: string | null;
  audience: Audience;
  format: AuditFormat;
  otherSide: boolean;
  index: number;
}

export const FORMAT_TAG: Partial<Record<AuditFormat, string>> = {
  unclear: 'Visit type not stated',
  virtual: 'Virtual',
  online: 'Online tool',
  coaching: 'Coaching',
  directory: 'Directory',
};
export const AUDIENCE_TAG: Partial<Record<Audience, string>> = {
  income: 'Income-qualified',
  area: 'Select areas',
};

/**
 * The research asked for some programs to be confirmed before they are listed (for example a page
 * that answered one request and returned 404 to another). Those stay off the pages.
 */
const HOLD_BACK = /confirm with [^.]* before listing/i;

export function auditPrograms(m: Metro): AuditView[] {
  return ((m.data.auditPrograms ?? []) as any[])
    .map((p, index) => {
      const chip = statusChip(p.status);
      return {
        name: p.name,
        runBy: p.runBy ?? null,
        cost: parseCost(p.cost),
        costText: p.cost ?? null,
        whoQualifies: p.whoQualifies ?? null,
        whatYouGet: p.whatYouGet ?? null,
        howToBook: p.howToBook ?? null,
        url: p.url ?? null,
        statusText: p.status ?? null,
        status: chip.status,
        chip: { cls: chip.cls, label: chip.label },
        live: isOpenChip(chip),
        checked: p.checked ?? null,
        audience: audienceOf(p),
        format: formatOf(p),
        otherSide: isOtherSide(p.name),
        index,
        hold: HOLD_BACK.test(p.status ?? ''),
      };
    })
    .filter((p) => !p.hold)
    .map(({ hold, ...p }) => p as AuditView);
}

/** Programs in display order: live ones first, then unconfirmed, not-yet-open and closed. */
export const auditProgramsSorted = (m: Metro) =>
  auditPrograms(m).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.index - b.index);

const FORMAT_RANK: Record<AuditFormat, number> = { visit: 0, unclear: 1, virtual: 2, online: 3, coaching: 4, directory: 5 };
const AUDIENCE_RANK: Record<Audience, number> = { all: 0, area: 1, income: 2 };

/**
 * Editorial picks where the generic ranking below would put a program that serves only a corner
 * of the metro ahead of the one most residents would start with. Names must match the record.
 */
const MAIN_AUDIT: Record<string, string> = {
  // statewide and open to every 1–4 family homeowner; the in-person options serve Long Island, the Rockaways or New Jersey
  'new-york': 'Home Energy Plan (virtual Home Energy Assessment)',
};

/**
 * The program a homeowner in the metro would most likely start with: live (open or limited),
 * on the metro's main side, an actual visit, open to all incomes, then the lowest published price.
 */
export function mainAudit(m: Metro): AuditView | null {
  const all = auditPrograms(m);
  const pick = MAIN_AUDIT[m.slug] && all.find((p) => p.name === MAIN_AUDIT[m.slug] && p.live);
  if (pick) return pick;
  const ranked = [...all].sort(
    (a, b) =>
      Number(!a.live) - Number(!b.live) ||
      Number(a.otherSide) - Number(b.otherSide) ||
      FORMAT_RANK[a.format] - FORMAT_RANK[b.format] ||
      AUDIENCE_RANK[a.audience] - AUDIENCE_RANK[b.audience] ||
      (a.cost.min ?? Infinity) - (b.cost.min ?? Infinity) ||
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.index - b.index,
  );
  return ranked[0] ?? null;
}

/**
 * The lowest published price among live programs. Ties go to the metro's main side and to real
 * visits, so a free online tool doesn't stand in for a free in-home audit when both exist.
 */
export function cheapestAudit(m: Metro): AuditView | null {
  const live = auditPrograms(m).filter((p) => p.live && p.cost.min != null);
  live.sort(
    (a, b) =>
      (a.cost.min ?? 0) - (b.cost.min ?? 0) ||
      Number(a.otherSide) - Number(b.otherSide) ||
      FORMAT_RANK[a.format] - FORMAT_RANK[b.format] ||
      AUDIENCE_RANK[a.audience] - AUDIENCE_RANK[b.audience] ||
      a.index - b.index,
  );
  return live[0] ?? null;
}

/**
 * A live program on the metro's main side that offers a free in-person visit with no income test.
 * (SRP's free option is virtual only, so it doesn't count; neither does a program whose format isn't stated.)
 */
export const isFreeVisitForAll = (p: AuditView) =>
  p.live && p.cost.min === 0 && !p.cost.freeOnlyRemote && p.format === 'visit' && p.audience === 'all' && !p.otherSide;

export const hasFreeVisitForAll = (m: Metro) => auditPrograms(m).some(isFreeVisitForAll);

/** Tags shown next to a program name: Virtual, Online tool, Income-qualified, Select areas … */
export function auditTags(p: AuditView): string[] {
  const t: string[] = [];
  if (FORMAT_TAG[p.format]) t.push(FORMAT_TAG[p.format]!);
  if (AUDIENCE_TAG[p.audience]) t.push(AUDIENCE_TAG[p.audience]!);
  return t;
}

// ---------------------------------------------------------------- utilities
export function mainUtilities(m: Metro, max = 3): string[] {
  const u = m.data.utilities ?? {};
  const names = [...(u.electric ?? []), ...(u.gas ?? [])].map((x: any) => shortUtility(x.name)).filter(Boolean) as string[];
  return [...new Set(names)].slice(0, max);
}

// ---------------------------------------------------------------- federal Home Energy Rebates
export interface HerView {
  text: string;
  chip: { cls: string; label: string; status: NormStatus };
  url: string | null;
  checked: string | null;
  programName: string | null;
  administrator: string | null;
  summary: string | null;
  /** true when the metro record had no status and the 50-state table filled in */
  fromStateTable: boolean;
}

/** Better status first: the program a household could use now leads the badge. */
const HER_RANK: Record<NormStatus, number> = { open: 0, limited: 1, closed: 2, 'not-open': 3, unknown: 4 };

/**
 * One status per state everywhere: the badge and the "Status for the metro" card read the state
 * tracker (programs.ts STATES), the same records as the state pages and the planner. Where the
 * metro's own record says something the state's chips don't (MiHER paused across metro Detroit),
 * that local status leads, exactly as the state page shows it on the metro's card.
 */
export function herStatus(m: Metro): HerView {
  const s = m.data.stateHomeEnergyRebates ?? {};
  const st = (m.data.states ?? [])[0];
  const sv = stateByCode(st);
  if (sv) {
    const lead = [sv.hear, sv.homes].sort((a, b) => HER_RANK[a.chip.status] - HER_RANK[b.chip.status])[0];
    const local = metroProgramsFor(m, st).localRebates;
    return {
      text: local ? `${cleanStatus(local.status)} Statewide: ${stateLede(sv)}` : stateLede(sv),
      chip: local?.chip ?? lead.chip,
      url: (local ? s.url : null) ?? lead.url ?? sv.hear.url ?? sv.homes.url ?? null,
      checked: (local ? s.checked : null) ?? lead.checked ?? null,
      programName: s.programName ?? lead.programName ?? null,
      administrator: s.administrator ?? lead.administrator ?? null,
      summary: s.summary ?? null,
      fromStateTable: !local,
    };
  }
  return {
    text: s.status ? cleanStatus(s.status) : `No ${STATE_NAMES[st] ?? st} state page gives a status yet.`,
    chip: statusChip(s.status ?? null),
    url: s.url ?? null,
    checked: s.checked ?? null,
    programName: s.programName ?? null,
    administrator: s.administrator ?? null,
    summary: s.summary ?? null,
    fromStateTable: false,
  };
}

export interface StateHerRow {
  state: StateRef;
  hear: { text: string; chip: ReturnType<typeof statusChip>; name: string | null; url: string | null; checked: string | null };
  homes: { text: string; chip: ReturnType<typeof statusChip>; name: string | null; url: string | null; checked: string | null };
  baseline: string | null;
  sources: { label: string; href: string }[];
}

/** Both federal rebate programs, state by state, from the state tracker (the same chips as each state page). */
export function stateHerRows(m: Metro): StateHerRow[] {
  return metroStates(m).map((state) => {
    const sv: StateView | undefined = stateByCode(state.code);
    const row = stateRebateRow(state.code) ?? {};
    const base: string | null = row.baseline?.status ?? null;
    const one = (p: ProgView | undefined, raw: any) => {
      const status: string | null = p ? p.status : raw?.status ?? null;
      const text = status
        ? cleanStatus(status)
        : base
          ? `No status posted by the state. The Building Performance Association’s June 2026 map lists ${state.name} as “${base}”.`
          : 'No status posted by the state.';
      return {
        text,
        chip: p ? p.chip : statusChip(status),
        name: p ? p.programName : raw?.programName ?? null,
        url: p ? p.url : raw?.url ?? null,
        checked: p ? p.checked : raw?.checked ?? null,
      };
    };
    return { state, hear: one(sv?.hear, row.hear), homes: one(sv?.homes, row.homes), baseline: base, sources: sv?.sources ?? row.sources ?? [] };
  });
}

// ---------------------------------------------------------------- rebates
export const REBATE_CATS: { key: string; label: string }[] = [
  { key: 'whole-home', label: 'Whole-home upgrades' },
  { key: 'insulation-air-sealing', label: 'Insulation and air sealing' },
  { key: 'heat-pump', label: 'Heat pumps' },
  { key: 'appliances', label: 'Appliances and equipment' },
  { key: 'income-qualified', label: 'Income-qualified offers' },
  { key: 'financing', label: 'Financing' },
  { key: 'other', label: 'Other incentives' },
];

export interface RebateView {
  name: string;
  runBy: string | null;
  amount: string | null;
  whoQualifies: string | null;
  statusText: string | null;
  status: NormStatus;
  chip: { cls: string; label: string };
  live: boolean;
  url: string | null;
  checked: string | null;
}

export function rebateGroups(m: Metro): { key: string; label: string; items: RebateView[]; live: number }[] {
  const items = ((m.data.rebates ?? []) as any[]).map((r, i) => {
    const chip = statusChip(r.status);
    return {
      cat: REBATE_CATS.some((c) => c.key === r.category) ? r.category : 'other',
      i,
      view: {
        name: r.name,
        runBy: r.runBy ?? null,
        amount: r.amount ?? null,
        whoQualifies: r.whoQualifies ?? null,
        statusText: r.status ?? null,
        status: chip.status,
        chip: { cls: chip.cls, label: chip.label },
        live: isOpenChip(chip),
        url: r.url ?? null,
        checked: r.checked ?? null,
      } as RebateView,
    };
  });
  return REBATE_CATS.map((c) => {
    const list = items
      .filter((x) => x.cat === c.key)
      .sort((a, b) => STATUS_ORDER[a.view.status] - STATUS_ORDER[b.view.status] || a.i - b.i)
      .map((x) => x.view);
    return { key: c.key, label: c.label, items: list, live: list.filter((r) => r.live).length };
  }).filter((g) => g.items.length > 0);
}

export function rebateCounts(m: Metro) {
  const all = ((m.data.rebates ?? []) as any[]).map((r) => statusChip(r.status));
  return { total: all.length, live: all.filter(isOpenChip).length, closed: all.filter((c) => c.status === 'closed').length };
}

// ---------------------------------------------------------------- local rules
export interface RuleView {
  name: string;
  appliesTo: string | null;
  summary: string | null;
  url: string | null;
  reach: RuleReach;
  tag: { label: string; cls: string; homes: boolean };
}

const REACH_ORDER: RuleReach[] = ['homes', 'build', 'indirect', 'large', 'proposed', 'none'];

export function localRules(m: Metro): RuleView[] {
  return ((m.data.localRules ?? []) as any[])
    .map((r) => {
      const reach = ruleReach(r);
      return { name: r.name, appliesTo: r.appliesTo ?? null, summary: r.summary ?? null, url: r.url ?? null, reach, tag: RULE_REACH[reach] };
    })
    .sort((a, b) => REACH_ORDER.indexOf(a.reach) - REACH_ORDER.indexOf(b.reach));
}

// ---------------------------------------------------------------- notes
export const metroNotes = (m: Metro): MetroNotes => notesFor(m.data.notes);

// ---------------------------------------------------------------- energy prices (EIA)
const P = prices as any;

export interface PriceRow {
  state: StateRef;
  elecCents: number | null;
  gasPerTherm: number | null;
  gasPerMcf: number | null;
  /** year of the annual gas average used (EIA's last full year, or the most recent year EIA published) */
  gasYear: string | null;
  oilPerGal: number | null;
  propanePerGal: number | null;
}

/** Prices come from statePrices(); this only adds which year the gas average is from. */
export function priceRows(states: string[]): PriceRow[] {
  return states.map((st) => {
    const sp = statePrices(st);
    const g = P.naturalGas.states?.[st] ?? {};
    const gasYear = g.annualAverageLastFullYear != null ? PRICE_META.gas.lastFullYear : g.mostRecentAnnualPublished?.year ?? null;
    return {
      state: stateRef(st),
      elecCents: sp.elecCents,
      gasPerMcf: sp.gasPerMcfAnnual,
      gasPerTherm: sp.gasPerTherm,
      gasYear,
      oilPerGal: sp.oilPerGal,
      propanePerGal: sp.propanePerGal,
    };
  });
}

export const PRICE_INFO = {
  elecMonth: P.electricity.latestMonth as string,
  elecUrl: P.electricity.url as string,
  elecReleased: P.electricity.released as string,
  gasYear: P.naturalGas.lastFullYear as string,
  gasUrl: P.naturalGas.annualUrl as string,
  btu: P.naturalGas.heatContent?.btuPerCubicFoot as number,
  btuUrl: P.naturalGas.heatContent?.url as string,
  oilWeek: P.heatingOil.lastWeek as string,
  oilUrl: P.heatingOil.dataUrl as string,
  propaneWeek: P.propane.lastWeek as string,
  propaneUrl: P.propane.dataUrl as string,
  weeklyUrl: P.heatingOil.url as string,
  usElec: P.electricity.unitedStates?.latest as number,
};

// ---------------------------------------------------------------- climate and housing
const C = climate as any;
const findSource = (re: RegExp) => (C.sources as { label: string; href: string }[]).find((s) => re.test(s.label));

export const CLIMATE_SOURCES = {
  normals: findSource(/Climate Normals 1991/),
  zones: findSource(/^PNNL-33270/),
  radon: findSource(/Map of Radon Zones — text version/) ?? findSource(/Map of Radon Zones/),
  yearBuilt: findSource(/B25035/),
  tenure: findSource(/B25003/),
  ranking: C.rankingSource as { label: string; href: string },
};

const RADON = (testsData as any).radon;
/** EPA's zone meanings, as tests.json quotes them */
export const RADON_ZONE: Record<number, string> = {
  1: 'highest potential: predicted average indoor level above 4 pCi/L',
  2: 'moderate potential: predicted average 2–4 pCi/L',
  3: 'low potential: predicted average below 2 pCi/L',
};
export const RADON_ZONE_SOURCE = (RADON.sources as { label: string; href: string }[]).find((s) => /radon zones/i.test(s.label)) ?? {
  label: 'EPA Map of Radon Zones',
  href: 'https://www.epa.gov/radon/epa-map-radon-zones',
};

export interface Glance {
  zone: string | null;
  county: string | null;
  hdd: number | null;
  cdd: number | null;
  station: { id: string; name: string } | null;
  yearBuilt: number | null;
  yearBuiltNote: string | null;
  owner: number | null;
  acs: string | null;
  place: string | null;
  radonZone: number | null;
}

export function glance(m: Metro): Glance {
  const c = m.climate;
  const notes = c?.notes ?? '';
  return {
    zone: c?.iecc2021ClimateZone ?? null,
    county: c?.principalCounty ?? null,
    hdd: c?.hdd65 ?? null,
    cdd: c?.cdd65 ?? null,
    station: c?.station ?? null,
    yearBuilt: c?.medianYearBuilt ?? null,
    yearBuiltNote: c?.medianYearBuilt == null && /Built 1939 or earlier/.test(notes) ? '1939 or earlier' : null,
    owner: c?.ownerOccupiedShare ?? null,
    acs: c?.acsRelease ?? null,
    place: housingPlace(notes),
    radonZone: c?.epaRadonZone ?? null,
  };
}

/** Housing place without the state, e.g. "Boston city" */
export const placeShort = (place: string | null) => (place ? place.split(',')[0] : null);
