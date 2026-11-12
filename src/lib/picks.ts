/**
 * Top picks: three slots (best performance, best do-it-yourself, best value) per climate zone and situation.
 * Heat pumps first (src/data/picks/heatpumps.json, built by tools/picks/build_heatpumps.py from the ENERGY STAR
 * and brand research already on the sites). Pages read picks through these helpers only, so the wording of every
 * card comes from one place.
 */
import hp from '../data/picks/heatpumps.json';
import climateCA from '../data/climate/ca.json';
import climateUS from '../data/climate/us.json';
import zip3 from '../data/us/zip3.json';
import calcCities from '../data/calc/cities.json';
import { brandInfo, brandHref, caRebates, caRegion, usRebates, statusChipHP, publicText, usMetro, metroName, type Market } from './heatpumps';

export type Situation = 'ducted' | 'ductless' | 'room';
export type Slot = 'performance' | 'diy' | 'value';
export type Lang = 'en' | 'fr';

export const SITUATIONS: Situation[] = ['ductless', 'ducted', 'room'];
export const SLOTS: Slot[] = ['performance', 'diy', 'value'];

const H = hp as any;
export const PICKS_CHECKED_ISO: string = H.checked;
export const PICKS_DATA_AS_OF = H.dataAsOf as { energyStar: string; brands: string };
export const PICKS_METHOD = H.method as any;
export const PICKS_COSTS = H.costs as Record<Market, Record<Situation, any>>;

export interface PickWarranty { parts: number | null; compressor: number | null; registrationRequired: boolean | null; years: number }
export interface Pick {
  brand: string;
  slug: string;
  series: string | null;
  line: string | null;
  claim: string | null;
  outdoor: string;
  indoor: string | null;
  ahri: string | null;
  type: string;
  capCool: number | null;
  cap47: number | null;
  cap5: number | null;
  tons: number;
  cop5: number | null;
  ret: number | null;
  hspf2: number | null;
  seer2: number | null;
  eer2: number | null;
  refrig: string;
  staging: string | null;
  cold: boolean;
  nrcanLike: boolean;
  mostEff: boolean;
  priceTier: string | null;
  channel: string | null;
  warranty: PickWarranty;
  score?: number;
  runnerUp?: Pick;
  supplementOnly?: boolean;
  runnerUpManual?: { brand: string; name: string; note: string; url: string };
}
export interface SituationPicks {
  eligible: number;
  excludedReasons: Record<string, number>;
  performance?: Pick;
  value?: Pick;
  diy?: Pick | null;
  diyReason?: string;
}
export interface Zone {
  key: string;
  label: string;
  oneLiner: string;
  kind: string;
  kindLabel: string;
  weights: Record<string, number>;
  note: string | null;
  situations: Record<Situation, SituationPicks>;
}

export const zones = (m: Market): Zone[] => Object.values(H.markets[m].zones) as Zone[];
/** Zone label, climate words and note in the page's language (French for the two Quebec zones). */
const ZONE_FR: Record<string, { label: string; kind: string; note: string | null }> = {
  'great-lakes-st-lawrence': { label: 'Grands Lacs et Saint-Laurent', kind: 'hivers froids', note: null },
  'very-cold-east': {
    label: 'Est très froid',
    kind: 'hivers très froids',
    note: 'Ici, les températures de calcul vont de −25\u00a0°C à −29\u00a0°C, plus bas que le point de −15\u00a0°C où s’arrêtent toutes les cotes. Demandez à l’installateur la puissance que donne le fabricant à votre température de calcul, et gardez un chauffage d’appoint.',
  },
};
export function zoneWords(z: Zone, lang: Lang = 'en'): { label: string; kind: string; note: string | null } {
  if (lang === 'fr' && ZONE_FR[z.key]) return ZONE_FR[z.key];
  return { label: z.label, kind: z.kindLabel, note: z.note };
}
export const zone = (m: Market, key: string): Zone | undefined => H.markets[m].zones[key];
export const zoneHref = (key: string) => `/heat-pumps/picks/${key}/`;
export const PICKS_HREF = '/heat-pumps/picks/';
export const HOW_HREF = '/heat-pumps/how-we-pick/';

