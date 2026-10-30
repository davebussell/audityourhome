import accountsJson from './accounts.json';
import type { Country } from '../lib/country';

/**
 * Central site configuration.
 *
 * Two sites are built from this one codebase (since 2026-10-30): audityourhome.ca is the Canadian
 * site and audityourhome.com the US site, both AuditYourHome. `SITE` is the Canadian configuration
 * (and the operator's details, shared by both); `SITES` has both, and `siteFor(country)` picks the
 * right one for a page. Swap brand, contact, or form endpoint here.
 */
export const SITE = {
  name: 'AuditYourHome',
  domain: 'audityourhome.ca',
  url: 'https://audityourhome.ca',
  tagline: 'Find a certified home energy auditor. Verified credentials, real prices, live rebates.',
  description:
    'AuditYourHome helps Canadian homeowners find NRCan-registered energy advisors, compare real prices, and see which rebates are actually live right now — province by province, from Ontario\'s Home Renovation Savings to BC\'s Improvement Bonus and Efficiency Manitoba.',
  /**
   * audityourhome.com has NO MX records (checked 25 Sep 2026), so any
   * @audityourhome.com address silently fails. Leads and advisor applications
   * route to Dave's working Google Workspace inbox until domain email exists.
   */
  contactEmail: 'dave@clickshift.ca',

  /**
   * Lead form endpoint (Formspree, Basin, Netlify Forms action URL, or your own API).
   * Leave empty to fall back to a mailto: link so the form never dead-ends.
   */
  formEndpoint: '',

  /** Stamped across program pages — update whenever program data is re-verified. */
  dataReviewDate: 'October 2, 2026',
  dataReviewDateISO: '2026-10-02',

  /** v1 scope */
  launchRegion: 'Ontario',
} as const;

export interface SiteInfo {
  /** Brand as written (no space), e.g. in og:site_name and the wordmark */
  name: string;
  domain: string;
  /** Origin without a trailing slash */
  url: string;
  tagline: string;
  description: string;
  /** Short line for the "other site" banner and the country switcher */
  blurb: string;
}

/** One brand and domain per country. The Canadian entry mirrors `SITE`. */
export const SITES: Record<Country, SiteInfo> = {
  ca: {
    name: SITE.name,
    domain: SITE.domain,
    url: SITE.url,
    tagline: SITE.tagline,
    description: SITE.description,
    blurb: 'NRCan-registered energy advisors, EnerGuide evaluations and live provincial and federal rebates.',
  },
  us: {
    name: 'AuditYourHome',
    domain: 'audityourhome.com',
    url: 'https://audityourhome.com',
    tagline: 'Find a certified home energy auditor. Verified credentials, real prices, live rebates and tax credits.',
    description:
      'AuditYourHome helps US homeowners find HERS raters and BPI professionals, see what a home energy audit costs, and check which rebates, tax credits and utility programs are open right now, metro by metro.',
    blurb: 'HERS raters and BPI professionals, audit costs and the rebates, tax credits and utility programs open in your state.',
  },
};

/** The site a page belongs to. Pages outside both country trees (none since 2026-10-29) count as Canadian. */
export const siteFor = (country: Country | null | undefined): SiteInfo => SITES[country ?? 'ca'];

/** Absolute URL on a country's site for a root-form path like `/tests/radon/`. */
export const siteUrl = (country: Country | null | undefined, path = '/'): string => `${siteFor(country).url}${path}`;

/**
 * Free homeowner accounts (sign-in, My Home, alerts, matching) on Supabase.
 * Values live in ./accounts.json (also read by astro.config.mjs). Local testing
 * can override them with PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_KEY.
 */
export const ACCOUNTS = {
  supabaseUrl: (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) || accountsJson.supabaseUrl || '',
  supabaseKey: (import.meta.env.PUBLIC_SUPABASE_KEY as string | undefined) || accountsJson.supabaseKey || '',
  /** CASL: every alert email and sign-up names the sender with a mailing address. */
  sender: 'AuditYourHome, operated by Click Shift Marketing',
  mailingAddress: accountsJson.mailingAddress || '',
};

export const ACCOUNTS_ENABLED = Boolean(ACCOUNTS.supabaseUrl && ACCOUNTS.supabaseKey);

/**
 * Amazon Associates configuration.
 * amazonTagUS: Dave's account-wide Associates (US) tracking ID. To report this
 * site's earnings separately, create an audityourhome-specific tracking ID in
 * Associates Central and swap it here.
 * amazonTagCA: null until the separate amazon.ca Associates application is
 * approved — .ca links render untagged in the meantime and pick up the tag
 * the moment it's filled in.
 */
export const AFFILIATE = {
  amazonTagUS: 'clickshift-20' as string | null,
  amazonTagCA: null as string | null,
};

export const HAS_AFFILIATE = Boolean(AFFILIATE.amazonTagUS || AFFILIATE.amazonTagCA);
