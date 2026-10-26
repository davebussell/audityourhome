/**
 * How booking a home energy audit (EnerGuide evaluation) works in each province and territory,
 * and what it costs. One record per province page slug (src/data/provinces.json), used by the
 * national /ca/find/ and /ca/cost/ pages. Facts come from the provincial price table behind the
 * city pages (tools/local-pages/gen_pages.py, checked September 2026) and the province program
 * records (src/data/provinces.json, checked October 2026); each record names its sources.
 */
import { localIndex, localCities, type IndexCity } from './local';
import provincesJson from '../data/provinces.json';

export interface Source { label: string; href: string }

export interface ProvinceBooking {
  slug: string;
  name: string;
  /** Short label for the booking route */
  route: string;
  /** How booking works, in a sentence or two */
  how: string;
  /** What the evaluation typically costs, short */
  cost: string;
  /** Help with the cost (rebate, subsidy), short; empty when there's none */
  help: string;
  /** Who runs bookings when the province does (empty when you book directly) */
  bookWith?: { label: string; href: string };
  checked: string;
  sources: Source[];
}

const CITY_DATA = localIndex.checked; // "September 28, 2026"

export const PROVINCE_BOOKING: ProvinceBooking[] = [
  {
    slug: 'bc',
    name: 'British Columbia',
    route: 'Book directly with a licensed service organization',
    how: 'You book the EnerGuide evaluation yourself with an NRCan-licensed service organization. There’s no provincial price list, and several BC municipalities subsidize evaluations for their residents. BC’s Home Energy Improvement Bonus pays for the measured improvement between two evaluations.',
    cost: 'About $400–$500 (City of Nanaimo’s typical figure)',
    help: 'Municipal subsidies in some cities · Home Energy Improvement Bonus $750–$2,000',
    checked: 'October 8, 2026',
    sources: [
      { label: 'City of Nanaimo — home energy assessment rebate', href: 'https://www.nanaimo.ca/property-development/rebates/home-energy-efficiency-rebate/how-to-receive-your-home-energy-assessment-rebate' },
      { label: 'BC Hydro — Home Energy Improvement Bonus', href: 'https://www.bchydro.com/powersmart/residential/rebates-programs/home-renovation/bonus-rebates.html' },
    ],
  },
  {
    slug: 'alberta',
    name: 'Alberta',
    route: 'Book directly with a licensed service organization',
    how: 'You book the EnerGuide evaluation yourself with an NRCan-licensed service organization. There’s no provincial rebate or price list; the City of Edmonton’s advice is to expect more than $400 and get two or three quotes. Some municipalities finance upgrades through the Clean Energy Improvement Program (CEIP), which needs an evaluation.',
    cost: 'Expect $400+ (City of Edmonton)',
    help: 'No provincial rebate · CEIP financing in participating municipalities',
    checked: 'October 8, 2026',
    sources: [
      { label: 'City of Edmonton — home energy retrofit guidance', href: 'https://homes.changeforclimate.ca/hera/' },
      { label: 'Clean Energy Improvement Program (CEIP)', href: 'https://ceip.abmunis.ca/residential/' },
    ],
  },
  {
    slug: 'saskatchewan',
    name: 'Saskatchewan',
    route: 'Book directly with a licensed service organization',
    how: 'You book the EnerGuide evaluation yourself with an NRCan-licensed service organization. There’s no provincial rebate for it; the City of Saskatoon quotes $500–$600 as typical for the first evaluation and $300–$400 for the follow-up.',
    cost: 'About $500–$600 first visit, $300–$400 follow-up (City of Saskatoon)',
    help: 'No provincial rebate (the retrofit rebate ended April 2026)',
    checked: 'October 8, 2026',
    sources: [
      { label: 'City of Saskatoon — what is an energy audit', href: 'https://www.saskatoon.ca/sites/default/files/media/documents/What%20is%20an%20Energy%20Audit-Mar13.pdf' },
      { label: 'SaskPower — Home Efficiency Retrofit Rebate (ended)', href: 'https://www.saskpower.com/power-savings-and-programs/home/programs/home-efficiency-retrofit-rebate' },
    ],
  },
  {
    slug: 'manitoba',
    name: 'Manitoba',
    route: 'Book with a licensed service organization, then claim $400',
    how: 'You book the EnerGuide evaluation with an NRCan-licensed service organization. Efficiency Manitoba rebates $400 on a pre-retrofit evaluation if you own the home, it has Manitoba Hydro residential service and you plan at least one upgrade within 12 months. Apply within 90 days.',
    cost: 'Set by the provider',
    help: '$400 rebate from Efficiency Manitoba',
    checked: 'October 8, 2026',
    sources: [{ label: 'Efficiency Manitoba — EnerGuide home evaluation rebate', href: 'https://efficiencymb.ca/my-home/energuide-home-evaluation-rebate/' }],
  },
  {
    slug: 'ontario',
    name: 'Ontario',
    route: 'Book with a licensed service organization (seven qualify for the $600 rebate)',
    how: 'You book the EnerGuide evaluation with an NRCan-licensed service organization. For the Home Renovation Savings Program’s $600 assessment rebate, both visits must come from one of its seven approved organizations, and you need to install at least two recommended upgrades. The follow-up must be booked by November 30, 2026 and done by December 31, 2026.',
    cost: 'About $500–$700 first visit, $200–$450 follow-up',
    help: '$600 Home Renovation Savings rebate (approved organizations only) · city help in Ottawa, Kitchener and Peterborough',
    checked: 'October 8, 2026',
    sources: [
      { label: 'Home Renovation Savings — the seven approved service organizations', href: 'https://www.homerenovationsavings.ca/help-and-support' },
      { label: 'Windfall Ecology Centre — EnerGuide evaluation prices', href: 'https://windfallcentre.ca/energy/evaluation/' },
      { label: 'Reep Green Solutions — EnerGuide evaluation prices', href: 'https://reepgreen.ca/energyevaluation/' },
    ],
  },
  {
    slug: 'quebec',
    name: 'Quebec',
    route: 'Through Rénoclimat (evaluation now optional)',
    how: 'Rénoclimat changed on October 1, 2026: an evaluation is now optional, and the program pays up to $500 toward one. The old evaluation-first rules apply only if you requested a pre-work evaluation by October 12, 2026. Work must be done by RBQ-licensed contractors.',
    cost: 'Price not published since the October 1, 2026 changes',
    help: 'Rénoclimat pays up to $500 toward an evaluation · LogisVert heat pump grants',
    bookWith: { label: 'Rénoclimat (Gouvernement du Québec)', href: 'https://www.quebec.ca/habitation-territoire/chauffage-consommation-energie/aide-financiere-renovation-ecoenergetique/renoclimat/nouveautes-adapatation-inondations' },
    checked: 'October 8, 2026',
    sources: [{ label: 'Gouvernement du Québec — Rénoclimat, what’s new', href: 'https://www.quebec.ca/habitation-territoire/chauffage-consommation-energie/aide-financiere-renovation-ecoenergetique/renoclimat/nouveautes-adapatation-inondations' }],
  },
  {
    slug: 'new-brunswick',
    name: 'New Brunswick',
    route: 'Through the Total Home Energy Savings Program',
    how: 'Book through the Total Home Energy Savings Program: a Certified Energy Advisor charges $99 + HST, and that covers both the initial and the final evaluation.',
    cost: '$99 + HST for both visits',
    help: 'Subsidized by the program · free upgrades for incomes under $70,000',
    bookWith: { label: 'Total Home Energy Savings Program', href: 'https://www.saveenergynb.ca/en/for-home/total-home/' },
    checked: 'October 8, 2026',
    sources: [{ label: 'Save Energy NB — Total Home Energy Savings FAQ', href: 'https://www.saveenergynb.ca/en/for-home/total-home/frequently-asked-questions/' }],
  },
  {
    slug: 'nova-scotia',
    name: 'Nova Scotia',
    route: 'Through Efficiency Nova Scotia',
    how: 'Assessments are booked through Efficiency Nova Scotia’s Home Energy Assessment program. A $199 program fee covers the initial and final assessments, and it’s waived for households under the program’s income threshold.',
    cost: '$199 program fee (waived for lower incomes)',
    help: 'Rebates up to $5,000 on the assessment path',
    bookWith: { label: 'Efficiency Nova Scotia — Home Energy Assessments', href: 'https://www.efficiencyns.ca/programs-rebates/home-energy-assessments' },
    checked: 'October 8, 2026',
    sources: [{ label: 'Efficiency Nova Scotia — Home Energy Assessments', href: 'https://www.efficiencyns.ca/programs-rebates/home-energy-assessments' }],
  },
  {
    slug: 'pei',
    name: 'Prince Edward Island',
    route: 'Through efficiencyPEI’s partners',
    how: 'efficiencyPEI’s subsidized home energy assessment costs $99 + HST, booked directly with one of its efficiency partners.',
    cost: '$99 + HST',
    help: 'Subsidized by efficiencyPEI',
    bookWith: { label: 'efficiencyPEI — home energy assessments', href: 'https://www.princeedwardisland.ca/en/information/environment-energy-and-climate-action/home-energy-assessments' },
    checked: 'October 8, 2026',
    sources: [{ label: 'Government of PEI — home energy assessments', href: 'https://www.princeedwardisland.ca/en/information/environment-energy-and-climate-action/home-energy-assessments' }],
  },
  {
    slug: 'newfoundland-labrador',
    name: 'Newfoundland & Labrador',
    route: 'Book directly with a licensed service organization',
    how: 'There’s no province-wide price: takeCHARGE lists the service organizations working in the province, and you book with one of them. Income-eligible households can get assessments before and after no-cost upgrades through TakeCharge Greener Homes.',
    cost: 'Varies by provider',
    help: 'City help in St. John’s · TakeCharge Greener Homes for eligible incomes',
    checked: 'October 8, 2026',
    sources: [
      { label: 'takeCHARGE', href: 'https://takechargenl.ca/' },
      { label: 'TakeCharge Greener Homes', href: 'https://takechargenl.ca/greenerhomes/' },
    ],
  },
  {
    slug: 'north',
    name: 'The North (YT · NT · NU)',
    route: 'Through the territory’s energy program',
    how: 'In Yukon, the Good Energy program arranges assessments with local energy advisors for $50, plus $50 for the return visit. In the Northwest Territories, the Arctic Energy Alliance delivers subsidized EnerGuide evaluations for $200 + GST for a house. In Nunavut, start with the Nunavut Housing Corporation.',
    cost: 'Yukon $50 · NWT $200 + GST',
    help: 'Subsidized by the territory’s program',
    bookWith: { label: 'Arctic Energy Alliance (NWT)', href: 'https://aea.nt.ca/program/home-energy-evaluations/' },
    checked: 'October 19, 2026',
    sources: [
      { label: 'Government of Yukon — energy assessments', href: 'https://yukon.ca/en/energy-assessment' },
      { label: 'Arctic Energy Alliance — home energy evaluations', href: 'https://aea.nt.ca/program/home-energy-evaluations/' },
      { label: 'Nunavut Housing Corporation', href: 'https://www.nunavuthousing.ca/' },
    ],
  },
];

