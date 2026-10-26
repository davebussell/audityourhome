/**
 * Heat pump comparison data layer (/ca/heat-pumps/ and /us/heat-pumps/).
 *
 * Model numbers come from the ENERGY STAR Certified Heat Pumps list (data.energystar.gov 83eb-xbyy),
 * built by tools/heatpumps/build_estar.py into src/data/heatpumps/estar.json. Brand facts (owner,
 * lines, warranty, price tier) and rebate equipment rules were researched from makers' and
 * programs' own pages on October 19, 2026 (brands.json, rebates-ca.json, rebates-us.json).
 * Regional running costs reuse the calculator data (Canada) and the EIA price data (US).
 */
import estar from '../data/heatpumps/estar.json';
import brandsJson from '../data/heatpumps/brands.json';
import typesJson from '../data/heatpumps/types.json';
import rebatesCAJson from '../data/heatpumps/rebates-ca.json';
import rebatesUSJson from '../data/heatpumps/rebates-us.json';
import provincesJson from '../data/provinces.json';
import calcCities from '../data/calc/cities.json';
import calcPrices from '../data/calc/prices.json';
import calcModel from '../data/calc/model.json';
import { programs } from './data';
import { METROS, statePrices, STATE_NAMES, PRICE_META } from './us/data';
import type { Metro } from './us/data';

export type Market = 'ca' | 'us';

export const HP_CHECKED = 'October 19, 2026';
export const HP_CHECKED_ISO = '2026-10-19';
const E = estar as any;
export const ESTAR = E.meta as { name: string; dataset: string; rows: number; datasetUpdated: string; pulled: string; note: string };
export const ESTAR_URL = 'https://www.energystar.gov/productfinder/product/certified-heat-pumps/results';
export const AHRI_URL = 'https://www.ahridirectory.org/';
export const NRCAN_LIST_URL = 'https://oee.nrcan.gc.ca/pml-lmp/index.cfm?language_langue=en&action=app.search-recherche&appliance=ASHP1_GH';
export const NRCAN_HOW_LISTED_URL =
  'https://natural-resources.canada.ca/energy-efficiency/home-energy-efficiency/canada-greener-homes-initiative/products-are-listed-canada-greener-homes-grant';

// ---------------------------------------------------------------- research text, made readable
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/**
 * The research files keep links and working notes inside their prose ("Our 2026-10-12 file: …",
 * "UNVERIFIED today", "(https://…)"). Pages show the same facts in plain words: links stay in the
 * url and sources fields, and internal shorthand becomes "our October 12 check".
 */
