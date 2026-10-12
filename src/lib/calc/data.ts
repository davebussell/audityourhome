/**
 * Build-time assembly of calculator data for each city. Pages import this; the browser only
 * receives the small per-city payload each page embeds as JSON.
 */
import citiesJson from '../../data/calc/cities.json';
import pricesJson from '../../data/calc/prices.json';
import rebatesJson from '../../data/calc/rebates.json';
import healthJson from '../../data/calc/health.json';
import appliancesJson from '../../data/calc/appliances.json';
import sourcesJson from '../../data/calc/sources.json';
import { MODEL, climateZone, fuelOf, type Prices, type SystemKey, type RebateEntry } from './engine';

export const CALC_SLUGS = ['energy-costs', 'upgrade-payback', 'home-health', 'appliance-energy'] as const;
export type CalcSlug = (typeof CALC_SLUGS)[number];

export const CALC_META: Record<CalcSlug, { name: string; short: string; blurb: string; photo: string; hubTitle: string; hubH1: string; hubDescription: string }> = {
  'energy-costs': {
    name: 'Home heating cost calculator',
    short: 'Heating and hot water costs',
    blurb: 'What heating, hot water and air conditioning cost at your local prices, and what each heating system would cost instead.',
    photo: 'energy-bill-analysis',
    hubTitle: 'Home heating cost calculator for Canada (2026)',
    hubH1: 'Home heating cost calculator',
    hubDescription: 'Compare gas, oil, propane, electric, heat pump and wood heating costs at 2026 local prices for 70 Canadian cities, calibrated to your own bills.',
  },
  'upgrade-payback': {
    name: 'Insulation and upgrade payback calculator',
    short: 'Upgrade payback',
    blurb: 'Savings, rebates and payback for attic, wall and basement insulation, windows, air sealing and thermostat setbacks.',
    photo: 'attic-insulation-inspection',
    hubTitle: 'Insulation and upgrade payback calculator (Canada)',
    hubH1: 'Insulation and upgrade payback calculator',
    hubDescription: 'Conservative savings, open rebates and simple payback for attic, wall and basement insulation, windows, air sealing and thermostat setbacks in 70 Canadian cities.',
  },
  'home-health': {
    name: 'Home health check',
    short: 'Home health check',
    blurb: 'Radon results, winter humidity and window condensation, smoke and CO alarm rules, well water and mould.',
    photo: 'radon-testing',
    hubTitle: 'Home health check: radon, humidity, alarms, wells',
    hubH1: 'Home health check',
    hubDescription: 'Read a radon result, find the winter humidity that keeps windows dry, count the smoke and CO alarms your province requires, and check well-water testing rules.',
  },
  'appliance-energy': {
    name: 'Appliance energy cost calculator',
    short: 'Appliance running costs',
    blurb: 'What your fridge, dryer, freezer and other appliances cost to run at your local electricity price, and what a newer model saves.',
    photo: 'home-energy-audit',
    hubTitle: 'Appliance energy cost calculator for Canada (2026)',
    hubH1: 'Appliance energy cost calculator',
    hubDescription: 'Yearly kWh and running cost of fridges, freezers, dryers, block heaters, hot tubs and more at local 2026 electricity prices in 70 Canadian cities.',
  },
};

export type CalcCity = (typeof citiesJson.cities)[number];
export const CALC_CITIES: CalcCity[] = citiesJson.cities;
export const CITIES_CHECKED = citiesJson.checked;
export const PROVINCE_ORDER = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT'];

export function cityBySlug(slug: string): CalcCity {
  const c = CALC_CITIES.find((x) => x.slug === slug);
  if (!c) throw new Error(`calc: unknown city ${slug}`);
  return c;
}
/** Name with province when ambiguous (Richmond, BC) */
export const cityName = (c: CalcCity) => c.label ?? c.name;

