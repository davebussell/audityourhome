/**
 * Data for audityourbuilding.com (src/pages/bu/). Everything is read from src/data/building/:
 *   commercial.json   reporting rules (federal, provincial, municipal) and the audit/study incentive programs, each with its
 *                     source address and the date the source page was read (tools/local-pages/research/commercial.json)
 *   cities.json       the 70 cities with their facts and the text parts of each city page (tools/building/extract.mjs)
 *   articles.json     the two articles that moved here from audityourhome.ca
 */
import citiesJson from '../data/building/cities.json';
import research from '../data/building/commercial.json';
import articlesJson from '../data/building/articles.json';
import { BUILDING } from '../config/building';

const BUILDING_NAME = BUILDING.name;

export const PROVINCE_ORDER = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT'] as const;

export interface BFacts { hdd: number; designHeat: number; station: string; stationKm: number; electricity: string | null; gas: string | null }
export interface BCity {
  slug: string;
  name: string;
  label: string | null;
  prov: string;
  provName: string;
  provSlug: string;
  population: number;
  facts: BFacts;
  page: {
    kicker: string;
    title: string;
    description: string;
    h1: string;
    lede: string;
    faq: { q: string; a: string }[];
    nearby: { slug: string; name: string; km: number }[];
  };
}
export interface BRule {
  name: string;
  type: string;
  status: string;
  summary: string;
  thresholds: string | null;
  deadline?: string | null;
  source: string;
  sourceUpdated?: string;
  scope: 'province' | 'city';
  place: string;
}
export interface BIncentive {
  key: string;
  name: string;
  provider: string;
  provinces: string[];
  summary: string;
  eligibility: string;
  status: 'open' | 'unclear' | 'closed' | string;
  source: string;
}
export interface BArticle {
  slug: string;
  kicker: string;
  crumb: string;
  title: string;
  h1: string;
  description: string;
  blurb: string;
  lede: string;
  verified: string;
  verifiedISO: string;
  sections: { h2: string; html: string }[];
  faq: { q: string; a: string }[];
  sources: { href: string; label: string }[];
  related: { href: string; label: string }[];
}

export const cities = citiesJson as BCity[];
export const articles = articlesJson as BArticle[];
/** The article that is its own page (src/pages/bu/articles/energy-audit-services-toronto.astro). */
export const STATIC_ARTICLES = [
  {
    slug: 'energy-audit-services-toronto',
    kicker: 'Toronto buildings',
    crumb: 'Energy audit and energy management in Toronto',
    title: 'Energy audit and energy management services in Toronto',
    blurb: 'Audit levels, who performs them, monitoring and retro-commissioning, Ontario and City of Toronto reporting rules, and the programs that pay.',
    verified: 'October 8, 2026',
  },
] as const;

/** "2026-09-28" -> "September 28, 2026" (UTC, so the day never shifts with the build machine's time zone) */
export const longDate = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : iso;
export const dataCheckedISO: string = research.checked; // "2026-09-28"
export const dataChecked: string = longDate(research.checked); // "September 28, 2026"

const rawRules = research.rules as unknown as {
  federal: Record<string, unknown>[];
  provinces: Record<string, Omit<BRule, 'scope' | 'place'>[]>;
  cities: Record<string, Omit<BRule, 'scope' | 'place'>[]>;
};
const rawIncentives = research.incentives as unknown as Record<string, Omit<BIncentive, 'key'>>;
const rawCityIncentives = research.cityIncentives as unknown as Record<string, string[]>;
const rawCityNotes = research.cityIncentiveNotes as unknown as Record<string, string>;

/** The federal items in the research: ENERGY STAR Portfolio Manager (the reporting tool most programs use) and NRCan's list of programs. */
const rawFederal = (research.rules as unknown as { federal: Record<string, unknown>[] }).federal;
export const portfolioManager = rawFederal[0] as unknown as Omit<BRule, 'scope' | 'place'>;
export const nrcanDirectory = rawFederal[1] as unknown as { name: string; source: string; sourceUpdated?: string };

export const cityBySlug = (slug: string) => cities.find((c) => c.slug === slug);
export const cityLabel = (c: { name: string; label: string | null }) => c.label ?? c.name;

