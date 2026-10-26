/**
 * The four stages of a home energy audit, in the words the whole site uses. The JourneyBar
 * component draws them; the planners can import the same names so every page tells one story:
 * the free plan is an estimate, the audit is the visit, the report comes from the auditor.
 */
export type JourneyCountry = 'ca' | 'us';
export type JourneyStageKey = 'plan' | 'book' | 'visit' | 'upgrades';
export type JourneyStep = 1 | 2 | 3 | 4;

export interface JourneyStage {
  n: JourneyStep;
  key: JourneyStageKey;
  /** Short label, the same in both countries */
  label: string;
  /** One line saying what happens at this stage, worded for the country */
  sub: string;
  /** The page that explains this stage */
  href: string;
}

/** Stage labels, identical in Canada and the US. */
export const JOURNEY_LABELS: Record<JourneyStageKey, string> = {
  plan: 'Your free plan',
  book: 'Book the audit',
  visit: 'The audit visit and report',
  upgrades: 'Upgrades and rebates',
};

/** What the audit is called, and who does it, in each country. */
export const AUDIT_TERMS: Record<JourneyCountry, { audit: string; auditShort: string; pro: string; pros: string }> = {
  ca: {
    audit: 'home energy audit (EnerGuide evaluation)',
    auditShort: 'EnerGuide evaluation',
    pro: 'registered energy advisor',
    pros: 'registered energy advisors',
  },
  us: {
    audit: 'home energy audit',
    auditShort: 'home energy audit',
    pro: 'energy auditor',
    pros: 'energy auditors',
  },
};

const SUBS: Record<JourneyCountry, Record<JourneyStageKey, string>> = {
  ca: {
    plan: 'An estimate from the planner, before anyone visits',
    book: 'An EnerGuide evaluation with a registered energy advisor',
    visit: 'Tests, your EnerGuide rating and an upgrade report',
    upgrades: 'Do the work, then claim your province’s rebates',
  },
  us: {
    plan: 'An estimate from the planner, before anyone visits',
    book: 'A home energy audit with a certified auditor or your utility’s assessment',
    visit: 'Tests, findings and a ranked list of upgrades',
    upgrades: 'Do the work, then claim utility and state rebates',
  },
};

const ORDER: JourneyStageKey[] = ['plan', 'book', 'visit', 'upgrades'];

export function journeyHref(country: JourneyCountry, key: JourneyStageKey): string {
  switch (key) {
    case 'plan':
      return `/${country}/plan/`;
    case 'book':
      return `/${country}/find/`;
    case 'visit':
      return `/${country}/how-it-works/#visit`;
    case 'upgrades':
      return `/${country}/programs/`;
  }
}

/** The four stages for a country, in order. */
export function journeyStages(country: JourneyCountry): JourneyStage[] {
  return ORDER.map((key, i) => ({
    n: (i + 1) as JourneyStep,
    key,
    label: JOURNEY_LABELS[key],
    sub: SUBS[country][key],
    href: journeyHref(country, key),
  }));
}
