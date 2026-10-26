/**
 * Regional climate profiles: what homes in each climate need from an energy audit.
 *
 * Data: src/data/climate/us.json (9 profiles, 26 metros) and src/data/climate/ca.json (7 profiles,
 * 11 provinces/territories, 70 cities), written from sourced research (NOAA, ECCC, NRC/NBC, PNNL,
 * EPA, Health Canada, ENERGY STAR, NRCan and others; every profile and place carries its sources).
 * Checked 2026-10-26.
 *
 * Use placeClimate() on metro and city pages, provinceClimate() on province pages, and
 * climateMeaning() for one-line "what this means for your house" notes next to climate numbers.
 */
import usData from '../data/climate/us.json';
import caData from '../data/climate/ca.json';

export type Country = 'ca' | 'us';

export interface Source { label: string; url: string }
export interface Priority { title: string; why: string; ask: string; tests: string[] }
export interface ProfileTest { test: string; why: string; when: string }
export interface Upgrade { title: string; why: string; note?: string }
export interface Avoid { title: string; why: string }

export interface ClimateProfile {
  key: string;
  label: string;
  regionName: string;
  places: string[];
  provinces?: string[];
  oneLiner: string;
  summary: string;
  drivers: string[];
  priorities: Priority[];
  tests: ProfileTest[];
  upgrades: Upgrade[];
  equipment: string[];
  health: string[];
  avoid: Avoid[];
  symptoms: string[];
  seasonNote: string;
  sources: Source[];
}

export interface PlaceClimate {
  profile: string;
  note?: string;
  hazards?: string[];
  summerCooling?: 'low' | 'moderate' | 'high';
  smoke?: boolean;
  iceDams?: boolean;
  sources?: Source[];
}

export interface ProvinceClimate {
  profiles: string[];
  note?: string;
  radon?: string;
  sources?: Source[];
}

interface CountryData {
  checked: string;
  profiles: Record<string, ClimateProfile>;
  places: Record<string, PlaceClimate>;
  provinces?: Record<string, ProvinceClimate>;
}

const DATA: Record<Country, CountryData> = {
  us: usData as unknown as CountryData,
  ca: caData as unknown as CountryData,
};

export const CLIMATE_CHECKED = { us: DATA.us.checked, ca: DATA.ca.checked };

export const profiles = (c: Country): ClimateProfile[] => Object.values(DATA[c].profiles);
export const profile = (c: Country, key: string): ClimateProfile | undefined => DATA[c].profiles[key];

/** Climate profile and place-specific notes for a US metro slug or a Canadian city slug. */
export function placeClimate(c: Country, slug: string): { place: PlaceClimate; profile: ClimateProfile } | null {
  const place = DATA[c].places[slug];
  if (!place) return null;
  const p = DATA[c].profiles[place.profile];
  return p ? { place, profile: p } : null;
}

/** Canadian province/territory slug (bc, alberta, north, ...) → its note, radon line and profiles. */
export function provinceClimate(slug: string): (ProvinceClimate & { profileList: ClimateProfile[] }) | null {
  const pc = DATA.ca.provinces?.[slug];
  if (!pc) return null;
  return { ...pc, profileList: pc.profiles.map((k) => DATA.ca.profiles[k]).filter(Boolean) };
}

/** Cities (slugs) in a province that fall in a given profile. */
export function citiesInProfile(key: string): string[] {
  return DATA.ca.profiles[key]?.places ?? [];
}

// ------------------------------------------------------------------ tests

