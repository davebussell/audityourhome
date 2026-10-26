/**
 * US data layer. Research files in src/data/us/ were verified against official sources on
 * October 12, 2026 (see each record's sources). Pages read them through these helpers so
 * status wording, ordering and units stay consistent across the US site.
 */
import climate from '../../data/us/climate.json';
import prices from '../../data/us/prices.json';
import federal from '../../data/us/federal.json';
import { cleanRecord } from './clean';

export const US_VERIFIED = 'October 12, 2026';
export const US_VERIFIED_ISO = '2026-10-12';

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// ---------------------------------------------------------------- status
export type NormStatus = 'open' | 'limited' | 'closed' | 'not-open' | 'unknown';

const STATUS_WORD = /^(open|closed|paused|ended|launched|partly open|available|not launched)\b/;

function leadClause(text: string | null | undefined) {
  let s = (text ?? '').toLowerCase().trim();
  // drop a leading label such as "New York:", "DC:" or "owner-occupied homes:" (but keep "open: ...")
  const label = s.match(/^([a-z .,'\-–]{2,40}):\s*/);
  if (label && !STATUS_WORD.test(label[1])) s = s.slice(label[0].length);
  return { all: s, lead: s.split(/[.;(]/)[0].trim() };
}

const CLOSED_ANYWHERE = /fully reserved|funds? (are |is |were )?(used up|exhausted)|funding (has been )?(fully )?(exhausted|used up|reserved)|no longer accepting|not accepting (new )?applications/;

/** Research records keep the source's own status wording; this sorts it into five buckets. */
export function normStatus(text: string | null | undefined): NormStatus {
  const { all, lead } = leadClause(text);
  if (!lead) return 'unknown';
  if (/^(unverified|not stated|unknown|described as|registration form|applications requested|awarded)/.test(lead)) return 'unknown';
  if (/^(closed|ended|expired|fully reserved|used up|discontinued|terminated|no longer|not accepting|not participating)/.test(lead)) return 'closed';
  if (/^(paused|waitlist|wait list|suspended|on hold|partly open|mostly closed|ending|restricted|application window|pilot)/.test(lead)) return 'limited';
  if (/^(not launched|not yet|not available|pending|coming|announced|planned|expected)/.test(lead)) return 'not-open';
  if (/^(open|available|launched|active|listed as available|running|accepting|in force|referenced as available|taking applications|enrollment open|online application available|listed as current|listed on|listed in|year-round|operating)/.test(lead)) {
    if (/not verified|unverified/.test(all)) return 'unknown';
    return /while funds|funds (are |is )?limited|limited|first[- ]come|until funds|subject to funding|wait times|pilot|only|restrictions|ends |cut-off|reserve|except|paused|closing/.test(all) ? 'limited' : 'open';
  }
  // no status word up front: look for unambiguous wording anywhere
  if (CLOSED_ANYWHERE.test(all)) return 'closed';
  if (/is closing|will close|closes on|ending/.test(all)) return 'limited';
  if (/waitlist/.test(all)) return 'limited';
  return 'unknown';
}

/** Chip class and a short label that keeps the nuance of the source wording. */
export function statusChip(text: string | null | undefined): { cls: string; label: string; status: NormStatus } {
  const status = normStatus(text);
  const { all, lead } = leadClause(text);
  if (status === 'closed' && /^not participating/.test(lead)) return { status, cls: 'chip-closed', label: 'Not participating' };
  if (status === 'limited') {
    if (/^paused|^suspended|^on hold/.test(lead)) return { status, cls: 'chip-limited', label: 'Paused' };
    if (/^waitlist|^wait list/.test(lead) || (/^pilot/.test(lead) && /waitlist/.test(all))) return { status, cls: 'chip-limited', label: 'Waitlist' };
    if (/^partly open|^mostly closed|^restricted/.test(lead) || /except|paused/.test(all)) return { status, cls: 'chip-limited', label: 'Partly open' };
    if (/^ending|is closing|will close|closes on/.test(all)) return { status, cls: 'chip-limited', label: 'Ending soon' };
    if (/^application window/.test(lead)) return { status, cls: 'chip-limited', label: 'Short window' };
    if (/^pilot/.test(lead)) return { status, cls: 'chip-limited', label: 'Pilot' };
    return { status, cls: 'chip-limited', label: 'Open · limits apply' };
  }
  return { status, ...STATUS_CHIP[status] };
}

export const STATUS_CHIP: Record<NormStatus, { cls: string; label: string }> = {
  open: { cls: 'chip-active', label: 'Open' },
  limited: { cls: 'chip-limited', label: 'Open · limits apply' },
  closed: { cls: 'chip-closed', label: 'Closed' },
  'not-open': { cls: 'chip-info', label: 'Not open yet' },
  unknown: { cls: 'chip-neutral', label: 'Unconfirmed' },
};

// ---------------------------------------------------------------- metros
const metroFiles = import.meta.glob('../../data/us/metros/*.json', { eager: true, import: 'default' }) as Record<string, any>;

export interface MetroClimate {
  station: { id: string; name: string } | null;
  hdd65: number | null;
  cdd65: number | null;
  iecc2021ClimateZone: string | null;
  epaRadonZone: number | null;
  principalCounty: string | null;
  medianYearBuilt: number | null;
  ownerOccupiedShare: number | null;
  acsRelease?: string;
  notes?: string;
}

export interface Metro {
  slug: string;
  rank: number;
  population: number | null;
  msa: string;
  /** full research record: utilities, auditPrograms, rebates, stateHomeEnergyRebates, incomeQualified, localRules, notes, sources */
  data: any;
  climate: MetroClimate | null;
}

const ranked = (climate as any).rankedMetros as { rank: number; msa: string; population: number; slug: string }[];
export const METROS: Metro[] = ranked
  .map((r) => {
    const file = Object.entries(metroFiles).find(([p]) => p.endsWith(`/${r.slug}.json`));
    if (!file) return null;
    // research wording ("blocked automated access", "were not researched") becomes homeowner guidance; status fields stay raw
    return { slug: r.slug, rank: r.rank, population: r.population ?? null, msa: r.msa, data: cleanRecord(file[1]), climate: (climate as any).metros?.[r.slug] ?? null } as Metro;
  })
  .filter((m): m is Metro => m !== null)
  .sort((a, b) => a.rank - b.rank);

export const metroBySlug = (slug: string) => METROS.find((m) => m.slug === slug);
export const metrosInState = (st: string) => METROS.filter((m) => (m.data.states ?? []).includes(st));
export const POPULATION_SOURCE = (climate as any).rankingSource as { label: string; href: string };

// ---------------------------------------------------------------- prices (EIA)
const P = prices as any;
export const PRICE_META = {
  electricity: { month: P.electricity.latestMonth as string, url: P.electricity.url as string, source: P.electricity.source as string },
  gas: { month: P.naturalGas.latestMonth as string, lastFullYear: P.naturalGas.lastFullYear as string, url: P.naturalGas.url as string, source: P.naturalGas.source as string, btuPerCf: P.naturalGas.heatContent?.btuPerCubicFoot as number },
  oil: { week: P.heatingOil.lastWeek as string, url: P.heatingOil.url as string },
  propane: { week: P.propane.lastWeek as string, url: P.propane.url as string },
};

export interface StatePrices {
  /** cents per kWh, latest month */
  elecCents: number | null;
  /** cents per kWh, year to date */
  elecCentsYtd: number | null;
  /** dollars per thousand cubic feet, last full-year average (better for running costs than a summer month) */
  gasPerMcfAnnual: number | null;
  /** dollars per therm derived from the annual average and EIA's heat content */
  gasPerTherm: number | null;
  /** the year the gas average is for (EIA's last full year, or an older year when that one isn't published) */
  gasYear: string | null;
  gasNote?: string;
  /** dollars per gallon, latest week (taxes excluded per EIA) */
  oilPerGal: number | null;
  propanePerGal: number | null;
}

export function statePrices(st: string): StatePrices {
  const e = P.electricity.states?.[st] ?? {};
  const g = P.naturalGas.states?.[st] ?? {};
  const annual = g.annualAverageLastFullYear ?? g.mostRecentAnnualPublished?.value ?? null;
  const btu = PRICE_META.gas.btuPerCf || 1036;
  const therms = annual != null ? +(annual / ((btu * 1000) / 100000)).toFixed(2) : null; // 1 therm = 100,000 Btu
  return {
    elecCents: e.latest ?? null,
    elecCentsYtd: e.yearToDate ?? null,
    gasPerMcfAnnual: annual,
    gasPerTherm: therms,
    gasYear: g.annualAverageLastFullYear != null ? String(P.naturalGas.lastFullYear ?? '') || null : g.mostRecentAnnualPublished?.year ?? null,
    gasNote: g.note,
    oilPerGal: P.heatingOil.states?.[st]?.latest ?? null,
    propanePerGal: P.propane.states?.[st]?.latest ?? null,
  };
}

// ---------------------------------------------------------------- federal
export const FEDERAL = cleanRecord(federal as any);
export const stateRebateRow = (st: string) => (FEDERAL.homeEnergyRebates.states as any[]).find((s) => s.state === st);

/** "1,234" */
export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
/** "29.9¢" */
export const fmtCents = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}¢`);
/** "$1.70" */
export const fmtDollars = (n: number | null | undefined, digits = 2) => (n == null ? '—' : `$${n.toFixed(digits)}`);
