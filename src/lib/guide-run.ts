/**
 * The numbers behind the buying guides (/buying-guides/…) for every Canadian city and US metro the sites cover: a
 * year of heat, hot water and cooling for one reference house at local prices, and what each choice of equipment
 * changes. Prices, climate and efficiencies are the calculators' own (src/data/calc, src/data/us), so every figure
 * matches the planner; the standards and criteria quoted beside them live in src/data/guides/facts.json with their
 * sources. Nothing here is typed into a page by hand: a price update rewrites the guides.
 */
import { CALC_CITIES, resolvePrices, cityName, defaultSystem, provinceRebates, MODEL, PRICE_UPDATES } from './calc/data';
import {
  systemEfficiency, baselineDemandGJ, waterHeatingDemand, coolingKwh, defaultAcTons, setbackMeasure, fuelOf,
  type SystemKey, type WaterHeaterKey, type Fuel,
} from './calc/engine';
import { US_METROS, metroName, metroState, stateName, coolingUS, type Market } from './heatpumps';
import { statePrices } from './us/data';
import { cDegreeDays, annualMeanC, hpwhHeatShare, GJ_PER_THERM, LITERS_PER_GALLON } from './us/plan-model';
import { REF_HOUSE, RUN_PRICES_AS_OF } from './hp-run';
import factsJson from '../data/guides/facts.json';
import coolingModel from '../data/us/cooling-model.json';
import usPrices from '../data/us/prices.json';

export const FACTS = factsJson;
export const GUIDES_CHECKED = factsJson.checked;
export type FactSource = keyof typeof factsJson.sources;
/** A source from facts.json, in the shape GuideShell's `sources` takes. */
export const src = (id: FactSource) => ({ label: factsJson.sources[id].label, url: factsJson.sources[id].url });
export { REF_HOUSE };
export const REF_SQFT = Math.round((REF_HOUSE.m2 * 10.7639) / 100) * 100;
export const PERSONS = 3;
/** When the energy prices behind the numbers were last read (ISO date). */
export const pricesAsOf = (m: Market): string => (m === 'ca' ? RUN_PRICES_AS_OF.ca : ((usPrices as any).electricity.retrieved as string));
/** The two dates every guide prints under "What was checked when". */
export const baseAsOf = (m: Market) => [
  { label: 'Standards, criteria and guidance', date: factsJson.checked },
  { label: 'Energy prices', date: pricesAsOf(m) },
  ...(m === 'ca' ? PRICE_UPDATES : []),
];
/** "a detached house of 149 m² (1,600 sq ft) built between 1966 and 1980" */
export const refHouseWords = (m: Market) =>
  m === 'ca' ? `a detached house of ${Math.round(REF_HOUSE.m2)} m² (${REF_SQFT.toLocaleString('en-CA')} sq ft) built between 1966 and 1980` : `a detached house of ${REF_SQFT.toLocaleString('en-US')} sq ft built between 1966 and 1980`;
export const PRICES_SOURCE = { label: 'The energy prices behind these numbers, place by place', url: '/heat-pumps/vs-gas-furnace/#method' };

const EC = MODEL.energyContentGJ;
const F = factsJson;

export interface GRow {
  slug: string;
  name: string;
  /** province or territory code (CA) or state code (US) */
  code: string;
  region: string;
  /** the city or metro page */
  href: string;
  population: number;
  /** heating degree days, °C-days base 18 */
  hddC: number;
  /** dollars per GJ of energy bought, by fuel (null: no price in our data, e.g. no piped gas) */
  price: Record<'electricity' | 'gas' | 'oil' | 'propane', number | null>;
  /** dollars per kWh */
  kwh: number;
  /** a year of space heating for the reference house, GJ delivered */
  demandGJ: number;
  /** a year of hot water for three people, GJ delivered, and the average cold-water temperature behind it */
  waterGJ: number;
  inletC: number;
  /** share of the heat a heat pump water heater takes from the house that the heating system has to replace */
  hpwhShare: number;
  /** yearly cooling kWh for the reference house × SEER, so kWh at any rating is coolK ÷ SEER (null: no cooling data) */
  coolK: number | null;
  /** the federal minimum SEER2 for a new split air conditioner here */
  minSeer2: number;
  /** the heating most homes here have: prices the heat a water heater or ventilator adds or saves */
  sys: SystemKey;
}

