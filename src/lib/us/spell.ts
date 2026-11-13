/**
 * US spellings for copy that is written once for both home sites (the buying guides). Applied to the text between
 * tags only, so links, ids and attributes are never touched. Canadian program and document names don't use these
 * words in the guides; if one ever does, quote it through a variable and skip this pass for it.
 */
const WORDS: [RegExp, string | ((m: string) => string)][] = [
  [/\bmould(y|s)?\b/g, 'mold$1'],
  [/\bMould(y|s)?\b/g, 'Mold$1'],
  [/\b(kilo|centi|milli)?(lit|met)res?\b/g, (m: string) => m.replace(/re(s?)$/, 'er$1')],
  [/\bcolour(s|ed)?\b/g, 'color$1'],
  [/\bodour(s)?\b/g, 'odor$1'],
  [/\bvapour(s)?\b/g, 'vapor$1'],
  [/\bneutralis(er|ers|e|ed|ing)\b/g, 'neutraliz$1'],
  [/\bsanitis(e|ed|ing)\b/g, 'sanitiz$1'],
];

/** American spellings in a plain string. */
export function usSpell(text: string): string {
  let out = text;
  for (const [re, to] of WORDS) out = typeof to === 'string' ? out.replace(re, to) : out.replace(re, to);
  return out;
}

/** American spellings in the text of an HTML fragment, leaving tags and attributes alone. */
export function usSpellHtml(html: string): string {
  return html.replace(/(^|>)([^<]+)(?=<|$)/g, (_, open: string, text: string) => open + usSpell(text));
}
