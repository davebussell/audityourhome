/**
 * US Home Energy Planner: wording, the upgrade sequence, homeowner concerns and the test screener.
 *
 * The sequence starts from what houses of each era usually need, then re-scores it by heating
 * fuel, cooling, foundation, climate, the problems the homeowner picked and their goals. Where
 * cooling outweighs heating (cooling degree days above heating degree days), the money each upgrade
 * saves (heating plus cooling, from plan-model.ts and plan-cooling.ts) sets the order instead of
 * the era list. Test and safety facts come only from the US research files (src/data/us/tests.json,
 * federal.json), verified October 12, 2026, and are passed in from the page's build-time payload.
 */
import type { Vintage } from '../calc/engine';
import { stateLine } from './state-text';

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

/** Climate classes the planner words its advice for (from the metro's climate profile). */
export type ClimClass = 'cold' | 'mixed' | 'mixed-warm' | 'hot-humid' | 'hot-dry' | 'mild' | 'marine';

export function climClass(profileKey: string | null | undefined): ClimClass | null {
  switch (profileKey) {
    case 'very-cold': case 'cold': case 'cold-dry': return 'cold';
    case 'mixed-humid': return 'mixed';
    case 'mixed-humid-warm': return 'mixed-warm';
    case 'hot-humid': return 'hot-humid';
    case 'hot-dry': return 'hot-dry';
    case 'mild-coastal': return 'mild';
    case 'marine': return 'marine';
  }
  return null;
}
const humidClass = (c: ClimClass | null) => c === 'hot-humid' || c === 'mixed-warm';
const hotClass = (c: ClimClass | null) => c === 'hot-humid' || c === 'hot-dry' || c === 'mixed-warm';

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
      { category: 'air-sealing', action: 'Air sealing, guided by a blower door test', why: 'The cheapest big win in a leaky house: attic hatches, top plates and chases{rim}.' },
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
    air: 'Leaky, especially at attic openings{rimAir}',
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
      { category: 'air-sealing', action: 'Air sealing', why: 'Houses this age leak at attic hatches, top plates and the holes cut for wiring and plumbing{rim}.' },
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
      { category: 'air-sealing', action: 'Targeted air sealing', why: 'Attic penetrations and top plates still leak{rim}.' },
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

/** Fill the {rim} placeholders: no rim joists to talk about in a slab house. */
export function foundationText(s: string, found: string): string {
  const slab = found === 'slab';
  return s
    .replace('{rim}', slab ? '' : found === 'crawl' ? ', and the rim joists above the crawlspace' : ', and the rim joists')
    .replace('{rimAir}', slab ? '' : ' and rim joists');
}

/** Watch items adjusted to the climate, the heating fuel and the foundation. */
export function watchFor(era: Era, o: { cls: ClimClass | null; heat: string }): Watch[] {
  return era.watch
    .filter((w) => !(w.flag === 'Old oil tanks' && o.heat !== 'oil' && (hotClass(o.cls) || o.cls === 'mild')))
    .map((w) => {
      if (w.flag === 'Condensation and humidity' && humidClass(o.cls)) {
        return { ...w, detail: 'Musty air here usually comes from humid outdoor air leaking in, leaky return ducts in the attic, and an AC that cools without running long enough to dry the air, not from too little ventilation.' };
      }
      if (w.flag === 'Condensation and humidity' && o.cls === 'hot-dry') {
        return { ...w, flag: 'Dust and stale air', detail: 'A tighter house still needs fresh air: in dry, dusty heat, controlled ventilation with good filtration beats relying on leaks.' };
      }
      if (w.flag === 'The room over the garage' && (hotClass(o.cls) || o.cls === 'mild')) {
        return { ...w, detail: 'A classic problem room: hot in summer, and cold on winter nights, from gaps in the floor insulation and ducts running through the garage ceiling or attic.' };
      }
      if (w.flag === 'Old oil tanks' && o.heat === 'oil') {
        return { ...w, detail: 'Check the tank’s age and condition: insurers and lenders ask about it, and a heat pump conversion is the moment to remove it properly.' };
      }
      return w;
    });
}

/* ------------------------------------------------------------------ symptoms and concerns */

/** Homeowner problems, in the words of the /us/issues/<slug>/ pages. */
export const SYMPTOMS: { value: string; label: string }[] = [
  { value: 'high-summer-bills', label: 'High summer (cooling) bills' },
  { value: 'humid-indoors', label: 'Humid or sticky indoors' },
  { value: 'hot-upstairs', label: 'Hot upstairs or hot rooms' },
  { value: 'ac-runs-constantly', label: 'AC runs constantly or can’t keep up' },
  { value: 'musty-smell', label: 'Musty smell or mold' },
  { value: 'dust-smoke', label: 'Dust or smoke getting in' },
  { value: 'high-heating-bills', label: 'High heating bills' },
  { value: 'drafts-cold-rooms', label: 'Drafts or cold rooms' },
  { value: 'ice-dams', label: 'Ice dams or big icicles' },
  { value: 'cold-floors', label: 'Cold floors or basement' },
  { value: 'window-condensation', label: 'Condensation on windows in winter' },
];