let caCache: GRow[] | null = null;
function rowsCA(): GRow[] {
  if (caCache) return caCache;
  const capacityBtuh = defaultAcTons(REF_HOUSE.m2) * 12000;
  caCache = CALC_CITIES.map((c) => {
    const any = c as any;
    const rp = resolvePrices(c);
    const hddC = (any.eccc?.hdd18 ?? any.hot2000?.hdd) as number;
    const mean = any.eccc?.annualMean as number;
    const water = waterHeatingDemand(PERSONS, mean);
    const cdd = any.eccc?.cdd18 as number | null;
    const designCool = any.hot2000?.designCool as number | null;
    const coolK = cdd != null && designCool != null ? coolingKwh({ cdd18: cdd, designCool, capacityBtuh, seer: 1 }).kwh : null;
    return {
      slug: c.slug,
      name: cityName(c),
      code: c.prov,
      region: c.provName,
      href: `/cities/${c.slug}/`,
      population: c.population ?? 0,
      hddC,
      price: {
        electricity: rp.elec.variable / EC.electricity,
        gas: rp.gas ? rp.gas.variable / EC.gas : null,
        oil: rp.oil ? rp.oil.perL / EC.oil : null,
        propane: rp.propane ? rp.propane.perL / EC.propane : null,
      },
      kwh: rp.elec.variable,
      demandGJ: baselineDemandGJ({ vintage: REF_HOUSE.vintage, floorAreaM2: REF_HOUSE.m2, hdd: hddC, type: REF_HOUSE.type }),
      waterGJ: water.gj,
      inletC: water.inletC,
      hpwhShare: MODEL.water.hpwhHeatTaken.heatingSeasonShare,
      coolK: coolK && coolK > 0 ? coolK : null,
      minSeer2: F.ac.caMinSeer2,
      sys: defaultSystem(c),
    } satisfies GRow;
  });
  return caCache;
}

/** DOE's regional air conditioner standards (10 CFR 430.32), as recorded with the US cooling model. */
const ac2023 = ((coolingModel as any).acEfficiencyByAge as any[]).find((r) => /^2023/.test(r.installed) && /central AC/.test(r.type));
const ac2015 = ((coolingModel as any).acEfficiencyByAge as any[]).find((r) => /^2015/.test(r.installed) && /central AC/.test(r.type));
const southStates = new Set(
  `${(ac2015?.note as string | undefined)?.match(/Southeast \(([A-Z ]+)\)/)?.[1] ?? ''} ${(ac2015?.note as string | undefined)?.match(/Southwest \(([A-Z ]+?),/)?.[1] ?? ''}`.split(/\s+/).filter(Boolean),
);
export const US_MIN_SEER2 = { north: ac2023?.seer2North as number, south: ac2023?.seer2 as number };

