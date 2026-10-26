/**
 * Build-time data for the US Home Energy Planner (/us/plan/). Everything comes from the US
 * research files (src/data/us/, verified October 12, 2026) through the helpers in data.ts, plus
 * the Census-built ZIP3 table (src/data/us/zip3.json). The page embeds the result as JSON, so the
 * planner runs entirely in the browser and nothing a visitor enters is sent anywhere.
 */
import { STATE_NAMES, METROS, statePrices, statusChip, stateRebateRow, PRICE_META, FEDERAL, US_VERIFIED } from './data';
import pricesJson from '../../data/us/prices.json';
import climateJson from '../../data/us/climate.json';
import testsJson from '../../data/us/tests.json';
import zip3Json from '../../data/us/zip3.json';
import type { TestFacts } from './plan-content';

const P = pricesJson as any;
const T = testsJson as any;

export const stateSlug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** First sentence of a licensing requirement, without its parenthetical citations. */
function requirementSentence(text: string): string {
  let s = text;
  for (let prev = ''; prev !== s; ) { prev = s; s = s.replace(/\s*\([^()]*\)/g, ''); } // nested citations too
  s = s.replace(/\s+([,;.])/g, '$1').trim();
  const m = s.match(/^(.+?\.)(?:\s+(?=[A-Z])|$)/);
  return cap((m ? m[1] : s).trim());
}

/** tests.json stateSummary notes read "Radon: … Mold: … CO: …"; split them by topic. */
function summarySegments(notes: string): Record<string, string> {
  const parts = notes.split(/(?:^|\s)(Radon|Mold|CO):\s*/);
  const out: Record<string, string> = {};
  for (let i = 1; i < parts.length - 1; i += 2) out[parts[i]] = cap(parts[i + 1].replace(/\s*\(null\)/g, '').trim());
  return out;
}

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) throw new Error(`plan-payload: missing ${what}`);
  return v;
}

/* ------------------------------------------------------------------ prices */

const btuPerCf = PRICE_META.gas.btuPerCf || 1036;
const therm = (perMcf: number) => +(perMcf / ((btuPerCf * 1000) / 100000)).toFixed(2);

export const NATIONAL = {
  elecCents: must<number>(P.electricity.unitedStates?.latest, 'US electricity price'),
  gasPerTherm: therm(must<number>(P.naturalGas.unitedStates?.annualAverageLastFullYear, 'US natural gas price')),
  oilPerGal: must<number>(P.heatingOil.regions?.US?.latest, 'US heating oil price'),
  propanePerGal: must<number>(P.propane.regions?.US?.latest, 'US propane price'),
};

export const PRICE_PERIODS = {
  elecMonth: PRICE_META.electricity.month,
  gasYear: PRICE_META.gas.lastFullYear,
  oilWeek: PRICE_META.oil.week,
  propaneWeek: PRICE_META.propane.week,
  btuPerCf,
  elecReleased: P.electricity.released as string,
  gasReleased: P.naturalGas.released as string,
  oilReleased: P.heatingOil.released as string,
  links: {
    elec: PRICE_META.electricity.url,
    gas: P.naturalGas.annualUrl as string,
    oil: PRICE_META.oil.url,
  },
};

export interface StatePriceRow {
  /** ¢/kWh */
  e: number;
  /** $/therm */
  g: number | null;
  /** year of the gas average, when not the last full year */
  gy: string | null;
  /** $/gal, null = EIA publishes none for the state (planner uses the national figure) */
  o: number | null;
  pr: number | null;
}

function statePriceRow(st: string): StatePriceRow {
  const sp = statePrices(st);
  const g = P.naturalGas.states?.[st] ?? {};
  const gy = g.annualAverageLastFullYear != null ? null : g.mostRecentAnnualPublished?.year ?? null;
  return {
    e: must(sp.elecCents, `electricity price for ${st}`),
    g: sp.gasPerTherm,
    gy,
    o: sp.oilPerGal,
    pr: sp.propanePerGal,
  };
}