/** Older saved plans used these values. */
export const LEGACY_SYMPTOM: Record<string, string> = {
  'drafty-rooms': 'drafts-cold-rooms',
  'high-heating-bills': 'high-heating-bills',
  'ice-dams': 'ice-dams',
  'cold-second-floor': 'hot-upstairs',
  'condensation-mold': 'musty-smell',
  'condensation-mould': 'musty-smell',
  'cold-basement': 'cold-floors',
  'summer-overheating': 'ac-runs-constantly',
};

/** A climate profile's own complaint labels (src/data/climate/us.json) → the planner's symptom slugs. */
export function profileSymptoms(labels: string[]): string[] {
  const out: string[] = [];
  const add = (s: string) => { if (!out.includes(s)) out.push(s); };
  for (const l of labels) {
    if (/summer bill|cooling bill/i.test(l)) add('high-summer-bills');
    else if (/humid|sticky/i.test(l)) add('humid-indoors');
    else if (/AC runs|can.t keep up|breaks down/i.test(l)) add('ac-runs-constantly');
    else if (/upstairs|hot room|west-facing|heat waves/i.test(l)) add('hot-upstairs');
    else if (/musty|mold|damp/i.test(l)) add('musty-smell');
    else if (/dust|smoke/i.test(l)) add('dust-smoke');
    else if (/winter bill|heating bill/i.test(l)) add('high-heating-bills');
    else if (/draft|cold room/i.test(l)) add('drafts-cold-rooms');
    else if (/ice dam/i.test(l)) add('ice-dams');
    else if (/cold floor|basement/i.test(l)) add('cold-floors');
    else if (/condensation/i.test(l)) add('window-condensation');
  }
  return out;
}

export interface Concern {
  label: string;
  /** likely causes, by climate class (falls back to "any") */
  causes: Partial<Record<ClimClass | 'any', string>>;
  /** tests that confirm the cause (test slugs) */
  tests: string[];
  /** the fix ladder: cheapest first */
  ladder: Partial<Record<ClimClass | 'any', string[]>>;
}

