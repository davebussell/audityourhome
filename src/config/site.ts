/**
 * Central site configuration.
 * Swap brand, contact, or form endpoint here — nothing else needs editing.
 */
export const SITE = {
  name: 'AuditYourHome',
  domain: 'audityourhome.com',
  url: 'https://audityourhome.com',
  tagline: 'Find a certified home energy auditor. Verified credentials, real prices, live rebates.',
  description:
    'AuditYourHome helps Ontario homeowners find NRCan-registered energy advisors, compare real prices, and see which rebates — like the $600 Home Renovation Savings assessment rebate — are actually live right now.',
  contactEmail: 'hello@audityourhome.com',

  /**
   * Lead form endpoint (Formspree, Basin, Netlify Forms action URL, or your own API).
   * Leave empty to fall back to a mailto: link so the form never dead-ends.
   */
  formEndpoint: '',

  /** Stamped across program pages — update whenever program data is re-verified. */
  dataReviewDate: 'September 18, 2026',
  dataReviewDateISO: '2026-09-18',

  /** v1 scope */
  launchRegion: 'Ontario',
} as const;

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