export function citiesByProvince() {
  return PROVINCE_ORDER.map((p) => {
    const list = CALC_CITIES.filter((c) => c.prov === p).sort((a, b) => b.population - a.population);
    return { prov: p, provName: list[0]?.provName ?? p, provSlug: list[0]?.provSlug ?? '', cities: list };
  }).filter((g) => g.cities.length);
}

/* ------------------------------------------------------------------ prices */

type ElecP = { allIn: number; allInCurrentTariff?: number | null; variable: number; utility: string; basis?: string; variableBasis?: string; sourceDate?: string; variableDate?: string; source?: string; tiers?: string; currentTariffSources?: string[]; firstStep?: { perKwh: number; threshold: string; basis: string } };
type GasP = { allIn: number; variable: number; utility: string; basis?: string; sourceDate?: string; source?: string; taxNote?: string; taxes?: string };
type OilP = { perL: number; month?: string; avg12mo?: number; avg12moPeriod?: string; city?: string; source?: string };
type PropP = { perL: number | null; basis?: string; sourceDate?: string; source?: string; note?: string; taxNote?: string };

export interface ResolvedPrices {
  asOf: string;
  elec: { now: number; avg: number; variable: number; utility: string; avgBasis: string; tierHigher: boolean; varDate: string | null; varBasis: string | null; source: string | null; tiers: string | null; tariffSources: string[]; firstStep: { perKwh: number; threshold: string; basis: string } | null };
  gas: { now: number; variable: number; utility: string; date: string | null; source: string | null; taxNote: string | null } | null;
  oil: { perL: number; latest: number; month: string | null; period: string | null; city: string | null; source: string | null } | null;
  propane: { perL: number; date: string | null; source: string | null; basis: string | null } | null;
  propaneNote: string;
  gasNote: string | null;
}

export function resolvePrices(city: CalcCity): ResolvedPrices {
  const P = pricesJson.provinces[city.prov as keyof typeof pricesJson.provinces] as unknown as { electricity: ElecP; gas: GasP | null; oil: OilP | null; propane: PropP };
  const O = ((pricesJson.cityOverrides as Record<string, unknown>)[city.slug] ?? {}) as { electricity?: ElecP; gas?: GasP; oil?: OilP };
  const e = O.electricity ?? P.electricity;
  const avg = e.allInCurrentTariff ?? e.allIn;
  const avgBasis = e.allInCurrentTariff
    ? 'average for a 1,000 kWh/month bill at tariffs in effect October 8, 2026, taxes and fixed charges in'
    : 'average for a 1,000 kWh/month bill (Hydro-Québec 2025 comparison, rates of April 1, 2025), taxes and fixed charges in';
  const g = O.gas ?? P.gas;
  const oil = O.oil ?? P.oil;
  const pr = P.propane;
  let gasNote: string | null = null;
  if (city.prov === 'ON' && g) gasNote = 'Ontario gas prices are Enbridge\'s EGD rate zone (Toronto, Ottawa, Niagara). If you are in a former Union Gas zone, or buy gas from Kitchener Utilities or Utilities Kingston, use the price on your bill.';
  if ((city.prov === 'SK' || city.prov === 'MB') && g) gasNote = g.taxNote ?? null;
  return {
    asOf: pricesJson.asOf,
    elec: { now: Math.max(avg, e.variable), avg, variable: e.variable, utility: e.utility, avgBasis, tierHigher: e.variable > avg, varDate: e.variableDate ?? null, varBasis: e.variableBasis ?? null, source: e.source ?? null, tiers: e.tiers ?? null, tariffSources: e.currentTariffSources ?? [], firstStep: e.firstStep ?? null },
    gas: g ? { now: g.allIn, variable: g.variable, utility: g.utility, date: g.sourceDate ?? null, source: g.source ?? null, taxNote: g.taxNote ?? null } : null,
    oil: oil ? { perL: oil.avg12mo ?? oil.perL, latest: oil.perL, month: oil.month ?? null, period: oil.avg12moPeriod ?? pricesJson.oilAvgPeriod, city: oil.city ?? null, source: oil.source ?? pricesJson.oilSource } : null,
    propane: pr && pr.perL ? { perL: pr.perL, date: pr.sourceDate ?? null, source: pr.source ?? null, basis: pr.basis ?? null } : null,
    propaneNote: pr && pr.perL ? 'Regulated maximum price; yours may be lower.' : 'No official home-heating propane price is published for this province. Enter the price on your propane bill.',
    gasNote,
  };
}