export const CONCERNS: Record<string, Concern> = {
  'high-summer-bills': {
    label: 'High summer (cooling) bills',
    causes: {
      'hot-humid': 'Usually ducts and the air handler in a hot attic leaking cooled air, attic heat soaking through thin insulation, sun on unshaded windows, and an AC working hard to dry the air as well as cool it.',
      'hot-dry': 'Usually an aging or oversized AC, leaky attic ducts, attic heat and west sun on clear glass. In months of 100°F days, every leak and every point of efficiency shows on the bill.',
      'mixed-warm': 'Usually leaky ducts in the attic or crawlspace, thin attic insulation and an older AC, plus long, humid summers.',
      mixed: 'Usually leaky ducts, thin attic insulation and an older AC; muggy summers add a dehumidifying load.',
      any: 'Usually an older or oversized AC, leaky ducts in the attic, or rooms that overheat from sun. With a short cooling season, the cheap fixes come first.',
    },
    tests: ['duct-leakage', 'attic-inspection', 'bill-analysis'],
    ladder: {
      any: [
        'Raise the cooling setting a couple of degrees, use ceiling fans, and close blinds on sunny windows.',
        'Seal and insulate the ducts, then seal and insulate the attic floor.',
        'When the AC is due, a right-sized (Manual J) variable-speed heat pump or AC.',
      ],
    },
  },
  'humid-indoors': {
    label: 'Humid or sticky indoors',
    causes: {
      'hot-humid': 'Usually an oversized AC that cools quickly but doesn’t run long enough to dry the air, return ducts pulling in humid attic or crawlspace air, and outdoor air leaking in.',
      'mixed-warm': 'Usually an AC that short-cycles, leaky return ducts in a humid crawlspace or attic, and outdoor air leaking in during long, muggy summers.',
      mixed: 'Usually a damp basement plus an AC that short-cycles in muggy weather; outdoor air leaking in adds to it.',
      any: 'Usually moisture from cooking, showers or a damp basement or crawlspace, with too little ventilation or an AC that short-cycles.',
    },
    tests: ['mold-iaq', 'duct-leakage', 'heat-loss-calc'],
    ladder: {
      'hot-humid': [
        'Run bath and kitchen fans, and set the AC fan to “auto”, not “on” (a running fan re-evaporates moisture off the coil).',
        'Seal return ducts and air leaks so humid air stays outside.',
        'Have the AC’s size checked against Manual J; a right-sized variable-speed unit set up to dehumidify, plus a whole-house dehumidifier only if humidity stays above 60%.',
      ],
      'mixed-warm': [
        'Run bath and kitchen fans, and set the AC fan to “auto”.',
        'Seal return ducts, and dry out and close up a damp crawlspace.',
        'Right-size the AC (Manual J), or add a dehumidifier if humidity stays above 60%.',
      ],
      any: [
        'Run bath and kitchen fans, and fix any basement or crawlspace water.',
        'Add a dehumidifier in the basement in summer.',
        'Balanced ventilation (an ERV in humid summers) once the house is tighter.',
      ],
    },
  },
  'hot-upstairs': {
    label: 'Hot upstairs or hot rooms',
    causes: {
      any: 'Usually attic heat through a leaky, thinly insulated attic floor, ducts that leak or are too small on long runs, and sun on west- or south-facing windows.',
    },
    tests: ['duct-leakage', 'thermal-imaging', 'attic-inspection'],
    ladder: {
      any: [
        'Close blinds on sun-facing windows; check that supply registers are open and the filter is clean.',
        'Seal the attic floor and add insulation; seal and balance the ducts to the hot rooms.',
        'Shade screens or low-SHGC glass on the worst windows; a ductless heat pump for a room the ducts can’t serve.',
      ],
    },
  },
  'ac-runs-constantly': {
    label: 'AC runs constantly or can’t keep up',
    causes: {
      'hot-dry': 'In extreme heat a healthy AC can run for hours, but constant running often means low refrigerant, a dirty coil, ducts losing cooled air to the attic, or a unit that is aging out. Here a working AC is also a safety system.',
      any: 'Often low refrigerant or a dirty coil, ducts losing cooled air to the attic, attic heat, or a unit that is too small or near the end of its life.',
    },
    tests: ['duct-leakage', 'heat-loss-calc', 'attic-inspection'],
    ladder: {
      any: [
        'Have the AC serviced: refrigerant charge, airflow, a clean coil and a new filter.',
        'Seal and insulate the ducts and the attic so the AC can keep up.',
        'If it’s old or the wrong size, replace it with a right-sized variable-speed heat pump or AC (Manual J and Manual S), before it fails in a heat wave.',
      ],
    },
  },
  'musty-smell': {
    label: 'Musty smell or mold',
    causes: {
      'hot-humid': 'Usually high indoor humidity: an oversized AC, leaky return ducts in a humid attic, or water getting in after storms.',
      'mixed-warm': 'Usually a damp crawlspace, leaky return ducts and an AC that doesn’t dry the air.',
      any: 'Usually a damp basement or crawlspace, a plumbing or roof leak, or condensation where warm, moist air meets cold surfaces.',
    },
    tests: ['mold-iaq', 'duct-leakage'],
    ladder: {
      any: [
        'Find and fix the water source first; EPA says areas under about 10 sq ft can usually be cleaned yourself.',
        'Bring humidity down: bath and kitchen fans, sealed ducts, a dehumidifier.',
        'Dry out and close up a damp crawlspace or basement before insulating it.',
      ],
    },
  },
  'dust-smoke': {
    label: 'Dust or smoke getting in',
    causes: {
      any: 'Air leaks through the house shell, plus return ducts that pull air from the attic, crawlspace or garage. Smoke and dust ride in on the same leaks.',
    },
    tests: ['blower-door', 'duct-leakage'],
    ladder: {
      any: [
        'Use a MERV 13 filter if your system can take it, and a portable HEPA air cleaner on smoke days.',
        'Seal the leaks a blower door test finds, and seal the return ducts.',
        'Balanced ventilation with filtration once the house is tight.',
      ],
    },
  },
  'high-heating-bills': {
    label: 'High heating bills',
    causes: {
      'hot-humid': 'Heating is a small part of bills here, so a high one usually means electric strip heat: an electric furnace, or a heat pump leaning on its backup heat because of leaky ducts or a fault.',
      'hot-dry': 'Heating is a small part of bills here, so a high one usually means electric strip heat or leaky ducts in a cold attic at night.',
      any: 'Usually air leaks at the attic, rim joists and around openings, thin attic insulation, and an old furnace or electric resistance heat.',
    },
    tests: ['blower-door', 'thermal-imaging', 'bill-analysis'],
    ladder: {
      any: [
        'Seal air leaks, starting at the attic floor.',
        'Insulate the attic, then walls and the basement or crawlspace as needed.',
        'When the heating system is due, a right-sized heat pump.',
      ],
    },
  },
  'drafts-cold-rooms': {
    label: 'Drafts or cold rooms',
    causes: {
      any: 'Air leaks around windows, doors, outlets and the attic hatch; uninsulated walls; or ducts that don’t deliver enough warm air to those rooms.',
    },
    tests: ['blower-door', 'thermal-imaging', 'duct-leakage'],
    ladder: {
      any: [
        'Weatherstrip doors and the attic hatch, and caulk around window trim.',
        'Air sealing guided by a blower door test, then insulation.',
        'Seal or balance the ducts serving the cold rooms.',
      ],
    },
  },
  'ice-dams': {
    label: 'Ice dams or big icicles',
    causes: {
      any: 'Warm house air leaking into the attic melts the snow on the roof, and the water refreezes at the cold eaves.',
    },
    tests: ['thermal-imaging', 'attic-inspection', 'blower-door'],
    ladder: {
      any: [
        'Clear the roof edge safely with a roof rake; don’t chip at the ice.',
        'Seal attic air leaks: light fixtures, top plates, chases and the hatch.',
        'Then add attic insulation and keep the soffit vents clear.',
      ],
    },
  },
  'cold-floors': {
    label: 'Cold floors or basement',
    causes: {
      any: 'Bare foundation walls, leaky rim joists, or an open, damp or uninsulated crawlspace under the floor.',
    },
    tests: ['thermal-imaging', 'blower-door'],
    ladder: {
      any: [
        'Seal the rim joists and the gaps where the house meets the foundation.',
        'Insulate the basement walls or the crawlspace, after fixing any water.',
        'A ductless heat pump head or floor heating for one stubborn room.',
      ],
    },
  },
  'window-condensation': {
    label: 'Condensation on windows in winter',
    causes: {
      any: 'Indoor humidity too high for cold glass, often with too little ventilation; single-pane and older double-pane windows make it worse.',
    },
    tests: ['mold-iaq', 'blower-door'],
    ladder: {
      any: [
        'Run bath and kitchen fans, and keep indoor humidity lower in cold snaps (EPA’s range is 30–50%).',
        'Balanced ventilation (an HRV or ERV) in a tight house.',
        'Better glass when the windows are due.',
      ],
    },
  },
};

