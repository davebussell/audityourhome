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
  dataReviewDate: 'August 23, 2026',
  dataReviewDateISO: '2026-08-23',

  /** v1 scope */
  launchRegion: 'Ontario',
} as const;