export function publicText(s: string): string {
  if (/^(https?:\/\/\S+|\d{4}-\d{2}-\d{2})$/.test(s.trim())) return s; // a bare URL or date
  let t = s;
  t = t.replace(/\b(?:disallows|blocks|refused) automated fetching(?: \(robots rules\))?/g, "couldn't be read");
  t = t.replace(/\breturn(?:s|ed)? only metadata to our fetcher\b/g, "didn't load for us");
  t = t.replace(/\b(?:blocks|block) automated (?:reading|access)\b/g, "couldn't be read");
  t = t.replace(/\bcould not be verified this session\b/g, "couldn't be confirmed in our October 19 check");
  t = t.replace(/\b(was|were) verified this session\b/g, '$1 confirmed in our October 19 check').replace(/\bthis session\b/g, 'our October 19 check');
  t = t.replace(/\(official site rate-limited during this pass\)/g, "(the official site didn't respond during our October 19 check)");
  t = t.replace(/\bwere not read in this pass\b/g, "couldn't be read in our October 19 check").replace(/\b(in|during) this pass\b/g, '$1 our October 19 check');
  t = t.replace(/\bare not verified here\b/g, "aren't confirmed here");
  t = t.replace(/\s*Source:\s*https?:\/\/\S+/g, '');
  t = t.replace(/\s*\((?:see |source: |per )?https?:\/\/[^)\s]+\s*\)/gi, '');
  t = t.replace(/,?\s*https?:\/\/[^\s),;]+/g, '');
  t = t.replace(/\(\s*\)/g, '');
  t = t.replace(/\bOur \d{4}-\d{2}-\d{2} file\b/g, 'Our October 12 check').replace(/\bour \d{4}-\d{2}-\d{2} file\b/g, 'our October 12 check');
  t = t.replace(/\b[Pp]er our file\b/g, 'per our October 12 check').replace(/\bour file\b/g, 'our October 12 check');
  t = t.replace(/\bper our ([A-Z][a-z]+ \d{1,2}) data\b/g, 'as of our $1 check').replace(/\bper our data\b/g, 'per our earlier check');
  t = t.replace(/\bUNVERIFIED\b/g, 'Not re-confirmed');
  t = t.replace(/^Unverified\b/, 'Not confirmed').replace(/^unverified\b/, 'not confirmed').replace(/\bare unverified\b/g, "aren't confirmed").replace(/\bis unverified\b/g, "isn't confirmed");
  t = t.replace(/\b(re-confirmed|re-checked|re-verified|verifiable|readable|confirmed) today\b/g, '$1 on October 19');
  t = t.replace(/\bCorroborated today on\b/g, 'Confirmed on October 19 on');
  t = t.replace(/;?,?\s*(?:and )?web search was unavailable(?: today)?/g, '');
  t = t.replace(/\b(?:render client-side and returned no text|returned fetch errors|returned no text|load only a placeholder|render only a placeholder|didn't render for us today)\b/g, "didn't load");
  t = t.replace(/\(fetch error on (\d{4}-\d{2}-\d{2})\)/g, "(the page didn't load on $1)").replace(/\(page returned no text\)/g, "(the page didn't load)");
  t = t.replace(/\bpage could not be fetched\b/g, "the page didn't load");
  t = t.replace(/\b(?:sits|is) on a robots-disallowed file host\b/g, "isn't readable online").replace(/:? the site's robots\.txt blocks it/g, '');
  t = t.replace(/\bblocked automated access in our Oct\. 12 research\b/g, "couldn't be read in our October 12 check");
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, mo, d) => `${MONTHS[+mo - 1]} ${+d}, ${y}`);
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim();
}
const KEEP_KEYS = new Set(['url', 'href', 'sources', 'source', 'date', 'checked', 'id', 'slug', 'differencesFromOurData', 'notes']);
function cleanDeep<T>(o: T, key = ''): T {
  if (KEEP_KEYS.has(key)) return o;
  if (typeof o === 'string') return publicText(o) as T;
  if (Array.isArray(o)) return o.map((v) => cleanDeep(v)) as T;
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cleanDeep(v, k)])) as T;
  return o;
}

const B = cleanDeep((brandsJson as any).brands) as Record<string, BrandInfo>;
export const TYPES = cleanDeep((typesJson as any).types) as Record<string, any>;
export const REBATES_CA = cleanDeep(rebatesCAJson as any);
export const REBATES_US = cleanDeep(rebatesUSJson as any);

// ---------------------------------------------------------------- types
export interface ModelRow {
  brand: string;
  slug: string | null;
  series: string | null;
  outdoor: string;
  indoor: string | null;
  type: 'ducted' | 'ductless' | 'packaged';
  cap47: number | null;
  cap5: number | null;
  /** rated cooling capacity, BTU/h: the basis for nominal tons */
  capCool: number | null;
  ret: number | null;
  cop5: number | null;
  hspf2: number | null;
  seer2: number | null;
  eer2: number | null;
  cold: boolean;
  refrig: string;
  staging: string | null;
  ahri: string | null;
  mostEff: boolean;
  nrcanLike: boolean;
  alsoAs: string[];
}

