import { AFFILIATE } from '../config/site';

/**
 * Amazon links are deliberate SEARCH links (brand + model), not /dp/ ASINs:
 * editions, bundles, and stock rotate per store and per country, and a search
 * for an exact model name stays correct while a hard-coded ASIN goes stale.
 * The tag parameter is appended only when the matching program's tracking ID
 * is configured in src/config/site.ts.
 */
function withTag(base: string, tag: string | null): string {
  return tag ? `${base}&tag=${encodeURIComponent(tag)}` : base;
}

export function amazonCA(query: string): string {
  return withTag(`https://www.amazon.ca/s?k=${encodeURIComponent(query)}`, AFFILIATE.amazonTagCA);
}

export function amazonUS(query: string): string {
  return withTag(`https://www.amazon.com/s?k=${encodeURIComponent(query)}`, AFFILIATE.amazonTagUS);
}