export function enginePrices(rp: ResolvedPrices): Prices {
  return {
    electricity: { now: rp.elec.now, variable: rp.elec.variable },
    gas: rp.gas ? { now: rp.gas.now, variable: rp.gas.variable } : null,
    oil: rp.oil?.perL ?? null,
    propane: rp.propane?.perL ?? null,
    wood: null,
    pellets: null,
  };
}

/** The city's most common heating fuel picks the pre-selected system (the user can change it). */
export function defaultSystem(city: CalcCity): SystemKey {
  const rp = resolvePrices(city);
  const s = city.heatingShares;
  const gas = s.gas ?? 0, el = s.electricity ?? 0, oil = s.oil ?? 0;
  if (rp.gas && gas > 0 && gas >= el && gas >= oil) return 'gasFurnaceMid';
  if (el > 0 && el >= oil) return 'electricResistance';
  if (oil > 0) return 'oilFurnaceMid';
  return rp.gas ? 'gasFurnaceMid' : 'electricResistance';
}

/* ------------------------------------------------------------------ rebates */

type RebFull = RebateEntry & { slug?: string | null; fuelText?: string | null; amount?: string; basis?: string; conditions?: string; deadline?: string; source?: string; checked?: string };
type ProvReb = {
  name: string; summary: string;
  measures: Record<string, RebFull[]>;
  measureNotes: Record<string, string>;
  bonuses: { program: string; amount: string; source: string }[];
  caps: { program: string; amount: string; source: string }[];
  assessment: { amount: number | null; note: string; source: string } | null;
  cityCaveats: Record<string, string>;
  financing: { name: string; city?: string; amount?: string; interestRate?: string; status?: string; source?: string }[];
};

export function provinceRebates(prov: string): ProvReb {
  return (rebatesJson.provinces as unknown as Record<string, ProvReb>)[prov];
}
/** Full rebate entries (for the static program details) */
export function rebatesFull(city: CalcCity, measures: string[]): Record<string, RebFull[]> {
  const pr = provinceRebates(city.prov);
  const out: Record<string, RebFull[]> = {};
  for (const m of measures) out[m] = (pr?.measures[m] ?? []).filter((e) => e.status !== 'notApplicable');
  return out;
}
/** Compact, computable rebate entries for the browser */
export function rebatesCompact(city: CalcCity, measures: string[]): Record<string, RebateEntry[]> {
  const full = rebatesFull(city, measures);
  const keep: (keyof RebateEntry)[] = ['id', 'program', 'status', 'kind', 'rate', 'cap', 'pct', 'pctCostCap', 'fuels', 'minRAdded', 'minRAddedByOption', 'minTargetR', 'maxExistingR', 'minSqft', 'minCount', 'requiresDoubling', 'defaultOff', 'perCount', 'scope', 'ductedAmount', 'ductedRate', 'coldClimateRate', 'ductlessCap', 'rented', 'windowReq'];
  const out: Record<string, RebateEntry[]> = {};
  for (const [m, arr] of Object.entries(full)) {
    out[m] = arr.filter((e) => !e.rented).map((e) => {
      const o: Record<string, unknown> = {};
      for (const k of keep) if (e[k] !== undefined && e[k] !== null) o[k] = e[k];
      o.program = programLabel(e, arr);
      return o as unknown as RebateEntry;
    });
  }
  return out;
}

