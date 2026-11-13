/**
 * What a heat pump costs to run against the other ways of heating, for every Canadian city and US metro the sites
 * cover: the numbers behind /heat-pumps/vs-gas-furnace/ and the buying guide. Prices, efficiencies and the seasonal
 * COP are the calculators' own (src/data/calc/prices.json and model.json; EIA state prices for the US), so every
 * figure matches the planner and the province and metro pages.
 */
import { CALC_CITIES, resolvePrices, cityName } from './calc/data';
import { MODEL, systemEfficiency, baselineDemandGJ, floorAreaM2 } from './calc/engine';
import { US_METROS, costsUS, metroName, metroState, stateName, type Market } from './heatpumps';
import { statePrices } from './us/data';
import pricesJson from '../data/calc/prices.json';

export interface RunRow {
  slug: string;
  name: string;
  /** province or territory code (CA) or state code (US) */
  code: string;
  region: string;
  /** the local heat pump page */
  href: string;
  population: number;
  /** heating degree days: °C-days base 18 (CA), °F-days base 65 (US) */
  hdd: number;
  /** seasonal COP planning value for a cold-climate heat pump here */
  cop: number;
  /** electricity, dollars per kWh (marginal price in CA, state average in the US) */
  elec: number;
  /** natural gas, dollars per m³ (CA) or per therm (US); null where there is no piped gas in our data */
  gas: number | null;
  /** dollars per unit of heat delivered: per GJ (CA), per million Btu (US) */
  hp: number;
  gasFurnace: number | null;
  baseboard: number;
  oil: number | null;
  propane: number | null;
  /** gas price at which a 95% furnace and the heat pump tie, in the same unit as `gas` */
  tieGas: number | null;
  /** gas furnace cost ÷ heat pump cost: above 1, the heat pump is cheaper to run */
  ratio: number | null;
  /** CA only: one year of heat for the reference house, dollars */
  yearHp: number | null;
  yearGas: number | null;
  yearBaseboard: number | null;
  /** CA only: gas account fixed charges for a year (what closing the account saves) */
  gasFixed: number | null;
  elecUtility: string | null;
  gasUtility: string | null;
}

const EC = MODEL.energyContentGJ;
/** The house the yearly figures are for: a detached 1966–1980 house of 149 m² (1,600 sq ft), the planner's "medium". */
export const REF_HOUSE = { vintage: '1966-1980', sizeBand: 'medium', type: 'detached', m2: floorAreaM2({ sizeBand: 'medium' }) } as const;
/** Gas "all-in" prices spread the fixed charges over this many m³ a year (see prices.json notes). */
const GAS_ALLIN_M3 = 2400;
export const RUN_PRICES_AS_OF = { ca: (pricesJson as any).asOf as string };

let caCache: RunRow[] | null = null;
export function runRowsCA(): RunRow[] {
  if (caCache) return caCache;
  caCache = CALC_CITIES.map((c) => {
    const any = c as any;
    const rp = resolvePrices(c);
    const hdd = (any.eccc?.hdd18 ?? any.hot2000?.hdd) as number;
    const cop = systemEfficiency('ashpCold', hdd);
    const perGJ = (price: number, gjPerUnit: number, eff: number) => price / gjPerUnit / eff;
    const elec = rp.elec.variable;
    const hp = perGJ(elec, EC.electricity, cop);
    const gas = rp.gas?.variable ?? null;
    const furnaceEff = systemEfficiency('gasFurnaceHigh', hdd);
    const gasFurnace = gas != null ? perGJ(gas, EC.gas, furnaceEff) : null;
    const demand = baselineDemandGJ({ vintage: REF_HOUSE.vintage, floorAreaM2: REF_HOUSE.m2, hdd, type: REF_HOUSE.type });
    return {
      slug: c.slug,
      name: cityName(c),
      code: c.prov,
      region: c.provName,
      href: `/heat-pumps/${['YT', 'NT', 'NU'].includes(c.prov) ? 'north' : c.provSlug}/`,
      population: c.population ?? 0,
      hdd,
      cop,
      elec,
      gas,
      hp,
      gasFurnace,
      baseboard: perGJ(elec, EC.electricity, 1),
      oil: rp.oil ? perGJ(rp.oil.perL, EC.oil, 0.85) : null,
      propane: rp.propane ? perGJ(rp.propane.perL, EC.propane, 0.93) : null,
      tieGas: hp * furnaceEff * EC.gas,
      ratio: gasFurnace != null ? gasFurnace / hp : null,
      yearHp: hp * demand,
      yearGas: gasFurnace != null ? gasFurnace * demand : null,
      yearBaseboard: perGJ(elec, EC.electricity, 1) * demand,
      gasFixed: rp.gas ? Math.max(0, (rp.gas.now - rp.gas.variable) * GAS_ALLIN_M3) : null,
      elecUtility: rp.elec.utility ?? null,
      gasUtility: rp.gas?.utility ?? null,
    } satisfies RunRow;
  });
  return caCache;
}

