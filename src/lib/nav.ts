/**
 * Single source of truth for site navigation.
 * Consumed by Header.astro (desktop mega panels + mobile accordion).
 */

import { SERVICE_COUNT } from './local-counts';

export interface NavLink {
  href: string;
  label: string;
  desc?: string;
}

export interface NavColumn {
  title: string;
  links: NavLink[];
}

export interface NavLead {
  title: string;
  desc: string;
  href: string;
  cta: string;
}

export interface NavItem {
  id: string;
  label: string;
  /** plain link when no columns */
  href?: string;
  lead?: NavLead;
  columns?: NavColumn[];
  /** small footer row inside the panel */
  panelFoot?: NavLink;
}

/** Canadian site navigation (audityourhome.ca). */
export const NAV_CA: NavItem[] = [
  {
    id: 'test',
    label: 'Test your home',
    lead: {
      title: 'Which tests does my home need?',
      desc: 'Era, heating, water, symptoms in — your flagged tests out, in 30 seconds.',
      href: '/tests/screener/',
      cta: 'Run the screener →',
    },
    columns: [
      {
        title: 'Heat & energy',
        links: [
          { href: '/tests/blower-door/', label: 'Blower door test', desc: 'Your airtightness number' },
          { href: '/tests/thermal-imaging/', label: 'Infrared scan', desc: 'Finds the empty walls' },
          { href: '/tests/heat-loss-calc/', label: 'Heat-loss calculation', desc: 'Sizes the heat pump right' },
          { href: '/tests/duct-leakage/', label: 'Duct & airflow testing', desc: 'Why far rooms stay cold' },
          { href: '/tests/bill-analysis/', label: 'Utility bill analysis', desc: 'Your real baseline' },
        ],
      },
      {
        title: 'Air',
        links: [
          { href: '/tests/radon/', label: 'Radon', desc: 'The test every home needs' },
          { href: '/tests/carbon-monoxide/', label: 'Carbon monoxide', desc: 'Required by Ontario law in homes with fuel-burning appliances or attached garages' },
          { href: '/tests/mold-iaq/', label: 'Mould & indoor air', desc: 'Fix the cause, then clean' },
          { href: '/tests/ventilation-assessment/', label: 'Ventilation & humidity', desc: 'Musty-air diagnostics' },
        ],
      },
      {
        title: 'Water & moisture',
        links: [
          { href: '/tests/well-water/', label: 'Well water testing', desc: 'Free in Ontario — use it' },
          { href: '/products/water-testing/', label: 'Water test kits', desc: 'Chemistry the free test skips' },
          { href: '/issues/condensation-mould/', label: 'Condensation & mould', desc: 'The symptom, diagnosed' },
        ],
      },
      {
        title: 'Hazards & materials',
        links: [
          { href: '/tests/asbestos-vermiculite/', label: 'Asbestos & vermiculite', desc: 'Sample before disturbing' },
          { href: '/tests/lead-paint/', label: 'Lead paint', desc: 'A $15 swab before sanding' },
          { href: '/tests/combustion-safety/', label: 'Combustion safety', desc: 'Before tightening the house' },
          { href: '/tests/wood-burning-inspection/', label: 'Wood stove (WETT) inspection', desc: 'Before you buy, insure or light it' },
        ],
      },
    ],
    panelFoot: { href: '/tests/', label: 'The complete testing guide — every test on one page →' },
  },
  {
    id: 'guides',
    label: 'Guides',
    lead: {
      title: 'Your city, read like an auditor',
      desc: `70 Canadian cities, each with its climate, housing age and ${SERVICE_COUNT} local audit and testing services.`,
      href: '/cities/',
      cta: 'All 70 cities →',
    },
    columns: [
      {
        title: 'Across Canada',
        links: [
          { href: '/provinces/bc/', label: 'British Columbia' },
          { href: '/provinces/alberta/', label: 'Alberta' },
          { href: '/provinces/saskatchewan/', label: 'Saskatchewan' },
          { href: '/provinces/manitoba/', label: 'Manitoba' },
          { href: '/provinces/quebec/', label: 'Quebec' },
          { href: '/provinces/new-brunswick/', label: 'New Brunswick' },
          { href: '/provinces/nova-scotia/', label: 'Nova Scotia' },
          { href: '/provinces/pei/', label: 'Prince Edward Island' },
          { href: '/provinces/newfoundland-labrador/', label: 'Newfoundland & Labrador' },
          { href: '/provinces/north/', label: 'The North (YT · NT · NU)' },
        ],
      },
      {
        title: 'Big cities',
        links: [
          { href: '/cities/toronto/', label: 'Toronto' },
          { href: '/cities/montreal/', label: 'Montréal' },
          { href: '/cities/calgary/', label: 'Calgary' },
          { href: '/cities/ottawa/', label: 'Ottawa' },
          { href: '/cities/edmonton/', label: 'Edmonton' },
          { href: '/cities/winnipeg/', label: 'Winnipeg' },
          { href: '/cities/vancouver/', label: 'Vancouver' },
          { href: '/services/', label: `${SERVICE_COUNT} services by city →` },
          { href: '/areas/', label: 'Smaller towns & counties →' },
        ],
      },
      {
        title: 'Ontario region guides',
        links: [
          { href: '/guides/toronto/', label: 'Toronto' },
          { href: '/guides/mississauga/', label: 'Mississauga' },
          { href: '/guides/brampton/', label: 'Brampton' },
          { href: '/guides/york-region/', label: 'York Region' },
          { href: '/guides/hamilton/', label: 'Hamilton' },
          { href: '/guides/niagara/', label: 'Niagara' },
          { href: '/guides/ottawa/', label: 'Ottawa' },
          { href: '/guides/kingston/', label: 'Kingston' },
          { href: '/guides/peterborough/', label: 'Peterborough' },
          { href: '/guides/barrie-simcoe/', label: 'Barrie & Simcoe' },
          { href: '/guides/kitchener-waterloo/', label: 'Kitchener–Waterloo' },
          { href: '/guides/london/', label: 'London' },
        ],
      },
      {
        title: 'Articles',
        links: [
          { href: '/articles/what-is-a-home-energy-audit/', label: 'What is an energy audit?' },
          { href: '/articles/home-energy-audit-ontario/', label: 'Ontario audit guide' },
          { href: '/articles/home-energy-audit-cost/', label: 'What audits cost' },
          { href: '/programs/national-heat-pump-rebate/', label: 'New federal heat pump rebate' },
          { href: '/articles/heat-pump-rebates-canada/', label: 'Heat pump rebates by province' },
          { href: 'https://audityourbuilding.com/', label: 'Commercial & apartment buildings ↗' },
          { href: '/articles/', label: 'All articles →' },
        ],
      },
    ],
    panelFoot: { href: '/provinces/', label: 'Programs and rebates, province by province →' },
  },
  {
    id: 'heatpumps',
    label: 'Heat pumps',
    lead: {
      title: 'Compare every heat pump brand',
      desc: 'Every brand certified for Canada: its cold-climate models, warranty, price tier and the rebates it fits.',
      href: '/heat-pumps/',
      cta: 'Open the comparison →',
    },
    columns: [
      {
        title: 'Compare',
        links: [
          { href: '/heat-pumps/', label: 'Heat pump comparison guide', desc: 'Brands, models and warranties side by side' },
          { href: '/heat-pumps/brands/', label: 'Every certified brand', desc: 'Who really makes each one' },
          { href: '/heat-pumps/geothermal/', label: 'Geothermal & other types', desc: 'Ground-source, window, no outdoor unit' },
          { href: '/programs/national-heat-pump-rebate/', label: 'Federal heat pump rebate', desc: 'Opens early 2027' },
        ],
      },
      {
        title: 'Popular brands',
        links: [
          { href: '/heat-pumps/brands/mitsubishi-electric/', label: 'Mitsubishi Electric' },
          { href: '/heat-pumps/brands/daikin/', label: 'Daikin' },
          { href: '/heat-pumps/brands/fujitsu/', label: 'Fujitsu' },
          { href: '/heat-pumps/brands/lg/', label: 'LG' },
          { href: '/heat-pumps/brands/carrier/', label: 'Carrier' },
          { href: '/heat-pumps/brands/lennox/', label: 'Lennox' },
          { href: '/heat-pumps/brands/napoleon/', label: 'Napoleon' },
          { href: '/heat-pumps/brands/', label: 'All brands →' },
        ],
      },
      {
        title: 'By province',
        links: [
          { href: '/heat-pumps/ontario/', label: 'Ontario' },
          { href: '/heat-pumps/quebec/', label: 'Quebec' },
          { href: '/heat-pumps/bc/', label: 'British Columbia' },
          { href: '/heat-pumps/alberta/', label: 'Alberta' },
          { href: '/heat-pumps/manitoba/', label: 'Manitoba' },
          { href: '/heat-pumps/nova-scotia/', label: 'Nova Scotia' },
          { href: '/heat-pumps/new-brunswick/', label: 'New Brunswick' },
          { href: '/heat-pumps/#regions', label: 'All provinces & territories →' },
        ],
      },
      {
        title: 'Monitors & gear',
        links: [
          { href: '/products/radon-monitors/', label: 'Radon monitors & kits' },
          { href: '/products/air-quality-monitors/', label: 'Air quality monitors' },
          { href: '/products/air-purifiers/', label: 'Air purifiers' },
          { href: '/products/co-alarms/', label: 'CO alarms' },
          { href: '/products/dehumidifiers-hygrometers/', label: 'Dehumidifiers & hygrometers' },
          { href: '/products/water-testing/', label: 'Water test kits' },
          { href: '/products/', label: 'All gear guides →' },
        ],
      },
    ],
    panelFoot: { href: '/heat-pumps/#quote', label: 'Get heat pump quotes from a contractor who knows the rebates →' },
  },
  {
    id: 'learn',
    label: 'Learn',
    lead: {
      title: 'Run the numbers for your city',
      desc: 'Heating costs, upgrade paybacks, home-health checks and appliance costs, pre-filled with local prices, climate and rebates.',
      href: '/calculators/',
      cta: 'Open the calculators →',
    },
    columns: [
      {
        title: 'Calculators',
        links: [
          { href: '/calculators/energy-costs/', label: 'Energy cost calculator', desc: 'Heating, hot water and AC, every fuel compared' },
          { href: '/calculators/upgrade-payback/', label: 'Upgrade payback', desc: 'Insulation, air sealing, windows, rebates' },
          { href: '/calculators/home-health/', label: 'Home health check', desc: 'Radon, humidity, well water, alarms' },
          { href: '/calculators/appliance-energy/', label: 'Appliance costs', desc: 'What each appliance costs a year' },
          { href: '/learn/real-numbers/', label: 'Worked examples', desc: 'Four houses, every number shown' },
        ],
      },
      {
        title: 'Keeping the heat in',
        links: [
          { href: '/learn/roofs-attics/', label: 'Roofs & attics' },
          { href: '/learn/walls/', label: 'Walls' },
          { href: '/learn/foundations-basements/', label: 'Foundations & basements' },
          { href: '/learn/windows-doors/', label: 'Windows & doors' },
          { href: '/learn/air-sealing/', label: 'Air sealing' },
          { href: '/learn/moisture-control/', label: 'Moisture & humidity' },
          { href: '/learn/ventilation/', label: 'Ventilation' },
          { href: '/learn/hrv-erv/', label: 'HRVs & ERVs' },
        ],
      },
      {
        title: 'Systems & ratings',
        links: [
          { href: '/learn/heating-systems/', label: 'Heating systems' },
          { href: '/learn/water-heaters/', label: 'Water heaters' },
          { href: '/learn/air-conditioning/', label: 'Air conditioning' },
          { href: '/learn/thermostats/', label: 'Thermostats' },
          { href: '/learn/hvac-maintenance/', label: 'HVAC maintenance' },
          { href: '/learn/energuide-ratings/', label: 'EnerGuide ratings' },
          { href: '/learn/previous-audit/', label: 'Had an audit before?' },
          { href: '/glossary/', label: 'Glossary: every term A–Z' },
        ],
      },
    ],
    panelFoot: { href: '/learn/', label: 'Keeping the heat in — all 15 topics, with the numbers behind them →' },
  },
  { id: 'find', label: 'Find an auditor', href: '/find/' },
  { id: 'programs', label: 'Rebates & programs', href: '/programs/' },
];