let usCache: GRow[] | null = null;
function rowsUS(): GRow[] {
  if (usCache) return usCache;
  if (!US_MIN_SEER2.north || !US_MIN_SEER2.south || southStates.size < 15) throw new Error('guide-run: the US air conditioner standards could not be read from cooling-model.json');
  usCache = US_METROS.filter((m) => m.climate?.hdd65 != null && m.climate?.cdd65 != null).flatMap((m) => {
    const st = metroState(m);
    const p = statePrices(st);
    if (!p.elecCents) return [];
    const hdd65 = m.climate!.hdd65 as number;
    const cdd65 = m.climate!.cdd65 as number;
    const hddC = cDegreeDays(hdd65);
    const water = waterHeatingDemand(PERSONS, annualMeanC(hdd65, cdd65));
    const cool = coolingUS(m, REF_SQFT);
    const kwh = p.elecCents / 100;
    return [{
      slug: m.slug,
      name: metroName(m),
      code: st,
      region: stateName(st),
      href: `/cities/${m.slug}/`,
      population: m.population ?? 0,
      hddC,
      price: {
        electricity: kwh / EC.electricity,
        gas: p.gasPerTherm ? p.gasPerTherm / GJ_PER_THERM : null,
        oil: p.oilPerGal ? p.oilPerGal / (EC.oil * LITERS_PER_GALLON) : null,
        propane: p.propanePerGal ? p.propanePerGal / (EC.propane * LITERS_PER_GALLON) : null,
      },
      kwh,
      demandGJ: baselineDemandGJ({ vintage: REF_HOUSE.vintage, floorAreaM2: REF_HOUSE.m2, hdd: hddC, type: REF_HOUSE.type }),
      waterGJ: water.gj,
      inletC: water.inletC,
      hpwhShare: hpwhHeatShare({ hdd65, cdd65 }),
      coolK: cool ? cool.kwhTypical * cool.seerRef : null,
      minSeer2: southStates.has(st) ? US_MIN_SEER2.south : US_MIN_SEER2.north,
      sys: (p.gasPerTherm ? 'gasFurnaceMid' : 'electricResistance') as SystemKey,
    } satisfies GRow];
  });
  return usCache;
}

export const guideRows = (m: Market): GRow[] => (m === 'ca' ? rowsCA() : rowsUS());

/* ------------------------------------------------------------------ what things cost to run */

/** Dollars per GJ of heat delivered by a fuel at an efficiency (null where we hold no price for the fuel). */
export function heatAt(r: GRow, fuel: Fuel, eff: number): number | null {
  const p = (r.price as Record<string, number | null>)[fuel];
  return p != null && eff > 0 ? p / eff : null;
}
/** Dollars per GJ of heat delivered by one of the calculators' systems, at its seasonal efficiency here. */
export const heatBy = (r: GRow, sys: SystemKey) => heatAt(r, fuelOf(sys), systemEfficiency(sys, r.hddC));
/** A year of heat for the reference house. */
export const yearAt = (r: GRow, fuel: Fuel, eff: number) => { const x = heatAt(r, fuel, eff); return x == null ? null : x * r.demandGJ; };
export const yearBy = (r: GRow, sys: SystemKey) => { const x = heatBy(r, sys); return x == null ? null : x * r.demandGJ; };
export const copHere = (r: GRow) => systemEfficiency('ashpCold', r.hddC);
/** The COP above which a heat pump's heat costs less than a gas furnace's at this efficiency. */
export const tieCop = (r: GRow, furnaceEff = F.furnace.afue.min) => (r.price.gas == null ? null : (r.price.electricity! * furnaceEff) / r.price.gas);

/** Yearly cooling kWh for the reference house at a SEER2 rating. */
export const coolKwh = (r: GRow, seer2: number) => (r.coolK == null ? null : r.coolK / (seer2 / F.ac.seer2PerSeer));
export const coolCost = (r: GRow, seer2: number) => { const k = coolKwh(r, seer2); return k == null ? null : k * r.kwh; };
/** …and for an old unit rated in SEER. */
export const coolCostSeer = (r: GRow, seer: number) => (r.coolK == null ? null : (r.coolK / seer) * r.kwh);

/** A year of hot water for three people; heat pump water heaters include the house heat they take in the heating season. */
export function waterCost(r: GRow, type: WaterHeaterKey): number | null {
  const t = MODEL.water.types[type];
  const p = (r.price as Record<string, number | null>)[t.fuel];
  if (p == null) return null;
  let cost = (r.waterGJ / t.uef) * p;
  if (type === 'heatPump') {
    const heat = heatBy(r, r.sys);
    cost += r.waterGJ * (1 - 1 / t.uef) * r.hpwhShare * (heat ?? 0);
  }
  return cost;
}

