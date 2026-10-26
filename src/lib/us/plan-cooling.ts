/**
 * US Home Energy Planner: air-conditioning (cooling) estimates and electric-bill calibration.
 *
 * Method and every number: src/data/us/cooling-model.json (checked October 26, 2026):
 *   - baseline: EIA RECS 2020 microdata, single-family detached homes with central AC (indoor fan
 *     included), one benchmark per metro (state × climate-zone cell), rescaled to the metro's NOAA
 *     1991–2020 cooling degree days, floor area (exponent 0.6), era, house type and AC efficiency;
 *   - AC efficiency by install period: DOE standards history and LBNL shipment-weighted SEER;
 *   - savings: percent of cooling kWh from NREL ResStock, FSEC field studies and the Building America
 *     Solution Center, with low / typical / high ranges;
 *   - bills: a two-bill degree-day split (a two-point version of the PRISM-type billing regression in
 *     DOE's Uniform Methods Project), with the model's sanity checks.
 * The payload (plan-payload.ts) carries a compact copy of the numbers as `CoolingData`.
 *
 * Pure TypeScript, no DOM: runs at build time, in tests and in the browser.
 */

export interface CoolingData {
  /** per metro: RECS benchmark kWh (2020 weather), mean cooled sq ft, CDD65 at the sampled homes in 2020 */
  metros: Record<string, { k: number; a: number; c: number }>;
  /** room/window ACs per zone: kWh per household and the 2020 CDD65 at those homes (null = too few homes) */
  room: Record<string, { k: number; c: number } | null>;
  p: {
    areaExp: number;
    cddExp: Record<string, number>;
    sqft: Record<string, number>;
    era: Record<string, number>;
    type: Record<string, number>;
    seerRef: Record<string, number>;
    seerCap: number;
    /** EER assumed for the room-AC stock */
    roomEer: number;
    attic: { one: number; two: number; z1A: number };
    range: { lo: number; hi: number; mlo: number; mhi: number };
  };
  /**
   * Typical SEER of the unit a house has, by the planner's answers; a new variable-speed unit
   * (SEER and SEER2); and the 2023 federal minimum, South (Southeast and Southwest) and North.
   */
  seer: {
    centralNewS: number; centralNewN: number; centralOldNew: number; centralOldOld: number; hpNew: number; hpOld: number;
    newVs: number; newVs2: number; minS: number; minN: number; minS2: number; minN2: number;
  };
  /** measure savings, % of cooling kWh as [low, typical, high]; dehumidifier kWh a year (hot-humid users) and % an ENERGY STAR unit saves */
  m: {
    air: [number, number, number]; duct: [number, number, number]; radiant: [number, number, number]; coolRoof: [number, number, number];
    film: [number, number, number]; lowShgc: [number, number, number]; lowShgcDouble: [number, number, number];
    dehumKwh: number; dehumPct: number;
  };
  /** air sealing (30% leakage cut): typical % of cooling kWh by zone */
  air: Record<string, number>;
  /** raising the cooling setpoint: % of cooling kWh per °F, by metro (already clamped to 4–10) */
  setpoint: Record<string, number>;
  /** monthly NOAA 1991–2020 CDD65 and HDD65, and the annual CDD65, per metro */
  months: Record<string, { c: number[]; h: number[]; ac: number }>;
  /** heat pump water heater inside the house: kWh a year of free cooling, by climate */
  hpwh: { hotHumid: number; hotDry: number; mixedHumid: number };
}

export type AcKind = 'central' | 'heatpump' | 'room' | 'none';

export interface CoolingInput {
  metro: string;
  /** IECC 2021 zone, e.g. "2A" */
  zone: string | null;
  cdd65: number;
  size: string;
  age: string;
  /** detached | semi | condo */
  htype: string;
  /** planner answers */
  ac: string;
  heat: string;
  hage: string;
  /** DOE Southeast or Southwest region (regional AC standards since 2015) */
  south: boolean;
}