/** US site navigation (audityourhome.com). */
export const NAV_US: NavItem[] = [
  {
    id: 'test',
    label: 'Test your home',
    lead: {
      title: 'Which tests does my home need?',
      desc: 'Year built, water, heating and symptoms in; the tests worth doing out, with the reasons.',
      href: '/tests/screener/',
      cta: 'Run the screener →',
    },
    columns: [
      {
        title: 'Heat & energy',
        links: [
          { href: '/tests/blower-door/', label: 'Blower door test', desc: 'Your airtightness number' },
          { href: '/tests/thermal-imaging/', label: 'Infrared scan', desc: 'Finds missing insulation' },
          { href: '/tests/heat-loss-calc/', label: 'Load calculation (Manual J)', desc: 'Sizes heating and cooling right' },
          { href: '/tests/duct-leakage/', label: 'Duct leakage testing', desc: 'Why far rooms stay cold' },
          { href: '/tests/attic-inspection/', label: 'Attic & insulation levels', desc: 'R-values by climate zone' },
          { href: '/tests/bill-analysis/', label: 'Utility bill analysis', desc: 'Your real baseline' },
        ],
      },
      {
        title: 'Air & safety',
        links: [
          { href: '/tests/radon/', label: 'Radon', desc: 'EPA action level 4 pCi/L' },
          { href: '/tests/carbon-monoxide/', label: 'Carbon monoxide', desc: 'Alarms and state rules' },
          { href: '/tests/combustion-safety/', label: 'Combustion safety', desc: 'Before you tighten the house' },
          { href: '/tests/mold-iaq/', label: 'Mold & indoor air', desc: 'Moisture first' },
        ],
      },
      {
        title: 'Materials & water',
        links: [
          { href: '/tests/lead-paint/', label: 'Lead paint', desc: 'Homes built before 1978' },
          { href: '/tests/asbestos-vermiculite/', label: 'Asbestos & vermiculite', desc: 'Test before you disturb it' },
          { href: '/tests/well-water/', label: 'Well water', desc: 'Test it every year' },
        ],
      },
      {
        title: 'Words & numbers',
        links: [
          { href: '/issues/', label: 'Common problems', desc: 'Start from the symptom, by climate' },
          { href: '/glossary/', label: 'Glossary', desc: 'Every term and acronym explained' },
          { href: '/how-it-works/', label: 'How an audit works', desc: 'What happens at the visit' },
        ],
      },
    ],
    panelFoot: { href: '/tests/', label: 'The complete US testing guide →' },
  },
  {
    id: 'cities',
    label: 'Cities',
    lead: {
      title: 'Audits, rebates and prices where you live',
      desc: 'The 26 largest metro areas: utility audit programs, what is open now, and local energy prices.',
      href: '/cities/',
      cta: 'All 26 metros →',
    },
    columns: [
      {
        title: 'Northeast',
        links: [
          { href: '/cities/new-york/', label: 'New York City' },
          { href: '/cities/philadelphia/', label: 'Philadelphia' },
          { href: '/cities/boston/', label: 'Boston' },
        ],
      },
      {
        title: 'Midwest',
        links: [
          { href: '/cities/chicago/', label: 'Chicago' },
          { href: '/cities/detroit/', label: 'Detroit' },
          { href: '/cities/minneapolis/', label: 'Minneapolis–St. Paul' },
          { href: '/cities/st-louis/', label: 'St. Louis' },
        ],
      },
      {
        title: 'South',
        links: [
          { href: '/cities/dallas/', label: 'Dallas–Fort Worth' },
          { href: '/cities/houston/', label: 'Houston' },
          { href: '/cities/atlanta/', label: 'Atlanta' },
          { href: '/cities/washington-dc/', label: 'Washington, DC' },
          { href: '/cities/miami/', label: 'Miami' },
          { href: '/cities/tampa/', label: 'Tampa' },
          { href: '/cities/orlando/', label: 'Orlando' },
          { href: '/cities/charlotte/', label: 'Charlotte' },
          { href: '/cities/baltimore/', label: 'Baltimore' },
          { href: '/cities/san-antonio/', label: 'San Antonio' },
          { href: '/cities/austin/', label: 'Austin' },
        ],
      },
      {
        title: 'West',
        links: [
          { href: '/cities/los-angeles/', label: 'Los Angeles' },
          { href: '/cities/phoenix/', label: 'Phoenix' },
          { href: '/cities/riverside/', label: 'Riverside' },
          { href: '/cities/san-francisco/', label: 'San Francisco' },
          { href: '/cities/seattle/', label: 'Seattle' },
          { href: '/cities/san-diego/', label: 'San Diego' },
          { href: '/cities/denver/', label: 'Denver' },
          { href: '/cities/portland/', label: 'Portland' },
        ],
      },
    ],
    panelFoot: { href: '/programs/states/', label: 'Home energy rebates in all 50 states and DC →' },
  },
  {
    id: 'heatpumps',
    label: 'Heat pumps',
    lead: {
      title: 'Compare every heat pump brand',
      desc: 'Every brand certified for the US: its cold-climate and high-SEER2 models, warranty, price tier and the rebates it fits.',
      href: '/heat-pumps/',
      cta: 'Open the comparison →',
    },
    columns: [
      {
        title: 'Compare',
        links: [
          { href: '/heat-pumps/', label: 'Heat pump comparison guide', desc: 'Brands, models and warranties side by side' },
          { href: '/heat-pumps/brands/', label: 'Every certified brand', desc: 'Who really makes each one' },
          { href: '/heat-pumps/geothermal/', label: 'Geothermal & other types', desc: 'Ground-source, window, no outdoor unit' },
        ],
      },
      {
        title: 'Popular brands',
        links: [
          { href: '/heat-pumps/brands/carrier/', label: 'Carrier' },
          { href: '/heat-pumps/brands/trane/', label: 'Trane' },
          { href: '/heat-pumps/brands/lennox/', label: 'Lennox' },
          { href: '/heat-pumps/brands/mitsubishi-electric/', label: 'Mitsubishi Electric' },
          { href: '/heat-pumps/brands/daikin/', label: 'Daikin' },
          { href: '/heat-pumps/brands/goodman/', label: 'Goodman' },
          { href: '/heat-pumps/brands/rheem/', label: 'Rheem' },
          { href: '/heat-pumps/brands/', label: 'All brands →' },
        ],
      },
      {
        title: 'By metro',
        links: [
          { href: '/heat-pumps/new-york/', label: 'New York City' },
          { href: '/heat-pumps/chicago/', label: 'Chicago' },
          { href: '/heat-pumps/boston/', label: 'Boston' },
          { href: '/heat-pumps/minneapolis/', label: 'Minneapolis–St. Paul' },
          { href: '/heat-pumps/denver/', label: 'Denver' },
          { href: '/heat-pumps/seattle/', label: 'Seattle' },
          { href: '/heat-pumps/houston/', label: 'Houston' },
          { href: '/heat-pumps/#regions', label: 'All 26 metros →' },
        ],
      },
      {
        title: 'Monitors & gear',
        links: [
          { href: '/products/radon-monitors/', label: 'Radon monitors & kits' },
          { href: '/products/air-quality-monitors/', label: 'Air quality monitors' },
          { href: '/products/air-purifiers/', label: 'Air purifiers' },
          { href: '/products/co-alarms/', label: 'CO alarms' },
          { href: '/products/dehumidifiers-hygrometers/', label: 'Dehumidifiers & hygrometers' },
          { href: '/products/water-testing/', label: 'Water test kits' },
          { href: '/products/', label: 'All gear guides →' },
        ],
      },
    ],
    panelFoot: { href: '/heat-pumps/#quote', label: 'Ask for heat pump quotes in your area →' },
  },
  { id: 'find', label: 'Find an auditor', href: '/find/' },
  { id: 'programs', label: 'Rebates & programs', href: '/programs/' },
];

/** Pages outside both country trees (none since the sites split): just the two sites. */
export const NAV_ROOT: NavItem[] = [
  { id: 'ca', label: 'Canada', href: 'https://audityourhome.ca/' },
  { id: 'us', label: 'United States', href: 'https://audityourhome.com/' },
];

export function navFor(country: 'ca' | 'us' | null): NavItem[] {
  return country === 'ca' ? NAV_CA : country === 'us' ? NAV_US : NAV_ROOT;
}

/** @deprecated use navFor(); kept for older imports */
export const NAV = NAV_CA;
