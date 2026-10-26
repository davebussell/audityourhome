/**
 * Pure helpers for the Canadian Home Energy Planner (src/pages/ca/plan/index.astro). No DOM, no
 * data imports: the page passes everything in, so this runs both at build time and in the browser.
 *
 * What lives here: postal-code checks and province lookups, the words the planner uses for every
 * answer, climate-aware symptom chips, "your concerns" explanations, province-aware rewrites of the
 * shared copy (archetypes, savings notes, screener), and the heat pump card's fuel/climate wording.
 */

// ------------------------------------------------------------------ provinces

export type ProvCode = 'NL' | 'NS' | 'PE' | 'NB' | 'QC' | 'ON' | 'MB' | 'SK' | 'AB' | 'BC' | 'YT' | 'NT' | 'NU';

const FSA_PROVINCE: Record<string, ProvCode> = {
  A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC', K: 'ON', L: 'ON', M: 'ON', N: 'ON', P: 'ON',
  R: 'MB', S: 'SK', T: 'AB', V: 'BC', X: 'NT', Y: 'YT',
};

/** Province or territory of a forward sortation area (first 3 characters of a postal code). */
export function provinceOfFsa(fsa: string): ProvCode | null {
  const f = fsa.toUpperCase();
  if (/^X0[ABC]/.test(f)) return 'NU'; // Nunavut: X0A, X0B, X0C
  return FSA_PROVINCE[f[0]] ?? null;
}

export const PROV_NAME: Record<ProvCode, string> = {
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', PE: 'Prince Edward Island', NB: 'New Brunswick', QC: 'Quebec',
  ON: 'Ontario', MB: 'Manitoba', SK: 'Saskatchewan', AB: 'Alberta', BC: 'British Columbia', YT: 'Yukon',
  NT: 'Northwest Territories', NU: 'Nunavut',
};

/** Province page slug (src/data/provinces.json, /ca/provinces/<slug>/). The territories share one page. */
export const PROV_SLUG: Record<ProvCode, string> = {
  BC: 'bc', AB: 'alberta', SK: 'saskatchewan', MB: 'manitoba', ON: 'ontario', QC: 'quebec', NB: 'new-brunswick',
  NS: 'nova-scotia', PE: 'pei', NL: 'newfoundland-labrador', YT: 'north', NT: 'north', NU: 'north',
};

/** Value of the lead form's "Area" select for a province (Ontario areas use their region slug instead). */
export const LEAD_AREA: Record<ProvCode, string> = {
  BC: 'bc', AB: 'alberta', SK: 'saskatchewan', MB: 'manitoba', ON: 'other-ontario', QC: 'quebec', NB: 'new-brunswick',
  NS: 'nova-scotia', PE: 'pei', NL: 'newfoundland-labrador', YT: 'north', NT: 'north', NU: 'north',
};

/** Order for the "choose your province" fallback. */
export const PROVINCE_CHOICES: ProvCode[] = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];

export type PostalCheck =
  | { ok: true; fsa: string; province: ProvCode; full: boolean }
  | { ok: false; reason: 'empty' | 'invalid' | 'unknown-province' }
  | { ok: false; reason: 'us-zip'; zip: string };

/**
 * Checks a postal code: a full code (A1A 1A1) or just its first three characters (A1A). A 5-digit
 * (or ZIP+4) entry is treated as a US ZIP code, so the page can offer the US planner.
 */
export function checkPostal(raw: string): PostalCheck {
  const v = raw.toUpperCase().replace(/[\s-]+/g, '');
  if (!v) return { ok: false, reason: 'empty' };
  if (/^\d{5}(\d{4})?$/.test(v)) return { ok: false, reason: 'us-zip', zip: v.slice(0, 5) };
  const m = v.match(/^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])(\d[ABCEGHJ-NPRSTV-Z]\d)?$/);
  if (!m) return { ok: false, reason: 'invalid' };
  const fsa = m[1];
  const province = provinceOfFsa(fsa);
  if (!province) return { ok: false, reason: 'unknown-province' };
  return { ok: true, fsa, province, full: Boolean(m[2]) };
}