export interface CoolingBaseline {
  kind: AcKind;
  /** typical yearly kWh for air conditioning, indoor fan included */
  kwh: number;
  lo: number;
  hi: number;
  /** SEER assumed for the unit the house has (null for room units and none) */
  seer: number | null;
  /** the stock SEER the benchmark implies */
  seerRef: number;
  /** true when a stand-in zone was used for room ACs */
  roomStandIn: boolean;
}

const zoneLetter = (z: string | null) => (z ?? '').match(/^\d([A-C])/)?.[1] ?? 'A';
export const zoneNum = (z: string | null) => Number((z ?? '').match(/^\d/)?.[0] ?? NaN);
/** IECC zones 1–3: cooling-dominated or mixed with long, hot summers. */
export const hotZone = (z: string | null) => zoneNum(z) <= 3;

/** What kind of cooling the answers describe. */
export function acKind(ac: string, heat: string): AcKind {
  if (ac === 'none') return 'none';
  if (ac === 'room') return 'room';
  if (ac === 'heatpump') return 'heatpump';
  if (ac === 'unsure') return heat === 'heatpump' ? 'heatpump' : 'central';
  return 'central';
}

/**
 * SEER of the unit the house has, from the planner answers (DOE standards history, LBNL shipments).
 * null = not known: the stock average for the climate zone (seerRef) applies.
 */
export function unitSeer(i: CoolingInput, D: CoolingData): number | null {
  const kind = acKind(i.ac, i.heat);
  const S = D.seer;
  if (kind === 'none' || kind === 'room') return null;
  if (kind === 'heatpump') return i.hage === 'new' ? S.hpNew : i.hage === 'old' ? S.hpOld : null;
  if (i.ac === 'central-new') return i.south ? S.centralNewS : S.centralNewN;
  if (i.ac === 'central-old') return ['1996-2010', '2011-plus'].includes(i.age) ? S.centralOldNew : S.centralOldOld;
  return null;
}

/** The federal minimum a new central AC or heat pump has to meet here (2023 standards). */
export function minSeer(i: { south: boolean }, D: CoolingData): { seer: number; seer2: number } {
  return i.south ? { seer: D.seer.minS, seer2: D.seer.minS2 } : { seer: D.seer.minN, seer2: D.seer.minN2 };
}

/** Yearly air-conditioning kWh for a typical house like this one. */
export function coolingBaseline(i: CoolingInput, D: CoolingData): CoolingBaseline {
  const kind = acKind(i.ac, i.heat);
  const seerRef = D.p.seerRef[i.zone ?? ''] ?? 13;
  const letter = zoneLetter(i.zone);
  const marine = letter === 'C';
  const R = D.p.range;
  const out = (kwh: number, seer: number | null, roomStandIn = false): CoolingBaseline => ({
    kind, kwh, lo: kwh * (marine ? R.mlo : R.lo), hi: kwh * (marine ? R.mhi : R.hi), seer, seerRef, roomStandIn,
  });
  if (kind === 'none' || !(i.cdd65 > 0)) return out(0, null);
  const type = D.p.type[i.htype === 'semi' ? 'semi' : i.htype === 'condo' ? 'condo5plus' : 'detached'] ?? 1;
  if (kind === 'room') {
    let r = D.room[i.zone ?? ''];
    let standIn = false;
    if (!r) { r = D.room['3A'] ?? null; standIn = true; }
    if (!r) return out(0, null);
    return out(r.k * Math.pow(i.cdd65 / r.c, 0.9) * (i.htype === 'condo' ? D.p.type.condo5plus ?? 1 : 1), null, standIn);
  }
  const b = D.metros[i.metro];
  if (!b) return out(0, null);
  const area = D.p.sqft[i.size] ?? D.p.sqft.medium;
  const e = D.p.cddExp[letter] ?? 0.9;
  const seer = unitSeer(i, D);
  const ratio = seer ? Math.min(D.p.seerCap, seerRef / seer) : 1;
  const kwh = b.k * Math.pow(area / b.a, D.p.areaExp) * Math.pow(i.cdd65 / b.c, e) * (D.p.era[i.age] ?? 1) * type * ratio;
  return out(kwh, seer ?? seerRef);
}