export function concernText(slug: string, cls: ClimClass | null): { label: string; cause: string; tests: string[]; ladder: string[] } | null {
  const c = CONCERNS[slug];
  if (!c) return null;
  const pick = <T>(o: Partial<Record<ClimClass | 'any', T>>): T => ((cls && o[cls]) ?? o.any) as T;
  return { label: c.label, cause: pick(c.causes), tests: c.tests, ladder: pick(c.ladder) };
}

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

export interface SeqClimate {
  cls: ClimClass | null;
  /** cooling degree days above heating degree days */
  coolDom: boolean;
  /** IECC zones 1–3 */
  hot: boolean;
  /** central AC or a heat pump with ducts */
  ducted: boolean;
}

export interface SeqInput {
  age: Vintage;
  heat: string;
  wh: string;
  win: string;
  found: string;
  syms: string[];
  goals: string[];
  htype?: string;
  ac?: string;
  /** heating system age: new (under 15 years), old, unsure */
  hage?: string;
  clim?: SeqClimate;
  /** yearly dollars each category saves (heating + cooling), when the model has a climate */
  money?: Record<string, number>;
}

export interface SeqItem {
  category: string; action: string; why: string; score: number;
  /** in the money-ranked (cooling-dominated) list: equipment or windows to do when they're due */
  later?: boolean;
}

/** Window answers that mean clear (non-low-e) glass. */
const CLEAR_GLASS = ['single', 'singlestorm', 'double-old'];

