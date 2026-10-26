/**
 * The site is split by country: Canadian pages live under /ca/, US pages under /us/,
 * and a few global pages (the country chooser, about, privacy, account) at the root.
 */
export type Country = 'ca' | 'us';

export interface CountryInfo {
  code: Country;
  name: string;
  /** short label for the header switcher */
  short: string;
  home: string;
  /** BCP 47 tag for <html lang> and hreflang */
  locale: string;
  /** og:locale */
  ogLocale: string;
}

export const COUNTRIES: Record<Country, CountryInfo> = {
  ca: { code: 'ca', name: 'Canada', short: 'CA', home: '/ca/', locale: 'en-CA', ogLocale: 'en_CA' },
  us: { code: 'us', name: 'United States', short: 'US', home: '/us/', locale: 'en-US', ogLocale: 'en_US' },
};

export function countryOf(pathname: string): Country | null {
  if (pathname === '/ca' || pathname.startsWith('/ca/')) return 'ca';
  if (pathname === '/us' || pathname.startsWith('/us/')) return 'us';
  return null;
}

/** Cookie the switcher and chooser set; Netlify reads it to send "/" to the remembered country. */
export const COUNTRY_COOKIE = { ca: 'ayh_ca', us: 'ayh_us' } as const;
