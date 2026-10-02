/**
 * Local service pages: 70 cities × 16 services.
 *
 * Data is generated offline (svc/gen_pages.py) into src/data/local/:
 *   index.json           — services + per-city summary metrics (small; imported)
 *   cities/<slug>.json   — full city payload incl. all 16 page payloads (read from disk at build
 *                          time so ~10 MB of JSON never lands in the server bundle)
 */
import fs from 'node:fs';
import path from 'node:path';
import indexJson from '../data/local/index.json';

export interface KV { k: string; v: string; sub?: string }
export interface LinkItem { href: string; label: string; km?: number }
export interface SourceItem { href: string; label: string }

export interface EraShares {
  pre1961: number | null;
  y1961to1990: number | null;
  y1991to2000: number | null;
  since2001: number | null;
}

export interface CityFacts {
  hdd: number;
  designHeat: number;
  station: string;
  stationKm: number;
  housesPre1961: number | null;
  housesPre1991: number | null;
  houses: number;
  radonPct: number | null;
  radonRegion: string | null;
  providers: number;
  gas: string | null;
  electricity: string | null;
  wells: string | null;
  era: EraShares;
  singleDetachedPct: number | null;
  medianPeriod: string;
}

export interface LocalService {
  slug: string;
  name: string;
  h1: string;
  cat: 'energy' | 'health' | 'commercial' | string;
  guide: string;
  guideLabel: string;
  blurb: string;
  cost: string;
}

export interface IndexCity {
  slug: string;
  name: string;
  label: string | null;
  prov: string;
  provName: string;
  provSlug: string;
  population: number;
  facts: CityFacts;
  metrics: Record<string, string>;
}

export interface ProviderItem {
  name: string;
  phone: string | null;
  coverage: number;
  profile: string | null;
  hrs: boolean;
  gcc: boolean;
}

export interface ProgramItem {
  name: string;
  href: string;
  summary: string;
  status: string;
  kind: string;
  audit: boolean;
}

export interface LocalPage {
  service: string;
  city: string;
  h1: string;
  kicker: string;
  title: string;
  description: string;
  lede: string;
  glance: KV[];
  sections: { h2: string; html: string }[];
  providers: { heading: string; note: string; special: string | null; items: ProviderItem[]; count?: number } | null;
  programs: { heading: string; items: ProgramItem[] } | null;
  faq: { q: string; a: string }[];
  snapshot: KV[];
  related: LinkItem[];
  nearby: LinkItem[];
  sources: SourceItem[];
}

export interface LocalCity {
  slug: string;
  name: string;
  label: string | null;
  prov: string;
  provName: string;
  provSlug: string;
  population: number;
  onRegion: string | null;
  facts: CityFacts;
  providers: unknown[];
  nearby: { slug: string; name: string; km: number }[];
  municipal: { name: string; href: string; summary: string }[];
  programs: ProgramItem[];
  hub: {
    title: string;
    description: string;
    lede: string;
    climate: string | null;
    housing: string | null;
    heating: string | null;
    radon: string | null;
    services: { slug: string; name: string; cat: string; metric: string }[];
    sources: SourceItem[];
  };
  pages: Record<string, LocalPage>;
}

export interface LocalIndex {
  checked: string;
  checkedISO: string;
  services: LocalService[];
  cities: IndexCity[];
  provinceOrder: string[];
}

export const localIndex = indexJson as unknown as LocalIndex;
export const services = localIndex.services;
export const localCities = localIndex.cities;

const DIR = path.join(process.cwd(), 'src', 'data', 'local', 'cities');
const cache = new Map<string, LocalCity>();

export function loadCity(slug: string): LocalCity {
  let c = cache.get(slug);
  if (!c) {
    c = JSON.parse(fs.readFileSync(path.join(DIR, `${slug}.json`), 'utf8')) as LocalCity;
    cache.set(slug, c);
  }
  return c;
}

export function serviceBySlug(slug: string): LocalService | undefined {
  return services.find((s) => s.slug === slug);
}

export const CAT_LABEL: Record<string, string> = {
  energy: 'Energy',
  health: 'Home health',
  commercial: 'Commercial',
};

/** Cities grouped by province in the site's west-to-east order. */
export function citiesByProvince() {
  const out: { prov: string; provName: string; provSlug: string; cities: IndexCity[] }[] = [];
  for (const code of localIndex.provinceOrder) {
    const list = localCities.filter((c) => c.prov === code).sort((a, b) => b.population - a.population);
    if (list.length) out.push({ prov: code, provName: list[0].provName, provSlug: list[0].provSlug, cities: list });
  }
  return out;
}

/** "Richmond, BC" style label when the plain name is ambiguous. */
export function cityLabel(c: { name: string; label: string | null }) {
  return c.label ?? c.name;
}