const FUEL_SHORT: Record<string, string> = { electricity: 'electric', gas: 'gas', oil: 'oil', propane: 'propane', wood: 'wood' };
/** Program name, plus who it is for when the same program has several entries for one measure. */
export function programLabel(e: RebFull, siblings: RebFull[]): string {
  const base = shortProgram(e.program);
  const twins = siblings.filter((x) => !x.rented && shortProgram(x.program) === base).length > 1;
  const parts: string[] = [];
  if (e.scope === 'whole') parts.push('whole home');
  if (e.scope === 'partial') parts.push('part of the home');
  if (e.fuels && e.fuels.length && !e.fuels.includes('northernBC')) {
    if (e.fuels.includes('electricWaterHeater')) parts.push('replacing an electric water heater');
    else if (twins || e.fuels.length < 5) {
      const f = e.fuels.map((x) => FUEL_SHORT[x] ?? x);
      parts.push(`${f.length > 1 ? f.slice(0, -1).join(', ') + ' or ' + f[f.length - 1] : f[0]}-heated homes`);
    }
  }
  return parts.length ? `${base}, ${parts.join(', ')}` : base;
}
export function shortProgram(p: string): string {
  return p
    .replace('Home Renovation Savings Program — with home energy assessment', 'Home Renovation Savings (with assessment)')
    .replace('Home Renovation Savings Program — without assessment', 'Home Renovation Savings (no assessment)')
    .replace('Home Renovation Savings Program — smart thermostat', 'Home Renovation Savings (smart thermostat)')
    .replace('Rénoclimat — volet Efficacité énergétique (en vigueur le 1er octobre 2026)', 'Rénoclimat (rules from Oct. 1, 2026)')
    .replace('Home Renovation Rebate Program (BC Hydro / FortisBC / CleanBC Better Homes)', 'BC Home Renovation Rebate')
    .replace('Efficiency Nova Scotia Home Energy Assessment rebates', 'Efficiency NS assessment rebates')
    .replace('NB Power Total Home Energy Savings Program', 'NB Power Total Home Energy Savings');
}
export function municipalPrograms(city: CalcCity) {
  return (rebatesJson.municipal as Record<string, { program: string; status: string; conditions: string; source: string }[]>)[city.slug] ?? [];
}
export function cityCoverage(city: CalcCity) {
  return (rebatesJson.cityCoverage as Record<string, { result: string; note: string }>)[city.slug] ?? null;
}

/* ------------------------------------------------------------------ health */

export const HEALTH = healthJson;
export function provinceAlarms(prov: string) {
  return (healthJson.alarms as Record<string, { smoke: Record<string, unknown>; co: Record<string, unknown> }>)[prov];
}
export function provinceWells(prov: string) {
  return (healthJson.wells.provinces as Record<string, Record<string, unknown>>)[prov];
}
export function provinceRadon(prov: string) {
  return (healthJson.radon.provinces as unknown as Record<string, { buildingCode?: string | null; testKitProgram?: string | null; other?: string | null; sources?: string[] }>)[prov];
}

/* ------------------------------------------------------------------ appliances & sources */

export const APPLIANCES = appliancesJson;
export const SOURCES = sourcesJson as Record<string, { title: string; url: string; date?: string }>;
export function source(id: string) {
  const s = SOURCES[id];
  if (!s) throw new Error(`calc: unknown source ${id}`);
  return s;
}

/* ------------------------------------------------------------------ city climate summary */

export function climateOf(city: CalcCity) {
  return {
    hdd: city.hot2000.hdd,
    zone: climateZone(city.hot2000.hdd),
    designHeat: city.hot2000.designHeat,
    designCool: city.hot2000.designCool,
    cdd18: city.eccc.cdd18,
    janMean: city.eccc.janMean,
    julMean: city.eccc.julMean,
    annualMean: city.eccc.annualMean,
    nights10: city.eccc.nightsBelowMinus10,
    nights20: city.eccc.nightsBelowMinus20,
    h2kStation: city.hot2000.station,
    ecccStation: city.eccc.station,
  };
}

export const SYSTEM_FUEL = (s: SystemKey) => fuelOf(s);
export { MODEL };