/** "V6B 1A1" from "v6b1a1"; FSA-only entries stay as typed (upper-cased). */
export function formatPostal(raw: string): string {
  const v = raw.toUpperCase().replace(/[\s-]+/g, '');
  return v.length === 6 ? `${v.slice(0, 3)} ${v.slice(3)}` : v;
}

// ------------------------------------------------------------------ answer labels

export const LABEL = {
  htype: { detached: 'detached house', semi: 'semi-detached or townhome', condo: 'condo or apartment' } as Record<string, string>,
  size: { small: 'under 1,200 sq ft', medium: '1,200–2,000 sq ft', large: '2,000–3,000 sq ft', xlarge: 'over 3,000 sq ft' } as Record<string, string>,
  heat: {
    gas: 'gas furnace', gasboiler: 'gas boiler', electric: 'electric baseboards', elecfurnace: 'electric furnace or boiler',
    heatpump: 'air-source heat pump', geothermal: 'geothermal heat pump', oil: 'oil furnace or boiler', propane: 'propane',
    wood: 'wood stove or wood furnace', outdoorwood: 'outdoor wood boiler', pellet: 'pellet stove',
  } as Record<string, string>,
  hage: { new: 'under 15 years old', old: '15 years old or more', unsure: 'age unknown' } as Record<string, string>,
  wh: {
    gastank: 'gas tank', gastankless: 'gas tankless', electric: 'electric tank', heatpump: 'heat pump water heater',
    oil: 'oil-fired tank', boiler: 'from the boiler', unsure: 'not sure',
  } as Record<string, string>,
  ac: {
    none: 'no air conditioning', 'central-new': 'central AC under 10 years old', 'central-old': 'central AC 10+ years old',
    room: 'window or portable units', heatpump: 'the heat pump cools', unsure: 'not sure',
  } as Record<string, string>,
  win: {
    single: 'single-pane', singlestorm: 'single-pane with storms', 'double-old': 'double-pane, before 2000',
    'double-new': 'double-pane, 2000 or later', triple: 'triple-pane or recent ENERGY STAR', unsure: 'not sure',
  } as Record<string, string>,
  prev: { no: 'no', recent: 'yes, in the last 3 years', older: 'yes, more than 3 years ago', unsure: 'not sure' } as Record<string, string>,
  water: { municipal: 'municipal water', well: 'private well', unsure: 'water source not sure' } as Record<string, string>,
  goal: {
    bills: 'lower my bills', comfort: 'fix comfort problems', heatpump: 'get a heat pump', solar: 'add solar',
    buying: 'buying or just bought', reno: 'renovating', emissions: 'cut emissions',
  } as Record<string, string>,
  era: {
    'pre-1946': 'before 1946', '1946-1965': '1946–1965', '1966-1980': '1966–1980',
    '1981-1995': '1981–1995', '1996-2010': '1996–2010', '2011-plus': '2011 or later',
  } as Record<string, string>,
};

/** One line explaining each era's nickname, so "poly & batts" means something. */
export const ERA_NOTE: Record<string, string> = {
  'pre-1946': 'Builders call these wartime and older houses: solid brick or plank walls, usually with little or no insulation.',
  '1946-1965': 'The post-war era: bungalows and storey-and-a-halfs with thin insulation and plenty of air leaks.',
  '1966-1980': 'The suburban-expansion era: split-levels and early subdivisions with modest insulation, often heated by electric baseboards.',
  '1981-1995': 'The “poly and batts” era: tighter houses built with plastic (poly) vapour barriers and batt insulation, usually without mechanical ventilation.',
  '1996-2010': 'The code era: reasonably insulated houses where ducts, attic top-ups and equipment timing matter most.',
  '2011-plus': 'Modern code: fairly airtight houses where ventilation, equipment sizing and builder shortcuts matter most.',
};

// ------------------------------------------------------------------ symptoms

export interface ClimateFlags {
  /** climate profile key from src/data/climate/ca.json */
  profile?: string;
  iceDams?: boolean;
  smoke?: boolean;
  summerCooling?: 'low' | 'moderate' | 'high';
}

export interface SymptomDef {
  slug: string;
  label: string;
  /** /ca/issues/<slug>/ deep-dive, when one exists */
  issue?: string;
  /** Show this chip for a place? */
  show: (c: ClimateFlags) => boolean;
}

