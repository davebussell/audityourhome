/**
 * Two sites from one codebase. In the source tree Canadian pages live under src/pages/ca/ and
 * US pages under src/pages/us/, so a page's country is read from its build path; the published
 * sites put each country at the root of its own domain (audityourhome.com for Canada,
 * audityourhouse.com for the US; see tools/country/postbuild.mjs), so every link in the source is
 * written in root form (`/tests/radon/`), never with a country prefix.
 */
export type Country = 'ca' | 'us';

export interface CountryInfo {
  code: Country;
  name: string;
  /** short label for the header switcher */
  short: string;
  /** Home page on this country's own site */
  home: string;
  /** This country's site, without a trailing slash */
  origin: string;
  /** BCP 47 tag for <html lang> and hreflang */
  locale: string;
  /** og:locale */
  ogLocale: string;
}

export const COUNTRIES: Record<Country, CountryInfo> = {
  ca: { code: 'ca', name: 'Canada', short: 'CA', home: '/', origin: 'https://audityourhome.com', locale: 'en-CA', ogLocale: 'en_CA' },
  us: { code: 'us', name: 'United States', short: 'US', home: '/', origin: 'https://audityourhouse.com', locale: 'en-US', ogLocale: 'en_US' },
};

/** Country of a page from its build-time path (`Astro.url.pathname`, e.g. `/ca/tests/radon/`). */
export function countryOf(pathname: string): Country | null {
  if (pathname === '/ca' || pathname.startsWith('/ca/')) return 'ca';
  if (pathname === '/us' || pathname.startsWith('/us/')) return 'us';
  return null;
}

/** The path a page is published at: its build path without the country prefix (`/ca/tests/` → `/tests/`). */
export function publicPath(pathname: string): string {
  const m = pathname.match(/^\/(ca|us)(\/.*)?$/);
  return m ? m[2] || '/' : pathname;
}

/** Absolute published address of a page, from its build-time path. */
export function publicUrl(pathname: string): string {
  const c = countryOf(pathname) ?? 'ca';
  return `${COUNTRIES[c].origin}${publicPath(pathname)}`;
}

/**
 * Cookie that records a visitor's choice of site (set by the country switcher and the "other site"
 * banner). While it is set, the banner stays hidden. Each site sets it for its own domain only.
 */
export const CHOICE_COOKIE = 'ayh_site';
