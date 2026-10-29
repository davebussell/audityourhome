import { SITE, siteFor } from '../config/site';
import type { Provider, Region } from './data';
import type { Country } from './country';

/**
 * JSON-LD helpers. Page addresses are given in root form (`/tests/radon/`); Base.astro turns them
 * into absolute URLs on the page's own site with absolutize(), so the same helper serves both
 * audityourhome.com and audityourhouse.com.
 */

/** JSON-LD keys whose values are addresses; only these get the site's origin prefixed. */
const URL_KEYS = new Set(['url', 'item', 'image', 'logo', 'mainEntityOfPage', 'sameAs', '@id', 'contentUrl', 'thumbnailUrl', 'target']);

/** Prefix site-relative paths (string values starting with "/" under an address key) with the site's origin. */
export function absolutize<T>(value: T, origin: string, key: string | null = null): T {
  if (typeof value === 'string') {
    const isPath = key !== null && URL_KEYS.has(key) && value.startsWith('/') && !value.startsWith('//');
    return (isPath ? `${origin}${value}` : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => absolutize(v, origin, key)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = absolutize(v, origin, k);
    return out as T;
  }
  return value;
}

/** The WebSite block on every page: the brand and description of the page's own site. */
export function websiteSchema(country: Country | null = 'ca') {
  const site = siteFor(country);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url,
    description: site.description,
  };
}

export function organizationSchema(country: Country | null = 'ca') {
  const site = siteFor(country);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: site.url,
    email: SITE.contactEmail,
    description: site.tagline,
  };
}

export function providerSchema(p: Provider) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: p.name,
    description: p.profile,
    areaServed: p.serviceNote,
    url: `/providers/${p.slug}/`,
  };
  if (p.website) schema.sameAs = [p.website];
  if (p.phone) schema.telephone = p.phone;
  return schema;
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.path,
    })),
  };
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function cityDirectorySchema(region: Region, providerNames: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Home energy auditors serving ${region.name}`,
    numberOfItems: providerNames.length,
    itemListElement: providerNames.map((name, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
    })),
  };
}

/** A glossary entry (schema.org DefinedTerm) inside the country glossary. */
export function definedTermSchema(t: { name: string; description: string; path: string; setPath: string; setName: string; alternateName?: string[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: t.name,
    description: t.description,
    url: t.path,
    ...(t.alternateName && t.alternateName.length ? { alternateName: t.alternateName } : {}),
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: t.setName, url: t.setPath },
  };
}

/** The glossary index (schema.org DefinedTermSet). */
export function definedTermSetSchema(s: { name: string; description: string; path: string; terms: { name: string; path: string }[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: s.name,
    description: s.description,
    url: s.path,
    hasDefinedTerm: s.terms.map((t) => ({ '@type': 'DefinedTerm', name: t.name, url: t.path })),
  };
}
