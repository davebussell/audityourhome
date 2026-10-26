/**
 * State rule lines for the US plans ("In Texas: …") and the /us/tests/ state tables.
 *
 * tests.json writes them in research shorthand: agency initials (TDLR, FDOH, MDH), bare statute
 * cites at the start of a sentence ("RCW 19.27.530 covers…") and notes such as "no state license
 * found". stateLine() keeps every fact and reads it the way a homeowner would: agencies spelled out
 * on first use, cites introduced as state law, research notes turned into plain statements.
 */
import { cleanNote, expandFirst } from './clean';

/** Agencies and groups that appear in every state's lines. */
const GENERIC: [string, string][] = [
  ['NCSL', 'National Conference of State Legislatures'],
  ['ELI', 'Environmental Law Institute'],
  ['AARST', 'American Association of Radon Scientists and Technologists'],
  ['IRC', 'International Residential Code'],
];

/** State agencies, by state (the same initials mean different agencies in different states). */
const AGENCIES: Record<string, [string, string][]> = {
  AZ: [['ADHS', 'Arizona Department of Health Services']],
  CA: [['CDPH', 'California Department of Public Health'], ['CSLB', 'Contractors State License Board']],
  CO: [['DPO', 'Colorado Division of Professions and Occupations'], ['DORA', 'Colorado Department of Regulatory Agencies']],
  CT: [['DCP', 'Connecticut Department of Consumer Protection']],
  DC: [['DOEE', 'DC Department of Energy and Environment']],
  FL: [['FDOH', 'Florida Department of Health'], ['DBPR', 'Florida Department of Business and Professional Regulation']],
  GA: [['UGA', 'University of Georgia']],
  IL: [['IEMA-OHS', 'Illinois Emergency Management Agency and Office of Homeland Security']],
  KS: [['KDHE', 'Kansas Department of Health and Environment']],
  LA: [['LSLBC', 'Louisiana State Licensing Board for Contractors']],
  MA: [['MDPH', 'Massachusetts Department of Public Health']],
  ME: [['DHHS', 'Maine Department of Health and Human Services']],
  MI: [['EGLE', 'Michigan Department of Environment, Great Lakes, and Energy']],
  MN: [['MDH', 'Minnesota Department of Health']],
  MO: [['DHSS', 'Missouri Department of Health and Senior Services']],
  NE: [['DHHS', 'Nebraska Department of Health and Human Services']],
  NJ: [['NJDEP', 'New Jersey Department of Environmental Protection']],
  NY: [['NYS DOH', 'New York State Department of Health'], ['NY DOL', 'New York State Department of Labor']],
  OR: [['OHA', 'Oregon Health Authority']],
  PA: [['DEP', 'Pennsylvania Department of Environmental Protection']],
  RI: [['RIDOH', 'Rhode Island Department of Health']],
  TX: [['TDLR', 'Texas Department of Licensing and Regulation']],
  UT: [['DEQ', 'Utah Department of Environmental Quality']],
  VA: [['DPOR', 'Virginia Department of Professional and Occupational Regulation']],
  WA: [['DOH', 'Washington State Department of Health']],
};

/** Statute cites that open a sentence: "RCW 19.27.530 covers…", "Minn. Stat. 299F.51 requires…". */
const LEADING_CITE = /^((?:Exec\. Law|F\.S\.|RCW|Minn\. Stat\.|MCL|ORS|G\.S\.|C\.R\.S\.|M\.G\.L\.|Public Safety|Environment|H&S|N\.J\.S\.A\.|D\.C\. Code|Va\. Code|Act \d+ of \d{4}|\d+ ILCS)\s?[\w.:/()\-–]*(?:\s(?:to|s\.)\s?[\w.:/()\-–]+)?) (covers|requires|applies|sets)\b/;

const PHRASES: [RegExp, string | ((...a: string[]) => string)][] = [
  // "FDOH certification; …" → "Requires certification from the Florida Department of Health (FDOH); …"
  [/^([A-Z][A-Z-]{1,}(?: [A-Z]{2,})?) (certification|license|licensing)\b(?! required)/, (_m, who: string, what: string) =>
    `Requires ${what === 'license' ? 'a license' : what} from ${who}`],
  [/^Required at\b/, 'CO alarms are required at'],
  [/^Rental standard under\b/, 'CO alarms are a rental standard under'],
  [/;\s*(Environment|Public Safety) (\d[\d-]*(?: to -?\d+)?) /g, '; state law ($1 $2) '],
  [/\band ((?:ORS|RCW|G\.S\.|F\.S\.|MCL) [\d.]+) (sets|requires|covers)\b/g, 'and another state law ($1) $2'],
  [/\bSB (\d+-\d+) radon disclosures\b/g, 'state law (SB $1) requires radon disclosures'],
  [/\bno tester licensing found\b/g, 'testers aren’t licensed either'],
  [/\bNo state credential for radon testers was found\b/g, 'There is no state credential for radon testers'],
  [/\bNo mold licensing law found\b/g, 'No state mold licensing law'],
  [/,? but none was confirmed operating\b/g, ', but ask the state whether it is running'],
  [/\bNRPP or NRSB\b/g, 'National Radon Proficiency Program (NRPP) or National Radon Safety Board (NRSB)'],
  [/\bNRSB or NRPP\b/g, 'National Radon Safety Board (NRSB) or National Radon Proficiency Program (NRPP)'],
  [/\bper NCSL\b/g, 'per the National Conference of State Legislatures'],
  [/\bper ELI\b/g, 'per the Environmental Law Institute'],
];

/** One state rule line as homeowner guidance (agencies spelled out, cites introduced, notes plain). */
export function stateLine(text: string | null | undefined, st: string): string {
  let t = cleanNote(text ?? '');
  if (!t) return '';
  for (const [re, rep] of PHRASES) t = t.replace(re, rep as never);
  t = t.replace(LEADING_CITE, (_m, cite: string, verb: string) => `State law (${cite}) ${verb}`);
  for (const [abbr, name] of [...(AGENCIES[st] ?? []), ...GENERIC]) t = expandFirst(t, abbr, name);
  return t;
}
