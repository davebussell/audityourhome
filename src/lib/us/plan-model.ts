/**
 * US Home Energy Planner: the Canadian calculator engine (src/lib/calc/engine.ts) in US units.
 *
 * The building-science parts of the engine are reused unchanged: heating need by era, house
 * geometry, the R-value / U-value / air-leakage savings formulas, their conservative factors and
 * caps, system efficiencies and heat pump COP bands, hot water demand and water heater
 * efficiencies. What changes here:
 *   - prices and units: $/therm, $/kWh and $/gallon from EIA (src/data/us/prices.json) instead of
 *     $/m³ and $/L; energy content per gallon is the engine's per-liter figure × 3.785;
 *   - climate: NOAA 65 °F degree days (src/data/us/climate.json) converted to the engine's
 *     °C degree days (÷ 1.8); the yearly mean temperature for cold-water inlet comes from the
 *     degree days (65 °F − (HDD − CDD) ÷ 365);
 *   - attic targets: ENERGY STAR's US retrofit table by IECC climate zone (src/data/us/tests.json);
 *   - bills: a gas, oil or propane bill is split between heating and hot water in the proportions
 *     the model gives for the local climate; for electric heat, a summer and a winter electric bill
 *     are split by degree days (plan-cooling.ts) and the heating part scales the house;
 *   - heat pump water heaters: the heat they take from the house is charged to the heating system
 *     only for the heating share of the year (hpwhHeatShare), which is small in hot climates;
 *   - heat pump upgrades: a cold-climate model where winters are long, a standard one elsewhere.
 * Air conditioning is estimated separately, in plan-cooling.ts.
 *
 * Pure TypeScript, no DOM: runs at build time and in the browser.
 */
import {
  MODEL, fuelOf, isHeatPump, systemEfficiency, baselineDemandGJ, floorAreaM2, geometry, waterHeatingDemand,
  atticMeasure, wallMeasure, basementMeasure, windowMeasure, airMeasure, setbackMeasure, rsiToR,
} from '../calc/engine';
import type { Fuel, SystemKey, Vintage, WaterHeaterKey, WindowKey, SizeBand, HouseType } from '../calc/engine';

export type { Vintage, SystemKey, WindowKey };

/* ------------------------------------------------------------------ units */

/** 1 therm = 100,000 Btu; 1 Btu (IT) = 1,055.05585 J */
export const GJ_PER_THERM = 0.105505585;
export const GJ_PER_MMBTU = 1.05505585;
export const LITERS_PER_GALLON = 3.785411784;
export const SQFT_PER_M2 = 10.7639;
/** °F degree days per °C degree day */
export const F_PER_C_DEGREE = 1.8;

export type UsFuel = 'gas' | 'electricity' | 'oil' | 'propane';

/** Prices the planner uses: $/kWh, $/therm, $/gallon, $/gallon. null = no price. */
export interface UsPrices {
  electricity: number | null;
  gas: number | null;
  oil: number | null;
  propane: number | null;
}

export interface UsUnit { unit: string; one: string; gjPerUnit: number }

export function usUnit(fuel: Fuel | UsFuel): UsUnit {
  const ec = MODEL.energyContentGJ;
  switch (fuel) {
    case 'gas': return { unit: 'therms', one: 'therm', gjPerUnit: GJ_PER_THERM };
    case 'electricity': return { unit: 'kWh', one: 'kWh', gjPerUnit: ec.electricity };
    case 'oil': return { unit: 'gallons', one: 'gallon', gjPerUnit: ec.oil * LITERS_PER_GALLON };
    case 'propane': return { unit: 'gallons', one: 'gallon', gjPerUnit: ec.propane * LITERS_PER_GALLON };
    default: return { unit: '', one: '', gjPerUnit: NaN }; // wood and pellets aren't offered on the US planner
  }
}

