/** Shared pieces for the calculator city pages (build time only). */
import { CALC_META, cityName, type CalcSlug, type CalcCity, SOURCES } from '../data';

export interface Fact { k: string; v: string; s?: string }
export interface Faq { q: string; a: string }
export interface SourceRef { title: string; url: string }

/** The house every "at a glance" table uses. */
export const TYPICAL = { vintage: '1966-1980' as const, type: 'detached' as const, size: 'medium' as const, areaM2: 149, sqftLabel: '1,600', storeys: 2 };
export const TYPICAL_LINE = 'a typical detached house of about 1,600 sq ft (149 m²) built between 1966 and 1980';

export const LEAD_AREA: Record<string, string> = {
  BC: 'bc', AB: 'alberta', SK: 'saskatchewan', MB: 'manitoba', QC: 'quebec', NB: 'new-brunswick',
  NS: 'nova-scotia', PE: 'pei', NL: 'newfoundland-labrador', YT: 'north', NT: 'north',
};

/** The first candidate that fits (titles ≤ 60, descriptions ≤ 160 characters), else the shortest. */
export function fit(cands: string[], max: number): string {
  return cands.find((c) => c.length <= max) ?? [...cands].sort((a, b) => a.length - b.length)[0];
}

export function srcs(ids: string[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const id of ids) {
    const s = SOURCES[id];
    if (!s || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push({ title: s.title, url: s.url });
  }
  return out;
}
export function addSrc(list: SourceRef[], title: string, url: string | null | undefined) {
  if (!url || list.some((x) => x.url === url)) return;
  list.push({ title, url });
}

/** A short, distinct label for a rate document, from its URL ("bchydro electric tariff, PDF"). */
export function docLabel(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    const clean = (x: string) => decodeURIComponent(x).replace(/\.(pdf|html?|aspx?)$/i, '').replace(/[-_]+/g, ' ').trim();
    const last = segs.length ? clean(segs[segs.length - 1]) : '';
    const prev = segs.length > 1 ? clean(segs[segs.length - 2]) : '';
    const name = !last || last.length < 12 ? [prev, last].filter(Boolean).join(', ') : last;
    const pdf = /\.pdf$/i.test(u.pathname) ? ', PDF' : '';
    return `${name || u.hostname.replace(/^www\./, '')}${pdf}`;
  } catch {
    return url;
  }
}
export function addTariffSources(list: SourceRef[], utility: string, urls: string[]) {
  for (const u of urls) addSrc(list, `Electricity rates, ${utility}: ${docLabel(u)}`, u);
}

export const SERVICE_LINKS: Record<CalcSlug, { slug: string; label: string }[]> = {
  'energy-costs': [
    { slug: 'home-energy-audit', label: 'Home energy audits' },
    { slug: 'energy-bill-analysis', label: 'Energy bill analysis' },
    { slug: 'heat-loss-calculation', label: 'Heat loss calculations' },
    { slug: 'combustion-safety-test', label: 'Combustion safety tests' },
  ],
  'upgrade-payback': [
    { slug: 'home-energy-audit', label: 'Home energy audits' },
    { slug: 'attic-insulation-inspection', label: 'Attic insulation inspections' },
    { slug: 'blower-door-test', label: 'Blower door tests' },
    { slug: 'thermal-imaging', label: 'Thermal imaging' },
  ],
  'home-health': [
    { slug: 'radon-testing', label: 'Radon testing' },
    { slug: 'carbon-monoxide-testing', label: 'Carbon monoxide testing' },
    { slug: 'well-water-testing', label: 'Well water testing' },
    { slug: 'mold-testing', label: 'Mould testing' },
    { slug: 'ventilation-assessment', label: 'Ventilation assessments' },
  ],
  'appliance-energy': [
    { slug: 'energy-bill-analysis', label: 'Energy bill analysis' },
    { slug: 'home-energy-audit', label: 'Home energy audits' },
  ],
};

/** One visible line under each calculator that explains its units and terms (HTML, glossary links). */
const g = (slug: string, label: string) => `<a href="/ca/glossary/${slug}/">${label}</a>`;
export const UNITS_LINE: Record<CalcSlug, string> = {
  'energy-costs': `${g('gigajoule', 'GJ')} (gigajoule) measures heat: 1 GJ is about 278 kWh. Natural gas is sold by the ${g('cubic-metre-gas', 'm³')} (cubic metre, about 37.5 MJ or 10.4 kWh of energy), oil and propane by the litre, and electricity by the ${g('kwh', 'kWh')} (1,000 watts for one hour). Seasonal efficiency is the share of the fuel that ends up as heat over a winter; for heat pumps it is the ${g('seasonal-cop', 'seasonal COP')}, the heat delivered per unit of electricity (2.5 means 2.5 kWh of heat for each kWh). Water heaters are rated by ${g('uef', 'UEF')} (uniform energy factor): the higher it is, the less energy each litre of hot water takes.`,
  'upgrade-payback': `Savings are shown in ${g('gigajoule', 'GJ')} of heat (1 GJ is about 278 kWh) and in your fuel's own units: ${g('cubic-metre-gas', 'm³')} of natural gas, litres of oil or propane, or ${g('kwh', 'kWh')} of electricity. ${g('rsi', 'RSI')} is the metric R-value (RSI 1 is about R-5.7), and higher insulates better; a window's ${g('u-factor', 'U-value')} works the other way, lower loses less heat. ${g('ach50', 'ACH50')} is the air leakage a blower-door test measures, and a heat pump's ${g('seasonal-cop', 'seasonal COP')} is the heat it delivers per unit of electricity over a winter.`,
  'home-health': `Radon is measured in ${g('radon-units', 'Bq/m³')} (becquerels per cubic metre); US test kits report pCi/L, and 1 pCi/L is 37 Bq/m³. ${g('relative-humidity', 'Relative humidity')} is how much moisture the air holds compared with the most it could hold at that temperature, and the ${g('dew-point', 'dew point')} is the temperature at which that moisture turns to water on a cold surface. A window's ${g('u-factor', 'U-value')} says how fast it loses heat: the lower it is, the warmer the glass stays and the less it fogs.`,
  'appliance-energy': `Your electricity bill counts ${g('kwh', 'kWh')} (kilowatt-hours): 1,000 watts used for one hour, such as a 100-watt bulb left on for 10 hours. Watts (W) are how fast an appliance draws power, so its kWh a year depend on how many hours it runs. Electric cars are rated in kWh per 100 km. Rated figures come from standard tests, so your own use can differ.`,
};

export function otherCalcs(calc: CalcSlug, city: CalcCity) {
  return (Object.keys(CALC_META) as CalcSlug[])
    .filter((c) => c !== calc)
    .map((c) => ({ href: `/ca/calculators/${c}/${city.slug}/`, label: `${CALC_META[c].short} in ${cityName(city)}`, blurb: CALC_META[c].blurb }));
}

/** "about $1,350" style for prose */
export const about = (s: string) => `about ${s}`;