/** Cities grouped by province in the site's west-to-east order, largest first. */
export function citiesByProvince() {
  const out: { prov: string; provName: string; cities: BCity[] }[] = [];
  for (const code of PROVINCE_ORDER) {
    const list = cities.filter((c) => c.prov === code).sort((a, b) => b.population - a.population);
    if (list.length) out.push({ prov: code, provName: list[0].provName, cities: list });
  }
  return out;
}

// ------------------------------------------------------------------ reporting rules
const isPlaceholder = (r: { status: string }) => ['none', 'none found', 'not found'].includes(r.status);
export const isMandatory = (r: { type: string; status: string }) => /^mandatory/.test(r.type) && /^in force/.test(r.status);

/** Rules that exist for a province (placeholders for "none found" are left out). */
export function provinceRules(prov: string): BRule[] {
  return (rawRules.provinces[prov] ?? []).filter((r) => !isPlaceholder(r)).map((r) => ({ ...r, scope: 'province', place: prov }));
}
export function cityRules(slug: string): BRule[] {
  return (rawRules.cities[slug] ?? []).filter((r) => !isPlaceholder(r)).map((r) => ({ ...r, scope: 'city', place: slug }));
}
export function rulesFor(c: BCity) {
  const province = provinceRules(c.prov);
  const city = cityRules(c.slug);
  const all = [...city, ...province];
  return { city, province, all, mandatory: all.some(isMandatory), voluntary: all.some((r) => /^voluntary/.test(r.type)) };
}
/** Every rule on the site, for the reporting-rules overview: provinces first (west to east), then cities by province. */
export function allRules(): BRule[] {
  const out: BRule[] = [];
  for (const p of PROVINCE_ORDER) out.push(...provinceRules(p));
  for (const grp of citiesByProvince()) for (const c of grp.cities) out.push(...cityRules(c.slug));
  return out;
}
/** Provinces and territories where no province-wide rule was found. */
export const provincesWithoutRule = () => PROVINCE_ORDER.filter((p) => provinceRules(p).length === 0);

/** "in force - enforcement paused since May 21, 2026" → chip text + the detail after the dash. */
export function statusParts(status: string): { label: string; detail: string | null; tone: 'active' | 'limited' | 'info' | 'closed' | 'neutral' } {
  const [head, ...rest] = status.split(' - ');
  const detail = rest.length ? rest.join(' - ').replace(/^./, (m) => m.toUpperCase()) : null;
  if (head === 'in force') return { label: 'In force', detail, tone: detail ? 'limited' : 'active' };
  if (head === 'voluntary') return { label: 'Voluntary', detail, tone: 'info' };
  if (head === 'not adopted') return { label: 'Not adopted', detail, tone: 'closed' };
  if (head === 'available') return { label: 'Available', detail, tone: 'active' };
  return { label: head.replace(/^./, (m) => m.toUpperCase()), detail, tone: 'neutral' };
}
export function ruleTypeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t === 'mandatory reporting') return 'Mandatory reporting';
  if (t.startsWith('mandatory reporting (public')) return 'Mandatory · public sector';
  if (t.startsWith('mandatory disclosure')) return 'Mandatory disclosure and rating';
  if (t.startsWith('mandatory reporting +')) return 'Mandatory reporting + performance standard';
  if (t.startsWith('performance standard')) return 'Proposed performance standard';
  if (t.startsWith('voluntary')) return 'Voluntary program';
  return type.replace(/^./, (m) => m.toUpperCase());
}

// ------------------------------------------------------------------ incentives
const toIncentive = (key: string): BIncentive | null => (rawIncentives[key] ? { key, ...rawIncentives[key] } : null);
/** Audit and study incentive programs for buildings in a city: open ones, and ones whose status is unclear. */
export function incentivesFor(slug: string): BIncentive[] {
  return (rawCityIncentives[slug] ?? []).map(toIncentive).filter((x): x is BIncentive => !!x && x.status !== 'closed');
}
/** A note about how programs map to this city (utility territory, postal-code coverage). Wording that is a research caveat is left out. */
export function incentiveNote(slug: string): string | null {
  const n = rawCityNotes[slug];
  return n && !/assumed|assume/i.test(n) ? n : null;
}
export const allIncentives = (): BIncentive[] => Object.keys(rawIncentives).map((k) => toIncentive(k)!).filter(Boolean);
/** Programs that apply in one province (those open or with a status to confirm), open ones first. Programs open across Canada are listed apart. */
export function incentivesByProvince(prov: string): BIncentive[] {
  const order = (i: BIncentive) => (i.status === 'open' ? 0 : 1);
  return allIncentives()
    .filter((i) => i.provinces.includes(prov) && i.provinces.length < 12 && i.status !== 'closed')
    .sort((a, b) => order(a) - order(b));
}
export const closedIncentives = (): BIncentive[] => allIncentives().filter((i) => i.status === 'closed');
export const nationalIncentives = (): BIncentive[] => (research.nationalIncentives as string[]).map((k) => toIncentive(k)!).filter(Boolean);