// ---------------------------------------------------------------- where the zones are
const CLIM = { ca: climateCA as any, us: climateUS as any };
/** Where a zone is, in words a searcher uses ("Southern Ontario and southern Quebec", "the Pacific Northwest"), for titles. */
export function zoneWhere(m: Market, key: string): string {
  const n: string | undefined = CLIM[m].profiles[key]?.regionName;
  if (!n) return zone(m, key)?.label ?? key;
  return /^(Lower|Okanagan|Maritimes|Upper|Northeast|Colorado|Mid-|Southeast|Desert|Pacific)/.test(n) ? `the ${n}` : n;
}
/** Zone of a city or metro page (climate place slug). */
export const zoneOfPlace = (m: Market, slug: string): string | null => CLIM[m].places?.[slug]?.profile ?? null;
/** Zones of a Canadian province or territory page, most populous first (the order in climate/ca.json). */
export const zonesOfProvince = (slug: string): string[] => (CLIM.ca.provinces?.[slug]?.profiles ?? []) as string[];
/** Example places in a zone, for the zone list and page intros. */
const CA_CITY = new Map<string, { name: string; pop: number }>(
  (Object.values((calcCities as any).cities ?? {}) as any[]).map((c) => [c.slug, { name: c.name, pop: c.population ?? 0 }]),
);
export function placeName(m: Market, slug: string): string {
  if (m === 'ca') return CA_CITY.get(slug)?.name ?? prettySlug(slug);
  const metro = usMetro(slug);
  return metro ? metroName(metro) : prettySlug(slug);
}
/** The biggest places in a zone first: Canadian cities by population, US metros by rank. */
export function zonePlaces(m: Market, key: string, n = 4): string[] {
  const slugs = (m === 'ca' ? [...(CLIM.ca.profiles?.[key]?.places ?? [])] : metrosOfZone(key)) as string[];
  const weight = (s: string) => (m === 'ca' ? CA_CITY.get(s)?.pop ?? 0 : -(usMetro(s)?.rank ?? 999));
  return slugs.sort((a, b) => weight(b) - weight(a)).slice(0, n).map((s) => placeName(m, s));
}
function prettySlug(s: string) {
  return s.replace(/-(bc|on|qc)$/, '').split('-').map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}
/** Canadian provinces that touch a zone (for links from a zone page). */
export function provincesOfZone(key: string): string[] {
  const prov = CLIM.ca.provinces ?? {};
  return Object.keys(prov).filter((p) => (prov[p].profiles ?? []).includes(key));
}
/** US metros in a zone. */
export function metrosOfZone(key: string): string[] {
  return Object.entries(CLIM.us.places ?? {}).filter(([, v]: any) => v.profile === key).map(([k]) => k);
}

/**
 * Postal code (first three characters) to zone, for the zone finder. Province by the first letter; Ontario,
 * Quebec and BC split by the postal districts that fall in their colder or interior zone. Approximate by design:
 * the finder says so and lets people pick another zone.
 */
export const FSA_ZONE_RULES = {
  byLetter: {
    A: 'atlantic', B: 'atlantic', C: 'atlantic', E: 'atlantic', K: 'great-lakes-st-lawrence', L: 'great-lakes-st-lawrence',
    M: 'great-lakes-st-lawrence', N: 'great-lakes-st-lawrence', P: 'very-cold-east', H: 'great-lakes-st-lawrence',
    J: 'great-lakes-st-lawrence', G: 'very-cold-east', R: 'prairies', S: 'prairies', T: 'prairies', V: 'coastal-bc', X: 'north', Y: 'north',
  } as Record<string, string>,
  /** exceptions by prefix, longest match wins */
  byPrefix: {
    // Trois-Rivières and the Mauricie are in the Great Lakes–St. Lawrence zone on our city pages
    G8T: 'great-lakes-st-lawrence', G8V: 'great-lakes-st-lawrence', G8W: 'great-lakes-st-lawrence', G8Y: 'great-lakes-st-lawrence',
    G8Z: 'great-lakes-st-lawrence', G9A: 'great-lakes-st-lawrence', G9B: 'great-lakes-st-lawrence', G9C: 'great-lakes-st-lawrence',
    // Abitibi-Témiscamingue: very cold
    J9P: 'very-cold-east', J9T: 'very-cold-east', J9X: 'very-cold-east', J9Y: 'very-cold-east', J9Z: 'very-cold-east', J0Y: 'very-cold-east', J0Z: 'very-cold-east',
    // BC interior: Okanagan, Kamloops, Kootenays, Cariboo, Prince George
    V1: 'bc-southern-interior', V2A: 'bc-southern-interior', V2B: 'bc-southern-interior', V2C: 'bc-southern-interior', V2E: 'bc-southern-interior',
    V2G: 'bc-southern-interior', V2H: 'bc-southern-interior', V2J: 'bc-southern-interior', V2K: 'bc-southern-interior', V2L: 'bc-southern-interior',
    V2M: 'bc-southern-interior', V2N: 'bc-southern-interior',
    // rural BC (V0) spans every zone in the province: ask
    V0: '',
  } as Record<string, string>,
};
/** ZIP3 → zone, from the planner's ZIP3 table (metro, or the nearest metro within 200 miles). */
export function zip3Zones(): Record<string, string> {
  const out: Record<string, string> = {};
  const z = (zip3 as any).zip3 as Record<string, [string, string | null, string | null, number | null]>;
  for (const [k, [, metro, near, miles]] of Object.entries(z)) {
    const slug = metro ?? (near && (miles ?? 999) <= 200 ? near : null);
    const zk = slug ? zoneOfPlace('us', slug) : null;
    if (zk) out[k] = zk;
  }
  return out;
}

