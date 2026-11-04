/**
 * audityourbuilding.com: the third site built from this codebase (since 2026-11-04). It is the commercial and
 * multi-unit side of AuditYourHome: ASHRAE audit levels, reporting rules and incentives for buildings, city by city.
 * Its pages live under src/pages/bu/ and are published at the root of its own domain (tools/country/postbuild.mjs
 * splits dist/bu/ into dist-bu/), so every link in the source is root form, as on the other two sites.
 */
import { SITE } from './site';

export const BUILDING = {
  name: 'AuditYourBuilding',
  domain: 'audityourbuilding.com',
  url: 'https://audityourbuilding.com',
  tagline: 'Energy audits for commercial and multi-unit buildings: audit levels, reporting rules and incentives, city by city.',
  description:
    'AuditYourBuilding helps owners and managers of commercial, institutional, industrial and multi-unit residential buildings in Canada understand ASHRAE audit levels, the energy reporting rules that apply in their city, and the incentives that pay for audits and studies.',
  contactEmail: SITE.contactEmail,
  /** The Netlify project this site is published from (postbuild checks it against SITE_NAME on Netlify builds). */
  netlify: 'audityourbuilding',
  /** The residential sister sites: where a house or a single condo unit belongs. */
  homeCa: { name: 'AuditYourHome.ca', url: 'https://audityourhome.ca' },
  homeUs: { name: 'AuditYourHome.com', url: 'https://audityourhome.com' },
} as const;

/**
 * Address of a page on audityourbuilding.com, for links from the residential sites (audityourhome.ca / .com),
 * which keep only a pointer to the commercial and multi-unit content that moved here on 2026-11-04.
 * Pass the root-form path the page is published at: `buildingUrl('/commercial-energy-audit/toronto/')`.
 */
export const buildingUrl = (path = '/'): string => `${BUILDING.url}${path}`;

/** The path a building-site page is published at: its build path without the /bu prefix (`/bu/audit-levels/` → `/audit-levels/`). */
export function buildingPath(pathname: string): string {
  const m = pathname.match(/^\/bu(\/.*)?$/);
  return m ? m[1] || '/' : pathname;
}

export const isBuildingPage = (pathname: string): boolean => pathname === '/bu' || pathname.startsWith('/bu/');
