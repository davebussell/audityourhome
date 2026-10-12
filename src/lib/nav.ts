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

export const NAV: NavItem[] = [
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
      desc: '70 Canadian cities, each with its climate, housing age and 16 local audit and testing services.',
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
          { href: '/services/', label: '16 services by city →' },
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
          { href: '/articles/heat-pump-rebates-canada/', label: 'Heat pump rebates by province' },
          { href: '/articles/energy-audit-services-toronto/', label: 'Toronto audit services' },
          { href: '/articles/energy-audits-multi-unit-buildings/', label: 'Multi-unit buildings' },
          { href: '/articles/', label: 'All articles →' },
        ],
      },
    ],
    panelFoot: { href: '/provinces/', label: 'Programs and rebates, province by province →' },
  },
  {
    id: 'gear',
    label: 'Gear',
    lead: {
      title: 'Monitor it before you fix it',
      desc: 'Three vetted picks per category — with the honest notes nobody puts on the box.',
      href: '/products/',
      cta: 'All gear guides →',
    },
    columns: [
      {
        title: 'Air',
        links: [
          { href: '/products/radon-monitors/', label: 'Radon monitors & kits', desc: 'Long-term kits + live readers' },
          { href: '/products/air-quality-monitors/', label: 'Air quality monitors', desc: 'PM2.5, CO₂, humidity' },
          { href: '/products/air-purifiers/', label: 'Air purifiers', desc: 'HEPA, sized to the room' },
          { href: '/products/co-alarms/', label: 'CO alarms', desc: 'The law + the right specs' },
        ],
      },
      {
        title: 'Water & moisture',
        links: [
          { href: '/products/dehumidifiers-hygrometers/', label: 'Dehumidifiers & hygrometers', desc: 'Measure, then dry' },
          { href: '/products/water-testing/', label: 'Water test kits', desc: 'Wells and old city pipes' },
        ],
      },
    ],
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
        ],
      },
    ],
    panelFoot: { href: '/learn/', label: 'Keeping the heat in — all 15 topics, with the numbers behind them →' },
  },
  { id: 'find', label: 'Find an auditor', href: '/find/' },
  { id: 'programs', label: 'Rebates & programs', href: '/programs/' },
];
