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
          { href: '/tests/carbon-monoxide/', label: 'Carbon monoxide', desc: 'Required by Ontario law' },
          { href: '/tests/mold-iaq/', label: 'Mold & indoor air', desc: 'Fix the cause, then clean' },
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
        ],
      },
    ],
    panelFoot: { href: '/tests/', label: 'The complete testing guide — every test on one page →' },
  },
  {
    id: 'guides',
    label: 'Guides',
    lead: {
      title: 'Your province, your city — read like an auditor',
      desc: 'Live programs by province, housing stock, and what to monitor where you live.',
      href: '/provinces/',
      cta: 'All provinces →',
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
        title: 'Ontario cities',
        links: [
          { href: '/guides/toronto/', label: 'Toronto' },
          { href: '/guides/mississauga/', label: 'Mississauga' },
          { href: '/guides/brampton/', label: 'Brampton' },
          { href: '/guides/york-region/', label: 'York Region' },
          { href: '/guides/hamilton/', label: 'Hamilton' },
          { href: '/guides/niagara/', label: 'Niagara' },
        ],
      },
      {
        title: 'More Ontario',
        links: [
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
          { href: '/articles/energy-audit-requirements-ontario/', label: 'When is one required?' },
          { href: '/articles/energy-audit-services-toronto/', label: 'Toronto audit services' },
          { href: '/articles/home-renovation-loans-toronto/', label: 'Renovation loans' },
          { href: '/articles/', label: 'All articles →' },
        ],
      },
    ],
    panelFoot: { href: '/guides/', label: 'All Ontario city guides →' },
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
  { id: 'find', label: 'Find an auditor', href: '/find/' },
  { id: 'programs', label: 'Rebates & programs', href: '/programs/' },
];
