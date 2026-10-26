/**
 * US Home Energy Planner: wording, the upgrade sequence and the test screener.
 *
 * The sequence logic (era priorities re-scored by heating fuel, symptoms and goals) is the
 * Canadian planner's, with US wording. Test and safety facts come only from the US research
 * files (src/data/us/tests.json, federal.json), verified October 12, 2026; they are passed in
 * from the page's build-time payload rather than restated here.
 */
import type { Vintage } from '../calc/engine';

export const VINTAGES: Vintage[] = ['pre-1946', '1946-1965', '1966-1980', '1981-1995', '1996-2010', '2011-plus'];

export interface Priority { category: string; action: string; why: string }
export interface Watch { flag: string; detail: string; severity: 'safety' | 'comfort' | 'cost' }
export interface Era {
  label: string;
  title: string;
  /** "a typical prewar house" */
  typical: string;
  years: string;
  air: string;
  watch: Watch[];
  priorities: Priority[];
}

const LEAD: Watch = {
  flag: 'Lead paint',
  detail: 'EPA says homes built before 1978 are more likely to have lead-based paint. Paid work that disturbs paint in these homes must be done by a lead-safe certified firm.',
  severity: 'safety',
};
const VERMICULITE: Watch = {
  flag: 'Vermiculite attic insulation',
  detail: 'EPA: most vermiculite sold in the U.S. from 1919 to 1990 came from a mine near Libby, Montana, and was contaminated with asbestos. If your attic has it, leave it undisturbed and have an accredited professional assess it before any attic work.',
  severity: 'safety',
};