export function bookingFor(slug: string): ProvinceBooking | undefined {
  return PROVINCE_BOOKING.find((p) => p.slug === slug);
}

/** Covered cities in a province (by province page slug), biggest first. */
export function citiesInProvince(slug: string): IndexCity[] {
  return localCities.filter((c) => c.provSlug === slug).sort((a, b) => b.population - a.population);
}

/** "29 licensed organizations", or the province's booking route where there's no separate list */
export function providerCountLabel(c: IndexCity): string {
  const n = c.facts.providers;
  if (!n) return c.prov === 'NS' ? 'Book via Efficiency NS' : 'Ask us';
  return `${n} licensed organization${n === 1 ? '' : 's'}`;
}

interface ProvinceProgram { name: string; status: string; headline: string; programSlug?: string | null; url: string; verified: string }
interface ProvinceRecord { slug: string; name: string; programs: ProvinceProgram[] }
const PROVINCES = (provincesJson as unknown as { provinces: ProvinceRecord[] }).provinces;

/** The program to headline for a province: the first open one, else the first income-qualified, else the first. */
export function headlineProgram(slug: string): ProvinceProgram | undefined {
  const p = PROVINCES.find((x) => x.slug === slug);
  if (!p) return undefined;
  return p.programs.find((x) => x.status === 'active') ?? p.programs.find((x) => x.status === 'income') ?? p.programs[0];
}

/** Every open (or income-qualified) program for a province, in data order. */
export function openPrograms(slug: string): ProvinceProgram[] {
  const p = PROVINCES.find((x) => x.slug === slug);
  return (p?.programs ?? []).filter((x) => x.status === 'active' || x.status === 'income');
}

export const STATUS_CHIP: Record<string, [string, string]> = {
  active: ['chip-active', 'Open'],
  income: ['chip-limited', 'Income-qualified'],
  announced: ['chip-info', 'Announced'],
  closed: ['chip-closed', 'Closed'],
};

export const CITY_DATA_CHECKED = CITY_DATA;