const COLD_DRY = ['prairies', 'north', 'very-cold-east', 'bc-southern-interior', 'great-lakes-st-lawrence'];

export const SYMPTOMS: SymptomDef[] = [
  { slug: 'drafty-rooms', label: 'Drafts or cold rooms', issue: 'drafty-rooms', show: () => true },
  { slug: 'high-heating-bills', label: 'High heating bills', issue: 'high-heating-bills', show: () => true },
  { slug: 'summer-overheating', label: 'Hard to keep cool in summer', issue: 'summer-overheating', show: () => true },
  { slug: 'cold-second-floor', label: 'Upstairs too hot or too cold', issue: 'cold-second-floor', show: () => true },
  { slug: 'condensation-mould', label: 'Condensation, mould or musty air', issue: 'condensation-mould', show: () => true },
  { slug: 'cold-basement', label: 'Cold or damp basement', issue: 'cold-basement', show: () => true },
  { slug: 'ice-dams', label: 'Ice dams or big icicles', issue: 'ice-dams', show: (c) => c.iceDams !== false },
  // BC's interior and coast have dry summers; the clammy-summer chip is for the humid east and the eastern Prairies.
  { slug: 'humid-summer', label: 'Humid, clammy rooms in summer', show: (c) => c.profile === 'great-lakes-st-lawrence' || ((c.summerCooling === 'high' || c.summerCooling === 'moderate') && !['coastal-bc', 'bc-southern-interior', 'north'].includes(c.profile ?? '')) },
  { slug: 'smoke', label: 'Smoky air indoors on smoke days', show: (c) => c.smoke === true },
  { slug: 'window-frost', label: 'Frost or ice on windows', show: (c) => ['prairies', 'north', 'very-cold-east'].includes(c.profile ?? '') },
  { slug: 'dry-winter', label: 'Very dry air in winter', show: (c) => COLD_DRY.includes(c.profile ?? '') },
  { slug: 'outages', label: 'Power outages in storms', show: (c) => ['atlantic', 'great-lakes-st-lawrence', 'very-cold-east'].includes(c.profile ?? '') },
];
export const SYMPTOM_LABEL: Record<string, string> = Object.fromEntries(SYMPTOMS.map((s) => [s.slug, s.label]));

export interface Concern {
  /** What usually causes it */
  cause: string;
  /** Test slugs (CA test guides) that confirm the cause */
  tests: string[];
  /** What fixes it, cheapest first */
  fix: string;
  /** Page that goes deeper */
  more: { label: string; href: string };
}

/** Plain explanations for symptoms that don't have their own /ca/issues/ page. */
export const EXTRA_CONCERNS: Record<string, Concern> = {
  'humid-summer': {
    cause: 'Humid outdoor air leaking in, a damp basement, or an air conditioner too big for the house: it cools quickly and shuts off before it has dried the air.',
    tests: ['ventilation-assessment', 'heat-loss-calc', 'duct-leakage'],
    fix: 'Seal air leaks, dry the basement (grading, downspouts, a dehumidifier), and size any new heat pump or air conditioner to the house so it runs long, drying cycles.',
    more: { label: 'Air conditioning and cooling', href: '/ca/learn/air-conditioning/' },
  },
  smoke: {
    cause: 'Smoke gets in through the same gaps that let heat out, and through windows opened to cool the house.',
    tests: ['blower-door', 'ventilation-assessment'],
    fix: 'Seal air leaks, use a MERV 13 filter in the furnace or HRV if it can take one, run a portable HEPA filter in a bedroom, and plan cooling so you can keep windows shut on smoke days.',
    more: { label: 'Ventilation and fresh air', href: '/ca/learn/ventilation/' },
  },
  'window-frost': {
    cause: 'More indoor humidity than the coldest glass can handle, or cold window edges and frames.',
    tests: ['ventilation-assessment', 'thermal-imaging'],
    fix: 'Run bath and kitchen fans, keep indoor humidity toward the low end of 30–50% on very cold days, check that the HRV works, and upgrade the worst windows later.',
    more: { label: 'Window condensation and musty air', href: '/ca/issues/condensation-mould/' },
  },
  'dry-winter': {
    cause: 'Very cold outdoor air holds little moisture, and a leaky house swaps indoor air for that dry air all winter.',
    tests: ['blower-door', 'ventilation-assessment'],
    fix: 'Air sealing keeps the moisture you already have; add humidity only in moderation (too much frosts windows), and ask whether an ERV suits your house better than an HRV.',
    more: { label: 'Moisture control', href: '/ca/learn/moisture-control/' },
  },
  outages: {
    cause: 'Storms and freezing rain cut power, and most heating systems, even gas furnaces, need electricity to run.',
    tests: ['blower-door', 'combustion-safety'],
    fix: 'A tighter, better-insulated house holds its heat for longer. Plan a backup heat source, keep CO alarms on every floor, and never run a generator or barbecue indoors.',
    more: { label: 'Heating systems and backup heat', href: '/ca/learn/heating-systems/' },
  },
};