export const ERAS: Record<Vintage, Era> = {
  'pre-1946': {
    label: 'Before 1946',
    title: 'a prewar home',
    typical: 'a typical prewar house',
    years: 'Built before 1946',
    air: 'Very leaky',
    watch: [
      LEAD,
      VERMICULITE,
      { flag: 'Old wiring', detail: 'Houses this old can still have knob-and-tube wiring, which shouldn’t be buried in insulation. Have an electrician check before insulating the walls or attic.', severity: 'safety' },
    ],
    priorities: [
      { category: 'air-sealing', action: 'Air sealing, guided by a blower door test', why: 'The cheapest big win in a leaky house: attic hatches, top plates, rim joists and chases.' },
      { category: 'attic-insulation', action: 'Attic insulation, after sealing and safety checks', why: 'Usually the highest return per dollar once the attic floor is sealed.' },
      { category: 'basement-insulation', action: 'Basement and rim joist insulation', why: 'Bare foundation walls lose a lot of heat, and insulating them makes the space more usable.' },
      { category: 'wall-insulation', action: 'Wall insulation where the cavities allow', why: 'Dense-pack insulation fills empty frame walls; solid brick needs a different approach, so get advice before committing.' },
      { category: 'heat-pump', action: 'A right-sized heat pump when the heating system is due', why: 'After the envelope work, a smaller unit can heat the whole house.' },
    ],
  },
  '1946-1965': {
    label: '1946–1965',
    title: 'a postwar home',
    typical: 'a typical postwar house',
    years: 'Built 1946–1965',
    air: 'Leaky, especially at rim joists and attic openings',
    watch: [
      LEAD,
      VERMICULITE,
      { flag: 'Old oil tanks', detail: 'If the house was ever heated with oil, an old tank may remain, buried or in the basement. Insurers and lenders ask about them.', severity: 'cost' },
    ],
    priorities: [
      { category: 'attic-insulation', action: 'Attic insulation top-up', why: 'Quick to do, and usually one of the faster paybacks in a house this age.' },
      { category: 'air-sealing', action: 'Air sealing with the attic work', why: 'Sealing before insulating locks in the gain.' },
      { category: 'basement-insulation', action: 'Basement walls and rim joist', why: 'Bare concrete loses a lot of heat.' },
      { category: 'heat-pump', action: 'Heat pump when the furnace or air conditioner is due', why: 'If the house has ducts, a ducted heat pump can replace both the furnace and the air conditioner.' },
      { category: 'windows-doors', action: 'Windows when the budget allows', why: 'Comfort and quiet improve more than bills, so do the cheaper envelope work first.' },
    ],
  },
  '1966-1980': {
    label: '1966–1980',
    title: 'a 1966–1980 home',
    typical: 'a typical 1966–1980 house',
    years: 'Built 1966–1980',
    air: 'Moderately leaky',
    watch: [
      { ...LEAD, flag: 'Lead paint, if built before 1978' },
      VERMICULITE,
      { flag: 'Aluminum wiring', detail: 'Some homes of this era have aluminum branch wiring. An electrician should check the connections before renovation work.', severity: 'safety' },
    ],
    priorities: [
      { category: 'heat-pump', action: 'Heat pump, especially in an electrically heated house', why: 'The biggest bill cut available to homes heated with electric resistance.' },
      { category: 'attic-insulation', action: 'Attic insulation top-up', why: 'Still thin by today’s standards.' },
      { category: 'air-sealing', action: 'Air sealing', why: 'Split-levels leak at their many wall and roof junctions.' },
      { category: 'basement-insulation', action: 'Basement wall insulation during any basement project', why: 'Catch it while the walls are open.' },
      { category: 'controls', action: 'Smart thermostat and setbacks', why: 'A low-cost trim on any heating system.' },
    ],
  },
  '1981-1995': {
    label: '1981–1995',
    title: 'a 1981–1995 home',
    typical: 'a typical 1981–1995 house',
    years: 'Built 1981–1995',
    air: 'Tighter, which makes ventilation matter',
    watch: [
      { ...VERMICULITE, flag: 'Vermiculite attic insulation, if built before 1990' },
      { flag: 'Condensation and humidity', detail: 'A tighter house without mechanical ventilation can show window condensation and musty air. Those are ventilation problems, not window problems.', severity: 'comfort' },
      { flag: 'Aging equipment', detail: 'If the original furnace or air conditioner is still running, plan its replacement before it fails.', severity: 'cost' },
    ],
    priorities: [
      { category: 'heat-pump', action: 'Heat pump when the furnace or air conditioner is due', why: 'If the original equipment is still running, its replacement is the moment to price a heat pump.' },
      { category: 'ventilation', action: 'Ventilation check, and an HRV or ERV if humidity is a problem', why: 'Fixes condensation and stale air at the source.' },
      { category: 'attic-insulation', action: 'Attic insulation top-up', why: 'A modest gain, but cheap to do.' },
      { category: 'air-sealing', action: 'Targeted air sealing', why: 'Rim joists and attic penetrations still leak.' },
      { category: 'water-heating', action: 'Heat pump water heater when the tank is due', why: 'Plan it before the old tank fails, so you aren’t stuck with a like-for-like swap.' },
    ],
  },
  '1996-2010': {
    label: '1996–2010',
    title: 'a 1996–2010 home',
    typical: 'a typical 1996–2010 house',
    years: 'Built 1996–2010',
    air: 'Moderate',
    watch: [
      { flag: 'The room over the garage', detail: 'A classic cold room: gaps in the floor insulation and ducts running through unheated space.', severity: 'comfort' },
      { flag: 'Builder-grade ductwork', detail: 'Leaky, unbalanced ducts make upstairs rooms hot in summer and cold in winter.', severity: 'comfort' },
    ],
    priorities: [
      { category: 'attic-insulation', action: 'Attic insulation top-up', why: 'Still worthwhile where the attic is below the target for your climate.' },
      { category: 'heat-pump', action: 'Heat pump when the air conditioner or furnace is due', why: 'Replace the air conditioner with a heat pump and get heating included.' },
      { category: 'air-sealing', action: 'Duct sealing and targeted air sealing', why: 'The usual fix for uneven rooms.' },
      { category: 'controls', action: 'Smart thermostat', why: 'A low-cost trim.' },
      { category: 'water-heating', action: 'Heat pump water heater when the tank is due', why: 'Plan it before the old tank fails, so you aren’t stuck with a like-for-like swap.' },
    ],
  },
  '2011-plus': {
    label: '2011 or later',
    title: 'a home built since 2011',
    typical: 'a typical house built since 2011',
    years: 'Built 2011 or later',
    air: 'Fairly tight',
    watch: [
      { flag: 'Builder shortcuts', detail: 'Missed insulation and unbalanced heating and cooling show up even in new homes, and warranty periods run out.', severity: 'cost' },
      { flag: 'Oversized equipment', detail: 'An oversized furnace or air conditioner cycles on and off and wears early. ACCA’s Manual J (loads) and Manual S (equipment) are the sizing methods building codes refer to.', severity: 'cost' },
    ],
    priorities: [
      { category: 'heat-pump', action: 'Heat pump at the first equipment replacement', why: 'When the air conditioner fails, replace it with a heat pump rather than buying cooling-only again.' },
      { category: 'controls', action: 'Smart controls and monitoring', why: 'Low-cost tuning for a tight house.' },
      { category: 'air-sealing', action: 'Verify, don’t assume', why: 'A blower door test confirms the builder delivered the airtightness the code calls for.' },
      { category: 'water-heating', action: 'Heat pump water heater when the tank is due', why: 'Plan it before the old tank fails, so you aren’t stuck with a like-for-like swap.' },
    ],
  },
};