// ---------------------------------------------------------------- words
const L = {
  en: {
    slot: { performance: 'Best performance', diy: 'Best do-it-yourself', value: 'Best value' } as Record<Slot, string>,
    slotShort: {
      performance: 'Top score for this climate on the certified ratings',
      diy: 'Pre-charged lines, a warranty that covers an owner install',
      value: 'Best performer from a budget or mid-priced brand',
    } as Record<Slot, string>,
    situation: { ducted: 'House with ducts', ductless: 'No ducts', room: 'One room' } as Record<Situation, string>,
    situationLong: {
      ducted: 'A house with ducts: one central system (2 to 4 tons)',
      ductless: 'A house without ducts: a wall-mounted head for a floor or an open main level (1 to 2 tons)',
      room: 'One room: a small wall-mounted head (half a ton to 1 ton)',
    } as Record<Situation, string>,
  },
  fr: {
    slot: { performance: 'Meilleure performance', diy: 'Meilleure à installer soi-même', value: 'Meilleur rapport qualité-prix' } as Record<Slot, string>,
    slotShort: {
      performance: 'Meilleur score pour ce climat selon les cotes certifiées',
      diy: 'Conduites préchargées, garantie valide si vous l’installez vous-même',
      value: 'La plus performante d’une marque économique ou de milieu de gamme',
    } as Record<Slot, string>,
    situation: { ducted: 'Maison avec conduits', ductless: 'Sans conduits', room: 'Une pièce' } as Record<Situation, string>,
    situationLong: {
      ducted: 'Une maison avec conduits : un système central (2 à 4 tonnes)',
      ductless: 'Une maison sans conduits : une unité murale pour un étage ou une aire ouverte (1 à 2 tonnes)',
      room: 'Une pièce : une petite unité murale (une demi-tonne à 1 tonne)',
    } as Record<Situation, string>,
  },
};
export const slotLabel = (s: Slot, lang: Lang = 'en') => L[lang].slot[s];
export const slotShort = (s: Slot, lang: Lang = 'en') => L[lang].slotShort[s];
export const situationLabel = (s: Situation, lang: Lang = 'en') => L[lang].situation[s];
export const situationLong = (s: Situation, lang: Lang = 'en') => L[lang].situationLong[s];