export function usPrice(fuel: Fuel | UsFuel, p: UsPrices): number | null {
  const v = fuel === 'electricity' ? p.electricity : fuel === 'gas' ? p.gas : fuel === 'oil' ? p.oil : fuel === 'propane' ? p.propane : null;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/* ------------------------------------------------------------------ climate */

/** NOAA 65 °F heating degree days → the engine's °C degree days. */
export const cDegreeDays = (f: number) => f / F_PER_C_DEGREE;

/**
 * Yearly mean outdoor temperature (°C) from 65 °F degree days: over a year,
 * HDD − CDD = Σ(65 − daily mean), so the mean is 65 − (HDD − CDD) ÷ 365 (°F).
 */
export function annualMeanC(hdd65: number, cdd65: number): number {
  const f = 65 - (hdd65 - cdd65) / 365;
  return (f - 32) / F_PER_C_DEGREE;
}

/** "5A" → "5" (ENERGY STAR's insulation table is by zone number). */
export const zoneNumber = (iecc: string | null | undefined) => (iecc ?? '').match(/^\d/)?.[0] ?? null;

/* ------------------------------------------------------------------ heating and hot water costs */

export interface UsHeatingCost {
  sys: SystemKey;
  fuel: Fuel;
  eff: number;
  fuelGJ: number;
  units: number;
  unit: string;
  price: number | null;
  cost: number | null;
}

/** Yearly cost of delivering `demandGJ` of heat with `sys`: demand ÷ efficiency ÷ energy per unit × price. */
export function usHeatingCost(demandGJ: number, sys: SystemKey, hddC: number, p: UsPrices): UsHeatingCost {
  const fuel = fuelOf(sys);
  const eff = systemEfficiency(sys, hddC);
  const u = usUnit(fuel);
  const fuelGJ = demandGJ / eff;
  const units = fuelGJ / u.gjPerUnit;
  const price = usPrice(fuel, p);
  return { sys, fuel, eff, fuelGJ, units, unit: u.unit, price, cost: price !== null ? units * price : null };
}

/** $ per million Btu of heat delivered into the house, at this efficiency. */
export function costPerMMBtuDelivered(fuel: Fuel, eff: number, p: UsPrices): number | null {
  const price = usPrice(fuel, p);
  const u = usUnit(fuel);
  return price !== null ? (price / (u.gjPerUnit * eff)) * GJ_PER_MMBTU : null;
}

/** Saving of `gj` delivered heat, in the heating fuel's units and dollars. */
export function usSavingValue(gj: number, sys: SystemKey, hddC: number, p: UsPrices) {
  const c = usHeatingCost(gj, sys, hddC, p);
  return { units: c.units, unit: c.unit, dollars: c.cost };
}

export type UsWaterHeater = WaterHeaterKey | 'propaneTank';

/** Propane tanks use the engine's standard gas tank efficiency (our assumption: same burner type). */
export function waterHeaterSpec(t: UsWaterHeater): { uef: number; fuel: Fuel } {
  if (t === 'propaneTank') return { uef: MODEL.water.types.gasTank.uef, fuel: 'propane' };
  const s = MODEL.water.types[t];
  return { uef: s.uef, fuel: s.fuel as Fuel };
}

export interface UsWaterHeaterCost {
  type: UsWaterHeater;
  fuel: Fuel;
  uef: number;
  units: number;
  unit: string;
  cost: number | null;
  /** heat pump water heaters: added space heating to replace the heat they take from the house */
  extraCost: number;
}

/**
 * Share of the year a heat pump water heater's heat has to be replaced by the heating system. The
 * engine's figure (two-thirds) is for Canadian winters; where the heating season is short, the heat
 * it pulls from the house mostly arrives when the house is being cooled, so the share follows
 * heating degree days as a fraction of all degree days, never above the engine's figure.
 */
export function hpwhHeatShare(c: { hdd65: number; cdd65: number }): number {
  const engine = MODEL.water.hpwhHeatTaken.heatingSeasonShare;
  const dd = c.hdd65 + c.cdd65;
  return dd > 0 ? Math.min(engine, c.hdd65 / dd) : engine;
}

export function usWaterHeaterCost(t: UsWaterHeater, deliveredGJ: number, p: UsPrices, space?: { sys: SystemKey; hddC: number; share?: number } | null): UsWaterHeaterCost {
  const s = waterHeaterSpec(t);
  const u = usUnit(s.fuel);
  const units = deliveredGJ / s.uef / u.gjPerUnit;
  const price = usPrice(s.fuel, p);
  let extraCost = 0;
  if (t === 'heatPump' && space) {
    const extraGJ = deliveredGJ * (1 - 1 / s.uef) * (space.share ?? MODEL.water.hpwhHeatTaken.heatingSeasonShare);
    extraCost = usHeatingCost(extraGJ, space.sys, space.hddC, p).cost ?? 0;
  }
  return { type: t, fuel: s.fuel, uef: s.uef, units, unit: u.unit, cost: price !== null ? units * price : null, extraCost };
}

/* ------------------------------------------------------------------ the typical house */

export interface UsClimate {
  slug: string;
  hdd65: number;
  cdd65: number;
  zone: string | null;
}

export interface HouseInput {
  age: Vintage;
  /** detached | semi (townhouse, rowhouse, duplex) | condo */
  htype: string;
  size: SizeBand;
  /** basement | crawl | slab | unsure */
  found: string;
  sys: SystemKey;
  /** the water heater the planner assumes, or 'boiler' for a combi off the heating boiler */
  wh: UsWaterHeater | 'boiler';
}

export const PERSONS = 3;

export function houseModel(h: HouseInput, c: UsClimate, p: UsPrices) {
  const hddC = cDegreeDays(c.hdd65);
  const area = floorAreaM2({ sizeBand: h.size });
  const type: HouseType = h.htype === 'semi' ? 'semi' : 'detached';
  const demand = baselineDemandGJ({ vintage: h.age, floorAreaM2: area, hdd: hddC, type });
  const heat = usHeatingCost(demand, h.sys, hddC, p);
  const meanC = annualMeanC(c.hdd65, c.cdd65);
  const water = waterHeatingDemand(PERSONS, meanC);
  const hpwhShare = hpwhHeatShare(c);
  const waterCost = h.wh === 'boiler'
    ? (() => { const x = usHeatingCost(water.gj, h.sys, hddC, p); return { fuel: x.fuel, units: x.units, unit: x.unit, cost: x.cost, extraCost: 0 }; })()
    : usWaterHeaterCost(h.wh, water.gj, p, { sys: h.sys, hddC, share: hpwhShare });
  const storeys = h.size === 'small' ? 1 : 2;
  const basement = h.found === 'basement' || h.found === 'unsure';
  const g = geometry(area, storeys, basement);
  return { hddC, area, type, demand, heat, meanC, water, waterCost, hpwhShare, g, storeys, basement };
}
export type HouseModel = ReturnType<typeof houseModel>;

/* ------------------------------------------------------------------ bills */

export interface UsCalibration {
  calibrated: boolean;
  factor: number;
  raw: number | null;
  clamped: boolean;
  actualDemandGJ: number | null;
  /** share of the fuel bill treated as space heating */
  share: number | null;
}

const NO_CAL: UsCalibration = { calibrated: false, factor: 1, raw: null, clamped: false, actualDemandGJ: null, share: null };

/** Fuel units the water heater burns from the heating fuel (0 when it uses another fuel). */
export function sameFuelWaterUnits(m: HouseModel): number {
  return m.waterCost.fuel === m.heat.fuel ? m.waterCost.units : 0;
}

/**
 * Typical monthly bill for the heating fuel: heating plus a same-fuel water heater, divided by
 * the engine's 95% (the rest of a fuel bill goes to cooking, a dryer or a fireplace).
 */
export function typicalFuelBill(m: HouseModel): number | null {
  if (m.heat.price === null) return null;
  const share = MODEL.calibration.heatShareOtherwise;
  return ((m.heat.units + sameFuelWaterUnits(m)) * m.heat.price) / share / 12;
}

/**
 * Scale the typical house to a monthly gas, oil or propane bill. The bill is split between
 * space heating and a same-fuel water heater in the model's proportions for this climate, after
 * the engine's 5% for other uses; the result is clamped to the engine's 0.5–1.6 range.
 * Electric heating is calibrated from two electric bills instead (calibrateElectricHeat).
 */
export function calibrateFuelBill(m: HouseModel, sys: SystemKey, monthlyBill: number | null): UsCalibration {
  if (fuelOf(sys) === 'electricity' || !(monthlyBill && monthlyBill > 0) || m.heat.price === null || !(m.demand > 0)) return NO_CAL;
  const annualUnits = (monthlyBill * 12) / m.heat.price;
  const w = sameFuelWaterUnits(m);
  const share = MODEL.calibration.heatShareOtherwise * (m.heat.units / (m.heat.units + w));
  const heatingUnits = annualUnits * share;
  const actual = heatingUnits * usUnit(m.heat.fuel).gjPerUnit * m.heat.eff;
  if (!(actual > 0)) return NO_CAL;
  const raw = actual / m.demand;
  const C = MODEL.calibration;
  const factor = Math.min(C.max, Math.max(C.min, raw));
  return { calibrated: true, factor, raw, clamped: factor !== raw, actualDemandGJ: actual, share };
}

/**
 * Electric heat: scale the typical house to the yearly heating kWh that a summer and a winter
 * electric bill point to (plan-cooling.ts billSplit, heating mode), with the same 0.5–1.6 clamp.
 */
export function calibrateElectricHeat(m: HouseModel, heatKwh: number | null | undefined): UsCalibration {
  if (!(heatKwh && heatKwh > 0) || m.heat.fuel !== 'electricity' || !(m.heat.units > 0) || !(m.demand > 0)) return NO_CAL;
  const raw = heatKwh / m.heat.units;
  const C = MODEL.calibration;
  const factor = Math.min(C.max, Math.max(C.min, raw));
  return { calibrated: true, factor, raw, clamped: factor !== raw, actualDemandGJ: m.demand * raw, share: null };
}

/* ------------------------------------------------------------------ upgrades */

/** ENERGY STAR attic figure (R-value for an uninsulated attic) by zone number, from tests.json. */
export type AtticTargets = Record<string, number>;

export function atticTargetR(zone: string | null, targets: AtticTargets): number {
  const z = zoneNumber(zone);
  const t = z ? targets[z] : undefined;
  return Math.min(t ?? MODEL.envelope.atticTargetCapR, MODEL.envelope.atticTargetCapR);
}

/**
 * The heat pump the planner prices as an upgrade: a cold-climate model where winters are long
 * (4,000 heating degree days or more, °F) or the home already has one, a standard model elsewhere.
 */
export function heatPumpFor(c: { hdd65: number }, current?: SystemKey): SystemKey {
  return current === 'ashpCold' || c.hdd65 >= 4000 ? 'ashpCold' : 'ashpStandard';
}

export interface ItemSaving {
  dollars: number | null;
  units: number | null;
  unit: string;
  note?: string;
}

export function itemSaving(
  cat: string, h: HouseInput, m: HouseModel, c: UsClimate, p: UsPrices, factor: number, targets: AtticTargets,
  winBefore: WindowKey,
): ItemSaving {
  const demand = m.demand * factor;
  const E = MODEL.envelope;
  const g = m.g;
  const val = (gj: number): ItemSaving => {
    const v = usSavingValue(gj, h.sys, m.hddC, p);
    return { dollars: v.dollars, units: v.units, unit: v.unit };
  };
  switch (cat) {
    case 'air-sealing': {
      const r = airMeasure({ volumeM3: g.volumeM3, hdd: m.hddC, demandGJ: demand, calibration: 1 });
      return val(r.gj);
    }
    case 'attic-insulation': {
      const rb = (E.atticRByVintage as Record<string, number>)[h.age];
      const t = atticTargetR(c.zone, targets);
      const r = atticMeasure({ areaM2: g.atticM2, rBefore: rb, rAfter: t, hdd: m.hddC, demandGJ: demand, calibration: factor });
      return { ...val(r.applicable ? r.gj : 0), note: `R-${rb} to R-${t}` };
    }
    case 'wall-insulation': {
      const rb = (E.wallRsiByVintage as Record<string, number>)[h.age];
      const r = wallMeasure({ areaM2: g.wallNetM2, option: 'dense', rsiBefore: rb, hdd: m.hddC, demandGJ: demand, calibration: factor });
      return val(r.applicable ? r.gj : 0);
    }
    case 'basement-insulation': {
      const rb = (E.basementRsiByVintage as Record<string, number>)[h.age];
      const r = basementMeasure({ areaM2: g.basementWallM2, rsiBefore: rb, rsiAfter: E.basementTargetRsi, hdd: m.hddC, demandGJ: demand, calibration: factor });
      return val(r.applicable ? r.gj : 0);
    }
    case 'windows-doors': {
      const r = windowMeasure({ areaM2: g.windowM2, before: winBefore, after: 'energyStar', hdd: m.hddC, demandGJ: demand, calibration: factor });
      return { ...val(r.applicable ? r.gj : 0), note: `${g.windowCount} windows` };
    }
    case 'heat-pump': {
      const now = usHeatingCost(demand, h.sys, m.hddC, p);
      const hp = usHeatingCost(demand, heatPumpFor(c, h.sys), m.hddC, p);
      if (now.cost === null || hp.cost === null) return { dollars: null, units: null, unit: '' };
      // a home that already has a heat pump gets a like-for-like or better replacement, never a worse one
      const d = now.cost - hp.cost;
      return { dollars: isHeatPump(h.sys) ? Math.max(0, d) : d, units: null, unit: '' };
    }
    case 'water-heating': {
      if (h.wh === 'heatPump') return { dollars: 0, units: null, unit: '' };
      const cur = m.waterCost.cost;
      const alt = usWaterHeaterCost('heatPump', m.water.gj, p, { sys: h.sys, hddC: m.hddC, share: m.hpwhShare });
      if (cur === null || alt.cost === null) return { dollars: null, units: null, unit: '' };
      return { dollars: cur - (alt.cost + alt.extraCost), units: null, unit: '' };
    }
    case 'controls': {
      const hp = isHeatPump(h.sys);
      const r = setbackMeasure({ degrees: hp ? 2 : 3, hours: 8, demandGJ: demand, heatPump: hp });
      return { ...val(r.gj), note: hp ? 'a 4\u00a0°F setback, 8 hours a night' : 'a 5\u00a0°F setback, 8 hours a night' };
    }
  }
  return { dollars: null, units: null, unit: '' };
}

/* ------------------------------------------------------------------ comparison */

export interface CompareRow { key: string; label: string; sys: SystemKey; note?: string }

/** Heating systems compared in the running-cost table (efficiencies from the engine). */
export const COMPARE: CompareRow[] = [
  { key: 'gasHigh', label: 'Natural gas furnace, high-efficiency (95%)', sys: 'gasFurnaceHigh', note: 'needs gas service at the street' },
  { key: 'gasMid', label: 'Natural gas furnace, mid-efficiency (80%)', sys: 'gasFurnaceMid', note: 'needs gas service at the street' },
  { key: 'hpCold', label: 'Air-source heat pump, cold-climate', sys: 'ashpCold' },
  { key: 'hpStd', label: 'Air-source heat pump, standard', sys: 'ashpStandard' },
  { key: 'geo', label: 'Geothermal (ground-source) heat pump', sys: 'gshp' },
  { key: 'elec', label: 'Electric baseboard or electric furnace', sys: 'electricResistance' },
  { key: 'oilNew', label: 'Heating oil furnace, new (85%)', sys: 'oilFurnaceNew' },
  { key: 'propCond', label: 'Propane furnace, condensing (93%)', sys: 'propaneFurnaceCond' },
];

/* ------------------------------------------------------------------ era assumptions (for display) */

const round = (n: number) => Math.round(n);

/** Heating need of a typical detached house per sq ft, kBtu a year, at the engine's reference degree days. */
export function intensityKbtuPerSqft(v: Vintage): number {
  const gjPerM2 = MODEL.demand.intensityGJperM2[v];
  return (gjPerM2 / GJ_PER_MMBTU) * 1000 / SQFT_PER_M2;
}
export const REF_HDD65 = MODEL.demand.refHdd * F_PER_C_DEGREE;

export const WINDOW_LABEL_US: Record<string, string> = {
  single: 'single-pane',
  singleStorm: 'single-pane with storm windows',
  doubleClear: 'double-pane, clear glass',
  doubleLowE: 'double-pane, low-e',
  energyStar: 'ENERGY STAR replacement windows',
  triple: 'triple-pane',
  mostEfficient: 'ENERGY STAR Most Efficient',
};

export function eraAssumptions(v: Vintage) {
  const E = MODEL.envelope;
  return {
    atticR: (E.atticRByVintage as Record<string, number>)[v],
    wallR: round(rsiToR((E.wallRsiByVintage as Record<string, number>)[v])),
    basementR: round(rsiToR((E.basementRsiByVintage as Record<string, number>)[v])),
    window: (E.windowByVintage as Record<string, WindowKey>)[v],
    intensity: intensityKbtuPerSqft(v),
  };
}

/** U-factor in Btu/h·ft²·°F from the engine's W/m²·K. */
export const uImperial = (k: WindowKey) => MODEL.envelope.windowU[k].u / 5.678;
