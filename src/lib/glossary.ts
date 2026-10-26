/**
 * The glossary: every technical term on the site, explained for homeowners, with its own page per
 * country (/ca/glossary/<slug>/, /us/glossary/<slug>/). The build-time linker (tools/glossary/link.mjs)
 * links the first use of each term on every page to its entry; public/gl.js shows the short definition.
 * Data: src/data/glossary.json (written by tools/glossary/import.mjs).
 */
import data from '../data/glossary.json';
import {
  termFor,
  shortFor,
  bodyFor,
  whyFor,
  slugFor,
  hrefFor,
  localize,
  runtimePatterns,
  questionParts,
  questionFor,
} from './glossary-patterns.mjs';

export type Country = 'ca' | 'us';

export interface GlossaryValue {
  label: string;
  value: string;
  source?: string;
  countries?: string[];
}

export interface GlossaryEntry {
  slug: string;
  slugCa?: string;
  slugUs?: string;
  term: string;
  termCa?: string;
  termUs?: string;
  aka: string[];
  /** Per-country "also called" lists, used instead of aka (e.g. no CSA standard names on US pages). */
  akaCa?: string[];
  akaUs?: string[];
  category: string;
  countries: Country[];
  short: string;
  shortCa?: string;
  shortUs?: string;
  body: string;
  bodyCa?: string;
  bodyUs?: string;
  whyItMatters: string;
  whyCa?: string;
  whyUs?: string;
  values: GlossaryValue[];
  caNote?: string;
  usNote?: string;
  related: string[];
  sources: string[];
  noLink?: boolean;
}

export const GLOSSARY = (data as unknown as { entries: GlossaryEntry[] }).entries;
export const GLOSSARY_CHECKED: string | null = (data as unknown as { checked?: string | null }).checked ?? null;

export const CATEGORY_ORDER = ['testing', 'envelope', 'hvac', 'water', 'bills', 'health', 'safety', 'programs', 'climate'] as const;
export const CATEGORY_LABEL: Record<string, string> = {
  testing: 'Testing & air leaks',
  envelope: 'Insulation & windows',
  hvac: 'Heating, cooling & ventilation',
  water: 'Hot water',
  bills: 'Energy, bills & ratings',
  health: 'Health & indoor air',
  safety: 'Fire & electrical safety',
  programs: 'Programs & credentials',
  climate: 'Climate',
};

const bySlugMap = new Map(GLOSSARY.map((e) => [e.slug, e]));
export const glossaryEntry = (slug: string) => bySlugMap.get(slug);

export function entriesFor(c: Country): GlossaryEntry[] {
  return GLOSSARY.filter((e) => e.countries.includes(c));
}

export { termFor, shortFor, bodyFor, whyFor, slugFor, hrefFor, localize, questionFor };