export function buildSequence(a: SeqInput): SeqItem[] {
  const era = ERAS[a.age];
  const clim = a.clim ?? { cls: null, coolDom: false, hot: false, ducted: false };
  const condo = a.htype === 'condo';
  const items: SeqItem[] = era.priorities.map((p, i) => ({ ...p, why: foundationText(p.why, a.found), score: i * 10 }));
  const find = (cat: string) => items.find((i) => i.category === cat);
  /** how far the homeowner's problems and goals moved each item up (kept for the money ranking) */
  const boosted: Record<string, number> = {};
  const boost = (cat: string, by: number, track = true) => {
    const it = find(cat);
    if (!it) return;
    it.score -= by;
    if (track) boosted[cat] = (boosted[cat] ?? 0) + by;
  };
  const ensure = (cat: string, action: string, why: string, score: number) => {
    if (!find(cat)) items.push({ category: cat, action, why, score });
  };
  const drop = (cat: string) => { const i = items.findIndex((x) => x.category === cat); if (i >= 0) items.splice(i, 1); };
  const resistanceOrFuel = ['electric', 'elecfurnace', 'oil', 'propane'].includes(a.heat);
  const hasHeatPump = a.heat === 'heatpump' || a.heat === 'geothermal';

  if (resistanceOrFuel) {
    ensure('heat-pump', 'Heat pump', 'With your heating fuel, this is usually the biggest single saving available.', -50);
    boost('heat-pump', 100, false);
  }
  if (hasHeatPump && !clim.hot) {
    drop('heat-pump');
    ensure('controls', 'Get more from the heat pump you have', 'Controls, balancing and envelope work make an existing heat pump cheaper to run.', 45);
  }
  if (a.win === 'single' || a.win === 'singlestorm') boost('windows-doors', 15);
  if (['electric', 'oil', 'propane'].includes(a.wh)) {
    const why = a.wh === 'electric'
      ? 'A heat pump water heater does the electric tank’s job on less than half the electricity (efficiency 2.2 against 0.92 in our model).'
      : `A heat pump water heater replaces the ${a.wh === 'oil' ? 'oil' : 'propane'}-fired tank; the saving below is at your state’s prices.`;
    ensure('water-heating', 'Heat pump water heater', why, 35);
  }

  // ---- climate: cooling, humidity and dust
  if (clim.hot || clim.coolDom) {
    if (clim.ducted && a.found !== 'basement' && !condo) {
      ensure('duct-sealing', 'Seal and insulate the ducts and the air handler',
        a.found === 'crawl'
          ? 'Ducts under the floor lose cooled air to the crawlspace and pull in damp air through leaky returns. A duct leakage test finds the leaks.'
          : 'In houses on slabs, the ducts and often the air handler sit in the attic, the hottest space in the house. Leaks there waste cooled air and pull in hot, humid air.',
        12);
    }
    if (clim.hot && !condo) {
      ensure('attic-heat', 'Cut attic heat: a radiant barrier with the insulation', 'Attic heat drives the cooling load and heats any ducts up there; a radiant barrier on the rafters blocks much of it, most where insulation is thin.', 30);
      if (CLEAR_GLASS.includes(a.win) || (a.win === 'unsure' && ['pre-1946', '1946-1965', '1966-1980', '1981-1995'].includes(a.age))) {
        ensure('window-film', 'Shade sun-facing windows: solar screens or window film', 'Clear glass on east, west and south walls lets in heat the AC then has to remove; exterior screens and film cost far less than new windows.', 34);
      }
    }
    const hp = find('heat-pump');
    if (hp) {
      hp.action = hasHeatPump ? 'A right-sized variable-speed heat pump when yours is due' : 'Right-sized heat pump (or high-efficiency AC) when the AC is due';
      hp.why = hasHeatPump
        ? 'Newer variable-speed heat pumps use much less electricity to cool and dry the air better; size the replacement with Manual J, not the old unit’s tonnage.'
        : 'A heat pump is an air conditioner that also heats. A variable-speed model sized with Manual J cuts cooling bills and replaces gas or electric heat.';
    } else if (hasHeatPump || a.ac === 'central-old' || a.ac === 'central-new' || a.ac === 'heatpump' || a.ac === 'unsure') {
      items.push({
        category: 'heat-pump',
        action: hasHeatPump ? 'A right-sized variable-speed heat pump when yours is due' : 'Right-sized heat pump (or high-efficiency AC) when the AC is due',
        why: hasHeatPump
          ? 'Newer variable-speed heat pumps use much less electricity to cool and dry the air better; size the replacement with Manual J, not the old unit’s tonnage.'
          : 'A heat pump is an air conditioner that also heats. A variable-speed model sized with Manual J cuts cooling bills and replaces gas or electric heat.',
        score: a.ac === 'central-old' || (hasHeatPump && a.ac !== 'central-new') ? 15 : 40,
      });
    }
    const ctl = find('controls');
    if (ctl) {
      ctl.action = hasHeatPump && !clim.hot ? ctl.action : 'Smart thermostat: a warmer cooling setting and pre-cooling';
      ctl.why = 'Each degree warmer on the cooling setting saves several percent of AC use; on a time-of-use or peak plan, pre-cool the house before the peak and let it drift up.';
    } else if (clim.coolDom) {
      ensure('controls', 'Smart thermostat: a warmer cooling setting and pre-cooling', 'Each degree warmer on the cooling setting saves several percent of AC use; on a time-of-use or peak plan, pre-cool the house before the peak and let it drift up.', 50);
    }
  }

  const humidFix = () => {
    drop('ventilation');
    ensure('humidity', 'Humidity control: a right-sized AC, sealed ducts and dehumidifying settings',
      'In a humid climate, musty or sticky air usually comes from humid air leaking in and an AC that cools without drying. An HRV doesn’t remove moisture; sealing, sizing and dehumidification do.', 18);
  };
  const vent = find('ventilation');
  if (vent && humidClass(clim.cls)) humidFix();
  else if (vent && clim.cls === 'hot-dry') {
    vent.action = 'Ventilation and filtration for dust and smoke';
    vent.why = 'In dry, dusty heat, seal the leaks, use a MERV 13 filter and bring in controlled fresh air rather than relying on leaks.';
  }

  // ---- what the homeowner picked
  const syms = a.syms;
  const has = (s: string) => syms.includes(s);
  if (has('ice-dams')) { boost('air-sealing', 30); boost('attic-insulation', 25); }
  if (has('drafts-cold-rooms')) { boost('air-sealing', 25); boost('duct-sealing', 10); }
  if (has('high-heating-bills')) { boost('air-sealing', 20); boost('attic-insulation', 15); boost('heat-pump', 10); }
  if (has('cold-floors')) {
    boost('basement-insulation', 30);
    ensure('basement-insulation', 'Basement and rim joist insulation', 'Directly targets the cold basement or floors you flagged.', 25);
  }
  if (has('high-summer-bills')) { boost('duct-sealing', 25); boost('attic-heat', 15); boost('heat-pump', 15); boost('controls', 10); boost('window-film', 10); boost('attic-insulation', 10); }
  if (has('hot-upstairs')) { boost('duct-sealing', 20); boost('attic-insulation', 15); boost('attic-heat', 15); boost('air-sealing', 10); boost('window-film', 10); }
  if (has('ac-runs-constantly')) { boost('duct-sealing', 25); boost('heat-pump', 20); boost('attic-heat', 15); boost('attic-insulation', 10); }
  if (has('humid-indoors') || has('musty-smell')) {
    if (humidClass(clim.cls) || clim.cls === 'mixed') humidFix();
    else { ensure('ventilation', 'Ventilation check (HRV or ERV)', 'Condensation and musty air are usually moisture and ventilation problems: fix the cause, not the windows.', -10); boosted.ventilation = 30; }
    boost('humidity', 30); boost('duct-sealing', 15); boost('crawlspace', 20);
  }
  if (has('window-condensation')) {
    if (humidClass(clim.cls)) humidFix();
    else { ensure('ventilation', 'Ventilation check (HRV or ERV)', 'Winter condensation means indoor humidity is too high for the glass: balanced ventilation fixes the cause.', -5); boosted.ventilation = Math.max(boosted.ventilation ?? 0, 25); }
  }
  if (has('dust-smoke')) {
    boost('air-sealing', 25); boost('duct-sealing', 15);
    ensure('filtration', 'Better filtration and controlled ventilation', 'Sealing leaks keeps dust and smoke out; a MERV 13 filter and a portable HEPA cleaner handle bad-air days.', 22);
    boosted.filtration = 25;
  }
  if (a.goals.includes('heatpump')) boost('heat-pump', 40);
  if (a.goals.includes('solar')) {
    ensure('solar', 'Rooftop solar', 'On your goal list. Solar doesn’t lower the energy a house needs, so it comes after the envelope and equipment work here.', 55);
  }
  if (a.goals.includes('emissions') && (a.heat === 'gas' || a.heat === 'gasboiler')) boost('heat-pump', 20);

  // The 1966–1980 heat pump wording is about electric heat; fit it to the home's actual fuel.
  const hp = find('heat-pump');
  if (hp && /electric/i.test(hp.action) && !['electric', 'elecfurnace'].includes(a.heat)) {
    if (a.heat === 'oil' || a.heat === 'propane') {
      hp.action = 'Heat pump';
      hp.why = 'With your heating fuel, this is usually the biggest single saving available.';
    } else {
      hp.action = 'Heat pump when the furnace or air conditioner is due';
      hp.why = 'If the house has ducts, a ducted heat pump can replace both the furnace and the air conditioner.';
    }
  }
  if (a.wh === 'heatpump') drop('water-heating');

  // foundation: slabs have no basement walls; crawlspaces get their own item
  const bi = items.findIndex((i) => i.category === 'basement-insulation');
  if (bi >= 0 && a.found === 'slab') items.splice(bi, 1);
  else if (bi >= 0 && a.found === 'crawl') {
    items[bi] = {
      ...items[bi], category: 'crawlspace',
      action: humidClass(clim.cls) || clim.cls === 'marine' ? 'Dry out and close up the crawlspace' : 'Seal the crawlspace, or insulate the floor above it',
      why: has('cold-floors') ? 'Directly targets the cold floors you flagged.'
        : humidClass(clim.cls) || clim.cls === 'marine' ? 'A damp, vented crawlspace feeds moisture and musty air into the house; drainage, a ground cover and sealing fix it.'
          : 'Floors over an unheated crawlspace lose heat, and an audit shows which fix suits yours.',
    };
  } else if (bi >= 0 && a.found === 'unsure') {
    items[bi] = { ...items[bi], action: 'Basement or crawlspace insulation' };
  }

  // Where cooling outweighs heating, money (heating plus cooling dollars) sets the order: work that
  // can be done now first, then equipment and windows when they're due. A unit that's already old
  // (a 10+ year AC, window units, a 15+ year heat pump) counts as due now. Symptom boosts still apply.
  if (clim.coolDom && a.money) {
    const ranked = Object.entries(a.money).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([k]) => k);
    const equipOld = a.ac === 'central-old' || a.ac === 'room' || (hasHeatPump && a.hage === 'old');
    const later = (cat: string) => ['windows-doors', 'water-heating', 'solar'].includes(cat) || (cat === 'heat-pump' && !equipOld);
    for (const it of items) {
      const r = ranked.indexOf(it.category);
      // the homeowner's problems and goals can move an item up as many as four places
      const b = Math.min(45, boosted[it.category] ?? 0);
      it.later = r >= 0 && later(it.category);
      if (r >= 0) it.score = (it.later ? 100 : 0) + r * 10 - b;
      // no dollar figure (humidity, crawlspace, filtration, ventilation): near the top when a problem
      // the homeowner picked calls for it, otherwise after the money items
      else if (it.category !== 'solar') it.score = b > 0 ? 25 - b : 65 + it.score / 10;
    }
  }

  items.sort((x, y) => x.score - y.score);
  const seen = new Set<string>();
  const list = items.filter((i) => (seen.has(i.category) ? false : (seen.add(i.category), true)));
  if (clim.coolDom && a.money) {
    // the work to do now, then up to two items for when equipment or windows are due; eight at most
    const later = list.filter((i) => i.later).slice(0, 2);
    return [...list.filter((i) => !i.later).slice(0, Math.min(7, 8 - later.length)), ...later];
  }
  return list.slice(0, 7);
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
  found?: string;
  cls?: ClimClass | null;
  coolDom?: boolean;
}

