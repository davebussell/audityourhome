/**
 * Netlify Forms switch. netlify.toml sets FORMS=netlify for builds on Netlify, where form detection
 * is turned on; every other build (GitHub Pages, local) keeps the email fallbacks, so a form never
 * posts somewhere that can't receive it. Submissions are emailed to dave@clickshift.ca by the
 * site's form notification in Netlify (Forms > Submission notifications).
 *
 * Server-side only: import this from component frontmatter, never from a client script.
 */
export const NETLIFY_FORMS = process.env.FORMS === 'netlify' || process.env.HP_FORMS === 'netlify';

/** Netlify form names. Every copy of a form must submit the same field names. */
export const FORM_NAMES = {
  auditRequest: 'audit-request',
  usQuestion: 'us-question',
  heatPumpQuote: 'heat-pump-quote',
} as const;
