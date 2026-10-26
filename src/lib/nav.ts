/**
 * Single source of truth for site navigation.
 * Consumed by Header.astro (desktop mega panels + mobile accordion).
 */

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

/** Canadian site navigation (/ca/). */
export const NAV_CA: NavItem[] = [
  {
    id: 'test',
    label: 'Test your home',
    lead: {
      title: 'Which tests does my home need?',
      desc: 'Era, heating, water, symptoms in — your flagged tests out, in 30 seconds.',
      href: '/ca/tests/screener/',
      cta: 'Run the screener →',
    },
    columns: [
      {
        title: 'Heat & energy',
        links: [
          { href: '/ca/tests/blower-door/', label: 'Blower door test', desc: 'Your airtightness number' },
          { href: '/ca/tests/thermal-imaging/', label: 'Infrared scan', desc: 'Finds the empty walls' },
          { href: '/ca/tests/heat-loss-calc/', label: 'Heat-loss calculation', desc: 'Sizes the heat pump right' },
          { href: '/ca/tests/duct-leakage/', label: 'Duct & airflow testing', desc: 'Why far rooms stay cold' },
          { href: '/ca/tests/bill-analysis/', label: 'Utility bill analysis', desc: 'Your real baseline' },
        ],
      },
      {
        title: 'Air',
        links: [
          { href: '/ca/tests/radon/', label: 'Radon', desc: 'The test every home needs' },
          { href: '/ca/tests/carbon-monoxide/', label: 'Carbon monoxide', desc: 'Required by Ontario law in homes with fuel-burning appliances or attached garages' },
          { href: '/ca/tests/mold-iaq/', label: 'Mould & indoor air', desc: 'Fix the cause, then clean' },
          { href: '/ca/tests/ventilation-assessment/', label: 'Ventilation & humidity', desc: 'Musty-air diagnostics' },
        ],
      },
      {
        title: 'Water & moisture',
        links: [
          { href: '/ca/tests/well-water/', label: 'Well water testing', desc: 'Free in Ontario — use it' },
          { href: '/ca/products/water-testing/', label: 'Water test kits', desc: 'Chemistry the free test skips' },
          { href: '/ca/issues/condensation-mould/', label: 'Condensation & mould', desc: 'The symptom, diagnosed' },
        ],
      },
      {
        title: 'Hazards & materials',
        links: [
          { href: '/ca/tests/asbestos-vermiculite/', label: 'Asbestos & vermiculite', desc: 'Sample before disturbing' },
          { href: '/ca/tests/lead-paint/', label: 'Lead paint', desc: 'A $15 swab before sanding' },
          { href: '/ca/tests/combustion-safety/', label: 'Combustion safety', desc: 'Before tightening the house' },
          { href: '/ca/tests/wood-burning-inspection/', label: 'Wood stove (WETT) inspection', desc: 'Before you buy, insure or light it' },
        ],
      },
    ],
    panelFoot: { href: '/ca/tests/', label: 'The complete testing guide — every test on one page →' },
  },
  {
    id: 'guides',
    label: 'Guides',
    lead: {
      title: 'Your city, read like an auditor',
      desc: '70 Canadian cities, each with its climate, housing age and 16 local audit and testing services.',
      href: '/ca/cities/',
      cta: 'All 70 cities →',
    },
    columns: [
      {
        title: 'Across Canada',
        links: [
          { href: '/ca/provinces/bc/', label: 'British Columbia' },
          { href: '/ca/provinces/alberta/', label: 'Alberta' },
          { href: '/ca/provinces/saskatchewan/', label: 'Saskatchewan' },
          { href: '/ca/provinces/manitoba/', label: 'Manitoba' },
          { href: '/ca/provinces/quebec/', label: 'Quebec' },
          { href: '/ca/provinces/new-brunswick/', label: 'New Brunswick' },
          { href: '/ca/provinces/nova-scotia/', label: 'Nova Scotia' },
          { href: '/ca/provinces/pei/', label: 'Prince Edward Island' },
          { href: '/ca/provinces/newfoundland-labrador/', label: 'Newfoundland & Labrador' },
          { href: '/ca/provinces/north/', label: 'The North (YT · NT · NU)' },
        ],
      },
      {
        title: 'Big cities',
        links: [
          { href: '/ca/cities/toronto/', label: 'Toronto' },
          { href: '/ca/cities/montreal/', label: 'Montréal' },
          { href: '/ca/cities/calgary/', label: 'Calgary' },
          { href: '/ca/cities/ottawa/', label: 'Ottawa' },
          { href: '/ca/cities/edmonton/', label: 'Edmonton' },
          { href: '/ca/cities/winnipeg/', label: 'Winnipeg' },
          { href: '/ca/cities/vancouver/', label: 'Vancouver' },
          { href: '/ca/services/', label: '16 services by city →' },
          { href: '/ca/areas/', label: 'Smaller towns & counties →' },
        ],
      },
      {
        title: 'Ontario region guides',
        links: [
          { href: '/ca/guides/toronto/', label: 'Toronto' },
          { href: '/ca/guides/mississauga/', label: 'Mississauga' },
          { href: '/ca/guides/brampton/', label: 'Brampton' },
          { href: '/ca/guides/york-region/', label: 'York Region' },
          { href: '/ca/guides/hamilton/', label: 'Hamilton' },
          { href: '/ca/guides/niagara/', label: 'Niagara' },
          { href: '/ca/guides/ottawa/', label: 'Ottawa' },
          { href: '/ca/guides/kingston/', label: 'Kingston' },
          { href: '/ca/guides/peterborough/', label: 'Peterborough' },
          { href: '/ca/guides/barrie-simcoe/', label: 'Barrie & Simcoe' },
          { href: '/ca/guides/kitchener-waterloo/', label: 'Kitchener–Waterloo' },
          { href: '/ca/guides/london/', label: 'London' },
        ],
      },
      {
        title: 'Articles',
        links: [
          { href: '/ca/articles/what-is-a-home-energy-audit/', label: 'What is an energy audit?' },
          { href: '/ca/articles/home-energy-audit-ontario/', label: 'Ontario audit guide' },
          { href: '/ca/articles/home-energy-audit-cost/', label: 'What audits cost' },
          { href: '/ca/programs/national-heat-pump-rebate/', label: 'New federal heat pump rebate' },
          { href: '/ca/articles/heat-pump-rebates-canada/', label: 'Heat pump rebates by province' },
          { href: '/ca/articles/energy-audit-services-toronto/', label: 'Toronto audit services' },
          { href: '/ca/articles/energy-audits-multi-unit-buildings/', label: 'Multi-unit buildings' },
          { href: '/ca/articles/', label: 'All articles →' },
        ],
      },
    ],
    panelFoot: { href: '/ca/provinces/', label: 'Programs and rebates, province by province →' },
  },
  {
    id: 'heatpumps',
    label: 'Heat pumps',
    lead: {
      title: 'Compare every heat pump brand',
      desc: 'Every brand certified for Canada: its cold-climate models, warranty, price tier and the rebates it fits.',
      href: '/ca/heat-pumps/',
      cta: 'Open the comparison →',
    },
    columns: [
      {
        title: 'Compare',
        links: [
          { href: '/ca/heat-pumps/', label: 'Heat pump comparison guide', desc: 'Brands, models and warranties side by side' },
          { href: '/ca/heat-pumps/brands/', label: 'Every certified brand', desc: 'Who really makes each one' },
          { href: '/ca/heat-pumps/geothermal/', label: 'Geothermal & other types', desc: 'Ground-source, window, no outdoor unit' },
          { href: '/ca/programs/national-heat-pump-rebate/', label: 'Federal heat pump rebate', desc: 'Opens early 2027' },
        ],
      },
      {
        title: 'Popular brands',
        links: [
          { href: '/ca/heat-pumps/brands/mitsubishi-electric/', label: 'Mitsubishi Electric' },
          { href: '/ca/heat-pumps/brands/daikin/', label: 'Daikin' },
          { href: '/ca/heat-pumps/brands/fujitsu/', label: 'Fujitsu' },
          { href: '/ca/heat-pumps/brands/lg/', label: 'LG' },
          { href: '/ca/heat-pumps/brands/carrier/', label: 'Carrier' },
          { href: '/ca/heat-pumps/brands/lennox/', label: 'Lennox' },
          { href: '/ca/heat-pumps/brands/napoleon/', label: 'Napoleon' },
          { href: '/ca/heat-pumps/brands/', label: 'All brands →' },
        ],
      },
      {
        title: 'By province',
        links: [
          { href: '/ca/heat-pumps/ontario/', label: 'Ontario' },
          { href: '/ca/heat-pumps/quebec/', label: 'Quebec' },
          { href: '/ca/heat-pumps/bc/', label: 'British Columbia' },
          { href: '/ca/heat-pumps/alberta/', label: 'Alberta' },
          { href: '/ca/heat-pumps/manitoba/', label: 'Manitoba' },
          { href: '/ca/heat-pumps/nova-scotia/', label: 'Nova Scotia' },
          { href: '/ca/heat-pumps/new-brunswick/', label: 'New Brunswick' },
          { href: '/ca/heat-pumps/#regions', label: 'All provinces & territories →' },
        ],
      },
      {
        title: 'Monitors & gear',
        links: [
          { href: '/ca/products/radon-monitors/', label: 'Radon monitors & kits' },
          { href: '/ca/products/air-quality-monitors/', label: 'Air quality monitors' },
          { href: '/ca/products/air-purifiers/', label: 'Air purifiers' },
          { href: '/ca/products/co-alarms/', label: 'CO alarms' },
          { href: '/ca/products/dehumidifiers-hygrometers/', label: 'Dehumidifiers & hygrometers' },
          { href: '/ca/products/water-testing/', label: 'Water test kits' },
          { href: '/ca/products/', label: 'All gear guides →' },
        ],
      },
    ],
    panelFoot: { href: '/ca/heat-pumps/#quote', label: 'Get heat pump quotes from a contractor who knows the rebates →' },
  },
  {
    id: 'learn',
    label: 'Learn',
    lead: {
      title: 'Run the numbers for your city',
      desc: 'Heating costs, upgrade paybacks, home-health checks and appliance costs, pre-filled with local prices, climate and rebates.',
      href: '/ca/calculators/',
      cta: 'Open the calculators →',
    },
    columns: [
      {
        title: 'Calculators',
        links: [
          { href: '/ca/calculators/energy-costs/', label: 'Energy cost calculator', desc: 'Heating, hot water and AC, every fuel compared' },
          { href: '/ca/calculators/upgrade-payback/', label: 'Upgrade payback', desc: 'Insulation, air sealing, windows, rebates' },
          { href: '/ca/calculators/home-health/', label: 'Home health check', desc: 'Radon, humidity, well water, alarms' },
          { href: '/ca/calculators/appliance-energy/', label: 'Appliance costs', desc: 'What each appliance costs a year' },
          { href: '/ca/learn/real-numbers/', label: 'Worked examples', desc: 'Four houses, every number shown' },
        ],
      },
      {
        title: 'Keeping the heat in',
        links: [
          { href: '/ca/learn/roofs-attics/', label: 'Roofs & attics' },
          { href: '/ca/learn/walls/', label: 'Walls' },
          { href: '/ca/learn/foundations-basements/', label: 'Foundations & basements' },
          { href: '/ca/learn/windows-doors/', label: 'Windows & doors' },
          { href: '/ca/learn/air-sealing/', label: 'Air sealing' },
          { href: '/ca/learn/moisture-control/', label: 'Moisture & humidity' },
          { href: '/ca/learn/ventilation/', label: 'Ventilation' },
          { href: '/ca/learn/hrv-erv/', label: 'HRVs & ERVs' },
        ],
      },
      {
        title: 'Systems & ratings',
        links: [
          { href: '/ca/learn/heating-systems/', label: 'Heating systems' },
          { href: '/ca/learn/water-heaters/', label: 'Water heaters' },
          { href: '/ca/learn/air-conditioning/', label: 'Air conditioning' },
          { href: '/ca/learn/thermostats/', label: 'Thermostats' },
          { href: '/ca/learn/hvac-maintenance/', label: 'HVAC maintenance' },
          { href: '/ca/learn/energuide-ratings/', label: 'EnerGuide ratings' },
          { href: '/ca/learn/previous-audit/', label: 'Had an audit before?' },
          { href: '/ca/glossary/', label: 'Glossary: every term A–Z' },
        ],
      },
    ],
    panelFoot: { href: '/ca/learn/', label: 'Keeping the heat in — all 15 topics, with the numbers behind them →' },
  },
  { id: 'find', label: 'Find an auditor', href: '/ca/find/' },
  { id: 'programs', label: 'Rebates & programs', href: '/ca/programs/' },
];