const TEST_NAME: Record<string, string | { ca: string; us: string }> = {
  'blower-door': 'Blower door test',
  'thermal-imaging': 'Infrared (thermal) scan',
  'duct-leakage': 'Duct leakage test',
  'combustion-safety': 'Combustion safety test',
  'carbon-monoxide': 'Carbon monoxide check',
  'attic-inspection': 'Attic inspection',
  'heat-loss-calc': { ca: 'Heat-loss calculation', us: 'Manual J load calculation' },
  'bill-analysis': 'Energy bill analysis',
  radon: 'Radon test',
  'mold-iaq': { ca: 'Mould and humidity check', us: 'Mold and humidity check' },
  'asbestos-vermiculite': 'Asbestos and vermiculite check',
  'lead-paint': 'Lead paint test',
  'well-water': 'Well water test',
  'ventilation-assessment': 'Ventilation assessment',
  'wood-burning-inspection': 'Wood stove inspection',
};
/** Test guide pages that exist in each country. */
const TEST_PAGES: Record<Country, Set<string>> = {
  ca: new Set(['blower-door', 'thermal-imaging', 'duct-leakage', 'combustion-safety', 'carbon-monoxide', 'attic-inspection',
    'heat-loss-calc', 'bill-analysis', 'radon', 'mold-iaq', 'asbestos-vermiculite', 'lead-paint', 'well-water',
    'ventilation-assessment', 'wood-burning-inspection']),
  us: new Set(['blower-door', 'thermal-imaging', 'duct-leakage', 'combustion-safety', 'carbon-monoxide', 'attic-inspection',
    'heat-loss-calc', 'bill-analysis', 'radon', 'mold-iaq', 'asbestos-vermiculite', 'lead-paint', 'well-water']),
};
export function testName(c: Country, slug: string): string {
  const n = TEST_NAME[slug];
  if (!n) return slug.replace(/-/g, ' ');
  return typeof n === 'string' ? n : n[c];
}
export const testHref = (c: Country, slug: string): string | null => (TEST_PAGES[c].has(slug) ? `/${c}/tests/${slug}/` : null);

/** CA local service page slug for a test slug (the city-level pages under /ca/services/<service>/<city>/). */
export const CA_SERVICE_FOR_TEST: Record<string, string> = {
  'blower-door': 'blower-door-test',
  'thermal-imaging': 'thermal-imaging',
  'duct-leakage': 'duct-leakage-testing',
  'combustion-safety': 'combustion-safety-test',
  'carbon-monoxide': 'carbon-monoxide-testing',
  'attic-inspection': 'attic-insulation-inspection',
  'heat-loss-calc': 'heat-loss-calculation',
  'bill-analysis': 'energy-bill-analysis',
  radon: 'radon-testing',
  'mold-iaq': 'mold-testing',
  'asbestos-vermiculite': 'asbestos-testing',
  'lead-paint': 'lead-paint-testing',
  'well-water': 'well-water-testing',
  'ventilation-assessment': 'ventilation-assessment',
};
export const TEST_FOR_CA_SERVICE: Record<string, string> = Object.fromEntries(
  Object.entries(CA_SERVICE_FOR_TEST).map(([t, s]) => [s, t]),
);

// ------------------------------------------------------------------ "what this means" lines

/**
 * One plain sentence saying what a place's heating/cooling numbers mean for a house.
 * US: degree days base 65°F. Canada: heating degree-days below 18°C (cooling optional).
 */
export function climateMeaning(c: Country, o: { hdd?: number | null; cdd?: number | null; designTemp?: number | null }): string {
  const hdd = o.hdd ?? null;
  const cdd = o.cdd ?? null;
  if (c === 'us') {
    if (hdd == null || cdd == null) return '';
    if (cdd > hdd * 1.5) return 'Cooling far outweighs heating here: summer bills, humidity and attic heat matter more than winter drafts.';
    if (cdd > hdd) return 'Cooling needs outweigh heating here, so summer comfort and AC efficiency come first, with a short heating season.';
    if (hdd > 5500) return 'Long, cold winters drive the bills here: air sealing, insulation and heating efficiency pay back fastest.';
    if (hdd > 3500 && cdd > 1000) return 'Both seasons count here: real winters and humid summers, so fixes should help heating and cooling.';
    if (hdd > 3500) return 'Heating drives the bills here, with mild summers; leaks and insulation matter most in winter.';
    return 'Mild winters and modest summers: comfort fixes and efficient equipment matter more than big heating savings.';
  }
  if (hdd == null) return '';
  if (hdd < 3000) return 'Mild, wet winters: heating bills are modest, so moisture control and comfort matter as much as cutting heat loss.';
  if (hdd < 4000) return 'A moderate heating season with warm summers: fixes should cut heating bills and keep the house cool.';
  if (hdd < 5000) return 'A long heating season: air sealing and insulation pay back well, and every leak costs money for months.';
  if (hdd < 6000) return 'Cold winters: heating is the biggest energy cost, so stopping leaks and insulating come first.';
  if (hdd < 7000) return 'Very cold winters: heating dominates, and a heat pump needs cold-climate ratings and backup heat.';
  return 'Extreme cold and a very long heating season: envelope work comes first, and heating reliability is a safety issue.';
}