export interface BrandStats {
  systems: number;
  outdoorModels: number;
  byType: Record<string, { systems: number; outdoorModels: number }>;
  coldSystems: number;
  coldShare: number | null;
  coldOutdoorModels: number;
  nrcanLikeOutdoorModels: number;
  variableOutdoorModels: number;
  bestCop5: number | null;
  medianCop5Cold: number | null;
  bestRet5: number | null;
  bestHspf2: number | null;
  medianHspf2: number | null;
  bestSeer2: number | null;
  bestEer2: number | null;
  mostEfficientSystems: number;
  refrigerants: Record<string, number>;
  a2lOutdoorModels: number;
  latestCertified: string | null;
  partners: string[];
  names: string[];
  top: Record<string, ModelRow[]>;
  topA2L: Record<string, boolean>;
  topCooling: ModelRow[];
}

export interface Warranty {
  parts: number | null;
  compressor: number | null;
  registrationRequired: boolean | null;
  ifNotRegistered: string | null;
  labour: string | null;
  url: string | null;
}

export interface BrandLine {
  name: string;
  type: string;
  coldClimate: boolean;
  claim: string | null;
  refrigerant: string | null;
  url: string | null;
}

export interface BrandInfo {
  name: string;
  marketedAs: string;
  parent: string;
  sisterBrands: string[];
  headquarters: string | null;
  manufacturing: string | null;
  soldIn: { ca: boolean | null; us: boolean | null; evidence: string };
  channel: string | null;
  productTypes: string[];
  lines: BrandLine[];
  warranty: { ca: Warranty | null; us: Warranty | null };
  warrantyVariants?: { label: string; ca: Warranty | null; us: Warranty | null }[];
  priceTier: 'budget' | 'mid' | 'premium' | 'mixed' | null;
  priceNote: string | null;
  strengths: string[];
  watchouts: string[];
  recentNews: { date: string; text: string; url: string }[];
  sources: { title: string; url: string }[];
  notes?: string;
}

export interface DirectoryRow {
  name: string;
  page: string | null;
  company: string;
  systems: number;
  outdoorModels: number;
  coldShare: number | null;
  coldOutdoorModels: number;
  nrcanLikeOutdoorModels: number;
  bestCop5: number | null;
  bestHspf2: number | null;
  bestSeer2: number | null;
  types: string[];
}

// ---------------------------------------------------------------- market data
export const totals = (m: Market) => E.markets[m].totals as any;
export const leaders = (m: Market) => E.markets[m].leaders as Record<string, ModelRow[]>;
export const directory = (m: Market) => E.markets[m].directory as DirectoryRow[];
export const statsFor = (m: Market, slug: string) => E.markets[m].brands[slug] as BrandStats | undefined;
export const brandInfo = (slug: string) => B[slug];

/** Brands with a page in this country: certified for the market, and not known to be unavailable there. */
export function brandSlugs(m: Market): string[] {
  return Object.keys(B)
    .filter((s) => statsFor(m, s) && B[s].soldIn?.[m] !== false)
    .sort((a, b) => B[a].name.localeCompare(B[b].name));
}

/** Brand pages ordered by how many outdoor models they have certified for the market. */
export function brandsBySize(m: Market): string[] {
  return brandSlugs(m).sort((a, b) => (statsFor(m, b)!.outdoorModels - statsFor(m, a)!.outdoorModels));
}

export const brandHref = (m: Market, slug: string) => `/${m}/heat-pumps/brands/${slug}/`;