/* ------------------------------------------------------------------ federal home energy rebates */

/**
 * Some HOMES statuses in federal.json point at the HEEHR row ("not launched (same)",
 * "(same timeline)", "(same as HEAR)"). Spell the reference out so each row reads on its own.
 */
function resolveSame(status: string | null, other: string | null): string | null {
  if (!status) return status;
  const m = status.match(/\s*\((same(?: timeline| as hear)?)\)\s*$/i);
  if (!m) return status;
  const paren = (other ?? '').match(/\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/);
  return status.slice(0, m.index).trim() + (paren ? ` ${paren[0].trim()}` : '');
}

function herProgram(p: any, other?: any) {
  const status: string | null = resolveSame(p?.status ?? null, other?.status ?? null);
  const chip = statusChip(status);
  return {
    s: status ? cap(status) : null,
    chip: { cls: chip.cls, label: chip.label, status: chip.status },
    name: (p?.programName as string | null) ?? null,
    url: (p?.url as string | null) ?? null,
  };
}

/* ------------------------------------------------------------------ test facts (tests.json) */

function testFacts(): TestFacts {
  const bd: string = T.energyTests.blowerDoor.iecc2021;
  const m = bd.match(/([\d.]+) ACH50 or less in climate zones 0-2 and ([\d.]+) ACH50 or less in zones 3-8/);
  const dl: string = T.energyTests.ductLeakage.iecc2021;
  const d = dl.match(/([\d.]+) cfm25 or less per 100 sq ft/);
  // Per-state notes: the research file's state summaries first (20 states), then the state
  // licensing lists for states without a summary.
  const radonLicense: Record<string, string> = {};
  const coLaw: Record<string, string | null> = {};
  const moldLicense: Record<string, string> = {};
  const inState = (st: string) => `In ${st === 'DC' ? 'the District of Columbia' : STATE_NAMES[st] ?? st}: `;
  // Mold: the licensing list says more than the summaries' one-word notes, so it goes first.
  for (const r of T.mold.stateLicensing as any[]) {
    if (r.requirement) moldLicense[r.state] = inState(r.state) + requirementSentence(r.requirement);
  }
  for (const r of T.stateSummary as any[]) {
    const seg = summarySegments(r.notes ?? '');
    if (seg.Radon) radonLicense[r.state] = inState(r.state) + seg.Radon;
    if (seg.CO) coLaw[r.state] = inState(r.state) + seg.CO;
    if (seg.Mold && !moldLicense[r.state]) moldLicense[r.state] = inState(r.state) + seg.Mold;
  }
  for (const r of T.radon.stateLicensing as any[]) {
    if (r.requirement && !radonLicense[r.state]) radonLicense[r.state] = inState(r.state) + requirementSentence(r.requirement);
  }
  return {
    blowerLimitByZone: { warm: Number(must(m?.[1], 'IECC blower door limit (zones 0-2)')), cold: Number(must(m?.[2], 'IECC blower door limit (zones 3-8)')) },
    ductLimit: Number(must(d?.[1], 'IECC duct leakage limit')),
    radonLicense,
    coLaw,
    moldLicense,
  };
}

/* ------------------------------------------------------------------ ENERGY STAR insulation table */

function insulation() {
  const rows = T.energyTests.insulation.recommendedRValues as { zone: string; attic: string; floor: string }[];
  const attic: Record<string, number> = {};
  const atticText: Record<string, string> = {};
  const floorText: Record<string, string> = {};
  for (const r of rows) {
    const m = r.attic.match(/R(\d+) if uninsulated/);
    attic[r.zone] = Number(must(m?.[1], `ENERGY STAR attic R-value for zone ${r.zone}`));
    atticText[r.zone] = r.attic;
    floorText[r.zone] = r.floor;
  }
  for (const z of ['1', '2', '3', '4', '5', '6', '7', '8']) must(attic[z], `ENERGY STAR zone ${z}`);
  return { attic, atticText, floorText };
}

