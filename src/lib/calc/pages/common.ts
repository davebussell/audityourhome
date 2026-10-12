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

export function otherCalcs(calc: CalcSlug, city: CalcCity) {
  return (Object.keys(CALC_META) as CalcSlug[])
    .filter((c) => c !== calc)
    .map((c) => ({ href: `/calculators/${c}/${city.slug}/`, label: `${CALC_META[c].short} in ${cityName(city)}`, blurb: CALC_META[c].blurb }));
}

/** "about $1,350" style for prose */
export const about = (s: string) => `about ${s}`;