export const SYMPTOMS: { value: string; label: string }[] = [
  { value: 'drafty-rooms', label: 'Drafts or cold rooms' },
  { value: 'high-heating-bills', label: 'High heating bills' },
  { value: 'ice-dams', label: 'Ice dams or big icicles' },
  { value: 'cold-second-floor', label: 'Upstairs too hot or too cold' },
  { value: 'condensation-mold', label: 'Condensation or musty air' },
  { value: 'cold-basement', label: 'Cold basement or floors' },
  { value: 'summer-overheating', label: 'Won’t stay cool in summer' },
];

export const GOALS: { value: string; label: string }[] = [
  { value: 'bills', label: 'Lower my bills' },
  { value: 'comfort', label: 'Fix comfort problems' },
  { value: 'heatpump', label: 'Get a heat pump' },
  { value: 'solar', label: 'Add solar' },
  { value: 'buying', label: 'Buying or just bought' },
  { value: 'reno', label: 'Renovating (opening walls or trim)' },
  { value: 'emissions', label: 'Cut emissions' },
];

/* ------------------------------------------------------------------ the sequence */

export interface SeqInput {
  age: Vintage;
  heat: string;
  wh: string;
  win: string;
  found: string;
  syms: string[];
  goals: string[];
}

export interface SeqItem { category: string; action: string; why: string; score: number }