const nf = (m: Market, lang: Lang) => (lang === 'fr' ? 'fr-CA' : m === 'ca' ? 'en-CA' : 'en-US');
const num = (x: number, digits: number, m: Market, lang: Lang) => x.toLocaleString(nf(m, lang), { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const money = (n: number, m: Market, lang: Lang = 'en') =>
  lang === 'fr' ? `${Math.round(n).toLocaleString('fr-CA')} $` : `$${Math.round(n).toLocaleString(m === 'ca' ? 'en-CA' : 'en-US')}`;
const at5 = (m: Market, lang: Lang) => (lang === 'fr' ? 'à\u00a0−15\u00a0°C' : m === 'ca' ? 'at\u00a0−15°C' : 'at\u00a05°F');

/** Display name: brand + the maker's line (or ENERGY STAR's series), with the outdoor model. */
export function pickName(p: Pick, lang: Lang = 'en'): string {
  // the maker's line name without its trailing note in brackets ("(KTAP1)", "(up to 35 SEER2)"): the model shows below
  const line = p.line ? p.line.replace(/\s*\([^()]*\)\s*$/, '').trim() : p.series ?? '';
  let brandShort = p.brand.replace(/,? and other ICP brands$/, '').replace(/^Heil, Tempstar, Comfortmaker, KeepRite$/, 'Heil, Tempstar, Comfortmaker or KeepRite');
  // brands sold under several names ("Comfort-Aire and Century"): our joining words, so French gets "et" / "ou" (line names stay the maker's)
  if (lang === 'fr') brandShort = brandShort.replace(/ and /g, ' et ').replace(/ or /g, ' ou ');
  return line && !line.toLowerCase().startsWith(brandShort.toLowerCase().split(' ')[0]) ? `${brandShort} ${line}` : line || brandShort;
}
export const capacityText = (p: Pick, m: Market, lang: Lang = 'en') =>
  p.capCool ? (lang === 'fr' ? `${num(p.capCool, 0, m, lang)} BTU/h (${num(p.tons, p.tons % 1 ? 1 : 0, m, lang)} t)` : `${num(p.capCool, 0, m, lang)} BTU/h (${p.tons}-ton)`) : '';

/** The three numbers that put a pick in its slot, in the order the zone's weights rank them. */
export function pickFacts(p: Pick, z: Zone, m: Market, lang: Lang = 'en'): string[] {
  const order = Object.entries(z.weights).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const fr = lang === 'fr';
  const f: Record<string, string | null> = {
    ret: p.ret != null ? (fr ? `Garde ${Math.round(p.ret * 100)}\u00a0% de sa chaleur nominale ${at5(m, lang)}` : `Keeps ${Math.round(p.ret * 100)}% of its rated heat ${at5(m, lang)}`) : null,
    cop5: p.cop5 != null ? (fr ? `Efficacité (COP) de ${num(p.cop5, 2, m, lang)} ${at5(m, lang)}` : `COP ${num(p.cop5, 2, m, lang)} ${at5(m, lang)}`) : null,
    hspf2: p.hspf2 != null ? `HSPF2 ${num(p.hspf2, 1, m, lang)}` : null,
    seer2: p.seer2 != null ? `SEER2 ${num(p.seer2, 1, m, lang)}` : null,
    eer2: p.eer2 != null ? (fr ? `EER2 ${num(p.eer2, 1, m, lang)} (canicule)` : `EER2 ${num(p.eer2, 1, m, lang)} on the hottest days`) : null,
    warranty: p.warranty.years ? warrantyText(p, m, lang) : null,
  };
  return order.map((k) => f[k]).filter((x): x is string => Boolean(x)).slice(0, 3);
}
export function warrantyText(p: Pick, m: Market, lang: Lang = 'en'): string {
  const w = p.warranty;
  const fr = lang === 'fr';
  const both = w.parts && w.compressor && w.parts === w.compressor;
  const core = both
    ? fr ? `${w.parts} ans pièces et compresseur` : `${w.parts}-year parts and compressor warranty`
    : fr ? `${w.parts ?? '—'} ans pièces, ${w.compressor ?? '—'} ans compresseur` : `${w.parts ?? '—'}-year parts, ${w.compressor ?? '—'}-year compressor warranty`;
  if (w.registrationRequired) return fr ? `${core} (avec enregistrement)` : `${core} once registered`;
  if (w.registrationRequired === false) return fr ? `${core}, sans enregistrement` : `${core}, no registration`;
  return core;
}

/** Installed price line for a situation (published ranges, never a single model price). */
export function costLine(m: Market, s: Situation, lang: Lang = 'en'): { text: string; source: string; short: string; url: string } | null {
  const c = PICKS_COSTS[m]?.[s];
  if (!c) return null;
  const fr = lang === 'fr';
  let text = '';
  if (c.low != null && c.high != null) text = fr ? `Installé : ${money(c.low, m, lang)} à ${money(c.high, m, lang)}${c.plus ? ' et plus' : ''}` : `Installed: ${money(c.low, m)} to ${money(c.high, m)}${c.plus ? '+' : ''}`;
  else if (c.avg != null) text = `Installed: about ${money(c.avg, m)} on average (${money(c.perTon, m)} a ton) before incentives`;
  else if (c.high != null) text = 'Installed: a few thousand dollars per indoor head, up to about $8,000';
  return { text, source: fr ? c.sourceFr ?? c.source : c.source, short: fr ? c.shortFr ?? c.short ?? c.source : c.short ?? c.source, url: c.url };
}

// ---------------------------------------------------------------- rebates on the cards
const CONTRACTOR_RE = /(participating|registered|licensed|qualified|approved|trade ally|network member|rbq|hpcn|contractor (?:buys|applies|submits|deducts)|no diy|no self|self-install\w* (?:do not|don't) qualify|must be installed by)/i;
const NO_CONTRACTOR_RE = /no (?:approved-)?contractor requirement|allows self-installed/i;
/** income-qualified and free-upgrade programs: real, but not the rebate most readers will get */
const INCOME_RE = /income|affordab|free (?:heat pump|upgrade)|low-income|HEAR\b|HOMES\b|assistance/i;
/** the open programs most readers can use, by short name, each once (BC has two "Home Renovation Rebate" offers) */
function uniqueNames(open: any[]): string[] {
  const names = open.filter((p) => !INCOME_RE.test(p.name) && !/^no\b/i.test(p.name)).map((p) => shortProgram(p.name));
  return [...new Set(names)];
}
function needsContractor(text: string): boolean {
  return CONTRACTOR_RE.test(text) && !NO_CONTRACTOR_RE.test(text);
}
export interface RebateNote { names: string[]; diyNo: string | null; href: string }
/** Open heat pump programs for a Canadian province page, and whether a self-install loses them. */
export function rebateNoteCA(provSlug: string): RebateNote | null {
  const r = caRegion(provSlug);
  if (!r) return null;
  const open = caRebates(r).filter((p) => ['Open', 'Open · limits apply'].includes(statusChipHP(p.status).label));
  if (!open.length) return null;
  const names = uniqueNames(open);
  const strict = open.find((p) => needsContractor(`${p.otherConditions ?? ''} ${p.equipmentRule ?? ''} ${p.heatPumpRebate ?? ''}`));
  return { names: names.slice(0, 2), diyNo: strict ? shortProgram(strict.name) : null, href: `/heat-pumps/${provSlug}/#rebates` };
}
/** Same for a US metro page. */
export function rebateNoteUS(metroSlug: string): RebateNote | null {
  const open = usRebates(metroSlug).filter((p) => ['Open', 'Open · limits apply'].includes(statusChipHP(p.status).label));
  if (!open.length) return null;
  const strict = open.find((p) => needsContractor(`${p.contractorRule ?? ''}`));
  return { names: uniqueNames(open).slice(0, 2), diyNo: strict ? shortProgram(strict.name) : null, href: `/heat-pumps/${metroSlug}/#rebates` };
}
/** French names for the Quebec programs on the French heat pump page. */
const PROGRAM_FR: Record<string, string> = {
  'Hydro-Québec dual-energy offer': 'l’offre biénergie d’Hydro-Québec',
};
export const programNameFr = (n: string) => PROGRAM_FR[n] ?? n;
function shortProgram(name: string): string {
  return publicText(name).replace(/\s*[—–:]\s.*$/, '').replace(/\s*\((?:[^)]{0,60})\)\s*$/, '').trim();
}

/** Text the quote form's "brands" field gets when someone asks for quotes from a pick (no personal data). */
export const quotePrefill = (p: Pick, s: Slot) => `${pickName(p)} (${p.outdoor}), from the ${slotLabel(s).toLowerCase()} pick`;

export const brandPage = (p: Pick, m: Market) => (brandInfo(p.slug) ? brandHref(m, p.slug) : null);
/** Maker's page for the pick's product line, when the brand research has one. */
export function lineUrl(p: Pick): string | null {
  const b = brandInfo(p.slug) as any;
  const l = (b?.lines ?? []).find((x: any) => x.name === p.line);
  return l?.url ?? null;
}