/* ------------------------------------------------------------------ metros */

function housingPlace(notes: string | undefined): string | null {
  const m = (notes ?? '').match(/Housing figures are for (.+?) city, ([A-Za-z .]+?) \(Census place/);
  return m ? `${m[1]}, ${m[2]}` : null;
}

function metroRecord(m: (typeof METROS)[number]) {
  const c = m.climate;
  const cl = (climateJson as any).metros?.[m.slug] ?? {};
  return {
    n: m.data.name as string,
    msa: m.msa,
    st: (m.data.states ?? []) as string[],
    c: {
      h: must<number>(c?.hdd65, `${m.slug} HDD`),
      k: must<number>(c?.cdd65, `${m.slug} CDD`),
      z: c?.iecc2021ClimateZone ?? null,
      r: c?.epaRadonZone ?? null,
      co: c?.principalCounty ?? null,
      stn: c?.station?.name ?? null,
      my: c?.medianYearBuilt ?? null,
      place: housingPlace(cl.notes),
      acs: c?.acsRelease ?? null,
    },
    a: ((m.data.auditPrograms ?? []) as any[]).map((a) => {
      const chip = statusChip(a.status);
      return {
        n: a.name as string,
        by: (a.runBy as string) ?? null,
        cost: (a.cost as string) || null,
        s: a.status ? cap(String(a.status)) : null,
        chip: { cls: chip.cls, label: chip.label, status: chip.status },
        url: (a.url as string) ?? null,
      };
    }),
  };
}

/* ------------------------------------------------------------------ payload */

export function buildPlanPayload() {
  const states: Record<string, unknown> = {};
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    const row = stateRebateRow(code);
    states[code] = {
      n: name,
      slug: stateSlug(name),
      p: statePriceRow(code),
      her: row ? { homes: herProgram(row.homes, row.hear), heehr: herProgram(row.hear) } : null,
    };
  }
  const metros: Record<string, unknown> = {};
  for (const m of METROS) metros[m.slug] = metroRecord(m);
  if (Object.keys(metros).length !== 26) throw new Error(`plan-payload: expected 26 metros, got ${Object.keys(metros).length}`);

  const zip3 = (zip3Json as any).zip3 as Record<string, [string, string | null, string | null, number | null]>;
  for (const [k, v] of Object.entries(zip3)) {
    if (!states[v[0]]) throw new Error(`plan-payload: zip3 ${k} has unknown state ${v[0]}`);
    if (v[1] && !metros[v[1]]) throw new Error(`plan-payload: zip3 ${k} has unknown metro ${v[1]}`);
    if (v[2] && !metros[v[2]]) throw new Error(`plan-payload: zip3 ${k} has unknown nearest metro ${v[2]}`);
  }

  const cred = (FEDERAL.credentials as any[]);
  const pick = (re: RegExp) => cred.find((c) => re.test(c.name));
  const credentials = [pick(/^RESNET HERS Rater/), pick(/^BPI Building Analyst Professional/), pick(/^DOE Home Energy Score/)]
    .filter(Boolean)
    .map((c) => ({ name: c.name as string, by: c.certifiedBy as string, url: c.findAProUrl as string | null }));
  const rebateFinder = (FEDERAL.otherFederal as any[]).find((o) => /Rebate Finder/.test(o.name));

  return {
    verified: US_VERIFIED,
    zip3,
    states,
    metros,
    national: NATIONAL,
    periods: PRICE_PERIODS,
    insulation: insulation(),
    tests: testFacts(),
    credentials,
    wapUrl: FEDERAL.weatherization.findUrl as string,
    rebateFinderUrl: (rebateFinder?.url as string) ?? null,
  };
}

export type PlanPayload = ReturnType<typeof buildPlanPayload>;