/** The Canadian planner's sequencing, with US wording and the foundation answer applied. */
export function buildSequence(a: SeqInput): SeqItem[] {
  const era = ERAS[a.age];
  const items: SeqItem[] = era.priorities.map((p, i) => ({ ...p, score: i * 10 }));
  const boost = (cat: string, by: number) => {
    const it = items.find((i) => i.category === cat);
    if (it) it.score -= by;
  };
  const ensure = (cat: string, action: string, why: string, score: number) => {
    if (!items.find((i) => i.category === cat)) items.push({ category: cat, action, why, score });
  };
  const resistanceOrFuel = ['electric', 'elecfurnace', 'oil', 'propane'].includes(a.heat);
  if (resistanceOrFuel) {
    ensure('heat-pump', 'Heat pump', 'With your heating fuel, this is usually the biggest single saving available.', -50);
    boost('heat-pump', 100);
  }
  if (a.heat === 'heatpump' || a.heat === 'geothermal') {
    const idx = items.findIndex((i) => i.category === 'heat-pump');
    if (idx >= 0) items.splice(idx, 1);
    ensure('controls', 'Get more from the heat pump you have', 'Controls, balancing and envelope work make an existing heat pump cheaper to run.', 45);
  }
  if (a.win === 'single' || a.win === 'singlestorm') boost('windows-doors', 15);
  if (['electric', 'oil', 'propane'].includes(a.wh)) {
    const why = a.wh === 'electric'
      ? 'A heat pump water heater does the electric tank’s job on less than half the electricity (efficiency 2.2 against 0.92 in our model).'
      : `A heat pump water heater replaces the ${a.wh === 'oil' ? 'oil' : 'propane'}-fired tank; the saving below is at your state’s prices.`;
    ensure('water-heating', 'Heat pump water heater', why, 35);
  }
  const syms = a.syms;
  if (syms.includes('ice-dams')) { boost('air-sealing', 30); boost('attic-insulation', 25); }
  if (syms.includes('drafty-rooms')) boost('air-sealing', 25);
  if (syms.includes('cold-basement')) {
    boost('basement-insulation', 30);
    ensure('basement-insulation', 'Basement and rim joist insulation', 'Directly targets the cold basement or floors you flagged.', 25);
  }
  if (syms.includes('summer-overheating')) { boost('attic-insulation', 20); boost('heat-pump', 10); }
  if (syms.includes('cold-second-floor')) boost('air-sealing', 15);
  if (syms.includes('condensation-mold')) {
    ensure('ventilation', 'Ventilation check (HRV or ERV)', 'Condensation and musty air are usually ventilation problems: fix the cause, not the windows.', -10);
  }
  if (a.goals.includes('heatpump')) boost('heat-pump', 40);
  if (a.goals.includes('solar')) {
    ensure('solar', 'Rooftop solar', 'On your goal list. Solar doesn’t lower the heat a house needs, so it comes after the envelope work here.', 55);
  }
  if (a.goals.includes('emissions') && (a.heat === 'gas' || a.heat === 'gasboiler')) boost('heat-pump', 20);

  // The 1966–1980 heat pump wording is about electric heat; fit it to the home's actual fuel.
  const hp = items.find((i) => i.category === 'heat-pump');
  if (hp && /electric/i.test(hp.action) && !['electric', 'elecfurnace'].includes(a.heat)) {
    if (a.heat === 'oil' || a.heat === 'propane') {
      hp.action = 'Heat pump';
      hp.why = 'With your heating fuel, this is usually the biggest single saving available.';
    } else {
      hp.action = 'Heat pump when the furnace or air conditioner is due';
      hp.why = 'If the house has ducts, a ducted heat pump can replace both the furnace and the air conditioner.';
    }
  }
  // Already has a heat pump water heater: nothing to suggest there.
  if (a.wh === 'heatpump') {
    const wi = items.findIndex((i) => i.category === 'water-heating');
    if (wi >= 0) items.splice(wi, 1);
  }

  // foundation: slabs have no basement walls; crawlspaces get their own item
  const bi = items.findIndex((i) => i.category === 'basement-insulation');
  if (bi >= 0 && a.found === 'slab') items.splice(bi, 1);
  else if (bi >= 0 && a.found === 'crawl') {
    items[bi] = {
      ...items[bi], category: 'crawlspace', action: 'Seal the crawlspace, or insulate the floor above it',
      why: syms.includes('cold-basement') ? 'Directly targets the cold floors you flagged.' : 'Floors over an unheated crawlspace lose heat, and an audit shows which fix suits yours.',
    };
  } else if (bi >= 0 && a.found === 'unsure') {
    items[bi] = { ...items[bi], action: 'Basement or crawlspace insulation' };
  }

  items.sort((x, y) => x.score - y.score);
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.category) ? false : (seen.add(i.category), true))).slice(0, 6);
}

/* ------------------------------------------------------------------ tests */

/** Facts for the test cards, assembled at build time from src/data/us/tests.json. */
export interface TestFacts {
  /** "5A" → 3.0 or 5.0 (2021 IECC new-home limit) */
  blowerLimitByZone: { warm: number; cold: number };
  ductLimit: number;
  /** per state: short requirement text */
  radonLicense: Record<string, string>;
  coLaw: Record<string, string | null>;
  moldLicense: Record<string, string>;
}

export interface TestPick {
  slug: string;
  name: string;
  icon: string;
  why: string;
  note?: string;
  level?: 'strongly-flagged' | 'flagged' | 'recommended';
}

export interface TestInput {
  age: Vintage;
  heat: string;
  wh: string;
  sec: string[];
  water: string;
  syms: string[];
  goals: string[];
  ac: string;
  state: string;
  stateName: string;
  zone: string | null;
  radonZone: number | null;
  radonCounty: string | null;
}

const OLDER = ['pre-1946', '1946-1965', '1966-1980'];
const NEWER = ['1981-1995', '1996-2010', '2011-plus'];
const PRE_1990 = ['pre-1946', '1946-1965', '1966-1980', '1981-1995'];
const PRE_1966 = ['pre-1946', '1946-1965'];

const FUEL_HEAT = ['gas', 'gasboiler', 'oil', 'propane'];
const FUEL_WH = ['gastank', 'gastankless', 'oil', 'propane'];
const DUCTED = ['gas', 'elecfurnace', 'heatpump', 'geothermal', 'propane', 'oil'];

export function combustionAtHome(t: { heat: string; wh: string; sec: string[] }): boolean {
  return FUEL_HEAT.includes(t.heat) || FUEL_WH.includes(t.wh) || t.sec.includes('woodstove');
}