export const cityMetrics = (c: BCity) => ({ mandatory: rulesFor(c).mandatory, voluntary: rulesFor(c).voluntary, incentives: incentivesFor(c.slug).length });

/** Dated sources for a city page: the standard, the tool, each rule and each incentive (full names, no duplicates). */
export function sourcesFor(c: BCity): { label: string; href: string }[] {
  const out = [
    { label: 'ASHRAE: Standards 180 and 211 (ASHRAE Standard 211, commercial building energy audits)', href: 'https://www.ashrae.org/technical-resources/bookstore/standards-180-and-211' },
    { label: 'NRCan: Energy benchmarking with ENERGY STAR Portfolio Manager', href: 'https://natural-resources.canada.ca/energy-efficiency/energy-star/energy-benchmarking-energy-starr-portfolio-managerr' },
  ];
  for (const r of rulesFor(c).all) out.push({ label: r.name, href: r.source });
  for (const i of incentivesFor(c.slug)) out.push({ label: `${i.name} (${i.provider})`, href: i.source });
  return out.filter((s, i, a) => s.href && a.findIndex((x) => x.href === s.href) === i);
}

// ------------------------------------------------------------------ city page copy
/** The closest city pages: those within 150 km, or (for remote places) the five closest, with the distance either way. */
export function nearbyOf(c: BCity): { slug: string; name: string; km: number }[] {
  const near = c.page.nearby.filter((n) => n.km <= 150);
  return near.length ? near : c.page.nearby;
}
export const nearbyIsLocal = (c: BCity) => c.page.nearby.some((n) => n.km <= 150);