// ------------------------------------------------------------------ province-aware copy

const ON_SENTENCE = /HRSP|Ontario|Enbridge|Home Renovation Savings|Save on Energy|\bESA\b/;

/**
 * Removes Ontario-only sentences outside Ontario (rebate amounts, Ontario law, Ontario prices),
 * so a Vancouver or Halifax plan never quotes HRSP. Returns '' when nothing is left.
 */
export function localize(text: string, isON: boolean): string {
  if (!text) return '';
  if (isON) return text;
  return sentences(text)
    .filter((s) => !ON_SENTENCE.test(s))
    .join(' ')
    .trim();
}

/**
 * Splits at sentence ends (punctuation followed by a space), keeping decimals like $2.31 intact. No lookbehind:
 * older Safari can't parse one, and a parse error would stop the whole planner script.
 */
export function sentences(text: string): string[] {
  return text.replace(/([.!?])\s+/g, '$1\u0001').split('\u0001').map((s) => s.trim()).filter(Boolean);
}

/** "$120–$400 before the $125 HRSP rebate" → "$120–$400" outside Ontario. */
export function localizeCost(text: string, isON: boolean): string {
  if (!text || isON) return text;
  return text.replace(/\s*before the [^,;]*?HRSP rebate/i, '').trim();
}

/** Era summary without Ontario-only claims. */
export function localizeSummary(text: string): string {
  return text
    .replace(/which makes this era Ontario's best heat-pump hunting ground/i, 'which makes this era a prime candidate for heat pumps')
    .replace(/ the biggest savings potential in Ontario/i, ' some of the biggest savings potential of any era');
}

/** Screener reasons (src/lib/screener.ts) worded for any province. */
export function localizeScreener(id: string, why: string, isON: boolean): string {
  if (isON) return why;
  if (id === 'carbon-monoxide' && /Ontario law/.test(why)) {
    return 'You heat with combustion: put CO alarms near sleeping areas (Canada’s building code requires them in new homes with fuel-burning appliances), and tightening the house makes the audit’s spillage check essential.';
  }
  if (id === 'well-water') {
    return why
      .replace(/and then at least annually \(bacteriological testing is free in Ontario\)/, 'then test for bacteria at least every 6 months, as Health Canada advises')
      .replace(/\(bacteriological testing is free in Ontario\)/, '(Health Canada suggests testing for bacteria at least every 6 months)')
      .replace(/Ontario recommends bacteriological testing at least annually, and it’s free through the public health lab\./, 'test for bacteria at least every 6 months (early spring and fall are best), and ask your provincial public health lab about free or low-cost kits.')
      .replace(/should test at least annually — free in Ontario\./, 'should test for bacteria at least every 6 months; ask your provincial public health lab about kits.')
      .replace(/ — free in Ontario\./, '. Ask your provincial public health lab about kits.');
  }
  return localize(why, false) || why.replace(/Ontario/g, 'your province');
}

// ------------------------------------------------------------------ era warnings, filtered by fuel

export interface Watch { flag: string; detail: string; severity: string }

const ELECTRIC = ['electric', 'elecfurnace'];
const OIL_LIKE = ['oil', 'propane'];

/** The era's "watch for these" list, filtered and reworded for the home's heating fuel and province. */
export function watchFor(items: Watch[], heat: string, isON: boolean, era: string): Watch[] {
  const out: Watch[] = [];
  for (const w of items) {
    if (/^Electric baseboard heating/.test(w.flag)) {
      if (!ELECTRIC.includes(heat)) continue;
      out.push({ ...w, detail: localize(w.detail, isON) || 'Common in 1970s builds. Replacing baseboards with a heat pump is usually the biggest bill cut available to these houses.' });
      continue;
    }
    if (/^Original oil tanks/.test(w.flag)) {
      if (heat === 'oil') continue; // replaced by the oil-tank item below
      out.push({ ...w, flag: 'Old oil tanks from a past conversion', detail: 'Houses of this era that switched from oil may still have a buried or basement tank, or traces of one. Insurers and lenders ask about them.' });
      continue;
    }
    if (/^Mid-efficiency furnace/.test(w.flag)) {
      if (heat === 'gas') { out.push(w); continue; }
      if (OIL_LIKE.includes(heat)) {
        out.push({ ...w, flag: `Older ${heat === 'oil' ? 'oil' : 'propane'} furnace at end of life`, detail: `A furnace from before about 2000 burns noticeably more ${heat === 'oil' ? 'oil' : 'propane'} than a new one. When it needs replacing, compare a heat pump (with backup heat) against a new furnace.` });
      }
      continue;
    }
    if (/^Knob-and-tube/.test(w.flag) && !isON) {
      out.push({ ...w, detail: w.detail.replace(/electricians and ESA rules come first/, 'an electrician and your province’s electrical safety rules come first') });
      continue;
    }
    out.push({ ...w, detail: localize(w.detail, isON) || w.detail });
  }
  if (heat === 'oil') {
    out.unshift({
      flag: 'Oil tank age and condition',
      severity: 'safety',
      detail: 'Many insurers ask for the tank’s age and may require replacing an older one. Look for rust, weeping seams and the manufacture date on the tank’s label, and have the burner serviced every year.',
    });
  }
  if (era === '1981-1995' && ELECTRIC.includes(heat)) {
    // nothing extra: the condensation item already covers this era's main risk
  }
  return out;
}

// ------------------------------------------------------------------ heat pump card

export interface HeatPumpCopy { title: string; why: string }

/**
 * Title and reason for the heat pump card, by climate profile and current fuel. `saving` is the
 * modelled yearly running-cost saving ($, negative = costs more); `place` is the city name.
 */
export function heatPumpCopy(profile: string | undefined, heat: string, saving: number | null, place: string): HeatPumpCopy {
  const electric = ELECTRIC.includes(heat);
  const oilish = OIL_LIKE.includes(heat);
  const gas = heat === 'gas' || heat === 'gasboiler';
  const wood = ['wood', 'outdoorwood', 'pellet'].includes(heat);
  const fuelWord = heat === 'oil' ? 'oil' : heat === 'propane' ? 'propane' : gas ? 'natural gas' : wood ? 'wood' : 'electric heat';

  let title = 'Heat pump at equipment end of life';
  let climate = '';
  switch (profile) {
    case 'coastal-bc':
      title = 'Heat pump for heating and summer cooling';
      climate = 'Winters here are mild, so a standard variable-speed heat pump can usually heat the whole house, and it cools during heat waves like the 2021 heat dome. A cold-climate model adds margin for Arctic cold snaps.';
      break;
    case 'bc-southern-interior':
      title = 'Cold-climate heat pump that also cools';
      climate = 'Summers here are hot and often smoky, and winters cold, so size one system for both seasons. Keeping a gas furnace for the coldest days (a hybrid system) is practical where you already have gas.';
      break;
    case 'prairies':
      title = electric ? 'Cold-climate heat pump, with backup heat' : 'Cold-climate or hybrid heat pump, with backup heat';
      climate = 'Heating fully with a heat pump here needs a cold-climate model and backup heat for the coldest nights. Where power is pricey, keeping the gas furnace for the coldest weather (a hybrid system) often makes the most sense.';
      break;
    case 'great-lakes-st-lawrence':
      title = electric ? 'Cold-climate heat pump to replace electric heat' : 'Heat pump when the furnace or AC needs replacing';
      climate = 'One unit heats and cools. Size it for both seasons so it dries the air in humid summers, and in the colder cities choose a cold-climate model with backup heat.';
      break;
    case 'very-cold-east':
      title = 'Cold-climate heat pump with full backup heat';
      climate = 'Choose a model with published heating capacity near −25 °C to −30 °C, and keep backup heat for colder nights.';
      break;
    case 'atlantic':
      title = oilish ? 'Cold-climate heat pump to move off oil' : 'Cold-climate heat pump';
      climate = 'Keep your oil system or baseboards as backup for cold snaps and storm outages, set a few degrees below the heat pump so it does most of the work. Near the sea, ask whether the outdoor unit has a corrosion-resistant coating for salt air.';
      break;
    case 'north':
      title = 'Heat pump only with full backup heat';
      climate = 'Cold snaps here go well below the −30 °C rating of cold-climate air-source units, so a heat pump needs a full-size backup. Envelope work comes first and saves more here than almost anywhere.';
      break;
  }
  if (heat === 'gasboiler') {
    // Hot-water (boiler) homes: the backup is the boiler, not a furnace.
    title = title.replace('furnace or AC', 'boiler or AC');
    climate = climate.replace(/gas furnace/g, 'gas boiler');
  }

  // Money lines only when the heat pump would actually save; otherwise the card moves to
  // "when your system needs replacing" and heatPumpLaterNote() says what it would cost.
  const saves = saving !== null && saving >= 100;
  let fuel = '';
  if (electric) fuel = 'Against baseboards or an electric furnace, a heat pump delivers the same heat with far less electricity.';
  else if (oilish && saves) fuel = `${fuelWord[0].toUpperCase()}${fuelWord.slice(1)} is expensive heat, so switching usually saves more than any other upgrade.`;
  else if (gas && saves) fuel = `Even against natural gas, at today’s prices in ${place} a heat pump would trim the bill, and it adds cooling, comfort and lower emissions.`;
  else if (wood) fuel = 'Compared with wood, the case is convenience, cleaner indoor air and cooling more than the bill.';
  return { title, why: [climate, fuel].filter(Boolean).join(' ') };
}

/** Why the heat pump moved to "when your system needs replacing", in plain words. */
export function heatPumpLaterNote(heat: string, saving: number | null, place: string, profile?: string, prov?: string): string {
  const more = saving !== null && saving < -15
    ? `it would raise your bill by about $${(Math.round(-saving / 10) * 10).toLocaleString('en-CA')} a year`
    : saving !== null && saving > 15
      ? `it would save only about $${(Math.round(saving / 10) * 10).toLocaleString('en-CA')} a year`
      : 'its running cost would be about the same as what you have now';
  if (heat === 'gasboiler') {
    return `At today’s prices in ${place}, ${more}; the case for one is cooling, comfort, lower emissions and rebates. Decide when your boiler needs replacing; ductless heat pumps for most of the year, with the boiler kept for the coldest days, are a middle path.`;
  }
  if (heat === 'gas') {
    return `At today’s prices in ${place}, ${more}; the case for one is cooling, comfort, lower emissions and rebates. Decide when your furnace or AC needs replacing; a hybrid system (a heat pump plus your gas furnace as backup) is a middle path.`;
  }
  if (profile === 'north') {
    const local = prov === 'YT'
      ? ' Yukon’s rebate pays half the cost of a heat pump (up to $10,500), so ask your advisor whether one fits with full backup heat.'
      : prov === 'NT'
        ? ' The Arctic Energy Alliance lists no heat pump rebate right now, but it rebates insulation and modern wood or pellet stoves.'
        : '';
    return `At today’s prices in ${place}, ${more}: the extreme cold cuts an air-source unit’s efficiency, and electricity here is expensive. Seal and insulate first, and ask for a heat-loss calculation before any heating quote.${local}`;
  }
  return `At today’s prices in ${place}, ${more}. Plan the switch for when your current system needs replacing, after air sealing and insulation shrink the heat a new system has to supply, and compare quotes sized with a heat-loss calculation.`;
}
