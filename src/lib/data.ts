import programsJson from '../data/programs.json';
import providersJson from '../data/providers.json';
import regionsJson from '../data/regions.json';

export interface ProgramAmount {
  label: string;
  value: string;
}

export interface Program {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  jurisdiction: 'ontario' | 'canada' | 'toronto' | string;
  runBy: string;
  status: 'active' | 'active-limited' | 'closed' | string;
  auditRequired: boolean;
  auditRequirementNote: string;
  headline: string;
  amounts: ProgramAmount[];
  whoQualifies: string;
  officialUrl: string;
  lastVerified: string;
  notes: string;
  /** Optional authority-page fields (provincial + enriched entries) */
  provinceSlug?: string;
  howToApply?: string[];
  gotchas?: string[];
  faq?: { q: string; a: string }[];
  related?: string[];
  sources?: { href: string; label: string }[];
}

export interface ProviderPricing {
  preRetrofit: string;
  postRetrofit: string;
  note: string;
  source: string;
  asOf: string;
}

export interface Provider {
  slug: string;
  name: string;
  type: 'non-profit' | 'company' | 'franchise' | string;
  website: string | null;
  phone: string | null;
  serves: string[];
  serviceNote: string;
  registration: string;
  registrationSource: string;
  scaleClaim: string | null;
  pricing: ProviderPricing | null;
  booking: string;
  profile: string;
  sources: string[];
  checkedOn: string;
  reviewQuery: string;
}

/** Independent review-site links for a provider (search links — no scraped ratings). */
export function reviewLinks(p: Provider) {
  const q = encodeURIComponent(p.reviewQuery);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    homestars: `https://homestars.com/search?search%5Bquery%5D=${q}`,
    bbb: `https://www.bbb.org/search?find_country=CAN&find_text=${q}`,
  };
}

export interface Region {
  slug: string;
  name: string;
  fsaPrefixes: string[];
  intro: string;
}

export const programs = programsJson as Program[];
export const providers = providersJson as Provider[];
export const regions = regionsJson as Region[];

export const activePrograms = programs.filter((p) => p.status === 'active');
export const closedPrograms = programs.filter((p) => p.status === 'closed');

export function providersForRegion(slug: string): Provider[] {
  const list = providers.filter((p) => p.serves.includes(slug));
  // Non-profits and price-transparent providers first — the trust-first sort.
  return list.sort((a, b) => {
    const score = (p: Provider) => (p.pricing ? 2 : 0) + (p.type === 'non-profit' ? 1 : 0);
    return score(b) - score(a);
  });
}

export function regionBySlug(slug: string): Region | undefined {
  return regions.find((r) => r.slug === slug);
}

export function providerBySlug(slug: string): Provider | undefined {
  return providers.find((p) => p.slug === slug);
}

export function programBySlug(slug: string): Program | undefined {
  return programs.find((p) => p.slug === slug);
}

/** Compact payload the client-side eligibility checker embeds. */
export function checkerPayload() {
  return {
    regions: regions.map((r) => ({ slug: r.slug, name: r.name, fsa: r.fsaPrefixes })),
    providerCounts: Object.fromEntries(regions.map((r) => [r.slug, providersForRegion(r.slug).length])),
  };
}