/** Energy tests worth asking an auditor for by name. */
export function energyTests(t: TestInput, f: TestFacts): TestPick[] {
  const picks: TestPick[] = [];
  const older = OLDER.includes(t.age);
  const zoneNum = (t.zone ?? '').match(/^\d/)?.[0];
  const limit = zoneNum ? (Number(zoneNum) <= 2 ? f.blowerLimitByZone.warm : f.blowerLimitByZone.cold) : null;
  picks.push({
    slug: 'blower-door', name: 'Blower door test', icon: 'fan',
    why: older ? 'Air leakage is the big unknown in a house this age. This puts a number on it and finds where the air gets in.' : 'Checks how airtight the house really is; builders and later renovations leave gaps.',
    note: limit !== null
      ? `Result in ACH50. For comparison, the 2021 IECC holds new homes in climate zone ${t.zone} to ${limit.toFixed(1)} ACH50 or less.`
      : 'Result in ACH50, the number air-sealing work is measured against.',
  });
  picks.push({
    slug: 'thermal-imaging', name: 'Infrared (thermal) scan', icon: 'camera',
    why: t.syms.includes('drafty-rooms') ? 'Finds the cold walls you flagged without opening anything.' : 'Shows which wall and ceiling cavities are empty before you pay to fill them.',
    note: 'ASTM C1060 thermographic inspection; DOE says many professional assessments pair it with a blower door test.',
  });
  if (combustionAtHome(t)) {
    picks.push({
      slug: 'combustion-safety', name: 'Combustion safety test', icon: 'flame',
      why: 'You have fuel-burning equipment. Tightening the house calls for this check first.',
      note: 'Under BPI’s standards the auditor tests for spillage and carbon monoxide at the appliances with the house at its worst-case air pressure.',
    });
  }
  if (t.goals.includes('heatpump') || ['electric', 'elecfurnace', 'oil', 'propane'].includes(t.heat) || t.syms.includes('summer-overheating') || t.ac === 'central-old') {
    picks.push({
      slug: 'heat-loss-calc', name: 'Heating and cooling load calculation (Manual J)', icon: 'gauge',
      why: 'Sizes a heat pump or air conditioner before anyone quotes you; oversizing is a common and costly mistake.',
      note: 'ACCA says codes and most state and local jurisdictions require a Manual J load calculation; Manual S then sizes the equipment.',
    });
  }
  if ((t.syms.includes('cold-second-floor') || t.syms.includes('summer-overheating')) && DUCTED.includes(t.heat)) {
    picks.push({
      slug: 'duct-leakage', name: 'Duct leakage test', icon: 'duct',
      why: 'Hot and cold rooms usually trace back to the ducts. Measure before buying bigger equipment.',
      note: `For comparison, the 2021 IECC allows new homes ${f.ductLimit.toFixed(1)} cfm25 of total duct leakage per 100 sq ft of floor area.`,
    });
  }
  picks.push({
    slug: 'bill-analysis', name: '12-month bill analysis', icon: 'chart',
    why: 'Bring a year of bills to the audit; it anchors every projection to how your house really uses energy.',
    note: 'If your utility offers Green Button “Download My Data”, you can export a year of usage in a standard format.',
  });
  return picks;
}

const ZONE_DESC: Record<number, string> = {
  1: 'Zone 1 (highest potential)',
  2: 'Zone 2 (moderate potential)',
  3: 'Zone 3 (low potential)',
};