/* ------------------------------------------------------------------ savings */

export interface CoolPct { lo: number; typ: number; hi: number; note?: string }
export type CoolMeasureKey =
  | 'attic-insulation' | 'air-sealing' | 'duct-sealing' | 'attic-heat' | 'cool-roof' | 'window-film' | 'windows-doors'
  | 'setpoint' | 'ac-upgrade';

export interface MeasureInput extends CoolingInput {
  found: string;
  storeys: number;
  /** attic R-value the model assumes now, and the ENERGY STAR target for the zone */
  atticBefore: number;
  atticTarget: number;
  /** window key from the engine: single, singleStorm, doubleClear, doubleLowE, energyStar */
  win: string;
}

const pct = (lo: number, typ: number, hi: number, note?: string): CoolPct => ({ lo: lo / 100, typ: typ / 100, hi: hi / 100, note });
const fromT = (t: [number, number, number], note?: string) => pct(t[0], t[1], t[2], note);
/**
 * Air sealing by era. The zone figures are for a 30% cut in homes around 15 ACH50, ResStock's median
 * for 1980s homes in hot zones. Older homes leak more, but we don't credit more (on purpose, low);
 * newer ones leak less: about 10 ACH50 in the 1990s and 8 after 2000 (0.6), and 5 under the 2012
 * code (0.35).
 */
const AIR_ERA: Record<string, number> = { 'pre-1946': 1, '1946-1965': 1, '1966-1980': 1, '1981-1995': 1, '1996-2010': 0.6, '2011-plus': 0.35 };

/** Share of cooling kWh each measure saves for this house (missing = doesn't apply). */
export function coolingMeasures(i: MeasureInput, D: CoolingData): Partial<Record<CoolMeasureKey, CoolPct>> {
  const kind = acKind(i.ac, i.heat);
  const out: Partial<Record<CoolMeasureKey, CoolPct>> = {};
  if (kind === 'none') return out;
  const hot = hotZone(i.zone);
  const ducted = kind === 'central' || kind === 'heatpump';
  const condo = i.htype === 'condo';
  const M = D.m;

  if (!condo && i.atticTarget > i.atticBefore) {
    const k = (i.storeys <= 1 ? D.p.attic.one : D.p.attic.two) * (i.zone === '1A' ? D.p.attic.z1A : 1);
    const typ = 100 * k * (1 / (i.atticBefore + 2) - 1 / (i.atticTarget + 2));
    if (typ > 0.2) out['attic-insulation'] = pct(0.6 * typ, typ, 2 * typ, `R-${i.atticBefore} to R-${i.atticTarget}`);
  }
  if (!condo) {
    const zt = D.air[i.zone ?? ''] ?? (hot ? M.air[1] : M.air[1] / 2);
    const typ = zt * (AIR_ERA[i.age] ?? 1);
    if (typ > 0.2) out['air-sealing'] = pct((M.air[0] * typ) / M.air[1], typ, Math.min(M.air[2], (typ * M.air[2]) / M.air[1]));
  }
  if (ducted && !condo) {
    // ducts in a hot attic, a crawlspace or a garage: the measured range. Homes built since 2011 had
    // their ducts tested under the 2012 code (the model's note: low 2%, typical 5%). Ducts mostly
    // inside a basement lose much less (planner judgment: about a third of the typical figure).
    const T = M.duct;
    const newer = pct(2, 5, T[2] / 2);
    if (i.age === '2011-plus') out['duct-sealing'] = newer;
    else if (i.found === 'basement') out['duct-sealing'] = pct(T[0] * 0.4, T[1] / 3, T[2] * 0.4);
    else if (i.found === 'slab' || i.found === 'crawl' || hot) out['duct-sealing'] = fromT(T);
    else out['duct-sealing'] = newer;
  }
  if (hot && !condo) {
    // radiant barrier: the measured range applies with R-19 or less; with R-30 or more the model
    // gives low 0, typical 3, high 6; in between, halfway (planner judgment)
    const rb = i.atticBefore;
    const R = M.radiant;
    out['attic-heat'] = rb <= 19 ? fromT(R) : rb >= 30 ? pct(0, 3, 6) : pct(R[0] / 2, (R[1] + 3) / 2, (R[2] + 6) / 2);
    out['cool-roof'] = fromT(M.coolRoof, 'at re-roofing');
  }
  if (hot && ['single', 'singleStorm', 'doubleClear'].includes(i.win)) {
    out['window-film'] = fromT(M.film);
    out['windows-doors'] = fromT(i.win === 'doubleClear' ? M.lowShgcDouble : M.lowShgc);
  }
  // raising the cooling setting 2 °F all day: the metro's % per °F (clamped 4–10%) compounded twice;
  // the range keeps the measured spread (4 to 8% around a typical 6% per °F)
  const sp = (D.setpoint[i.metro] ?? 6) / 100;
  const two = 100 * (1 - (1 - sp) ** 2);
  out.setpoint = pct(two * (4 / 6), two, two * (8 / 6), 'raising the cooling setting 2 °F');
  if (ducted || kind === 'room') {
    // a right-sized variable-speed unit: 1 − SEER now / SEER new (window units: the stock room-AC EER)
    const s = kind === 'room' ? D.p.roomEer : unitSeer(i, D) ?? (D.p.seerRef[i.zone ?? ''] ?? 13);
    const typ = Math.max(0, 100 * (1 - s / D.seer.newVs));
    if (typ > 1) {
      out['ac-upgrade'] = pct(0.7 * typ, typ, Math.min(55, 1.3 * typ),
        kind === 'room' ? `window units around EER ${s} now, a variable-speed heat pump around SEER ${D.seer.newVs}` : `about SEER ${s.toFixed(1)} now, SEER ${D.seer.newVs} (${D.seer.newVs2} SEER2) new`);
    }
  }
  return out;
}

