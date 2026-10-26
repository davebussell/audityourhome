/**
 * Labels and options shared by My Home, the admin console, the lead form and
 * the alert emails. Values match the database checks in
 * supabase/migrations/*_accounts.sql and the Home Energy Planner's answers.
 */
import { ACCOUNTS, SITE } from '../../config/site';

export type Opt = { value: string; label: string; hint?: string };

export const PROVINCES: Opt[] = [
  { value: 'BC', label: 'British Columbia' },
  { value: 'AB', label: 'Alberta' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'ON', label: 'Ontario' },
  { value: 'QC', label: 'Quebec' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'YT', label: 'Yukon' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
];
export const provinceName = (code?: string | null) => PROVINCES.find((p) => p.value === code)?.label ?? code ?? '';

/** First letter of a Canadian postal code → province (X covers NT and NU; we use NT). */
const FSA_PROVINCE: Record<string, string> = { A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC', K: 'ON', L: 'ON', M: 'ON', N: 'ON', P: 'ON', R: 'MB', S: 'SK', T: 'AB', V: 'BC', X: 'NT', Y: 'YT' };
export function provinceFromPostal(postal: string): string | null {
  const v = postal.toUpperCase().replace(/\s+/g, '');
  return /^[A-Z]\d[A-Z]/.test(v) ? FSA_PROVINCE[v[0]] ?? null : null;
}
export function cleanPostal(postal: string): string {
  return postal.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
export function formatPostal(postal?: string | null): string {
  const v = cleanPostal(postal ?? '');
  return v.length === 6 ? `${v.slice(0, 3)} ${v.slice(3)}` : v;
}

export const SERVICES: (Opt & { who: string; guide?: string })[] = [
  { value: 'energy-audit', label: 'Home energy audit (EnerGuide evaluation)', who: 'a registered energy advisor', guide: '/ca/articles/what-is-a-home-energy-audit/', hint: 'The first step for most rebates: blower door test, rating and upgrade report.' },
  { value: 'insulation', label: 'Insulation or air sealing', who: 'an insulation or air-sealing contractor', guide: '/ca/learn/air-sealing/' },
  { value: 'heat-pump', label: 'Heat pump, furnace or air conditioning', who: 'a heating and cooling contractor', guide: '/ca/learn/heating-systems/' },
  { value: 'windows-doors', label: 'Windows and doors', who: 'a window and door installer', guide: '/ca/learn/windows-doors/' },
  { value: 'water-heater', label: 'Water heater', who: 'a plumbing or water heater contractor', guide: '/ca/learn/water-heaters/' },
  { value: 'ventilation', label: 'Ventilation, HRV or humidity problems', who: 'a ventilation contractor', guide: '/ca/learn/hrv-erv/' },
  { value: 'radon', label: 'Radon test or mitigation', who: 'a C-NRPP certified radon professional', guide: '/ca/tests/radon/' },
  { value: 'mould-air', label: 'Mould or indoor air quality', who: 'an indoor air quality investigator', guide: '/ca/tests/mold-iaq/' },
  { value: 'wood-stove', label: 'Wood stove inspection (WETT)', who: 'a WETT-certified inspector', guide: '/ca/tests/wood-burning-inspection/' },
  { value: 'well-water', label: 'Well water testing or treatment', who: 'a water treatment specialist', guide: '/ca/tests/well-water/' },
  { value: 'asbestos-lead', label: 'Asbestos, vermiculite or lead paint', who: 'a hazardous materials testing firm', guide: '/ca/tests/asbestos-vermiculite/' },
  { value: 'other', label: 'Something else', who: 'the right company' },
];
export const serviceLabel = (v?: string | null) => SERVICES.find((s) => s.value === v)?.label ?? v ?? '';

export const TIMELINES: Opt[] = [
  { value: 'asap', label: 'As soon as possible' },
  { value: '1-3-months', label: 'In the next 1 to 3 months' },
  { value: '3-6-months', label: 'In 3 to 6 months' },
  { value: 'researching', label: 'Just researching for now' },
];

export const BUILDINGS: Opt[] = [
  { value: 'house', label: 'House (detached, semi, row or town)' },
  { value: 'duplex-triplex', label: 'Duplex or triplex' },
  { value: 'multi-unit', label: 'Multi-unit building (4 or more units)' },
  { value: 'condo-unit', label: 'Condo unit' },
  { value: 'commercial', label: 'Commercial building' },
];

export const REQUEST_STATUS: Record<string, { label: string; tone: string; hint: string }> = {
  new: { label: 'Received', tone: 'info', hint: 'We have your request and will review it within one business day.' },
  reviewing: { label: 'Finding a match', tone: 'limited', hint: 'We are checking which company serves your area and has time for you.' },
  matched: { label: 'Matched', tone: 'active', hint: 'We have introduced you. Expect them to get in touch.' },
  closed: { label: 'Closed', tone: 'neutral', hint: 'This request is closed.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', hint: 'You cancelled this request.' },
};

export const AUDIT_KINDS: (Opt & { field?: 'rating_gj' | 'radon_bq'; resultHint?: string })[] = [
  { value: 'energuide-pre', label: 'EnerGuide evaluation (before upgrades)', field: 'rating_gj', resultHint: 'e.g. 145 GJ/year' },
  { value: 'energuide-post', label: 'EnerGuide evaluation (after upgrades)', field: 'rating_gj', resultHint: 'e.g. 112 GJ/year' },
  { value: 'renoclimat', label: 'Rénoclimat evaluation', field: 'rating_gj' },
  { value: 'home-inspection', label: 'Home inspection' },
  { value: 'radon-test', label: 'Radon test', field: 'radon_bq', resultHint: 'Long-term test result in Bq/m³' },
  { value: 'water-test', label: 'Well water test', resultHint: 'e.g. no coliform bacteria detected' },
  { value: 'wett', label: 'WETT wood stove inspection' },
  { value: 'blower-door', label: 'Blower door test', resultHint: 'e.g. 4.2 air changes per hour at 50 Pa' },
  { value: 'thermal-imaging', label: 'Thermal imaging scan' },
  { value: 'other', label: 'Other test or report' },
];
export const auditLabel = (v?: string | null) => AUDIT_KINDS.find((a) => a.value === v)?.label ?? v ?? '';

export const NEED_STATUS: Opt[] = [
  { value: 'todo', label: 'To do' },
  { value: 'quotes', label: 'Getting quotes' },
  { value: 'booked', label: 'Booked' },
  { value: 'done', label: 'Done' },
  { value: 'skip', label: 'Not doing' },
];

export const NEED_CATEGORIES: Opt[] = [
  { value: 'air-sealing', label: 'Air sealing' },
  { value: 'attic-insulation', label: 'Attic insulation' },
  { value: 'wall-insulation', label: 'Wall insulation' },
  { value: 'basement-insulation', label: 'Basement insulation' },
  { value: 'windows-doors', label: 'Windows and doors' },
  { value: 'heat-pump', label: 'Heat pump' },
  { value: 'heating', label: 'Furnace or boiler' },
  { value: 'water-heating', label: 'Water heater' },
  { value: 'ventilation', label: 'Ventilation' },
  { value: 'controls', label: 'Thermostat and controls' },
  { value: 'solar', label: 'Solar' },
  { value: 'health', label: 'Health and safety' },
  { value: 'other', label: 'Other' },
];

export const REMINDER_KINDS: Opt[] = [
  { value: 'post-evaluation', label: 'Post-retrofit evaluation' },
  { value: 'rebate-claim', label: 'Rebate claim deadline' },
  { value: 'radon-retest', label: 'Radon retest' },
  { value: 'water-test', label: 'Well water test' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'custom', label: 'Something else' },
];

/** Home fields: the same values the planner uses (see src/pages/plan/index.astro). */
export const HOME_OPTIONS = {
  era: [
    { value: 'pre-1946', label: 'Before 1946' },
    { value: '1946-1965', label: '1946–1965' },
    { value: '1966-1980', label: '1966–1980' },
    { value: '1981-1995', label: '1981–1995' },
    { value: '1996-2010', label: '1996–2010' },
    { value: '2011-plus', label: '2011 or later' },
  ],
  home_type: [
    { value: 'detached', label: 'Detached' },
    { value: 'semi', label: 'Semi or townhome' },
    { value: 'condo', label: 'Condo or apartment' },
  ],
  size_band: [
    { value: 'small', label: 'Under 1,200 sq ft' },
    { value: 'medium', label: '1,200–2,000 sq ft' },
    { value: 'large', label: '2,000–3,000 sq ft' },
    { value: 'xlarge', label: 'Over 3,000 sq ft' },
  ],
  heating: [
    { value: 'gas', label: 'Gas furnace' },
    { value: 'gasboiler', label: 'Gas boiler' },
    { value: 'electric', label: 'Electric baseboards' },
    { value: 'elecfurnace', label: 'Electric furnace or boiler' },
    { value: 'heatpump', label: 'Air-source heat pump' },
    { value: 'geothermal', label: 'Geothermal heat pump' },
    { value: 'oil', label: 'Oil' },
    { value: 'propane', label: 'Propane' },
    { value: 'wood', label: 'Wood stove or furnace' },
    { value: 'outdoorwood', label: 'Outdoor wood boiler' },
    { value: 'pellet', label: 'Pellet stove' },
  ],
  heating_age: [
    { value: 'new', label: 'Under 15 years old' },
    { value: 'old', label: '15 years or older' },
    { value: 'unsure', label: 'Not sure' },
  ],
  water_heater: [
    { value: 'gastank', label: 'Gas tank' },
    { value: 'gastankless', label: 'Gas tankless (on demand)' },
    { value: 'electric', label: 'Electric tank' },
    { value: 'heatpump', label: 'Heat pump water heater' },
    { value: 'oil', label: 'Oil-fired' },
    { value: 'boiler', label: 'From the boiler' },
    { value: 'unsure', label: 'Not sure' },
  ],
  cooling: [
    { value: 'none', label: 'No air conditioning' },
    { value: 'central-new', label: 'Central air, newer' },
    { value: 'central-old', label: 'Central air, older' },
    { value: 'room', label: 'Window or portable units' },
    { value: 'heatpump', label: 'Heat pump' },
    { value: 'unsure', label: 'Not sure' },
  ],
  windows: [
    { value: 'single', label: 'Single-pane' },
    { value: 'singlestorm', label: 'Single-pane with storms' },
    { value: 'double-old', label: 'Older double-pane' },
    { value: 'double-new', label: 'Newer double-pane (low-e)' },
    { value: 'triple', label: 'Triple-pane' },
    { value: 'unsure', label: 'Not sure' },
  ],
  water_supply: [
    { value: 'municipal', label: 'Town or city water' },
    { value: 'well', label: 'Private well' },
    { value: 'unsure', label: 'Not sure' },
  ],
  prev_audit: [
    { value: 'no', label: 'No' },
    { value: 'recent', label: 'Yes, in the last 3 years' },
    { value: 'older', label: 'Yes, more than 3 years ago' },
    { value: 'unsure', label: 'Not sure' },
  ],
} satisfies Record<string, Opt[]>;
export type HomeOptionKey = keyof typeof HOME_OPTIONS;
export const homeLabel = (key: HomeOptionKey, v?: string | null) =>
  (HOME_OPTIONS[key] as Opt[]).find((o) => o.value === v)?.label ?? '';

export const ALERT_TYPES = [
  {
    key: 'program_updates' as const,
    label: 'Rebate and program changes',
    hint: 'When a rebate or program in your province opens, closes or changes. Usually a few emails a year.',
  },
  {
    key: 'deadline_reminders' as const,
    label: 'My deadline reminders',
    hint: 'Before the dates you add, like a post-retrofit evaluation or a rebate claim: 30, 7 and 1 day ahead.',
  },
  {
    key: 'seasonal_checks' as const,
    label: 'Seasonal home checks',
    hint: 'One short email a month with the checks that matter for your house: filters, alarms, radon, well water, humidity.',
  },
];
export type AlertKey = (typeof ALERT_TYPES)[number]['key'];

/** Consent wording (CASL: purpose, who is asking, how to reach them, that consent can be withdrawn). */
export function alertConsentText(kinds: string[]): string {
  const names = ALERT_TYPES.filter((a) => kinds.includes(a.key)).map((a) => a.label.toLowerCase());
  const what = names.length ? names.join(', ') : 'the alerts I choose';
  const where = ACCOUNTS.mailingAddress ? `, ${ACCOUNTS.mailingAddress}` : ', Wakefield, Quebec';
  return `Yes, email me ${what} from ${ACCOUNTS.sender}${where} (${SITE.contactEmail}, ${SITE.domain}). I can unsubscribe at any time with the link in every email or from My Home.`;
}

export const MATCH_CONSENT =
  'I agree that AuditYourHome may share this request and my contact details with one company that serves my area so they can contact me about it. Participating companies pay AuditYourHome a referral fee; I pay nothing for the introduction.';

export const money = (n?: number | null) =>
  n === null || n === undefined || !Number.isFinite(n) ? '' : `$${Math.round(n).toLocaleString('en-CA')}`;

export function fmtDate(d?: string | null, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }) {
  if (!d) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA', opts);
}

export function daysUntil(d: string): number {
  const due = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86400000);
}