/** Sort key and A–Z bucket ("#" for terms that start with a digit). */
export function sortTerm(t: string) {
  return t.replace(/^[^\p{L}\p{N}]+/u, '').toLocaleLowerCase('en');
}
export function letterOf(t: string) {
  const ch = sortTerm(t).charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

// ------------------------------------------------------------------ related site pages
// Pages that explain a term in depth. Paths are checked against the build by tools/glossary/link.mjs,
// which reports any that don't exist.
type PageRef = { ca?: string; us?: string; label: string; labelUs?: string };
const T = (test: string, label: string): PageRef => ({ ca: `/ca/tests/${test}/`, us: `/us/tests/${test}/`, label });
const L = (slug: string, label: string): PageRef => ({ ca: `/ca/learn/${slug}/`, label });
const I = (slug: string, label: string): PageRef => ({ ca: `/ca/issues/${slug}/`, label });
const P = (cat: string, label: string): PageRef => ({ ca: `/ca/products/${cat}/`, us: `/us/products/${cat}/`, label });

const PAGES = {
  audit: [
    { ca: '/ca/how-it-works/', us: '/us/how-it-works/', label: 'How a home energy audit works' },
    { ca: '/ca/cost/', us: '/us/cost/', label: 'What an audit costs' },
    { ca: '/ca/tests/', us: '/us/tests/', label: 'The complete testing guide' },
  ],
  blower: [T('blower-door', 'The blower door test, step by step'), L('air-sealing', 'Air sealing: where the leaks are'), I('drafty-rooms', 'Drafty rooms: causes and fixes')],
  infrared: [T('thermal-imaging', 'The infrared scan: what it finds'), L('walls', 'Walls: insulation and thermal bridges')],
  ducts: [T('duct-leakage', 'Duct leakage testing'), I('cold-second-floor', 'A second floor that is too hot or cold')],
  combustion: [T('combustion-safety', 'Combustion safety testing'), T('carbon-monoxide', 'Carbon monoxide: alarms and testing')],
  co: [T('carbon-monoxide', 'Carbon monoxide: alarms and testing'), P('co-alarms', 'CO alarms worth buying')],
  attic: [T('attic-inspection', 'Attic and insulation inspection'), L('roofs-attics', 'Roofs and attics')],
  walls: [L('walls', 'Walls'), T('thermal-imaging', 'The infrared scan')],
  windows: [L('windows-doors', 'Windows and doors')],
  moisture: [L('moisture-control', 'Moisture and humidity'), I('condensation-mould', 'Condensation and mould'), T('mold-iaq', 'Mould and indoor air testing')],
  basement: [L('foundations-basements', 'Foundations and basements'), I('cold-basement', 'A cold basement')],
  iceDam: [I('ice-dams', 'Ice dams: causes and fixes'), L('roofs-attics', 'Roofs and attics')],
  vermiculite: [T('asbestos-vermiculite', 'Asbestos and vermiculite testing')],
  heatPumps: [
    { ca: '/ca/heat-pumps/', us: '/us/heat-pumps/', label: 'Heat pump comparison guide' },
    L('heating-systems', 'Heating systems compared'),
    I('switching-to-heat-pump', 'Switching to a heat pump'),
  ],
  geothermal: [{ ca: '/ca/heat-pumps/geothermal/', us: '/us/heat-pumps/geothermal/', label: 'Geothermal and other heat pump types' }],
  heating: [L('heating-systems', 'Heating systems compared'), L('hvac-maintenance', 'HVAC maintenance')],
  sizing: [T('heat-loss-calc', 'Sizing heating and cooling: the load calculation')],
  filters: [P('air-purifiers', 'Air purifiers and filters'), L('hvac-maintenance', 'HVAC maintenance')],
  ventilation: [L('hrv-erv', 'HRVs and ERVs'), L('ventilation', 'Ventilation'), { ca: '/ca/tests/ventilation-assessment/', label: 'Ventilation and humidity assessment' }],
  dehumid: [P('dehumidifiers-hygrometers', 'Dehumidifiers and hygrometers'), L('moisture-control', 'Moisture and humidity')],
  thermostats: [L('thermostats', 'Thermostats and setbacks')],
  water: [L('water-heaters', 'Water heaters compared')],
  bills: [T('bill-analysis', 'Utility bill analysis'), { ca: '/ca/calculators/energy-costs/', label: 'Energy cost calculator' }],
  baseload: [T('bill-analysis', 'Utility bill analysis'), { ca: '/ca/calculators/appliance-energy/', label: 'Appliance cost calculator' }],
  climate: [{ ca: '/ca/cities/', us: '/us/cities/', label: 'Climate and programs city by city' }, T('heat-loss-calc', 'How climate sets equipment size')],
  energuide: [L('energuide-ratings', 'EnerGuide ratings explained'), L('previous-audit', 'Had an audit before?')],
  hers: [{ us: '/us/how-it-works/', label: 'How a home energy audit works' }, { us: '/us/programs/home-energy-score/', label: 'Home Energy Score' }],
  hes: [{ us: '/us/programs/home-energy-score/', label: 'Home Energy Score' }],
  ratings: [{ ca: '/ca/heat-pumps/', us: '/us/heat-pumps/', label: 'Heat pump comparison guide' }],
  payback: [{ ca: '/ca/calculators/upgrade-payback/', label: 'Upgrade payback calculator' }, { ca: '/ca/learn/real-numbers/', label: 'What upgrades really save: worked examples' }],
  radon: [T('radon', 'Radon testing and fixes'), P('radon-monitors', 'Radon monitors and kits')],
  iaq: [T('mold-iaq', 'Mould and indoor air quality'), P('air-quality-monitors', 'Air quality monitors'), P('air-purifiers', 'Air purifiers')],
  asbestos: [T('asbestos-vermiculite', 'Asbestos and vermiculite testing')],
  lead: [T('lead-paint', 'Lead paint testing')],
  well: [T('well-water', 'Well water testing'), P('water-testing', 'Water test kits')],
  advisors: [
    { ca: '/ca/how-it-works/', label: 'How an EnerGuide evaluation works' },
    { ca: '/ca/find/', label: 'Find an energy advisor' },
    L('energuide-ratings', 'EnerGuide ratings explained'),
  ],
  cghap: [{ ca: '/ca/programs/canada-greener-homes-affordability-program/', label: 'Canada Greener Homes Affordability Program' }],
  hrsp: [
    { ca: '/ca/programs/home-renovation-savings-assessment/', label: 'Home Renovation Savings: assessment stream' },
    { ca: '/ca/programs/home-renovation-savings-direct/', label: 'Home Renovation Savings: direct rebates' },
  ],
  greenerGrant: [{ ca: '/ca/programs/canada-greener-homes-grant/', label: 'Canada Greener Homes Grant (closed)' }],
  greenerLoan: [{ ca: '/ca/programs/canada-greener-homes-loan/', label: 'Canada Greener Homes Loan (closed)' }],
  ohpa: [{ ca: '/ca/programs/oil-to-heat-pump-affordability/', label: 'Oil to Heat Pump Affordability' }],
  usRebates: [
    { us: '/us/programs/home-energy-rebates/', label: 'Federal home energy rebates (HOMES and HEEHR)' },
    { us: '/us/programs/states/', label: 'Home energy rebates by state' },
  ],
  usCredits: [{ us: '/us/programs/federal-tax-credits/', label: 'Federal tax credits: what ended and when' }],
  wap: [{ us: '/us/programs/weatherization-assistance-program/', label: 'Weatherization Assistance Program' }],
  usAuditors: [{ us: '/us/find/', label: 'How to find a certified auditor' }, { us: '/us/how-it-works/', label: 'How a home energy audit works' }],
  programs: [{ ca: '/ca/programs/', us: '/us/programs/', label: 'Rebates and programs' }],
  financing: [
    { ca: '/ca/programs/toronto-home-energy-loan-program/', label: 'Toronto Home Energy Loan Program' },
    { ca: '/ca/programs/alberta-clean-energy-improvement-program/', label: 'Alberta Clean Energy Improvement Program' },
    { us: '/us/programs/', label: 'Rebates, credits and financing' },
  ],
} satisfies Record<string, PageRef[]>;

const SLUG_PAGES: Record<string, (keyof typeof PAGES)[]> = {
  'home-energy-audit': ['audit'],
  'blower-door-test': ['blower'], ach50: ['blower'], cfm50: ['blower'], 'pascal-50-pa': ['blower'], 'air-leakage': ['blower'],
  'air-sealing': ['blower'], 'stack-effect': ['blower'], depressurization: ['blower', 'combustion'],
  'infrared-thermal-imaging': ['infrared'], 'thermal-bridging': ['infrared'],
  'duct-leakage-test': ['ducts'], 'leakage-to-outside': ['ducts'],
  'combustion-safety-test': ['combustion'], 'combustion-appliance-zone': ['combustion'], 'backdrafting-spillage': ['combustion'],
  'worst-case-depressurization': ['combustion'], draft: ['combustion'], 'carbon-monoxide': ['co'], ppm: ['co'],
  'building-envelope': ['attic', 'walls'], 'r-value': ['attic', 'walls'], rsi: ['attic', 'walls'],
  'u-factor': ['windows'], shgc: ['windows'], 'energy-rating-er': ['windows'], 'low-e-glass': ['windows'],
  'continuous-insulation': ['walls'], 'air-barrier': ['blower'], 'vapour-barrier': ['moisture'], 'dew-point': ['moisture'],
  'relative-humidity': ['moisture', 'dehumid'], condensation: ['moisture'], 'rim-joist': ['basement'], 'knee-wall': ['attic'],
  'attic-bypass': ['attic'], 'soffit-vent-baffle': ['attic'], 'ice-dam': ['iceDam'], 'blown-in-insulation': ['attic'],
  'spray-foam': ['attic', 'basement'], 'rigid-foam': ['walls', 'basement'], vermiculite: ['vermiculite'], rainscreen: ['walls', 'moisture'],
  'radiant-barrier': ['attic'],
  'heat-pump': ['heatPumps'], 'air-source-heat-pump': ['heatPumps'], 'cold-climate-heat-pump': ['heatPumps'],
  'ground-source-heat-pump': ['geothermal'], 'ductless-mini-split': ['heatPumps'], 'ducted-heat-pump': ['heatPumps'],
  cop: ['ratings'], hspf: ['ratings'], seer: ['ratings'], eer: ['ratings'], 'ahri-certificate': ['ratings'], 'cee-tiers': ['ratings'],
  'energy-star': ['ratings'], 'energy-star-most-efficient': ['ratings'],
  afue: ['heating'], 'condensing-furnace': ['heating'], 'electric-resistance-heat': ['heating'],
  btu: ['sizing'], ton: ['sizing'], 'load-calculation': ['sizing'], 'heat-loss-calculation': ['sizing'], 'design-temperature': ['sizing'],
  'balance-point': ['heatPumps'], 'auxiliary-heat': ['heatPumps'], 'dual-fuel': ['heatPumps'], 'variable-speed-compressor': ['heatPumps'],
  'short-cycling': ['sizing'], oversizing: ['sizing'], merv: ['filters'], hrv: ['ventilation'], erv: ['ventilation'],
  dehumidifier: ['dehumid'], 'make-up-air': ['ventilation'], zoning: ['thermostats'], 'smart-thermostat': ['thermostats'], setback: ['thermostats'],
  'heat-pump-water-heater': ['water'], 'tankless-water-heater': ['water'], uef: ['water'], 'drain-water-heat-recovery': ['water'],
  kwh: ['bills'], therm: ['bills'], gigajoule: ['bills'], 'cubic-metre-gas': ['bills'], 'time-of-use-pricing': ['bills'], baseload: ['baseload'],
  'heating-degree-days': ['climate'], 'cooling-degree-days': ['climate'], 'energy-use-intensity': ['bills'],
  'energuide-rating': ['energuide'], 'hers-index': ['hers'], 'home-energy-score': ['hes'], 'net-zero-home': ['energuide'],
  'simple-payback': ['payback'], 'return-on-investment': ['payback'], 'lifecycle-cost': ['payback'],
  radon: ['radon'], 'radon-units': ['radon'], 'radon-mitigation': ['radon'], 'radon-test': ['radon'],
  mould: ['iaq', 'moisture'], 'indoor-air-quality': ['iaq'], vocs: ['iaq'], pm25: ['iaq'], asbestos: ['asbestos'], 'lead-paint': ['lead'],
  'well-water-testing': ['well'], 'coliform-bacteria': ['well'],
  nrcan: ['advisors'], eccc: ['climate'], 'registered-energy-advisor': ['advisors'], 'service-organization': ['advisors'],
  'pre-post-retrofit-evaluation': ['advisors'], hot2000: ['energuide'], 'renovation-upgrade-report': ['energuide'],
  cghap: ['cghap'], hrsp: ['hrsp'], 'canada-greener-homes-grant': ['greenerGrant'], 'canada-greener-homes-loan': ['greenerLoan'], ohpa: ['ohpa'],
  heehr: ['usRebates'], 'homes-rebate': ['usRebates'], 'inflation-reduction-act': ['usRebates', 'usCredits'], obbba: ['usCredits'],
  'tax-credit-25c': ['usCredits'], 'tax-credit-25d': ['usCredits'], 'weatherization-assistance-program': ['wap'],
  'bpi-certification': ['usAuditors'], 'resnet-hers-rater': ['usAuditors', 'hers'], 'utility-rebate': ['programs'],
  'on-bill-financing': ['financing'], 'pace-financing': ['financing'], 'area-median-income': ['usRebates'],
  'iecc-climate-zone': ['climate'], 'nbc-climate-zone': ['climate'], 'heating-vs-cooling-dominated-climate': ['climate'],
  'hot-humid-climate': ['climate'], 'marine-climate': ['climate'],
};

function relatedPages(e: GlossaryEntry, c: Country) {
  const seen = new Set<string>();
  const out: { label: string; href: string }[] = [];
  for (const key of SLUG_PAGES[e.slug] ?? []) {
    for (const p of PAGES[key] as PageRef[]) {
      const href = p[c];
      if (!href || seen.has(href)) continue;
      seen.add(href);
      out.push({ href, label: localize(c === 'us' && p.labelUs ? p.labelUs : p.label, c) });
    }
  }
  return out.slice(0, 5);
}

function sourceLabel(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface GlossaryView {
  slug: string;
  path: string;
  term: string;
  short: string;
  body: string;
  why: string;
  note: string | null;
  aka: string[];
  category: string;
  categoryLabel: string;
  values: { label: string; value: string; source?: string; sourceLabel?: string }[];
  related: { term: string; href: string; short: string }[];
  pages: { label: string; href: string }[];
  sources: { href: string; label: string }[];
}

export function viewFor(e: GlossaryEntry, c: Country): GlossaryView {
  const term = termFor(e, c);
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const seenAka = new Set([term, ...term.split(/\s*\/\s*|\s*[()]\s*/)].map(norm).filter(Boolean));
  const aka = ((c === 'us' ? e.akaUs : e.akaCa) ?? e.aka)
    .map((a) => localize(a, c))
    .filter((a) => {
      const k = norm(a);
      if (!k || seenAka.has(k) || /^(?:[A-Z][a-z]?)$/.test(a)) return false;
      seenAka.add(k);
      return true;
    });
  return {
    slug: e.slug,
    path: hrefFor(e, c),
    term,
    short: shortFor(e, c),
    body: bodyFor(e, c),
    why: whyFor(e, c),
    note: (c === 'us' ? e.usNote : e.caNote) ?? null,
    aka: aka.slice(0, 6),
    category: e.category,
    categoryLabel: CATEGORY_LABEL[e.category] ?? e.category,
    values: e.values
      .filter((v) => !v.countries || v.countries.includes(c))
      .map((v) => ({
        label: localize(v.label, c),
        value: localize(v.value, c),
        source: v.source,
        sourceLabel: v.source ? sourceLabel(v.source) : undefined,
      })),
    related: e.related
      .map((s) => glossaryEntry(s))
      .filter((r): r is GlossaryEntry => !!r && r.countries.includes(c))
      .map((r) => ({ term: termFor(r, c), href: hrefFor(r, c), short: shortFor(r, c) })),
    pages: relatedPages(e, c),
    sources: e.sources.map((href) => ({ href, label: sourceLabel(href) })),
  };
}

/** SEO title "What is <term>? <paraphrase> | AuditYourHome", kept near 65 characters. */
export function seoTitle(v: GlossaryView) {
  const { lead, paren, parenIsAcronym, acronym } = questionParts(v.term);
  const para = acronym && paren && !parenIsAcronym && !/\s(?:and|vs)\s/.test(paren) ? paren.charAt(0).toUpperCase() + paren.slice(1) : null;
  const brand = ' | AuditYourHome';
  const opts = [
    para ? `${lead} ${para}${brand}` : null,
    `${lead} Meaning and why it matters${brand}`,
    `${lead} Explained${brand}`,
    `${lead}${brand}`,
  ].filter((o): o is string => !!o);
  return opts.find((o) => o.length <= 65) ?? opts[opts.length - 1];
}

/** Data public/gl.js needs to link terms inside content rendered in the browser (planner, calculators). */
export function runtimeData(c: Country) {
  return {
    c,
    terms: runtimePatterns(GLOSSARY, c).map((p: { g: string; ci?: string[]; cs?: string[]; re?: string[] }) => {
      const e = bySlugMap.get(p.g)!;
      return { ...p, t: termFor(e, c), s: shortFor(e, c), h: hrefFor(e, c), q: questionFor(e, c) };
    }),
  };
}