/** Families: owner → brand slugs in this country, for the "who owns whom" map. */
export const FAMILIES: { owner: string; note: string; slugs: string[]; others?: string[] }[] = [
  { owner: 'Carrier Global', note: 'Also owns Viessmann and the Toshiba Carrier ductless business (now Carrier Japan).', slugs: ['carrier', 'bryant', 'payne', 'icp-brands'], others: ['Viessmann', 'Toshiba Carrier'] },
  { owner: 'Trane Technologies', note: 'Its ductless comes from Mitsubishi Electric through the METUS joint venture in the US.', slugs: ['trane', 'american-standard'], others: ['Ameristar', 'RunTru'] },
  { owner: 'Lennox International', note: 'Ductless through a Samsung joint venture; signed in June 2026 to buy Heat Controller (Comfort-Aire, Century).', slugs: ['lennox', 'allied-air-brands', 'comfort-aire'] },
  { owner: 'Daikin Industries', note: 'Goodman and Amana are made by Daikin Comfort Technologies in Texas.', slugs: ['daikin', 'goodman', 'amana'] },
  { owner: 'Paloma Rheem Holdings', note: 'Bought Nortek Global HVAC (Oct 2024) and Fujitsu General (2025), now GENERAL Inc.', slugs: ['rheem', 'ruud', 'friedrich', 'nortek-brands', 'fujitsu'] },
  { owner: 'Bosch', note: "Bought Johnson Controls' residential HVAC business, including Johnson Controls-Hitachi, on July 31, 2025; uses the York and Hitachi names under licence.", slugs: ['bosch', 'york', 'coleman-luxaire', 'hitachi'] },
  { owner: 'Mitsubishi Electric', note: 'Sold in the US through Mitsubishi Electric Trane HVAC US, a joint venture with Trane Technologies.', slugs: ['mitsubishi-electric'] },
  { owner: 'Haier', note: 'GE Appliances is a Haier company and also builds ductless units certified under several Allied Air and Lennox-family names.', slugs: ['ge-haier'] },
  { owner: 'Innovair Solutions (Quebec)', note: 'The former Ouellet Group; Stelpro joined through a 2024 alliance.', slugs: ['innovair-group'] },
  { owner: 'Midea Group', note: "ENERGY STAR shows identical Midea-built systems listed under many other names (see each model table's 'also listed as').", slugs: ['midea'] },
  { owner: 'Gree Electric', note: 'Also sold as Tosot.', slugs: ['gree'] },
];

// ---------------------------------------------------------------- formatting
const nf = (m: Market) => (m === 'us' ? 'en-US' : 'en-CA');
export const fmtInt = (n: number | null | undefined, m: Market = 'ca') => (n == null ? '—' : Math.round(n).toLocaleString(nf(m)));
export const fmtPct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const fmtCop = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(2));
export const fmt1 = (x: number | null | undefined) => (x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1));
export const fmtBtu = (n: number | null | undefined, m: Market = 'ca') => (n == null ? '—' : `${fmtInt(n, m)} BTU/h`);
export const tons = (n: number | null | undefined) => (n == null ? '—' : `${(Math.round((n / 12000) * 2) / 2).toString()}-ton`);
export const fmtMoney = (n: number | null | undefined, m: Market = 'ca', digits = 2) =>
  n == null ? '—' : `${m === 'ca' ? '$' : '$'}${n.toFixed(digits)}`;