let usCache: RunRow[] | null = null;
export function runRowsUS(): RunRow[] {
  if (usCache) return usCache;
  usCache = US_METROS.filter((m) => m.climate?.hdd65 != null).map((m) => {
    const st = metroState(m);
    const hdd = m.climate!.hdd65 as number;
    const k = costsUS(st, hdd);
    const row = (key: string) => k.rows.find((r) => r.key === key)?.cost ?? null;
    const p = statePrices(st);
    const hp = row('hp-cold') as number;
    const gasFurnace = row('gas');
    return {
      slug: m.slug,
      name: metroName(m),
      code: st,
      region: stateName(st),
      href: `/heat-pumps/${m.slug}/`,
      population: m.population ?? 0,
      hdd,
      cop: k.band.coldClimate,
      elec: (p.elecCents ?? 0) / 100,
      gas: p.gasPerTherm ?? null,
      hp,
      gasFurnace,
      baseboard: row('elec') as number,
      oil: row('oil'),
      propane: row('propane'),
      // a therm is 0.1 million Btu; the furnace is 95% efficient
      tieGas: hp != null ? (hp * 0.95) / 10 : null,
      ratio: gasFurnace != null && hp ? gasFurnace / hp : null,
      yearHp: null,
      yearGas: null,
      yearBaseboard: null,
      gasFixed: null,
      elecUtility: null,
      gasUtility: null,
    } satisfies RunRow;
  }).filter((r) => r.hp != null && r.elec > 0);
  return usCache;
}

export const runRows = (m: Market) => (m === 'ca' ? runRowsCA() : runRowsUS());

export interface RunSummary {
  places: number;
  withGas: number;
  /** places where the heat pump is cheaper to run than a 95% gas furnace */
  hpWins: RunRow[];
  gasWins: RunRow[];
  /** within 10% either way */
  close: RunRow[];
  /** regions (province or state names) where the heat pump wins everywhere we cover, and where gas does */
  hpRegions: string[];
  gasRegions: string[];
  mixedRegions: string[];
  /** saving against electric baseboards or an electric furnace: lowest and highest share across places */
  baseboardSaving: [number, number];
  /** the place with the smallest baseboard saving (the coldest, where the seasonal COP is lowest) */
  baseboardLeast: RunRow;
  /** against an 85% oil furnace, where we hold a home oil price: places compared, places where the heat pump is cheaper, and the range of saving there */
  oil: { places: number; wins: number; saving: [number, number] | null };
}

export function runSummary(m: Market): RunSummary {
  const rows = runRows(m);
  const gas = rows.filter((r) => r.ratio != null);
  const hpWins = gas.filter((r) => (r.ratio as number) > 1);
  const gasWins = gas.filter((r) => (r.ratio as number) <= 1);
  const regions = [...new Set(gas.map((r) => r.region))];
  const all = (reg: string, test: (r: RunRow) => boolean) => gas.filter((r) => r.region === reg).every(test);
  const hpRegions = regions.filter((reg) => all(reg, (r) => (r.ratio as number) > 1));
  const gasRegions = regions.filter((reg) => all(reg, (r) => (r.ratio as number) <= 1));
  const savings = rows.map((r) => 1 - r.hp / r.baseboard);
  const oilRows = rows.filter((r) => r.oil != null);
  const oilWins = oilRows.filter((r) => r.hp < (r.oil as number)).map((r) => 1 - r.hp / (r.oil as number));
  return {
    places: rows.length,
    withGas: gas.length,
    hpWins,
    gasWins,
    close: gas.filter((r) => Math.abs((r.ratio as number) - 1) <= 0.1),
    hpRegions,
    gasRegions,
    mixedRegions: regions.filter((x) => !hpRegions.includes(x) && !gasRegions.includes(x)),
    baseboardSaving: [Math.min(...savings), Math.max(...savings)],
    baseboardLeast: rows[savings.indexOf(Math.min(...savings))],
    oil: { places: oilRows.length, wins: oilWins.length, saving: oilWins.length ? [Math.min(...oilWins), Math.max(...oilWins)] : null },
  };
}

/** "A, B and C" */
export const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "55% to 64% in most places, less where winters are coldest (17% in Yellowknife)": the saving against baseboards */
export function baseboardWords(S: RunSummary, m: Market): string {
  const p = (x: number) => `${Math.round(x * 100)}%`;
  const all = runRows(m).map((r) => ({ r, s: 1 - r.hp / r.baseboard }));
  const low = all.filter((x) => x.s < 0.4).sort((a, b) => a.s - b.s);
  if (!low.length) return `${p(S.baseboardSaving[0])} to ${p(S.baseboardSaving[1])}`;
  const main = all.filter((x) => x.s >= 0.4).map((x) => x.s);
  return `${p(Math.min(...main))} to ${p(Math.max(...main))} in most places, less where winters are coldest (${listWords(low.map((x) => `${p(x.s)} in ${x.r.name}`))})`;
}
/** "it costs less in 9 of the 11 places where we hold a home oil price, by 20% to 60%" */
export function oilWords(S: RunSummary): string | null {
  const p = (x: number) => `${Math.round(x * 100)}%`;
  const o = S.oil;
  if (!o.places || !o.saving) return null;
  const range = `${p(o.saving[0])} to ${p(o.saving[1])}`;
  return o.wins === o.places ? `it costs ${range} less everywhere we hold a home oil price` : `it costs less in ${o.wins} of the ${o.places} places where we hold a home oil price, by ${range}`;
}
/** Names when there are few, otherwise a count and the regions: "11 cities, all in British Columbia" */
export function placesWords(list: RunRow[], word: string): string {
  if (list.length <= 4) return listWords(list.map((r) => r.name));
  const regs = [...new Set(list.map((r) => r.region))];
  return `${list.length} ${word}, ${regs.length === 1 ? `all in ${regs[0]}` : `in ${listWords(regs)}`}`;
}