/** Share of a year's heating saved by the guides' standard setback (facts.json), by NRCan's 2% per °C per 8 hours. */
export const setbackShare = (heatPump: boolean) =>
  setbackMeasure({ degrees: F.thermostat.setbackDeg, hours: F.thermostat.setbackHours, demandGJ: 1, heatPump }).fraction;

export interface Vent {
  lps: number;
  cfm: number;
  /** heat the ventilation air carries out in a year, GJ */
  loadGJ: number;
  /** heat a recovery ventilator at ENERGY STAR's minimum efficiency gives back, GJ */
  recoveredGJ: number;
  fanWatts: number;
  fanKwh: number;
  fanCost: number;
}
/** Continuous ventilation for the reference house: the building code's rate (Canada) or ASHRAE 62.2's (US). */
export function ventilation(r: GRow, m: Market): Vent {
  const V = F.ventilation;
  const cfm = m === 'ca' ? V.caLps.min / V.lpsPerCfm : V.usCfm.perSqft * REF_SQFT + V.usCfm.perPerson * (V.usCfm.bedrooms + 1);
  const lps = cfm * V.lpsPerCfm;
  const loadGJ = ((lps / 1000) * V.airKJperM3K * r.hddC * 86400) / 1e6;
  const fanWatts = cfm / V.efficacyCfmPerWatt;
  const fanKwh = (fanWatts * 8760) / 1000;
  return { lps, cfm, loadGJ, recoveredGJ: loadGJ * V.sre.at0, fanWatts, fanKwh, fanCost: fanKwh * r.kwh };
}

/** One year of a constant electrical load, e.g. a fan left on. */
export const yearOfWatts = (r: GRow, watts: number) => ((watts * 8760) / 1000) * r.kwh;

/* ------------------------------------------------------------------ rebates we hold (Canada) */

