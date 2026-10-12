/**
 * AuditYourHome calculator engine.
 *
 * Pure TypeScript, no DOM: the same functions run at build time (the static "at a glance"
 * tables) and in the browser (the interactive calculators). Every number comes from
 * src/data/calc/model.json, which records its source; see src/data/calc/sources.json.
 *
 * Units: energy in GJ (1 kWh = 0.0036 GJ), areas in m², temperatures in °C, money in CAD.
 */
import model from '../../data/calc/model.json';

export const MODEL = model;

/* ------------------------------------------------------------------ basic types */

export type Vintage = 'pre-1946' | '1946-1965' | '1966-1980' | '1981-1995' | '1996-2010' | '2011-plus';
export const VINTAGES: Vintage[] = ['pre-1946', '1946-1965', '1966-1980', '1981-1995', '1996-2010', '2011-plus'];
export const VINTAGE_LABEL: Record<Vintage, string> = {
  'pre-1946': 'Before 1946',
  '1946-1965': '1946–1965',
  '1966-1980': '1966–1980',
  '1981-1995': '1981–1995',
  '1996-2010': '1996–2010',
  '2011-plus': '2011 or later',
};

export type HouseType = 'detached' | 'semi' | 'row';
export const HOUSE_TYPE_LABEL: Record<HouseType, string> = { detached: 'Detached', semi: 'Semi-detached', row: 'Row or townhouse' };

export type SizeBand = 'small' | 'medium' | 'large' | 'xlarge';
export const SIZE_LABEL: Record<SizeBand, string> = {
  small: 'Under 1,200 sq ft',
  medium: '1,200–2,000 sq ft',
  large: '2,000–3,000 sq ft',
  xlarge: 'Over 3,000 sq ft',
};

export type Fuel = 'gas' | 'electricity' | 'oil' | 'propane' | 'wood' | 'pellets';
export const FUEL_LABEL: Record<Fuel, string> = {
  gas: 'natural gas',
  electricity: 'electricity',
  oil: 'heating oil',
  propane: 'propane',
  wood: 'firewood',
  pellets: 'wood pellets',
};
export type SystemKey = keyof typeof model.systems;
export const SYSTEM_KEYS = Object.keys(model.systems) as SystemKey[];

export type WaterHeaterKey = keyof typeof model.water.types;
export const WATER_HEATER_KEYS = Object.keys(model.water.types) as WaterHeaterKey[];

export type WindowKey = keyof typeof model.envelope.windowU;
export const WINDOW_KEYS = Object.keys(model.envelope.windowU) as WindowKey[];

/** Per-unit prices (taxes in). `null` = no verified price (the user must enter one). */
export interface Prices {
  electricity: { now: number | null; variable: number | null };
  /** null = no natural gas service in this area */
  gas: { now: number | null; variable: number | null } | null;
  oil: number | null;
  propane: number | null;
  /** $ per full cord of seasoned hardwood */
  wood: number | null;
  /** $ per tonne */
  pellets: number | null;
}
export type PriceMode = 'now' | 'variable';

/* ------------------------------------------------------------------ constants & helpers */

export const SQFT_PER_M2 = 10.7639;
export const R_PER_RSI = 5.678;
export const GJ_PER_KWH = 0.0036;
const SECONDS_PER_DAY = 86400;

export const sqftToM2 = (sqft: number) => sqft / SQFT_PER_M2;
export const m2ToSqft = (m2: number) => m2 * SQFT_PER_M2;
export const rToRsi = (r: number) => r / R_PER_RSI;
export const rsiToR = (rsi: number) => rsi * R_PER_RSI;