/**
 * Several measures together, without double counting (cooling-model.json, model.parameters.combination):
 * multiplicative, with attic-heat measures overlapping (largest in full, others at 50%) and duct
 * sealing at 75% when a radiant barrier or cool roof is also chosen.
 */
export function combineCooling(keys: CoolMeasureKey[], m: Partial<Record<CoolMeasureKey, CoolPct>>, which: 'lo' | 'typ' | 'hi' = 'typ'): number {
  const atticSet = ['attic-insulation', 'attic-heat', 'cool-roof'] as const;
  const attic = keys.filter((k) => (atticSet as readonly string[]).includes(k)).map((k) => m[k]?.[which] ?? 0).sort((a, b) => b - a);
  let left = 1;
  attic.forEach((v, idx) => { left *= 1 - (idx === 0 ? v : v * 0.5); });
  for (const k of keys) {
    if ((atticSet as readonly string[]).includes(k)) continue;
    let v = m[k]?.[which] ?? 0;
    if (k === 'duct-sealing' && (keys.includes('attic-heat') || keys.includes('cool-roof'))) v *= 0.75;
    left *= 1 - v;
  }
  return 1 - left;
}

/* ------------------------------------------------------------------ bills */

const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface BillInput {
  metro: string;
  /** dollars, and the month the bill mostly covers (0 = January) */
  summer: { amt: number; month: number };
  winter: { amt: number; month: number };
  /** $ per kWh (state average) */
  price: number;
  /** the electric bill also pays for heating */
  elecHeat: boolean;
  /** modeled yearly heating kWh (electric heat only) and the metro's annual HDD65 */
  heatKwh?: number;
  hddAnnual?: number;
  /** modeled yearly cooling kWh, used when the bills calibrate heating instead */
  coolKwh?: number;
}

export interface BillResult {
  ok: boolean;
  /** what the bills were used for */
  mode?: 'cooling' | 'heating';
  reason?: string;
  coolKwh?: number;
  coolCost?: number;
  heatKwh?: number;
  baseKwhPerDay?: number;
}

