import { SITE } from '../config/site';
import type { Provider, Region } from './data';

const SITE_DESCRIPTION_US =
  'AuditYourHome helps US homeowners find certified home energy auditors, compare what audits cost and see which utility, state and federal programs are actually open, metro by metro.';
const SITE_DESCRIPTION_GLOBAL =
  'AuditYourHome helps homeowners in Canada and the United States find certified home energy auditors, compare real prices and see which rebates are live.';

/** The WebSite block on every page; its description follows the country section. */
export function websiteSchema(country: 'ca' | 'us' | null = 'ca') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: country === 'us' ? SITE_DESCRIPTION_US : country === 'ca' ? SITE.description : SITE_DESCRIPTION_GLOBAL,
  };
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    email: SITE.contactEmail,
    description: SITE.tagline,
  };
}

export function providerSchema(p: Provider) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: p.name,
    description: p.profile,
    areaServed: p.serviceNote,
    url: `${SITE.url}/ca/providers/${p.slug}/`,
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
      item: `${SITE.url}${item.path}`,
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