export interface GuideRebate { prov: string; region: string; program: string; amount: string; slug: string | null; who: string | null }
/** The amount in a few words from the entry's own fields ("$125", "up to $150", "50% of the cost, up to $150"); the program's sentence if it has none. */
function rebateWords(e: any, each: string): string {
  const d = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`;
  if (e.kind === 'flat' && e.cap) return e.rate && e.rate < e.cap ? `up to ${d(e.cap)}` : d(e.cap);
  if (e.kind === 'perCount' && e.rate) return `${d(e.rate)} for each ${each}`;
  if (e.kind === 'pctCost' && e.pct) return `${Math.round(e.pct * 100)}% of the cost${e.cap ? `, up to ${d(e.cap)}` : ''}`;
  if (e.cap) return `up to ${d(e.cap)}`;
  return e.amount;
}
/** Open rebates for one measure ('hpwh', 'thermostat'), one line per program, from the calculators' rebate data. */
export function rebatesFor(measure: string, each = 'unit'): GuideRebate[] {
  const seen = new Set<string>();
  const out: GuideRebate[] = [];
  for (const c of CALC_CITIES) {
    if (seen.has(c.prov)) continue;
    seen.add(c.prov);
    const list = (provinceRebates(c.prov)?.measures?.[measure] ?? []) as any[];
    for (const e of list) {
      if (e.status !== 'open' || !e.amount) continue;
      out.push({ prov: c.prov, region: c.provName, program: e.program, amount: rebateWords(e, each), slug: e.slug ?? null, who: e.fuelText ?? null });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ rows for a page, and words */

/** The largest place in each province (Canada) or the largest metros (US): the rows a table leads with. */
export function leadRows(rows: GRow[], m: Market, n = 10): GRow[] {
  const bySize = [...rows].sort((a, b) => b.population - a.population);
  if (m === 'us') return bySize.slice(0, n);
  const out: GRow[] = [];
  for (const r of bySize) if (!out.some((x) => x.code === r.code)) out.push(r);
  return out;
}
/** Regions by population, each with its places by population. */
export function byRegion(rows: GRow[]): { name: string; list: GRow[] }[] {
  return [...new Set(rows.map((r) => r.region))]
    .map((name) => ({ name, list: rows.filter((r) => r.region === name).sort((a, b) => b.population - a.population) }))
    .sort((a, b) => b.list.reduce((n, r) => n + r.population, 0) - a.list.reduce((n, r) => n + r.population, 0));
}

const loc = (m: Market) => (m === 'ca' ? 'en-CA' : 'en-US');
/** "$1,240": whole dollars, rounded to the nearest 10 above 300 and the nearest 5 below. */
export function money(x: number | null | undefined, m: Market): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const step = Math.abs(x) >= 300 ? 10 : 5;
  const v = Math.round(x / step) * step;
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(loc(m))}`;
}
export const pct0 = (x: number) => `${Math.round(x * 100)}%`;
export const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export interface Spread { n: number; min: number; max: number; median: number; least: GRow; most: GRow }
/** The spread of a figure across places, skipping places where it doesn't apply. */
export function spread(rows: GRow[], f: (r: GRow) => number | null): Spread | null {
  const xs = rows.map((r) => ({ r, v: f(r) })).filter((x): x is { r: GRow; v: number } => x.v != null && Number.isFinite(x.v)).sort((a, b) => a.v - b.v);
  if (!xs.length) return null;
  const mid = xs.length % 2 ? xs[(xs.length - 1) / 2].v : (xs[xs.length / 2 - 1].v + xs[xs.length / 2].v) / 2;
  return { n: xs.length, min: xs[0].v, max: xs[xs.length - 1].v, median: mid, least: xs[0].r, most: xs[xs.length - 1].r };
}
/** "$120 to $410 a year (least in Vancouver, most in Regina)" */
export function spreadWords(s: Spread | null, m: Market, per = ' a year'): string {
  if (!s) return 'not available';
  if (money(s.min, m) === money(s.max, m)) return `${money(s.min, m)}${per}`;
  return `${money(s.min, m)} to ${money(s.max, m)}${per} (least in ${s.least.name}, most in ${s.most.name})`;
}
/** "$120 to $410 a year", without the places */
export const rangeWords = (s: Spread | null, m: Market, per = ' a year') => (!s ? 'not available' : money(s.min, m) === money(s.max, m) ? `${money(s.min, m)}${per}` : `${money(s.min, m)} to ${money(s.max, m)}${per}`);
/** How many places pass a test, of those where it applies. */
export function count(rows: GRow[], f: (r: GRow) => boolean | null): { yes: number; of: number } {
  const xs = rows.map(f).filter((x): x is boolean => x != null);
  return { yes: xs.filter(Boolean).length, of: xs.length };
}

/* ------------------------------------------------------------------ the set of guides */

export interface GuideMeta { slug: string; name: string; path: string; blurb: string }
export const HUB = '/buying-guides/';
export const GUIDES: GuideMeta[] = [
  { slug: 'heat-pumps', name: 'Heat pumps', path: '/heat-pumps/buying-guide/', blurb: 'Whether one pays with what you heat with now, which type, and our three picks for each climate.' },
  { slug: 'furnaces', name: 'Furnaces', path: `${HUB}furnaces/`, blurb: 'What a new furnace saves where you live, when the top efficiency is worth it, and furnace, heat pump or both.' },
  { slug: 'air-conditioners', name: 'Air conditioners', path: `${HUB}air-conditioners/`, blurb: 'What a higher rating saves in your summer, sizing, and when a heat pump is the better buy.' },
  { slug: 'water-heaters', name: 'Water heaters', path: `${HUB}water-heaters/`, blurb: 'Tank, tankless or heat pump: a year of hot water for each at your prices.' },
  { slug: 'smart-thermostats', name: 'Smart thermostats', path: `${HUB}smart-thermostats/`, blurb: 'What a setback saves with your heating, which thermostat your wiring takes, and the rebates.' },
  { slug: 'hrv-erv', name: 'HRVs and ERVs', path: `${HUB}hrv-erv/`, blurb: 'Whether you need one, what the recovered heat is worth where you live, and HRV or ERV.' },
  { slug: 'air-filtration', name: 'Air filters and purifiers', path: `${HUB}air-filtration/`, blurb: 'Which filter rating to buy, how to size a purifier to a room, and what a fan costs to run.' },
  { slug: 'boilers', name: 'Boilers', path: `${HUB}boilers/`, blurb: 'What a condensing boiler saves, why the water temperature decides it, and the heat pump options.' },
  { slug: 'duct-cleaning', name: 'Duct cleaning', path: `${HUB}duct-cleaning/`, blurb: 'When it is worth paying for, when to skip it, and what to spend the money on instead.' },
];
export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug)!;