export const fmtDate = (iso: string | null | undefined, m: Market = 'ca') => {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString(nf(m), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};
/** "−15°C (5°F)" on the Canadian site, "5°F" on the US one. */
export const at5 = (m: Market) => (m === 'ca' ? '−15°C (5°F)' : '5°F');
export const at47 = (m: Market) => (m === 'ca' ? '8.3°C (47°F)' : '47°F');

export const TIER_LABEL: Record<string, string> = {
  budget: 'Budget',
  mid: 'Mid-range',
  premium: 'Premium',
  mixed: 'Budget to premium',
};
export const tierLabel = (t: string | null | undefined) => (t ? TIER_LABEL[t] ?? t : 'Not rated');

export const CHANNEL_LABEL: Record<string, string> = {
  'dealer-installed': 'Contractor-installed',
  'DIY/online': 'Sold online, often self-installed',
  'dealer and online': 'Contractors and online',
  'direct (company installs)': 'Sold and installed through the company',
};
export const channelLabel = (c: string | null | undefined) => (c ? CHANNEL_LABEL[c] ?? c : 'Not published');

export const TYPE_LABEL: Record<string, string> = {
  ducted: 'Central (ducted) split systems',
  ductless: 'Mini-splits and multi-splits',
  packaged: 'Single-package units',
};

/** "10-year parts, 10-year compressor" */
export function warrantyHeadline(w: Warranty | null | undefined): string {
  if (!w) return 'Not published';
  const bits = [w.parts ? `${w.parts}-year parts` : null, w.compressor ? `${w.compressor}-year compressor` : null].filter(Boolean);
  return bits.length ? bits.join(', ') : 'Terms not published';
}

/** Short registration note for tables. */
export function registrationNote(w: Warranty | null | undefined): string {
  if (!w) return '';
  if (w.registrationRequired === true) {
    const days = /(\d+)\s*days/.exec(w.ifNotRegistered ?? '')?.[1];
    return days ? `register within ${days} days` : 'registration required';
  }
  if (w.registrationRequired === false) return 'no registration needed';
  return '';
}

export const refrigerantNote = (r: string) =>
  r === 'R-410A'
    ? 'R-410A: the older refrigerant. US rules ended it in most new systems from 2025, and service gas will get dearer.'
    : r === 'R-454B'
      ? 'R-454B: a newer, lower-impact refrigerant (A2L) most US makers moved to in 2025.'
      : r === 'R-32'
        ? 'R-32: a newer, lower-impact refrigerant (A2L) used by Daikin, Fujitsu, LG and others.'
        : r;

// ---------------------------------------------------------------- running costs
export interface CopBand {
  zone: string;
  standard: number;
  coldClimate: number;
  standardLow: number;
  coldClimateLow: number;
}
const BANDS = (calcModel as any).ashpCopBands as (CopBand & { minHdd: number; maxHdd: number | null })[];
export const COP_NOTE = (calcModel as any).ashpNote as string;
const EC = (calcModel as any).energyContentGJ;

/** Seasonal COP planning band for a climate, by heating degree days (°C base 18). */
export function copBand(hdd18: number): CopBand {
  return BANDS.find((b) => hdd18 >= b.minHdd && (b.maxHdd == null || hdd18 <= b.maxHdd)) ?? BANDS[BANDS.length - 1];
}

export interface FuelCost {
  key: string;
  label: string;
  cost: number;
  note: string;
}

const PRICES_CA = (calcPrices as any).provinces as Record<string, any>;
export const PRICES_CA_AS_OF = (calcPrices as any).asOf as string;

/** Delivered heat cost in $ per GJ for one Canadian province or territory (prices from the calculators). */
export function costsCA(prov: string, hdd18: number): { rows: FuelCost[]; elecPerGJ: number | null; gasPerGJ: number | null; band: CopBand } {
  const p = PRICES_CA[prov] ?? {};
  const band = copBand(hdd18);
  const rows: FuelCost[] = [];
  const elec = p.electricity?.variable as number | undefined;
  let elecPerGJ: number | null = null;
  let gasPerGJ: number | null = null;
  if (elec) {
    elecPerGJ = elec / EC.electricity;
    rows.push({ key: 'hp-cold', label: 'Cold-climate heat pump', cost: elecPerGJ / band.coldClimate, note: `seasonal COP ${band.coldClimate.toFixed(1)} for this climate` });
    rows.push({ key: 'hp-std', label: 'Standard heat pump', cost: elecPerGJ / band.standard, note: `seasonal COP ${band.standard.toFixed(1)}` });
    rows.push({ key: 'elec', label: 'Electric baseboards or furnace', cost: elecPerGJ, note: `${(elec * 100).toFixed(1)}¢ per kWh` });
  }
  const gas = p.gas?.variable as number | undefined;
  if (gas) {
    gasPerGJ = gas / EC.gas / 0.95;
    rows.push({ key: 'gas', label: 'Natural gas furnace (95%)', cost: gasPerGJ, note: `${(gas * 100).toFixed(1)}¢ per m³` });
  }
  const oil = (p.oil?.avg12mo ?? p.oil?.perL) as number | undefined;
  if (oil) rows.push({ key: 'oil', label: 'Oil furnace (85%)', cost: oil / EC.oil / 0.85, note: `$${oil.toFixed(2)} per litre, 12-month average` });
  const propane = p.propane?.perL as number | undefined;
  if (propane) rows.push({ key: 'propane', label: 'Propane furnace (93%)', cost: propane / EC.propane / 0.93, note: `$${propane.toFixed(2)} per litre` });
  rows.sort((a, b) => a.cost - b.cost);
  return { rows, elecPerGJ, gasPerGJ, band };
}

const KWH_PER_MMBTU = 293.07;
const OIL_MMBTU_PER_GAL = 0.1385; // EIA heating oil (No. 2 distillate) heat content
const PROPANE_MMBTU_PER_GAL = 0.091452; // EIA propane heat content

/** Delivered heat cost in $ per million Btu for a US state (EIA prices). */
export function costsUS(state: string, hdd65: number): { rows: FuelCost[]; elecPerMMBtu: number | null; gasPerMMBtu: number | null; band: CopBand } {
  const p = statePrices(state);
  const band = copBand(Math.round((hdd65 * 5) / 9));
  const rows: FuelCost[] = [];
  let elecPerMMBtu: number | null = null;
  let gasPerMMBtu: number | null = null;
  if (p.elecCents) {
    elecPerMMBtu = (p.elecCents / 100) * KWH_PER_MMBTU;
    rows.push({ key: 'hp-cold', label: 'Cold-climate heat pump', cost: elecPerMMBtu / band.coldClimate, note: `seasonal COP ${band.coldClimate.toFixed(1)} for this climate` });
    rows.push({ key: 'hp-std', label: 'Standard heat pump', cost: elecPerMMBtu / band.standard, note: `seasonal COP ${band.standard.toFixed(1)}` });
    rows.push({ key: 'elec', label: 'Electric furnace or baseboards', cost: elecPerMMBtu, note: `${p.elecCents.toFixed(1)}¢ per kWh (${PRICE_META.electricity.month})` });
  }
  if (p.gasPerTherm) {
    gasPerMMBtu = (p.gasPerTherm * 10) / 0.95;
    rows.push({ key: 'gas', label: 'Natural gas furnace (95%)', cost: gasPerMMBtu, note: `$${p.gasPerTherm.toFixed(2)} per therm (${p.gasYear ?? 'annual'} average)` });
  }
  if (p.oilPerGal) rows.push({ key: 'oil', label: 'Oil furnace (85%)', cost: p.oilPerGal / OIL_MMBTU_PER_GAL / 0.85, note: `$${p.oilPerGal.toFixed(2)} per gallon before tax (week of ${PRICE_META.oil.week})` });
  if (p.propanePerGal) rows.push({ key: 'propane', label: 'Propane furnace (93%)', cost: p.propanePerGal / PROPANE_MMBTU_PER_GAL / 0.93, note: `$${p.propanePerGal.toFixed(2)} per gallon before tax (week of ${PRICE_META.propane.week})` });
  rows.sort((a, b) => a.cost - b.cost);
  return { rows, elecPerMMBtu, gasPerMMBtu, band };
}

// ---------------------------------------------------------------- Canadian regions
export interface CARegion {
  slug: string;
  name: string;
  codes: string[];
  rebateKeys: string[];
}
const PROV = (provincesJson as any).provinces as { slug: string; name: string }[];
const CODE: Record<string, string[]> = {
  ontario: ['ON'], quebec: ['QC'], bc: ['BC'], alberta: ['AB'], saskatchewan: ['SK'], manitoba: ['MB'],
  'new-brunswick': ['NB'], 'nova-scotia': ['NS'], pei: ['PE'], 'newfoundland-labrador': ['NL'], north: ['YT', 'NT', 'NU'],
};
const REBATE_KEYS: Record<string, string[]> = { north: ['yukon', 'northwest-territories', 'nunavut'] };
const ORDER = ['ontario', 'quebec', 'bc', 'alberta', 'manitoba', 'saskatchewan', 'nova-scotia', 'new-brunswick', 'newfoundland-labrador', 'pei', 'north'];
export const CA_REGIONS: CARegion[] = ORDER.map((slug) => {
  const p = PROV.find((x) => x.slug === slug)!;
  return { slug, name: p.name, codes: CODE[slug], rebateKeys: REBATE_KEYS[slug] ?? [slug] };
});
export const caRegion = (slug: string) => CA_REGIONS.find((r) => r.slug === slug);
export const caShortName = (r: CARegion) => (r.slug === 'north' ? 'the North' : r.name);

export interface CACity {
  slug: string;
  name: string;
  prov: string;
  provSlug: string;
  population: number | null;
  designHeat: number | null;
  hdd18: number | null;
  nightsBelowMinus20: number | null;
  heatingShares: any;
}
export function citiesIn(regionSlug: string): CACity[] {
  return ((calcCities as any).cities as any[])
    .filter((c) => c.provSlug === regionSlug)
    .map((c) => ({
      slug: c.slug,
      name: c.label ?? c.name,
      prov: c.prov,
      provSlug: c.provSlug,
      population: c.population ?? null,
      designHeat: c.hot2000?.designHeat ?? null,
      hdd18: c.eccc?.hdd18 ?? c.hot2000?.hdd ?? null,
      nightsBelowMinus20: c.eccc?.nightsBelowMinus20 ?? null,
      heatingShares: c.heatingShares ?? null,
    }))
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
}

/** Provincial heat pump programs from the October 19 research, for one region page. */
export function caRebates(r: CARegion): any[] {
  const prov = (REBATES_CA.canada?.provinces ?? []) as any[];
  return prov.filter((p) => r.rebateKeys.includes(p.province)).flatMap((p) => p.programs.map((x: any) => ({ ...x, territory: p.province })));
}

/** Our full program guides for a province (src/data/programs.json). */
export function caProgramGuides(slug: string) {
  return programs.filter((p) => (p as any).provinceSlug === slug || (slug === 'north' && (p as any).provinceSlug === 'north'));
}
export const federalHeatPumpPrograms = () => programs.filter((p) => ['national-heat-pump-rebate', 'canada-greener-homes-affordability-program'].includes(p.slug));

// ---------------------------------------------------------------- US metros
export const US_METROS: Metro[] = METROS;
export const usMetro = (slug: string) => METROS.find((m) => m.slug === slug);
export const metroName = (m: Metro) => (m.data.name as string) ?? m.slug;
export const metroState = (m: Metro) => ((m.data.states ?? [])[0] as string) ?? '';
export const stateName = (st: string) => STATE_NAMES[st] ?? st;

export function usRebates(slug: string): any[] {
  const ids = ((REBATES_US.metros ?? []) as any[]).find((x) => x.slug === slug)?.programIds ?? [];
  const byId = new Map(((REBATES_US.programs ?? []) as any[]).map((p) => [p.id, p]));
  return ids.map((id: string) => byId.get(id)).filter(Boolean);
}

/** Cold, mixed or hot: picks which leaderboard leads a metro page. */
export function usClimateKind(m: Metro): 'cold' | 'mixed' | 'hot' {
  const hdd = m.climate?.hdd65 ?? 0;
  const cdd = m.climate?.cdd65 ?? 0;
  if (hdd >= 5000) return 'cold';
  if (cdd >= 2500 && hdd < 2500) return 'hot';
  return 'mixed';
}

// ---------------------------------------------------------------- misc
export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

/** Status chip for a rebate program's free-text status. */
export function statusChipHP(text: string | null | undefined): { cls: string; label: string } {
  const t = (text ?? '').toLowerCase();
  if (/unverified|could not|couldn't|not be (read|loaded)|not (re-)?confirmed|not verified|didn't load/.test(t)) return { cls: 'chip-neutral', label: 'Unconfirmed' };
  if (/^\s*(closed|ended|fully reserved|fully subscribed|none)|closed for|closed to new|no longer|has ended|exhausted|fully (reserved|subscribed)/.test(t)) return { cls: 'chip-closed', label: 'Closed now' };
  if (/paused|waitlist|limited|first-come|subject to fund|not launched|not open|announced|pilot|only/.test(t)) return { cls: 'chip-limited', label: /announced|not launched|not open/.test(t) ? 'Not open yet' : 'Open · limits apply' };
  if (/open|offered|active|listed|available|current|operating/.test(t)) return { cls: 'chip-active', label: 'Open' };
  return { cls: 'chip-neutral', label: 'Unconfirmed' };
}