/** A finite, non-negative number or null. */
export function clean(n: unknown): number | null {
  const v = typeof n === 'string' ? parseFloat(n.replace(/[^0-9.\-]/g, '')) : (n as number);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
const pos = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/* ------------------------------------------------------------------ 1. climate zone */

/** NBC 2020 climate zone from heating degree-days (HOT2000 HDD). */
export function climateZone(hdd: number): string {
  for (const z of model.zones) {
    if (hdd >= z.minHdd && (z.maxHdd === null || hdd <= z.maxHdd)) return z.zone;
  }
  return model.zones[model.zones.length - 1].zone;
}

/* ------------------------------------------------------------------ 2. baseline demand */

export function floorAreaM2(o: { sizeBand?: SizeBand; sqft?: number | null }): number {
  if (pos(o.sqft)) return sqftToM2(o.sqft);
  return model.demand.sizeBandM2[o.sizeBand ?? 'medium'];
}

/**
 * Space-heating demand (heat delivered to the house, GJ/yr) for a typical house:
 * intensity(vintage) × floor area × (HDD ÷ 4,200) × type factor.
 */
export function baselineDemandGJ(o: { vintage: Vintage; floorAreaM2: number; hdd: number; type: HouseType }): number {
  const i = model.demand.intensityGJperM2[o.vintage];
  const t = model.demand.typeFactor[o.type];
  return i * o.floorAreaM2 * (o.hdd / model.demand.refHdd) * t;
}

/* ------------------------------------------------------------------ 4. systems & costs */

export function fuelOf(sys: SystemKey): Fuel {
  return model.systems[sys].fuel as Fuel;
}
export function isHeatPump(sys: SystemKey): boolean {
  return Boolean((model.systems[sys] as { heatPump?: boolean }).heatPump);
}

/** Seasonal COP band for an air-source heat pump at this HDD (values include backup heat). */
export function ashpBand(hdd: number) {
  const b = model.ashpCopBands.find((x) => hdd >= x.minHdd && (x.maxHdd === null || hdd <= x.maxHdd)) ?? model.ashpCopBands[model.ashpCopBands.length - 1];
  return b;
}

/** Seasonal efficiency (fuel systems) or seasonal COP (electric/heat pumps). */
export function systemEfficiency(sys: SystemKey, hdd: number): number {
  const s = model.systems[sys] as { eff?: number; copBand?: 'standard' | 'coldClimate' };
  if (s.copBand) {
    const b = ashpBand(hdd);
    // Above 7,000 HDD (zone 8) use the low end of the ≥6,000 band: one partial-season pilot only.
    if (hdd >= 7000) return s.copBand === 'standard' ? b.standardLow : b.coldClimateLow;
    return s.copBand === 'standard' ? b.standard : b.coldClimate;
  }
  return s.eff as number;
}

export interface FuelUnit { unit: string; unitLong: string; gjPerUnit: number }
export function fuelUnit(fuel: Fuel): FuelUnit {
  const ec = model.energyContentGJ;
  switch (fuel) {
    case 'gas': return { unit: 'm³', unitLong: 'cubic metres of natural gas', gjPerUnit: ec.gas };
    case 'electricity': return { unit: 'kWh', unitLong: 'kilowatt-hours', gjPerUnit: ec.electricity };
    case 'oil': return { unit: 'L', unitLong: 'litres of heating oil', gjPerUnit: ec.oil };
    case 'propane': return { unit: 'L', unitLong: 'litres of propane', gjPerUnit: ec.propane };
    case 'wood': return { unit: 'cords', unitLong: 'full cords of seasoned hardwood', gjPerUnit: ec.hardwood };
    case 'pellets': return { unit: 'tonnes', unitLong: 'tonnes of wood pellets', gjPerUnit: ec.pellets };
  }
}

export function priceFor(fuel: Fuel, p: Prices, mode: PriceMode): number | null {
  switch (fuel) {
    case 'electricity': return mode === 'now' ? p.electricity.now : p.electricity.variable;
    case 'gas': return p.gas ? (mode === 'now' ? p.gas.now : p.gas.variable) : null;
    case 'oil': return p.oil;
    case 'propane': return p.propane;
    case 'wood': return p.wood;
    case 'pellets': return p.pellets;
  }
}

export interface HeatingCost {
  system: SystemKey;
  fuel: Fuel;
  /** seasonal efficiency or COP */
  eff: number;
  /** energy bought, GJ/yr */
  fuelGJ: number;
  /** fuel bought in its billing unit */
  units: number;
  unit: string;
  /** price used ($/unit), null if unknown */
  price: number | null;
  /** $/yr, null when the price is unknown */
  cost: number | null;
  /** $ per GJ of heat delivered */
  costPerGJ: number | null;
  available: boolean;
}

/** Heating cost of delivering `demandGJ` with `sys`: demand ÷ efficiency × price per unit. */
export function heatingCost(demandGJ: number, sys: SystemKey, hdd: number, p: Prices, mode: PriceMode): HeatingCost {
  const fuel = fuelOf(sys);
  const eff = systemEfficiency(sys, hdd);
  const fu = fuelUnit(fuel);
  const fuelGJ = demandGJ / eff;
  const units = fuelGJ / fu.gjPerUnit;
  const price = priceFor(fuel, p, mode);
  const available = !(fuel === 'gas' && p.gas === null);
  const cost = available && pos(price) ? units * price : null;
  const costPerGJ = available && pos(price) ? price / (fu.gjPerUnit * eff) : null;
  return { system: sys, fuel, eff, fuelGJ, units, unit: fu.unit, price: pos(price) ? price : null, cost, costPerGJ, available };
}

/* ------------------------------------------------------------------ 3. bill calibration */

export interface BillInput {
  /** 'usage' = annual fuel use in the system's unit; 'bill' = average monthly bill in $ */
  mode: 'none' | 'usage' | 'bill';
  annualUnits?: number | null;
  monthlyBill?: number | null;
  /** electric-heated homes: a typical summer month's bill ($) */
  summerBill?: number | null;
  /** electric-heated homes: summer month's use (kWh) when mode = 'usage' */
  summerKwh?: number | null;
  /** is the water heater on the same fuel as the heating system? */
  waterHeaterSameFuel: boolean;
}

export interface Calibration {
  calibrated: boolean;
  /** factor applied to every saving (1 when not calibrated) */
  factor: number;
  /** unclamped actual ÷ model */
  raw: number | null;
  clamped: boolean;
  actualDemandGJ: number | null;
  /** fuel units attributed to space heating */
  heatingUnits: number | null;
  method: string;
}

/**
 * Turn a bill or annual use into delivered space heat and compare with the typical-house model.
 * Gas/oil/propane: 80% of the fuel is space heating when the water heater uses the same fuel,
 * else 95%. Electric heat: total − summer baseload (if given) or Hydro-Québec's 54% heating share.
 */
export function calibrate(modelDemandGJ: number, sys: SystemKey, hdd: number, p: Prices, bill: BillInput): Calibration {
  const none: Calibration = { calibrated: false, factor: 1, raw: null, clamped: false, actualDemandGJ: null, heatingUnits: null, method: 'typical' };
  if (bill.mode === 'none' || !(modelDemandGJ > 0)) return none;
  const fuel = fuelOf(sys);
  const fu = fuelUnit(fuel);
  const avgPrice = priceFor(fuel, p, 'now');
  const C = model.calibration;

  let annualUnits: number | null = null;
  if (bill.mode === 'usage') annualUnits = pos(bill.annualUnits) ? bill.annualUnits : null;
  if (bill.mode === 'bill') annualUnits = pos(bill.monthlyBill) && pos(avgPrice) ? (bill.monthlyBill * 12) / avgPrice : null;
  if (!pos(annualUnits)) return none;

  let heatingUnits: number;
  let method: string;
  if (fuel === 'electricity') {
    let baseUnits: number | null = null;
    if (bill.mode === 'usage' && pos(bill.summerKwh)) baseUnits = bill.summerKwh * 12;
    if (bill.mode === 'bill' && pos(bill.summerBill) && pos(avgPrice)) baseUnits = (bill.summerBill * 12) / avgPrice;
    if (baseUnits !== null) {
      heatingUnits = Math.max(0, annualUnits - baseUnits);
      method = 'summer';
    } else {
      const share = bill.waterHeaterSameFuel ? C.elecHeatShare.withElectricWaterHeater : C.elecHeatShare.withOtherWaterHeater;
      heatingUnits = annualUnits * share;
      method = 'share';
    }
  } else {
    const share = bill.waterHeaterSameFuel ? C.heatShareWithSameFuelWaterHeater : C.heatShareOtherwise;
    heatingUnits = annualUnits * share;
    method = 'share';
  }
  const actual = heatingUnits * fu.gjPerUnit * systemEfficiency(sys, hdd);
  if (!(actual > 0)) return none;
  const raw = actual / modelDemandGJ;
  const factor = Math.min(C.max, Math.max(C.min, raw));
  return { calibrated: true, factor, raw, clamped: factor !== raw, actualDemandGJ: actual, heatingUnits, method };
}

/* ------------------------------------------------------------------ 5. envelope */

export interface Geometry {
  floorAreaM2: number;
  storeys: number;
  basement: boolean;
  footprintM2: number;
  perimeterM: number;
  atticM2: number;
  wallGrossM2: number;
  wallNetM2: number;
  basementWallM2: number;
  windowM2: number;
  windowCount: number;
  volumeM3: number;
}

/**
 * Simple house geometry: a square footprint (the smallest perimeter for the area, which keeps
 * wall and basement savings conservative), 2.5 m storeys, 2.4 m basement walls.
 */
export function geometry(floorAreaM2: number, storeys: number, basement: boolean, windowCount?: number | null): Geometry {
  const E = model.envelope;
  const n = Math.max(1, storeys);
  const footprint = floorAreaM2 / n;
  const perimeter = 4 * Math.sqrt(footprint);
  const wallGross = perimeter * n * E.storeyHeightM;
  const wallNet = wallGross * (1 - E.windowShareOfGrossWall);
  const basementWall = basement ? perimeter * E.basementWallHeightM : 0;
  const windowM2 = pos(windowCount) ? windowCount * E.windowM2Each : floorAreaM2 * E.windowAreaShareOfFloor;
  const count = pos(windowCount) ? windowCount : Math.round(windowM2 / E.windowM2Each);
  const volume = floorAreaM2 * E.storeyHeightM + (basement ? footprint * E.basementWallHeightM : 0);
  return { floorAreaM2, storeys: n, basement, footprintM2: footprint, perimeterM: perimeter, atticM2: footprint, wallGrossM2: wallGross, wallNetM2: wallNet, basementWallM2: basementWall, windowM2, windowCount: count, volumeM3: volume };
}

/** ΔQ (GJ/yr) = A × ΔU × HDD × 24 × 3600 ÷ 1e9 × F */
export function conductionSavingGJ(areaM2: number, uBefore: number, uAfter: number, hdd: number, F: number): number {
  const du = uBefore - uAfter;
  if (!(du > 0) || !(areaM2 > 0)) return 0;
  return (areaM2 * du * hdd * SECONDS_PER_DAY) / 1e9 * F;
}

export function atticTargetR(hdd: number): { target: number; nrcan: number; codeMinR: number; zone: string } {
  const zone = climateZone(hdd);
  const E = model.envelope;
  const nrcan = (E.nrcanRetrofitRoofR as Record<string, number>)[zone];
  const codeMinR = Math.round(rsiToR((E.nbcCeilingMinRsi as Record<string, number>)[zone]) * 10) / 10;
  return { target: Math.min(nrcan, E.atticTargetCapR), nrcan, codeMinR, zone };
}

export interface MeasureResult {
  key: string;
  /** delivered heat saved, GJ/yr, after the conservative factor, calibration and caps */
  gj: number;
  /** share of (calibrated) heating demand */
  fraction: number;
  capped: boolean;
  applicable: boolean;
  note?: string;
}

function finishMeasure(key: string, gjRaw: number, demandGJ: number, calibration: number, applicable = true, note?: string): MeasureResult {
  const E = model.envelope;
  const calibrated = Math.max(0, gjRaw) * calibration;
  const cap = E.capSingle * demandGJ;
  const capped = calibrated > cap;
  const gj = capped ? cap : calibrated;
  return { key, gj, fraction: demandGJ > 0 ? gj / demandGJ : 0, capped, applicable: applicable && gj > 0, note };
}

export function atticMeasure(o: { areaM2: number; rBefore: number; rAfter: number; hdd: number; demandGJ: number; calibration: number }): MeasureResult {
  if (!(o.rAfter > o.rBefore)) return finishMeasure('attic', 0, o.demandGJ, o.calibration, false, 'The target is not above what the attic has now.');
  const g = conductionSavingGJ(o.areaM2, 1 / rToRsi(Math.max(o.rBefore, 0.5)), 1 / rToRsi(o.rAfter), o.hdd, model.envelope.F.aboveGrade);
  return finishMeasure('attic', g, o.demandGJ, o.calibration);
}

export type WallOption = 'dense' | 'exterior';
export function wallAfterRsi(option: WallOption, rsiBefore: number): number {
  const E = model.envelope;
  return option === 'dense' ? Math.max(rsiBefore, E.denseRsi) : rsiBefore + E.exteriorAddRsi;
}
export function wallMeasure(o: { areaM2: number; option: WallOption; rsiBefore: number; hdd: number; demandGJ: number; calibration: number }): MeasureResult {
  const after = wallAfterRsi(o.option, o.rsiBefore);
  if (!(after > o.rsiBefore)) {
    return finishMeasure('walls', 0, o.demandGJ, o.calibration, false, `Walls at RSI ${o.rsiBefore.toFixed(1)} already have about what dense-packing would give (RSI ${model.envelope.denseRsi}).`);
  }
  const g = conductionSavingGJ(o.areaM2, 1 / Math.max(o.rsiBefore, 0.3), 1 / after, o.hdd, model.envelope.F.aboveGrade);
  return finishMeasure('walls', g, o.demandGJ, o.calibration);
}

export function basementMeasure(o: { areaM2: number; rsiBefore: number; rsiAfter: number; hdd: number; demandGJ: number; calibration: number }): MeasureResult {
  if (!(o.areaM2 > 0)) return finishMeasure('basement', 0, o.demandGJ, o.calibration, false, 'No basement walls to insulate.');
  if (!(o.rsiAfter > o.rsiBefore)) return finishMeasure('basement', 0, o.demandGJ, o.calibration, false, 'The target is not above what the basement has now.');
  const g = conductionSavingGJ(o.areaM2, 1 / Math.max(o.rsiBefore, 0.3), 1 / o.rsiAfter, o.hdd, model.envelope.F.basement);
  return finishMeasure('basement', g, o.demandGJ, o.calibration);
}

export function windowU(k: WindowKey): number {
  return model.envelope.windowU[k].u;
}
export function windowMeasure(o: { areaM2: number; before: WindowKey; after: WindowKey; hdd: number; demandGJ: number; calibration: number }): MeasureResult {
  const ub = windowU(o.before), ua = windowU(o.after);
  if (!(ub > ua)) return finishMeasure('windows', 0, o.demandGJ, o.calibration, false, 'The new windows are not better than the ones you have.');
  const g = conductionSavingGJ(o.areaM2, ub, ua, o.hdd, model.envelope.F.aboveGrade);
  return finishMeasure('windows', g, o.demandGJ, o.calibration);
}

export interface AirResult extends MeasureResult {
  method: 'share' | 'ach50';
  reduction: number;
  ach50Before: number | null;
  ach50After: number | null;
}
/**
 * Air sealing. Without a blower-door test: NRCan's "about 25% of heat loss is air leakage" ×
 * reduction × demand × F. With a measured ACH50: natural ACH = ACH50 ÷ 20;
 * ΔQ = ΔACH × volume × 1.21 kJ/m³·K × HDD × 24 ÷ 1e6 × F.
 */
export function airMeasure(o: { volumeM3: number; hdd: number; demandGJ: number; calibration: number; ach50?: number | null; reduction?: number | null }): AirResult {
  const A = model.envelope.air;
  const F = model.envelope.F.aboveGrade;
  const ach = pos(o.ach50) ? o.ach50 : null;
  const reduction = pos(o.reduction) ? Math.min(0.6, o.reduction) : ach !== null && ach < A.tightAch50 ? A.reductionTight : A.reductionDefault;
  let r: MeasureResult;
  let method: 'share' | 'ach50';
  if (ach !== null) {
    const natBefore = ach / A.nFactor;
    const dAch = natBefore * reduction;
    const gjRaw = (dAch * o.volumeM3 * A.volHeatCapKJm3K * o.hdd * 24) / 1e6 * F;
    r = finishMeasure('airSealing', gjRaw, o.demandGJ, o.calibration);
    method = 'ach50';
  } else {
    // o.demandGJ is already the calibrated demand, so the factor is not applied a second time
    const gjRaw = A.leakShareOfHeatLoss * reduction * o.demandGJ * F;
    r = finishMeasure('airSealing', gjRaw, o.demandGJ, 1);
    method = 'share';
  }
  return { ...r, method, reduction, ach50Before: ach, ach50After: ach !== null ? ach * (1 - reduction) : null };
}

export interface SetbackResult extends MeasureResult {
  degrees: number;
  hours: number;
  limited: boolean;
}
/** saving fraction = 2% × setback °C × (hours ÷ 8); heat pumps limited to a 2 °C setback (NRCan). */
export function setbackMeasure(o: { degrees: number; hours: number; demandGJ: number; heatPump: boolean }): SetbackResult {
  const S = model.setback;
  let deg = Math.max(0, o.degrees || 0);
  let limited = false;
  if (o.heatPump && deg > S.heatPumpMaxDeg) { deg = S.heatPumpMaxDeg; limited = true; }
  const hours = Math.min(24, Math.max(0, o.hours || 0));
  const frac = Math.min(model.envelope.capSingle, S.perDegPer8h * deg * (hours / 8));
  const gj = frac * o.demandGJ;
  return { key: 'setback', gj, fraction: frac, capped: frac >= model.envelope.capSingle, applicable: gj > 0, degrees: deg, hours, limited };
}

/**
 * Combine selected measures. Savings overlap (once the attic is insulated there is less heat to
 * save elsewhere), so the combined share is 1 − Π(1 − fᵢ), which is always ≤ the simple sum,
 * and it is capped at 60% of heating demand.
 */
export function combineMeasures(results: MeasureResult[], demandGJ: number): { gj: number; fraction: number; sumFraction: number; capped: boolean; overlap: boolean } {
  const active = results.filter((r) => r.applicable && r.gj > 0);
  const sumFraction = active.reduce((s, r) => s + r.fraction, 0);
  let keep = 1;
  for (const r of active) keep *= 1 - Math.min(0.99, r.fraction);
  let fraction = 1 - keep;
  const cap = model.envelope.capTotal;
  const capped = fraction > cap;
  if (capped) fraction = cap;
  return { gj: fraction * demandGJ, fraction, sumFraction, capped, overlap: active.length > 1 && fraction < sumFraction - 1e-9 };
}

/* ------------------------------------------------------------------ money: savings, rebates, payback */

/** Convert delivered-heat savings to fuel units and dollars (at the variable price). */
export function savingValue(gj: number, sys: SystemKey, hdd: number, p: Prices, mode: PriceMode = 'variable') {
  const fuel = fuelOf(sys);
  const fu = fuelUnit(fuel);
  const eff = systemEfficiency(sys, hdd);
  const units = gj / eff / fu.gjPerUnit;
  const price = priceFor(fuel, p, mode);
  return { units, unit: fu.unit, dollars: pos(price) ? units * price : null };
}

export interface RebateEntry {
  id: string;
  program: string;
  status: string;
  /** shown instead of an amount when the program is announced but not open */
  statusNote?: string;
  kind: 'flat' | 'perSqft' | 'perSqftR' | 'per100SqftR' | 'perCount' | 'perTon' | 'perKBtu' | 'pctCost' | 'info';
  rate: number | null;
  cap: number | null;
  pct?: number;
  pctCostCap?: number;
  fuels?: string[] | null;
  minRAdded?: number;
  minRAddedByOption?: Record<string, number>;
  minTargetR?: number;
  maxExistingR?: number;
  minSqft?: number;
  minCount?: number;
  requiresDoubling?: boolean;
  defaultOff?: boolean;
  perCount?: boolean;
  scope?: 'whole' | 'partial';
  ductedAmount?: number;
  ductedRate?: number;
  coldClimateRate?: number;
  ductlessCap?: number;
  rented?: boolean;
  /** window rebates: the new windows must be at least this good */
  windowReq?: 'energyStar' | 'triple' | 'mostEfficient';
}

export interface RebateQty {
  sqft?: number;
  rBefore?: number;
  rAfter?: number;
  count?: number;
  tons?: number;
  kBtu?: number;
  cost?: number | null;
  option?: string;
  ducted?: boolean;
  coldClimate?: boolean;
  /** heating fuel of the home before the work */
  fuel?: string;
  waterHeaterFuel?: string;
  windowAfter?: string;
}

export interface RebateResult { amount: number | null; eligible: boolean; reason?: string }

/** Conservative rebate for one program: the per-unit default × quantity, within caps and rules. */
export function rebateAmount(e: RebateEntry, q: RebateQty): RebateResult {
  if (e.status === 'announced') return { amount: null, eligible: false, reason: e.statusNote ?? 'Announced, not open yet' };
  if (e.status !== 'open') return { amount: null, eligible: false, reason: 'Not open to new applicants' };
  if (e.rented) return { amount: null, eligible: false, reason: 'For rented equipment only' };
  if (e.fuels && e.fuels.length) {
    if (e.fuels.includes('northernBC')) return { amount: null, eligible: false, reason: 'Northern BC only' };
    if (e.fuels.includes('electricWaterHeater')) {
      if (q.waterHeaterFuel && q.waterHeaterFuel !== 'electricity') return { amount: null, eligible: false, reason: 'Only when replacing an electric water heater' };
    } else if (q.fuel && !e.fuels.includes(q.fuel)) {
      return { amount: null, eligible: false, reason: `Only for homes heated by ${e.fuels.map((f) => FUEL_LABEL[f as Fuel] ?? f).join(', ')}` };
    }
  }
  const rAdded = pos(q.rAfter) && typeof q.rBefore === 'number' ? q.rAfter - q.rBefore : undefined;
  const minAdd = e.minRAddedByOption && q.option ? e.minRAddedByOption[q.option] : e.minRAdded;
  if (minAdd !== undefined && rAdded !== undefined && rAdded < minAdd - 1e-6) return { amount: null, eligible: false, reason: `Needs at least R-${minAdd} added` };
  if (e.minTargetR !== undefined && pos(q.rAfter) && q.rAfter < e.minTargetR - 0.5) return { amount: null, eligible: false, reason: `Needs a result of at least R-${e.minTargetR}` };
  if (e.maxExistingR !== undefined && typeof q.rBefore === 'number' && q.rBefore > e.maxExistingR + 0.5) return { amount: null, eligible: false, reason: `Only when the existing level is R-${e.maxExistingR} or less` };
  if (e.minSqft !== undefined && pos(q.sqft) && q.sqft < e.minSqft) return { amount: null, eligible: false, reason: `Needs at least ${e.minSqft} sq ft` };
  if (e.minCount !== undefined && typeof q.count === 'number' && q.count < e.minCount) return { amount: null, eligible: false, reason: `Needs at least ${e.minCount} openings` };
  if (e.requiresDoubling && pos(q.rAfter) && pos(q.rBefore) && q.rAfter < 2 * q.rBefore - 1e-6) return { amount: null, eligible: false, reason: 'Paid in full only when the R-value at least doubles' };
  if (e.windowReq && q.windowAfter) {
    const okWin = e.windowReq === 'energyStar' ? ['energyStar', 'mostEfficient', 'triple'].includes(q.windowAfter) : q.windowAfter === e.windowReq;
    if (!okWin) return { amount: null, eligible: false, reason: e.windowReq === 'triple' ? 'Needs triple-pane ENERGY STAR windows' : e.windowReq === 'mostEfficient' ? 'Needs ENERGY STAR Most Efficient windows' : 'Needs ENERGY STAR windows' };
  }
  if (e.scope === 'whole' && q.ducted === false) return { amount: null, eligible: false, reason: 'Whole-home systems only' };
  if (e.scope === 'partial' && q.ducted === true) return { amount: null, eligible: false, reason: 'Partial-home systems only' };

  let a: number | null = null;
  const rate = e.rate ?? 0;
  switch (e.kind) {
    case 'flat':
      a = q.ducted && e.ductedAmount ? e.ductedAmount : rate;
      break;
    case 'perSqft':
      a = pos(q.sqft) ? rate * q.sqft : null;
      break;
    case 'perSqftR':
      a = pos(q.sqft) && rAdded !== undefined && rAdded > 0 ? rate * q.sqft * rAdded : null;
      break;
    case 'per100SqftR':
      a = pos(q.sqft) && rAdded !== undefined && rAdded > 0 ? rate * (q.sqft / 100) * rAdded : null;
      break;
    case 'perCount':
      a = pos(q.count) ? rate * q.count : null;
      break;
    case 'perTon':
      a = pos(q.tons) ? (q.ducted && e.ductedRate ? e.ductedRate : rate) * q.tons : null;
      break;
    case 'perKBtu':
      a = pos(q.kBtu) ? rate * q.kBtu : null;
      break;
    case 'pctCost': {
      if (!pos(q.cost)) return { amount: null, eligible: true, reason: 'Enter your cost to see this rebate' };
      let cap = q.ducted === false && e.ductlessCap ? e.ductlessCap : e.cap;
      if (pos(cap) && e.perCount && pos(q.count)) cap = cap * q.count;
      a = (e.pct ?? 0) * q.cost;
      if (pos(cap)) a = Math.min(a, cap);
      break;
    }
    case 'info':
      return { amount: null, eligible: false, reason: 'Amount depends on the project; see the program' };
  }
  if (a === null) return { amount: null, eligible: true, reason: 'Needs the size of the job' };
  if (e.kind !== 'pctCost' && pos(e.cap)) a = Math.min(a, e.cap);
  if (pos(e.pctCostCap) && pos(q.cost)) a = Math.min(a, e.pctCostCap * q.cost);
  if (pos(q.cost)) a = Math.min(a, q.cost);
  return { amount: Math.max(0, a), eligible: true };
}

export interface Payback {
  kind: 'years' | 'immediate' | 'never' | 'unknown';
  years: number | null;
}
/** Simple payback = (cost − rebate) ÷ annual saving. Never negative, never Infinity. */
export function payback(cost: number | null | undefined, rebate: number | null | undefined, annualSaving: number | null | undefined): Payback {
  if (cost === 0) return pos(annualSaving) ? { kind: 'immediate', years: 0 } : { kind: 'never', years: null };
  if (!pos(cost)) return { kind: 'unknown', years: null };
  const net = cost - (pos(rebate) ? rebate : 0);
  if (net <= 0) return { kind: 'immediate', years: 0 };
  if (!pos(annualSaving)) return { kind: 'never', years: null };
  const y = net / annualSaving;
  if (!Number.isFinite(y) || y > 200) return { kind: 'never', years: null };
  return { kind: 'years', years: y };
}

/* ------------------------------------------------------------------ 6. water heating */

export function inletTempC(annualMeanC: number): number {
  const W = model.water;
  return Math.max(W.inletMinC, annualMeanC + W.inletOffsetC);
}

/** Heat delivered to hot water, GJ/yr: L/day × 4.186 kJ/L·K × (55 − inlet) × 365. */
export function waterHeatingDemand(persons: number, annualMeanC: number, litresPerDay?: number | null) {
  const W = model.water;
  const litres = pos(litresPerDay) ? litresPerDay : Math.max(1, persons) * W.litresPerPerson;
  const inlet = inletTempC(annualMeanC);
  const dT = Math.max(0, W.deliveryC - inlet);
  const gj = (litres * W.kJperLK * dT * 365) / 1e6;
  return { litresPerDay: litres, inletC: inlet, deliveryC: W.deliveryC, gj };
}

export interface WaterHeaterCost {
  type: WaterHeaterKey;
  fuel: Fuel;
  uef: number;
  fuelGJ: number;
  units: number;
  unit: string;
  cost: number | null;
  /** heat pump water heaters: extra space heating to replace heat taken from the house */
  extraHeatGJ: number;
  extraCost: number | null;
  available: boolean;
}

export function waterHeaterCost(type: WaterHeaterKey, deliveredGJ: number, p: Prices, mode: PriceMode, space?: { sys: SystemKey; hdd: number } | null): WaterHeaterCost {
  const t = model.water.types[type];
  const fuel = t.fuel as Fuel;
  const fu = fuelUnit(fuel);
  const fuelGJ = deliveredGJ / t.uef;
  const units = fuelGJ / fu.gjPerUnit;
  const price = priceFor(fuel, p, mode);
  const available = !(fuel === 'gas' && p.gas === null);
  const cost = available && pos(price) ? units * price : null;
  let extraHeatGJ = 0;
  let extraCost: number | null = 0;
  if (type === 'heatPump' && space) {
    extraHeatGJ = deliveredGJ * (1 - 1 / t.uef) * model.water.hpwhHeatTaken.heatingSeasonShare;
    extraCost = heatingCost(extraHeatGJ, space.sys, space.hdd, p, mode).cost;
  }
  return { type, fuel, uef: t.uef, fuelGJ, units, unit: fu.unit, cost, extraHeatGJ, extraCost, available };
}

/** DOE tankless claim band for this daily use (null between the two published points). */
export function tanklessClaim(litresPerDay: number): [number, number] | null {
  const T = model.water.tanklessClaim;
  if (litresPerDay <= T.smallUseLitres) return T.smallUse as [number, number];
  if (litresPerDay >= T.largeUseLitres) return T.largeUse as [number, number];
  return null;
}

/* ------------------------------------------------------------------ 7. cooling */

export type AcAge = keyof typeof model.cooling.seerByAge;
export function defaultAcTons(floorAreaM2: number): number {
  const btuh = floorAreaM2 * model.cooling.btuhPerM2;
  return Math.max(1, Math.round((btuh / 12000) * 2) / 2);
}
/** Equivalent full-load hours = 24 × CDD18 ÷ (design cooling temperature − 18). */
export function eflh(cdd18: number, designCool: number): number {
  const d = designCool - 18;
  return d > 0 ? (24 * cdd18) / d : 0;
}
/** kWh = EFLH × capacity ÷ SEER ÷ 1000 × 0.8 (central) or ÷ (0.9 × EER) for room units. */
export function coolingKwh(o: { cdd18: number; designCool: number; capacityBtuh: number; seer?: number; eer?: number; room?: boolean; units?: number }): { eflh: number; kwh: number } {
  const h = eflh(o.cdd18, o.designCool);
  const C = model.cooling;
  let kwh: number;
  if (o.room) {
    const eer = pos(o.eer) ? o.eer : C.room.eerStock;
    kwh = (h * o.capacityBtuh) / (C.room.formulaFactor * eer) / 1000 * C.usageFactor * Math.max(1, o.units ?? 1);
  } else {
    const seer = pos(o.seer) ? o.seer : C.seerByAge['2006to2022'];
    kwh = (h * o.capacityBtuh) / seer / 1000 * C.usageFactor;
  }
  return { eflh: h, kwh: Number.isFinite(kwh) ? Math.max(0, kwh) : 0 };
}

/* ------------------------------------------------------------------ 9. health helpers */

/** Saturation vapour pressure (hPa), Magnus form used by the US National Weather Service. */
export function satVapourPressure(tC: number): number {
  return 6.112 * Math.exp((17.67 * tC) / (tC + 243.5));
}
export function dewPoint(tC: number, rhPct: number): number {
  const e = (Math.min(100, Math.max(1, rhPct)) / 100) * satVapourPressure(tC);
  const l = Math.log(e / 6.112);
  return (243.5 * l) / (17.67 - l);
}
/** Inside glass temperature: T_in − U × (T_in − T_out) ÷ h_in (h_in = 8.33 W/m²·K, NBC interior film). */
export function glassTemp(tIn: number, tOut: number, u: number, hIn = 8.33): number {
  return tIn - (u * (tIn - tOut)) / hIn;
}
/** Highest indoor RH before condensation forms at the centre of the glass. */
export function maxRhNoCondensation(tIn: number, tOut: number, u: number, hIn = 8.33): number {
  const tg = glassTemp(tIn, tOut, u, hIn);
  return Math.min(100, (100 * satVapourPressure(tg)) / satVapourPressure(tIn));
}
/** Outdoor temperature at which condensation starts on the glass for this indoor T and RH. */
export function condensationStartsAt(tIn: number, rhPct: number, u: number, hIn = 8.33): number {
  const td = dewPoint(tIn, rhPct);
  return tIn - ((tIn - td) * hIn) / u;
}

export const bqToPci = (bq: number) => bq / 37;
export const pciToBq = (pci: number) => pci * 37;

export interface AlarmLayout {
  /** levels including the basement */
  levels: number;
  /** levels that have bedrooms */
  bedroomLevels: number;
  bedrooms: number;
  /** separate sleeping areas (hallways serving bedrooms) */
  sleepingAreas: number;
  fuelBurning: boolean;
  attachedGarage: boolean;
}
export interface AlarmRules {
  existingHomesRequired: boolean | null;
  everyStorey: boolean | string | null;
  outsideSleepingAreas: boolean | null;
  inEachBedroom: boolean | string | null;
}
export interface AlarmCounts {
  smokeLaw: number | null;
  smokeLawNote: string;
  smokeRecommended: number;
  coApplies: boolean;
  coLaw: number | null;
  coRecommended: number;
}

/** Smoke and CO alarm counts: what provincial law requires in an existing house vs the new-home standard. */
export function alarmCounts(l: AlarmLayout, prov: string, rules: AlarmRules, coExisting: boolean | null): AlarmCounts {
  const levels = Math.max(1, Math.round(l.levels));
  const bLevels = Math.min(levels, Math.max(1, Math.round(l.bedroomLevels)));
  const areas = Math.max(bLevels, Math.round(l.sleepingAreas));
  const bedrooms = Math.max(0, Math.round(l.bedrooms));
  const otherLevels = levels - bLevels;
  // NBC 2020 9.10.19 (new homes): every storey incl. basement; on bedroom storeys one between
  // the bedrooms and the rest of the storey plus one in each bedroom.
  const smokeRecommended = otherLevels + areas + bedrooms;
  let smokeLaw: number | null = null;
  let note = '';
  if (rules.existingHomesRequired === null || rules.existingHomesRequired === undefined) {
    smokeLaw = null;
    note = prov === 'QC' ? 'Set by your municipality' : 'Not confirmed for this province';
  } else {
    const everyStorey = rules.everyStorey === true || (typeof rules.everyStorey === 'string' && /yes/i.test(rules.everyStorey));
    const eachBedroom = rules.inEachBedroom === true || (typeof rules.inEachBedroom === 'string' && /yes/i.test(rules.inEachBedroom));
    smokeLaw = areas + (everyStorey ? otherLevels : 0) + (eachBedroom ? bedrooms : 0);
  }
  const coApplies = l.fuelBurning || l.attachedGarage;
  // NRCan: one near the furnace or appliance and one in each bedroom area.
  const coRecommended = coApplies ? areas + (l.fuelBurning ? 1 : 0) : 0;
  let coLaw: number | null = null;
  if (coExisting === true && coApplies) {
    if (prov === 'ON') coLaw = areas + otherLevels; // next to each sleeping area + every storey without one (from 2026-01-01)
    else if (prov === 'SK') coLaw = areas; // inside each sleeping room or within 5 m of each door
    else coLaw = null; // required, but the count is not set out in the sources we read
  }
  return { smokeLaw, smokeLawNote: note, smokeRecommended, coApplies, coLaw, coRecommended };
}

/* ------------------------------------------------------------------ 8. appliances */

export function applianceCost(kwh: number, pricePerKwh: number | null): number | null {
  return pos(pricePerKwh) && kwh >= 0 ? kwh * pricePerKwh : null;
}