/** US site navigation (/us/). */
export const NAV_US: NavItem[] = [
  {
    id: 'test',
    label: 'Test your home',
    lead: {
      title: 'Which tests does my home need?',
      desc: 'Year built, water, heating and symptoms in; the tests worth doing out, with the reasons.',
      href: '/us/tests/screener/',
      cta: 'Run the screener →',
    },
    columns: [
      {
        title: 'Heat & energy',
        links: [
          { href: '/us/tests/blower-door/', label: 'Blower door test', desc: 'Your airtightness number' },
          { href: '/us/tests/thermal-imaging/', label: 'Infrared scan', desc: 'Finds missing insulation' },
          { href: '/us/tests/heat-loss-calc/', label: 'Load calculation (Manual J)', desc: 'Sizes heating and cooling right' },
          { href: '/us/tests/duct-leakage/', label: 'Duct leakage testing', desc: 'Why far rooms stay cold' },
          { href: '/us/tests/attic-inspection/', label: 'Attic & insulation levels', desc: 'R-values by climate zone' },
          { href: '/us/tests/bill-analysis/', label: 'Utility bill analysis', desc: 'Your real baseline' },
        ],
      },
      {
        title: 'Air & safety',
        links: [
          { href: '/us/tests/radon/', label: 'Radon', desc: 'EPA action level 4 pCi/L' },
          { href: '/us/tests/carbon-monoxide/', label: 'Carbon monoxide', desc: 'Alarms and state rules' },
          { href: '/us/tests/combustion-safety/', label: 'Combustion safety', desc: 'Before you tighten the house' },
          { href: '/us/tests/mold-iaq/', label: 'Mold & indoor air', desc: 'Moisture first' },
        ],
      },
      {
        title: 'Materials & water',
        links: [
          { href: '/us/tests/lead-paint/', label: 'Lead paint', desc: 'Homes built before 1978' },
          { href: '/us/tests/asbestos-vermiculite/', label: 'Asbestos & vermiculite', desc: 'Test before you disturb it' },
          { href: '/us/tests/well-water/', label: 'Well water', desc: 'Test it every year' },
        ],
      },
      {
        title: 'Words & numbers',
        links: [
          { href: '/us/glossary/', label: 'Glossary', desc: 'Every term and acronym explained' },
          { href: '/us/how-it-works/', label: 'How an audit works', desc: 'What happens at the visit' },
        ],
      },
    ],
    panelFoot: { href: '/us/tests/', label: 'The complete US testing guide →' },
  },
  {
    id: 'cities',
    label: 'Cities',
    lead: {
      title: 'Audits, rebates and prices where you live',
      desc: 'The 26 largest metro areas: utility audit programs, what is open now, and local energy prices.',
      href: '/us/cities/',
      cta: 'All 26 metros →',
    },
    columns: [
      {
        title: 'Northeast',
        links: [
          { href: '/us/cities/new-york/', label: 'New York City' },
          { href: '/us/cities/philadelphia/', label: 'Philadelphia' },
          { href: '/us/cities/boston/', label: 'Boston' },
        ],
      },
      {
        title: 'Midwest',
        links: [
          { href: '/us/cities/chicago/', label: 'Chicago' },
          { href: '/us/cities/detroit/', label: 'Detroit' },
          { href: '/us/cities/minneapolis/', label: 'Minneapolis–St. Paul' },
          { href: '/us/cities/st-louis/', label: 'St. Louis' },
        ],
      },
      {
        title: 'South',
        links: [
          { href: '/us/cities/dallas/', label: 'Dallas–Fort Worth' },
          { href: '/us/cities/houston/', label: 'Houston' },
          { href: '/us/cities/atlanta/', label: 'Atlanta' },
          { href: '/us/cities/washington-dc/', label: 'Washington, DC' },
          { href: '/us/cities/miami/', label: 'Miami' },
          { href: '/us/cities/tampa/', label: 'Tampa' },
          { href: '/us/cities/orlando/', label: 'Orlando' },
          { href: '/us/cities/charlotte/', label: 'Charlotte' },
          { href: '/us/cities/baltimore/', label: 'Baltimore' },
          { href: '/us/cities/san-antonio/', label: 'San Antonio' },
          { href: '/us/cities/austin/', label: 'Austin' },
        ],
      },
      {
        title: 'West',
        links: [
          { href: '/us/cities/los-angeles/', label: 'Los Angeles' },
          { href: '/us/cities/phoenix/', label: 'Phoenix' },
          { href: '/us/cities/riverside/', label: 'Riverside' },
          { href: '/us/cities/san-francisco/', label: 'San Francisco' },
          { href: '/us/cities/seattle/', label: 'Seattle' },
          { href: '/us/cities/san-diego/', label: 'San Diego' },
          { href: '/us/cities/denver/', label: 'Denver' },
          { href: '/us/cities/portland/', label: 'Portland' },
        ],
      },
    ],
    panelFoot: { href: '/us/programs/states/', label: 'Home energy rebates in all 50 states and DC →' },
  },
  {
    id: 'heatpumps',
    label: 'Heat pumps',
    lead: {
      title: 'Compare every heat pump brand',
      desc: 'Every brand certified for the US: its cold-climate and high-SEER2 models, warranty, price tier and the rebates it fits.',
      href: '/us/heat-pumps/',
      cta: 'Open the comparison →',
    },
    columns: [
      {
        title: 'Compare',
        links: [
          { href: '/us/heat-pumps/', label: 'Heat pump comparison guide', desc: 'Brands, models and warranties side by side' },
          { href: '/us/heat-pumps/brands/', label: 'Every certified brand', desc: 'Who really makes each one' },
          { href: '/us/heat-pumps/geothermal/', label: 'Geothermal & other types', desc: 'Ground-source, window, no outdoor unit' },
        ],
      },
      {
        title: 'Popular brands',
        links: [
          { href: '/us/heat-pumps/brands/carrier/', label: 'Carrier' },
          { href: '/us/heat-pumps/brands/trane/', label: 'Trane' },
          { href: '/us/heat-pumps/brands/lennox/', label: 'Lennox' },
          { href: '/us/heat-pumps/brands/mitsubishi-electric/', label: 'Mitsubishi Electric' },
          { href: '/us/heat-pumps/brands/daikin/', label: 'Daikin' },
          { href: '/us/heat-pumps/brands/goodman/', label: 'Goodman' },
          { href: '/us/heat-pumps/brands/rheem/', label: 'Rheem' },
          { href: '/us/heat-pumps/brands/', label: 'All brands →' },
        ],
      },
      {
        title: 'By metro',
        links: [
          { href: '/us/heat-pumps/new-york/', label: 'New York City' },
          { href: '/us/heat-pumps/chicago/', label: 'Chicago' },
          { href: '/us/heat-pumps/boston/', label: 'Boston' },
          { href: '/us/heat-pumps/minneapolis/', label: 'Minneapolis–St. Paul' },
          { href: '/us/heat-pumps/denver/', label: 'Denver' },
          { href: '/us/heat-pumps/seattle/', label: 'Seattle' },
          { href: '/us/heat-pumps/houston/', label: 'Houston' },
          { href: '/us/heat-pumps/#regions', label: 'All 26 metros →' },
        ],
      },
      {
        title: 'Monitors & gear',
        links: [
          { href: '/us/products/radon-monitors/', label: 'Radon monitors & kits' },
          { href: '/us/products/air-quality-monitors/', label: 'Air quality monitors' },
          { href: '/us/products/air-purifiers/', label: 'Air purifiers' },
          { href: '/us/products/co-alarms/', label: 'CO alarms' },
          { href: '/us/products/dehumidifiers-hygrometers/', label: 'Dehumidifiers & hygrometers' },
          { href: '/us/products/water-testing/', label: 'Water test kits' },
          { href: '/us/products/', label: 'All gear guides →' },
        ],
      },
    ],
    panelFoot: { href: '/us/heat-pumps/#quote', label: 'Ask for heat pump quotes in your area →' },
  },
  { id: 'find', label: 'Find an auditor', href: '/us/find/' },
  { id: 'programs', label: 'Rebates & programs', href: '/us/programs/' },
];

/** Global pages (country chooser, about, privacy, account): just the two country sites. */
export const NAV_ROOT: NavItem[] = [
  { id: 'ca', label: 'Canada', href: '/ca/' },
  { id: 'us', label: 'United States', href: '/us/' },
];

export function navFor(country: 'ca' | 'us' | null): NavItem[] {
  return country === 'ca' ? NAV_CA : country === 'us' ? NAV_US : NAV_ROOT;
}

/** @deprecated use navFor(); kept for older imports */
export const NAV = NAV_CA;
