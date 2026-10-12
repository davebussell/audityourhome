/**
 * Area pages: county and regional guides for the towns and hamlets around the cities we cover.
 *
 * Data is generated offline (tools/areas/gen_areas.py) into src/data/areas/:
 *   index.json     — area list, services and community names (small; imported)
 *   <slug>.json    — full area payload incl. the hub and all six service pages (read from disk at build time)
 */
import fs from 'node:fs';
import path from 'node:path';
import indexJson from '../data/areas/index.json';
import type { KV, LinkItem, SourceItem, ProgramItem, EraShares } from './local';

export interface AreaProviderItem {
  name: string;
  phone: string | null;
  towns: string[];
  allTowns: boolean;
  profile: string | null;
  hrs: boolean;
  gcc: boolean;
}

export interface AreaProviders {
  key: string;
  towns: string[];
  fsas: string[];
  items: AreaProviderItem[];
  count: number;
  heading: string;
  note: string;
}

export interface AreaMunicipality {
  csd: string;
  name: string;
  label: string;
  type: string;
  pop: number;
  dwellings?: number;
  occupied?: number;
  communities: string[];
}

export interface AreaStats {
  pop: number;
  popChangePct: number | null;
  dwellings: number;
  occupied: number;
  notOccupiedPct: number | null;
  landKm2: number;
  houses: number;
  households: number;
  pre1961Pct: number;
  pre1991Pct: number;
  since2001Pct: number;
  singleDetachedPct: number;
  era: EraShares;
  medianPeriod: string;
}

export interface AreaPage {
  service: string;
  area: string;
  h1: string;
  kicker: string;
  title: string;
  description: string;
  lede: string;
  glance: KV[];
  sections: { h2: string; html: string }[];
  providers: AreaProviders | null;
  providersSection?: AreaProviders | null;
  programs: { heading: string; items: ProgramItem[] } | null;
  faq: { q: string; a: string }[];
  snapshot: KV[];
  related: LinkItem[];
  sources: SourceItem[];
}

export interface AreaService {
  slug: string;
  name: string;
  short: string;
  cat: 'energy' | 'health' | string;
  guide: string;
  guideLabel: string;
  hub: string | null;
  blurb: string;
  photo: string;
}

export interface Area {
  slug: string;
  name: string;
  inName: string;
  prov: string;
  provName: string;
  provSlug: string;
  kind: string;
  scope: string;
  leadRegion: string;
  photo: string;
  titleNames: string[];
  titleName: string;
  stats: AreaStats;
  municipalities: AreaMunicipality[];
  section: { key: string; name: string; aliases?: string[]; stats: AreaStats; municipalities: AreaMunicipality[] } | null;
  nearbyGroup: { label: string; healthUnit: string; municipalities: AreaMunicipality[] } | null;
  coveredCities: { slug: string; name: string; why: string; communities: string[]; pop: number }[];
  nearbyCities: { slug: string; name: string }[];
  sitePages: LinkItem[];
  articles: LinkItem[];
  communityCount: number;
  portrait: { hdd: number; designHeat: number; station: string; stationKm: number; source: string };
  hub: {
    h1: string;
    title: string;
    description: string;
    lede: string;
    cards: { eyebrow: string; text: string }[];
    facts: KV[];
    services: { slug: string; name: string; cat: string; metric: string; photo: string }[];
    programs: ProgramItem[];
    sources: SourceItem[];
  };
  pages: Record<string, AreaPage>;
  services: AreaService[];
  checked: string;
  checkedISO: string;
}

export interface AreaIndexEntry {
  slug: string;
  name: string;
  inName: string;
  prov: string;
  provName: string;
  kind: string;
  pop: number;
  municipalities: number;
  communityCount: number;
  titleNames: string[];
  photo: string;
  communities: string[];
  coveredCities: { slug: string; name: string; communities: string[] }[];
  nearby: { name: string; communities: string[] }[];
}

export interface AreaIndex {
  checked: string;
  checkedISO: string;
  areas: AreaIndexEntry[];
  services: Omit<AreaService, 'hub' | 'photo'>[];
}

export const areaIndex = indexJson as unknown as AreaIndex;

const DIR = path.join(process.cwd(), 'src', 'data', 'areas');
const cache = new Map<string, Area>();

export function loadArea(slug: string): Area {
  let a = cache.get(slug);
  if (!a) {
    a = JSON.parse(fs.readFileSync(path.join(DIR, `${slug}.json`), 'utf8')) as Area;
    cache.set(slug, a);
  }
  return a;
}

/** LeadForm area value: the matching Ontario region (src/data/regions.json), else 'other-ontario' / 'bc'. */
export function leadArea(a: { leadRegion: string }) {
  return a.leadRegion;
}

export function fmt(n: number) {
  return n.toLocaleString('en-CA');
}