/** Specialty health tests, screened from the intake, sorted strongest first. */
export function specialtyTests(t: TestInput, f: TestFacts): TestPick[] {
  const flags: TestPick[] = [];
  const reno = t.goals.some((g) => ['reno', 'heatpump', 'bills', 'comfort'].includes(g));
  const buying = t.goals.includes('buying');
  const fuel = combustionAtHome(t);

  // Radon: EPA says every home should be tested.
  let radonWhy = buying
    ? 'EPA says every home should be tested, and a purchase is the time to do it. It recommends fixing at 4 pCi/L or more and considering a fix from 2 pCi/L.'
    : reno
      ? 'EPA says every home should be tested, and air sealing or basement work without knowing your radon level is working blind. EPA recommends fixing at 4 pCi/L or more.'
      : 'EPA says every home should be tested, whatever its age or location. It recommends fixing at 4 pCi/L or more.';
  const notes: string[] = [];
  if (t.radonZone && t.radonCounty) notes.push(`On EPA’s 1993 Map of Radon Zones, ${t.radonCounty} (the metro’s principal county) is in ${ZONE_DESC[t.radonZone] ?? `Zone ${t.radonZone}`}; EPA says high levels turn up in all three zones.`);
  if (f.radonLicense[t.state]) notes.push(f.radonLicense[t.state]);
  flags.push({ slug: 'radon', name: 'Radon test', icon: 'radon', level: reno || buying ? 'strongly-flagged' : 'recommended', why: radonWhy, note: notes.join(' ') || undefined });

  // Carbon monoxide
  const co = f.coLaw[t.state];
  flags.push({
    slug: 'carbon-monoxide',
    name: fuel ? 'Carbon monoxide alarms and a spillage check' : 'Carbon monoxide alarms',
    icon: 'co',
    level: fuel ? 'strongly-flagged' : 'recommended',
    why: fuel
      ? 'You have fuel-burning equipment. CPSC recommends CO alarms on every level of the home and outside sleeping areas, and tightening the house makes the audit’s spillage check essential.'
      : 'No fuel-burning heating, but a gas range, fireplace or attached garage still calls for working CO alarms. CPSC recommends them on every level and outside sleeping areas.',
    note: co ?? undefined,
  });

  // Asbestos and vermiculite
  if (PRE_1990.includes(t.age)) {
    const strong = OLDER.includes(t.age);
    flags.push({
      slug: 'asbestos-vermiculite', name: 'Asbestos and vermiculite check', icon: 'hazard',
      level: strong ? 'strongly-flagged' : 'flagged',
      why: strong
        ? 'Your home’s era overlaps the years asbestos-contaminated vermiculite was sold (1919 to 1990, per EPA). Have damaged or soon-to-be-disturbed materials assessed before attic or renovation work.'
        : 'If the house was built before 1990, check the attic for vermiculite before any work there.',
      note: 'EPA: don’t take samples yourself, because sampling can release fibers; a trained, accredited professional should.',
    });
  }

  // Lead paint: pre-1978 homes
  if (PRE_1966.includes(t.age) || t.age === '1966-1980') {
    const strong = PRE_1966.includes(t.age) || buying || t.goals.includes('reno');
    flags.push({
      slug: 'lead-paint', name: 'Lead paint testing', icon: 'paint',
      level: strong ? 'strongly-flagged' : 'flagged',
      why: t.age === '1966-1980'
        ? 'If the house was built before 1978, EPA says lead-based paint is more likely. Test before sanding, scraping or replacing windows and trim.'
        : 'EPA says homes built before 1978 are more likely to have lead-based paint. Test before sanding, scraping or replacing windows and trim.',
      note: buying
        ? 'Under the federal disclosure rule, buyers of pre-1978 homes get 10 days to arrange a lead-based paint inspection or risk assessment, unless they agree otherwise in writing.'
        : 'Paid renovation that disturbs paint in a pre-1978 home must be done by an EPA or state lead-safe certified firm.',
    });
  }

  // Mold: symptom-driven
  if (t.syms.includes('condensation-mold')) {
    flags.push({
      slug: 'mold-iaq', name: 'Mold and indoor air check', icon: 'mold', level: 'flagged',
      why: 'You flagged condensation or musty air. Find and fix the moisture source first; EPA says sampling is usually unnecessary when mold is visible, and areas under about 10 sq ft can usually be cleaned yourself.',
      note: f.moldLicense[t.state] ?? 'EPA sets no federal limits for mold, so sampling can’t show compliance with a standard.',
    });
  }

  // Well water
  if (t.water === 'well' || t.water === 'unsure') {
    flags.push({
      slug: 'well-water', name: 'Well water testing', icon: 'water',
      level: t.water === 'well' ? 'strongly-flagged' : 'recommended',
      why: t.water === 'well'
        ? 'Private wells aren’t covered by the federal Safe Drinking Water Act. EPA says to test every year for total coliform bacteria, nitrates, total dissolved solids and pH.'
        : 'Not sure of your water source? If the house is on a private well, EPA says to test it every year for coliform bacteria, nitrates, dissolved solids and pH.',
      note: 'Use a lab certified for drinking-water testing; EPA notes local health departments may test private wells for free.',
    });
  }

  const order = { 'strongly-flagged': 0, flagged: 1, recommended: 2 } as const;
  return flags.sort((a, b) => order[a.level ?? 'recommended'] - order[b.level ?? 'recommended']);
}