/* ------------------------------------------------------------------ each guide's headline figure */

const A = F.furnace.afue;
/** What the step from a condensing furnace to the top of the range saves in a year. */
export const furnaceTopStep = (r: GRow) => { const a = yearAt(r, 'gas', A.min), b = yearAt(r, 'gas', A.top); return a == null || b == null ? null : a - b; };
/** What a high-efficiency air conditioner saves in a year against one at the legal minimum. */
export const acHighStep = (r: GRow) => { const a = coolCost(r, r.minSeer2), b = coolCost(r, F.ac.highSeer2); return a == null || b == null ? null : a - b; };
/** What a heat pump water heater saves in a year against an electric tank, house heat taken included. */
export const hpwhSaving = (r: GRow) => { const a = waterCost(r, 'electricTank'), b = waterCost(r, 'heatPump'); return a == null || b == null ? null : a - b; };
/** What the standard setback saves in a year with the heating most homes here have. */
export const setbackSaving = (r: GRow) => { const y = yearBy(r, r.sys); return y == null ? null : y * setbackShare(false); };
/** What the heat a recovery ventilator gives back is worth in a year, less the electricity its fans use. */
export const hrvNet = (r: GRow, m: Market) => { const v = ventilation(r, m); const h = heatBy(r, r.sys); return h == null ? null : v.recoveredGJ * h - v.fanCost; };
/** What a condensing gas boiler saves in a year against an old one. */
export const boilerStep = (r: GRow) => { const a = yearAt(r, 'gas', MODEL.systems.gasFurnaceOld.eff), b = yearBy(r, 'gasBoilerCondensing'); return a == null || b == null ? null : a - b; };

const range = (s: Spread | null, m: Market) => (s ? `${money(s.min, m)} to ${money(s.max, m)}` : '—');
/** One computed line per guide for the hub's cards. */
export function hubLines(m: Market): Record<string, string> {
  const rows = guideRows(m);
  const y = F.horizon;
  return {
    furnaces: `Going from a 95% furnace to a 98% one saves ${range(spread(rows, furnaceTopStep), m)} a year, depending on the place.`,
    'air-conditioners': `A high-efficiency unit saves ${range(spread(rows, acHighStep), m)} a year over one at the legal minimum.`,
    'water-heaters': `A heat pump water heater saves ${range(spread(rows, hpwhSaving), m)} a year against an electric tank.`,
    'smart-thermostats': `A daily setback saves ${range(spread(rows, setbackSaving), m)} a year with the heating most homes in each place have.`,
    'hrv-erv': ((s) => (!s ? '' : s.min < 0 ? `The heat recovered, less the fans' electricity, runs from a net cost of ${money(-s.min, m)} a year to a net saving of ${money(s.max, m)}.` : `The heat recovered, less the fans' electricity, is worth ${range(s, m)} a year.`))(spread(rows, (r) => hrvNet(r, m))),
    'air-filtration': `A ${F.filtration.fanWatts}-watt fan left on all year costs ${range(spread(rows, (r) => yearOfWatts(r, F.filtration.fanWatts)), m)}.`,
    boilers: `A condensing boiler saves ${range(spread(rows, boilerStep), m)} a year against an old one.`,
    'duct-cleaning': 'The US EPA and CMHC both found it does little for air quality or bills in most homes. Here is when it is worth it.',
    _years: `${y.hvacYears}`,
  };
}
