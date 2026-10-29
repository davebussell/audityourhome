/**
 * Specialty-test screener — pure flag engine shared by the planner intake
 * and the standalone /tests/screener/ tool. No DOM; safe in client scripts.
 */

export interface ScreenerInput {
  /** archetype id: pre-1946 | 1946-1965 | 1966-1980 | 1981-1995 | 1996-2010 | 2011-plus */
  era: string;
  /** gas | electric | oil | heatpump */
  heat: string;
  /** municipal | well | unsure | '' */
  water: string;
  /** issue slugs, e.g. condensation-mould */
  symptoms: string[];
  /** goal ids, e.g. buying, reno */
  goals: string[];
  /** detached | semi | condo */
  htype: string;
}

export interface TestFlag {
  id: 'radon' | 'carbon-monoxide' | 'mold-iaq' | 'asbestos-vermiculite' | 'lead-paint' | 'well-water';
  name: string;
  level: 'recommended' | 'flagged' | 'strongly-flagged';
  why: string;
  guide: string;
}

const PRE_1990 = ['pre-1946', '1946-1965', '1966-1980', '1981-1995'];
const PRE_1960 = ['pre-1946', '1946-1965'];
const OLDER_ERAS = ['pre-1946', '1946-1965', '1966-1980'];

export function screenSpecialtyTests(input: ScreenerInput): TestFlag[] {
  const { era, heat, water, symptoms, goals } = input;
  const flags: TestFlag[] = [];
  const fuel = heat === 'gas' || heat === 'oil';
  const reno = goals.includes('reno') || goals.includes('heatpump') || goals.includes('bills') || goals.includes('comfort');
  const buying = goals.includes('buying');

  // Radon — Health Canada recommends every home test.
  flags.push({
    id: 'radon',
    name: 'Radon test',
    level: reno || buying ? 'strongly-flagged' : 'recommended',
    why:
      buying
        ? 'Health Canada recommends every home test — and a purchase is the moment to start the 3-month kit.'
        : reno
          ? 'Health Canada recommends every home test — and air-sealing or basement work without knowing your radon number is doing it blind.'
          : 'Health Canada recommends every home be tested, whatever its age or location.',
    guide: '/tests/radon/',
  });

  // CO — law + physics for fuel-burning homes.
  if (fuel) {
    flags.push({
      id: 'carbon-monoxide',
      name: 'Carbon monoxide alarms & spillage check',
      level: 'strongly-flagged',
      why: 'You heat with combustion — Ontario law requires CO alarms near sleeping areas, and tightening the house makes the audit’s spillage check essential.',
      guide: '/tests/carbon-monoxide/',
    });
  } else {
    flags.push({
      id: 'carbon-monoxide',
      name: 'Carbon monoxide alarms',
      level: 'recommended',
      why: 'No combustion heating — but any gas appliance, fireplace, or attached garage still calls for working CO alarms (check their expiry dates).',
      guide: '/tests/carbon-monoxide/',
    });
  }

  // Asbestos / vermiculite — pre-1990 materials.
  if (PRE_1990.includes(era)) {
    const strong = OLDER_ERAS.includes(era);
    flags.push({
      id: 'asbestos-vermiculite',
      name: 'Asbestos & vermiculite sampling',
      level: strong ? 'strongly-flagged' : 'flagged',
      why: strong
        ? 'Your home’s era is squarely in the vermiculite/asbestos window — sample before any attic or renovation work disturbs old materials.'
        : 'Early-materials risk at the tail of the asbestos era — check attic insulation and older finishes before disturbing them.',
      guide: '/tests/asbestos-vermiculite/',
    });
  }

  // Lead paint — pre-1960 likely, pre-1990 possible; matters when disturbing paint.
  if (PRE_1960.includes(era)) {
    flags.push({
      id: 'lead-paint',
      name: 'Lead paint testing',
      level: 'strongly-flagged',
      why: 'Homes of this era very likely contain lead paint — any window, trim, or wall work needs a cheap swab test first.',
      guide: '/tests/lead-paint/',
    });
  } else if (PRE_1990.includes(era) && (goals.includes('reno') || symptoms.length > 0)) {
    flags.push({
      id: 'lead-paint',
      name: 'Lead paint testing',
      level: 'flagged',
      why: 'Pre-1990 paint layers can contain lead — swab-test before sanding or removing trim and windows.',
      guide: '/tests/lead-paint/',
    });
  }

  // Mold / IAQ — symptom-driven.
  if (input.symptoms.includes('condensation-mould')) {
    flags.push({
      id: 'mold-iaq',
      name: 'Mold & indoor air quality assessment',
      level: 'flagged',
      why: 'You flagged condensation or musty air — diagnose the moisture cause first (the audit does this); sampling confirms scope if odours persist.',
      guide: '/tests/mold-iaq/',
    });
  }

  // Well water — rural homes.
  if (water === 'well') {
    flags.push({
      id: 'well-water',
      name: 'Well water testing',
      level: 'strongly-flagged',
      why: buying
        ? 'Private well — test before closing, and then at least annually (bacteriological testing is free in Ontario).'
        : 'Private well — Ontario recommends bacteriological testing at least annually, and it’s free through the public health lab.',
      guide: '/tests/well-water/',
    });
  } else if (water === 'unsure') {
    flags.push({
      id: 'well-water',
      name: 'Well water testing',
      level: 'recommended',
      why: 'Not sure of your water source? Rural properties on wells should test at least annually — free in Ontario.',
      guide: '/tests/well-water/',
    });
  }

  const order = { 'strongly-flagged': 0, flagged: 1, recommended: 2 } as const;
  return flags.sort((a, b) => order[a.level] - order[b.level]);
}