const OLDER = ['pre-1946', '1946-1965', '1966-1980'];
const PRE_1990 = ['pre-1946', '1946-1965', '1966-1980', '1981-1995'];
const PRE_1966 = ['pre-1946', '1946-1965'];

const FUEL_HEAT = ['gas', 'gasboiler', 'oil', 'propane'];
const FUEL_WH = ['gastank', 'gastankless', 'oil', 'propane'];
const DUCTED = ['gas', 'elecfurnace', 'heatpump', 'geothermal', 'propane', 'oil'];

export function combustionAtHome(t: { heat: string; wh: string; sec: string[] }): boolean {
  return FUEL_HEAT.includes(t.heat) || FUEL_WH.includes(t.wh) || t.sec.includes('woodstove');
}

const COOL_SYMS = ['high-summer-bills', 'hot-upstairs', 'ac-runs-constantly', 'humid-indoors'];

/** Energy tests worth asking an auditor for by name. */
export function energyTests(t: TestInput, f: TestFacts): TestPick[] {
  const picks: TestPick[] = [];
  const older = OLDER.includes(t.age);
  const zoneNum = (t.zone ?? '').match(/^\d/)?.[0];
  const limit = zoneNum ? (Number(zoneNum) <= 2 ? f.blowerLimitByZone.warm : f.blowerLimitByZone.cold) : null;
  const hot = zoneNum ? Number(zoneNum) <= 3 : false;
  const coolSym = t.syms.some((s) => COOL_SYMS.includes(s));
  const ducted = DUCTED.includes(t.heat) || ['central-new', 'central-old', 'heatpump'].includes(t.ac);
  const ductsOut = t.found === 'slab' || t.found === 'crawl' || (t.found !== 'basement' && hot);
  const duct: TestPick = {
    slug: 'duct-leakage', name: 'Duct leakage test', icon: 'duct',
    why: coolSym
      ? 'Hot rooms, high summer bills and an AC that can’t keep up usually trace back to the ducts. Measure before buying bigger equipment.'
      : 'Ducts in an attic or crawlspace leak cooled and heated air outside the house; this measures how much.',
    note: `Ask for leakage to outside as well as total leakage. For comparison, the 2021 IECC allows new homes ${f.ductLimit.toFixed(1)} cfm25 of total duct leakage per 100 sq ft of floor area.`,
  };
  if (ducted && (ductsOut || coolSym) && (t.coolDom || hot)) picks.push(duct);
  picks.push({
    slug: 'blower-door', name: 'Blower door test', icon: 'fan',
    why: older ? 'Air leakage is the big unknown in a house this age. This puts a number on it and finds where the air gets in.' : 'Checks how airtight the house really is; builders and later renovations leave gaps.',
    note: limit !== null
      ? `Result in ACH50 (how many times an hour the house’s air leaks out at test pressure). For comparison, the 2021 IECC holds new homes in climate zone ${t.zone} to ${limit.toFixed(1)} ACH50 or less.`
      : 'Result in ACH50, the number air-sealing work is measured against.',
  });
  picks.push({
    slug: 'thermal-imaging', name: 'Infrared (thermal) scan', icon: 'camera',
    why: t.syms.includes('drafts-cold-rooms') ? 'Finds the cold walls you flagged without opening anything.'
      : t.syms.includes('hot-upstairs') ? 'Shows where attic heat and missing insulation make the hot rooms you flagged.'
        : 'Shows which wall and ceiling cavities are empty before you pay to fill them.',
    note: hot || t.coolDom
      ? 'In hot weather the scan works with the AC running and a large enough inside–outside temperature difference; many auditors pair it with the blower door test.'
      : 'Best in the heating season, with a large inside–outside temperature difference; many auditors pair it with the blower door test.',
  });
  if (combustionAtHome(t)) {
    picks.push({
      slug: 'combustion-safety', name: 'Combustion safety test', icon: 'flame',
      why: 'You have fuel-burning equipment. Tightening the house calls for this check first.',
      note: 'Under BPI’s standards the auditor tests for spillage and carbon monoxide at the appliances with the house at its worst-case air pressure.',
    });
  }
  if (t.goals.includes('heatpump') || ['electric', 'elecfurnace', 'oil', 'propane'].includes(t.heat) || coolSym || t.ac === 'central-old' || (hot && t.ac !== 'none')) {
    picks.push({
      slug: 'heat-loss-calc', name: 'Heating and cooling load calculation (Manual J)', icon: 'gauge',
      why: hot || t.coolDom
        ? 'Sizes a new AC or heat pump before anyone quotes you. Oversized units short-cycle and leave the house clammy; many contractors size by rule of thumb.'
        : 'Sizes a heat pump or air conditioner before anyone quotes you; oversizing is a common and costly mistake.',
      note: 'ACCA says codes and most state and local jurisdictions require a Manual J load calculation; Manual S then sizes the equipment.',
    });
  }
  if (!picks.includes(duct) && ducted && (t.syms.includes('hot-upstairs') || t.syms.includes('drafts-cold-rooms') || coolSym)) picks.push(duct);
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

/** The state's CO alarm rule as guidance: a real law is stated plainly; no statewide law (or none confirmed) becomes an action. */
export function coNote(raw: string | null | undefined, stateName: string, st: string): string | undefined {
  if (!raw) return undefined;
  const anyway = 'Whatever the law says, CPSC recommends a CO alarm on every level and outside sleeping areas, so put them in before any air sealing.';
  if (/only child-care/i.test(raw)) {
    return `In ${stateName}, the statewide CO alarm law covers only child-care facilities, so ask your city whether its building code requires alarms in homes. ${anyway}`;
  }
  if (/not (been )?(confirmed|verified)|unverified|no statute/i.test(raw)) {
    return `${stateName} has no statewide law we know of requiring CO alarms in existing homes, so ask your city whether its code does. ${anyway}`;
  }
  const prefix = raw.match(/^In [^:]+:\s*/)?.[0] ?? '';
  const body = stateLine(raw.slice(prefix.length), st).replace(/\s*\([^()]*\)/g, '').replace(/\s+([,.;])/g, '$1');
  return body ? prefix + body : undefined;
}

/** Specialty health tests, screened from the intake, sorted strongest first. */
export function specialtyTests(t: TestInput, f: TestFacts): TestPick[] {
  const flags: TestPick[] = [];
  const reno = t.goals.some((g) => ['reno', 'heatpump', 'bills', 'comfort'].includes(g));
  const buying = t.goals.includes('buying');
  const fuel = combustionAtHome(t);
  const slab = t.found === 'slab';

  // Radon: EPA says every home should be tested.
  const radonWhy = buying
    ? 'EPA says every home should be tested, and a purchase is the time to do it. It recommends fixing at 4 pCi/L or more and considering a fix from 2 pCi/L.'
    : reno
      ? `EPA says every home should be tested, and ${slab ? 'air sealing' : 'air sealing or basement work'} without knowing your radon level is working blind. EPA recommends fixing at 4 pCi/L or more.`
      : 'EPA says every home should be tested, whatever its age or location. It recommends fixing at 4 pCi/L or more.';
  const notes: string[] = [];
  if (t.radonZone && t.radonCounty) notes.push(`On EPA’s Map of Radon Zones, ${t.radonCounty} (the metro’s principal county) is in ${ZONE_DESC[t.radonZone] ?? `Zone ${t.radonZone}`}; EPA says high levels turn up in all three zones.`);
  if (f.radonLicense[t.state]) notes.push(f.radonLicense[t.state]);
  flags.push({ slug: 'radon', name: 'Radon test', icon: 'radon', level: reno || buying ? 'strongly-flagged' : 'recommended', why: radonWhy, note: notes.join(' ') || undefined });

  // Carbon monoxide
  flags.push({
    slug: 'carbon-monoxide',
    name: fuel ? 'Carbon monoxide alarms and a spillage check' : 'Carbon monoxide alarms',
    icon: 'co',
    level: fuel ? 'strongly-flagged' : 'recommended',
    why: fuel
      ? 'You have fuel-burning equipment. CPSC recommends CO alarms on every level of the home and outside sleeping areas, and tightening the house makes the audit’s spillage check essential.'
      : 'No fuel-burning heating, but a gas range, fireplace or attached garage still calls for working CO alarms. CPSC recommends them on every level and outside sleeping areas.',
    note: coNote(f.coLaw[t.state], t.stateName, t.state),
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

  // Mold and humidity: symptom- or climate-driven
  const moistSym = t.syms.includes('musty-smell') || t.syms.includes('humid-indoors') || t.syms.includes('window-condensation');
  if (moistSym) {
    flags.push({
      slug: 'mold-iaq', name: humidClass(t.cls ?? null) ? 'Humidity logging and mold check' : 'Mold and indoor air check', icon: 'mold', level: 'flagged',
      why: humidClass(t.cls ?? null)
        ? 'You flagged humidity or a musty smell. A few days of indoor humidity logging shows whether the AC removes moisture (aim below 60%); fix the moisture source before any mold cleanup.'
        : 'You flagged condensation, humidity or a musty smell. Find and fix the moisture source first; EPA says sampling is usually unnecessary when mold is visible, and areas under about 10 sq ft can usually be cleaned yourself.',
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