/**
 * Two electric bills → yearly cooling (or, for electric heat where heating dominates, heating)
 * by the degree-day method in cooling-model.json billMethod. Returns ok:false with a plain reason
 * when the sanity checks fail, so the planner can fall back to the typical house and say why.
 */
export function billSplit(b: BillInput, D: CoolingData): BillResult {
  const mn = D.months[b.metro];
  if (!mn || !(b.price > 0)) return { ok: false, reason: 'no monthly climate normals for this area' };
  const s = b.summer, w = b.winter;
  if (!(s.amt > 0) || !(w.amt > 0)) return { ok: false, reason: 'both bills are needed' };
  const ds = DAYS[s.month], dw = DAYS[w.month];
  const cs = mn.c[s.month] / ds, cw = mn.c[w.month] / dw;
  const hs = mn.h[s.month] / ds, hw = mn.h[w.month] / dw;
  let S = s.amt / ds, W = w.amt / dw; // dollars a day

  // Electric heat where heating outweighs cooling: use the model's cooling and solve for heating.
  if (b.elecHeat && (b.heatKwh ?? 0) > (b.coolKwh ?? 0)) {
    const bc = ((b.coolKwh ?? 0) * b.price) / mn.ac; // $ per CDD from the model
    const base = S - bc * cs - (b.heatKwh && b.hddAnnual ? (b.heatKwh * b.price * mn.h[s.month]) / b.hddAnnual / ds : 0);
    if (Math.abs(hw - hs) < 5) return { ok: false, reason: 'the two months have too similar weather to split heating from the rest of the bill' };
    const bh = (W - base - bc * cw) / hw;
    if (!(bh > 0)) return { ok: false, reason: 'the winter bill isn’t higher than the summer bill would explain' };
    const baseKwh = base / b.price;
    if (baseKwh < 5 || baseKwh > 60) return { ok: false, reason: 'the bills imply an unusual amount of non-heating use (pools, EVs or a second home skew a two-bill estimate)' };
    return { ok: true, mode: 'heating', heatKwh: (bh * (b.hddAnnual ?? mn.h.reduce((x, y) => x + y, 0))) / b.price, baseKwhPerDay: baseKwh };
  }
  if (b.elecHeat && b.heatKwh && b.hddAnnual) {
    S -= (b.heatKwh * b.price * mn.h[s.month]) / b.hddAnnual / ds;
    W -= (b.heatKwh * b.price * mn.h[w.month]) / b.hddAnnual / dw;
  }
  const dc = cs - cw;
  if (Math.abs(dc) < 5) return { ok: false, reason: 'the two months have too similar weather to separate air conditioning from the rest of the bill' };
  const bc = (S - W) / dc;
  if (!(bc > 0)) return { ok: false, reason: 'the summer bill isn’t higher than the winter one once heating is set aside' };
  const base = W - bc * cw;
  const baseKwh = base / b.price;
  if (baseKwh < 5 || baseKwh > 60) return { ok: false, reason: 'the bills imply an unusual amount of other electricity use (pools, EVs or a second home skew a two-bill estimate)' };
  const cost = bc * mn.ac;
  return { ok: true, mode: 'cooling', coolCost: cost, coolKwh: cost / b.price, baseKwhPerDay: baseKwh };
}

/** The bill-based figure over the model's, clamped like the heating calibration (0.5–1.6). */
export function clampFactor(raw: number): { factor: number; clamped: boolean } {
  const f = Math.min(1.6, Math.max(0.5, raw));
  return { factor: f, clamped: f !== raw };
}

/** Month with the most cooling (summer default) and the most heating (winter default). */
export function defaultMonths(metro: string, D: CoolingData): { summer: number; winter: number } {
  const mn = D.months[metro];
  if (!mn) return { summer: 6, winter: 0 };
  const argmax = (a: number[]) => a.reduce((bi, v, i) => (v > a[bi] ? i : bi), 0);
  return { summer: argmax(mn.c), winter: argmax(mn.h) };
}