/** Everything on a city page that is a sentence built from the data, so the counts always match the cards on the page. */
export function cityCopy(c: BCity) {
  const label = cityLabel(c);
  const r = rulesFor(c);
  const mandatory = r.all.filter(isMandatory);
  const voluntary = r.all.filter((x) => /^voluntary/.test(x.type));
  const inc = incentivesFor(c.slug);

  const ruleBit = mandatory.length
    ? `${plural(mandatory.length, 'mandatory reporting rule')}`
    : voluntary.length
      ? 'a voluntary reporting program and no mandatory rule'
      : 'no mandatory reporting rule';
  const incBit = inc.length ? `${plural(inc.length, 'audit or study incentive program')}` : 'no audit or study incentive program';

  const shortTitle = `Commercial energy audits in ${label} | ${BUILDING_NAME}`;
  const longTitle = `Commercial energy audits in ${label}: rules and incentives | ${BUILDING_NAME}`;
  const title = longTitle.length <= 72 ? longTitle : shortTitle;

  const ruleShort = mandatory.length ? plural(mandatory.length, 'mandatory reporting rule') : voluntary.length ? 'a voluntary reporting program' : 'no reporting rule found';
  const incShort = inc.length ? plural(inc.length, 'audit incentive') : 'no audit incentive found';
  const description = `${label} commercial and multi-unit energy audits: ${ruleShort}, ${incShort}, and the three ASHRAE audit levels. Checked ${dataChecked}.`;
  const lede = `Offices, apartment buildings, retail and industrial sites get engineering energy audits, scoped to ASHRAE Standard 211, rather than EnerGuide home evaluations. Here is what we found for ${label}: ${ruleBit} and ${incBit}.`;

  const names = (xs: { name: string }[]) => xs.map((x) => x.name).join('; ');
  const faq = [
    {
      q: `Do ${label} buildings have to report energy use?`,
      a: mandatory.length
        ? `Yes, above certain sizes or for certain owners. The rules in force: ${names(mandatory)}. Thresholds, deadlines and exemptions differ, so check each rule's official page before you rely on a summary.`
        : `We found no mandatory energy reporting rule for ${label} buildings as of ${dataChecked}.${voluntary.length ? ` A voluntary program is available: ${names(voluntary)}.` : ''} Rules change, so confirm with the city and the province before you rely on this.`,
    },
    {
      q: `Are there incentives for commercial energy audits in ${label}?`,
      a: inc.length
        ? `Yes, we found ${inc.length}: ${names(inc)}. Most need you to be a customer of the utility and to get pre-approval before the audit starts, so check eligibility first.`
        : `We found none as of ${dataChecked}. Programs open and close, so ask your electricity and gas utilities, and check the national program on the incentives page.`,
    },
    {
      q: 'What is the difference between an ASHRAE Level 1, 2 and 3 audit?',
      a: 'Level 1 is a walk-through with a utility-bill review and a list of low-cost measures. Level 2 breaks down where the energy goes and prices each practical measure. Level 3 adds monitoring and detailed analysis for capital-intensive projects. Most incentive and loan applications ask for Level 2.',
    },
    {
      q: 'What does a commercial energy audit cost?',
      a: `It depends on the building's size, its systems and the ASHRAE level. Ask for a fixed fee per level with a list of deliverables, and ask whether an incentive needs pre-approval before the work starts.`,
    },
    {
      q: `I own a house or a condo unit in ${label}. Is this the right site?`,
      a: `No. A house or a single condo unit gets an EnerGuide home evaluation, which AuditYourHome.ca covers city by city.`,
      link: { href: `https://audityourhome.ca/cities/${c.slug}/`, label: `Home energy audits in ${label} →` },
    },
  ] as { q: string; a: string; link?: { href: string; label: string } }[];
  return { label, rules: r, mandatory, voluntary, incentives: inc, title, description, lede, faq };
}

// ------------------------------------------------------------------ small formatters
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const ARTICLE_PHOTO: Record<string, string> = {
  'commercial-energy-audits-ontario': 'commercial-energy-audit',
  'energy-audits-multi-unit-buildings': 'multi-unit',
  'energy-audit-services-toronto': 'commercial-energy-audit',
};
/** Articles whose picture is a drawn tile (building-type icons) instead of a photograph, so the cards don't repeat one image. */
export const ARTICLE_TILE: Record<string, { types: string[]; caption: string; alt: string }> = {
  'commercial-energy-audits-ontario': {
    types: ['office', 'industrial', 'institutional'],
    caption: 'Commercial · industrial · institutional',
    alt: 'Line drawings of an office tower, a factory and a school-type building on a blueprint grid',
  },
};
export const articleBySlug = (slug: string) => articles.find((a) => a.slug === slug);

/** Building types the request form and the home page offer (value = form value). */
export const BUILDING_TYPES = [
  { value: 'office', label: 'Office', icon: 'office', looks: 'Heating and cooling plant, lighting and controls, plug loads and the envelope.', href: '/commercial-energy-audit/' },
  { value: 'retail', label: 'Retail and services', icon: 'retail', looks: 'Lighting, rooftop heating and cooling units, refrigeration where there is food, and operating hours.', href: '/commercial-energy-audit/' },
  { value: 'hospitality', label: 'Hotel and hospitality', icon: 'hotel', looks: 'Hot water, laundry and kitchens, heating and cooling plant, and guest-room controls.', href: '/commercial-energy-audit/' },
  { value: 'industrial', label: 'Industrial and warehouse', icon: 'industrial', looks: 'Process loads, compressed air, large heating plant and the building shell.', href: '/commercial-energy-audit/' },
  { value: 'institutional', label: 'School, hospital or public building', icon: 'institutional', looks: 'Boilers, ventilation and controls, and the reporting duties public-sector buildings carry.', href: '/commercial-energy-audit/' },
  { value: 'multi-unit', label: 'Apartment or condo building', icon: 'apartment', looks: 'Shared boilers and hot water, make-up air, common-area lighting and how suite metering splits the bills.', href: '/apartments-condos/' },
] as const;
