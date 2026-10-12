/**
 * Unit tests for the calculator engine. Run: npm run test:calc
 * (scripts/test-calc.mjs bundles this file with esbuild and runs it with `node --test`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import citiesJson from '../../data/calc/cities.json';
import {
  MODEL, climateZone, baselineDemandGJ, heatingCost, calibrate, systemEfficiency, fuelUnit,
  geometry, atticMeasure, wallMeasure, basementMeasure, windowMeasure, airMeasure, setbackMeasure,
  combineMeasures, payback, rebateAmount, waterHeatingDemand, waterHeaterCost, inletTempC, coolingKwh, eflh,
  defaultAcTons, dewPoint, glassTemp, maxRhNoCondensation, condensationStartsAt, bqToPci, pciToBq,
  alarmCounts, savingValue, atticTargetR, SYSTEM_KEYS, WATER_HEATER_KEYS, type Prices, type RebateEntry,
} from './engine';

const cities = citiesJson.cities;
const byName = (slug: string) => {
  const c = cities.find((x) => x.slug === slug);
  if (!c) throw new Error(slug);
  return c;
};
const within = (actual: number, expected: number, pct: number, msg: string) => {
  const d = Math.abs(actual - expected) / expected;
  assert.ok(d <= pct, `${msg}: ${actual.toFixed(1)} vs ${expected} (${(d * 100).toFixed(1)}% > ${pct * 100}%)`);
};
const PRICES: Prices = { electricity: { now: 0.188, variable: 0.144 }, gas: { now: 0.478, variable: 0.314 }, oil: 1.949, propane: null, wood: null, pellets: null };

test('NBC climate zones from HOT2000 HDD', () => {
  assert.equal(climateZone(2768), '4');
  assert.equal(climateZone(2999), '4');
  assert.equal(climateZone(3000), '5');
  assert.equal(climateZone(3559), '5');
  assert.equal(climateZone(4354), '6');
  assert.equal(climateZone(5542), '7A');
  assert.equal(climateZone(6522), '7B');
  assert.equal(climateZone(7856), '8');
});

test('baseline demand reproduces NRCan Heating with Gas Table 4 for Ottawa and Toronto within ±10%', () => {
  // Table 4: detached ≈ 186 m²; "old" = built before 1990 (1966–1980 band), "new" = 1990 or later (1996–2010 band)
  const ott = byName('ottawa').hot2000.hdd;
  const tor = byName('toronto').hot2000.hdd;
  within(baselineDemandGJ({ vintage: '1966-1980', floorAreaM2: 186, hdd: ott, type: 'detached' }), 110, 0.10, 'Ottawa old');
  within(baselineDemandGJ({ vintage: '1996-2010', floorAreaM2: 186, hdd: ott, type: 'detached' }), 75, 0.10, 'Ottawa new');
  within(baselineDemandGJ({ vintage: '1966-1980', floorAreaM2: 186, hdd: tor, type: 'detached' }), 95, 0.10, 'Toronto old');
  within(baselineDemandGJ({ vintage: '1996-2010', floorAreaM2: 186, hdd: tor, type: 'detached' }), 65, 0.10, 'Toronto new');
});

test('baseline demand is within ±20% of every other Table 4 city the site covers', () => {
  const table4: [string, number, number][] = [
    ['victoria', 85, 60], ['calgary', 120, 90], ['edmonton', 130, 95], ['winnipeg', 130, 90], ['regina', 130, 90],
    ['saskatoon', 130, 90], ['whitehorse', 155, 115], ['yellowknife', 195, 145], ['thunder-bay', 130, 95],
    ['sudbury', 120, 90], ['windsor', 80, 55], ['montreal', 110, 80], ['quebec-city', 115, 85], ['saint-john', 105, 75],
    ['charlottetown', 110, 80], ['halifax', 100, 75], ['st-johns', 120, 85],
  ];
  for (const [slug, oldGJ, newGJ] of table4) {
    const hdd = byName(slug).hot2000.hdd;
    within(baselineDemandGJ({ vintage: '1966-1980', floorAreaM2: 186, hdd, type: 'detached' }), oldGJ, 0.20, `${slug} old`);
    within(baselineDemandGJ({ vintage: '1996-2010', floorAreaM2: 186, hdd, type: 'detached' }), newGJ, 0.20, `${slug} new`);
  }
});

test('fuel energy contents and NRCan Heating with Gas Equation 3 sample ($600)', () => {
  assert.equal(fuelUnit('gas').gjPerUnit, 0.0375);
  assert.equal(fuelUnit('oil').gjPerUnit, 0.0382);
  assert.equal(fuelUnit('propane').gjPerUnit, 0.0253);
  assert.equal(fuelUnit('electricity').gjPerUnit, 0.0036);
  // ($0.18 ÷ 37.5) × (120 ÷ 96) × 100 000 = $600
  const units = 120 / 0.96 / fuelUnit('gas').gjPerUnit;
  within(units * 0.18, 600, 0.001, 'NRCan sample');
});

test('heating cost: demand ÷ efficiency × price, never NaN', () => {
  const r = heatingCost(100, 'gasFurnaceHigh', 3559, PRICES, 'now');
  within(r.units, 100 / 0.95 / 0.0375, 1e-9, 'm³');
  within(r.cost!, (100 / 0.95 / 0.0375) * 0.478, 1e-9, 'cost');
  const e = heatingCost(100, 'electricResistance', 3559, PRICES, 'now');
  within(e.units, 100 / 0.0036, 1e-9, 'kWh');
  const noGas = heatingCost(100, 'gasFurnaceMid', 4400, { ...PRICES, gas: null }, 'now');
  assert.equal(noGas.cost, null);
  assert.equal(noGas.available, false);
  const noWood = heatingCost(100, 'woodCertified', 4400, PRICES, 'now');
  assert.equal(noWood.cost, null);
  within(noWood.units, 100 / 0.75 / 30.6, 1e-9, 'cords');
});

test('heat pump seasonal COP by HDD band (backup included)', () => {
  assert.equal(systemEfficiency('ashpCold', 2768), 2.8);
  assert.equal(systemEfficiency('ashpCold', 3559), 2.5);
  assert.equal(systemEfficiency('ashpStandard', 4354), 1.9);
  assert.equal(systemEfficiency('ashpCold', 5542), 2.0);
  assert.equal(systemEfficiency('ashpCold', 6522), 1.6);
  assert.equal(systemEfficiency('ashpCold', 7856), 1.2); // low end of the band above 7,000 HDD
  assert.equal(systemEfficiency('gshp', 7856), 2.8);
});

test('bill calibration: gas share, clamping, electric summer baseload', () => {
  const model = 75;
  const c = calibrate(model, 'gasFurnaceMid', 3559, PRICES, { mode: 'usage', annualUnits: 2000, waterHeaterSameFuel: true });
  // 2,000 m³ × 0.8 × 0.0375 GJ × 0.80 = 48 GJ → 0.64
  within(c.actualDemandGJ!, 48, 1e-9, 'actual');
  within(c.factor, 0.64, 1e-9, 'factor');
  assert.equal(c.calibrated, true);
  const lo = calibrate(model, 'gasFurnaceMid', 3559, PRICES, { mode: 'usage', annualUnits: 100, waterHeaterSameFuel: true });
  assert.equal(lo.factor, 0.5);
  assert.equal(lo.clamped, true);
  const hi = calibrate(model, 'gasFurnaceMid', 3559, PRICES, { mode: 'usage', annualUnits: 20000, waterHeaterSameFuel: false });
  assert.equal(hi.factor, 1.6);
  const el = calibrate(model, 'electricResistance', 3559, PRICES, { mode: 'bill', monthlyBill: 300, summerBill: 100, waterHeaterSameFuel: true });
  // (300 − 100) × 12 ÷ $0.188 now-price = 12,766 kWh → 45.96 GJ
  within(el.actualDemandGJ!, ((200 * 12) / 0.188) * 0.0036, 1e-9, 'electric');
  const none = calibrate(model, 'gasFurnaceMid', 3559, PRICES, { mode: 'none', waterHeaterSameFuel: true });
  assert.equal(none.factor, 1);
  assert.equal(none.calibrated, false);
});

test('envelope measures: physics, caps and overlap', () => {
  const hdd = 3559;
  const g = geometry(149, 2, true);
  const demand = baselineDemandGJ({ vintage: '1966-1980', floorAreaM2: 149, hdd, type: 'detached' });
  const t = atticTargetR(hdd);
  assert.equal(t.target, 55);
  const attic = atticMeasure({ areaM2: g.atticM2, rBefore: 20, rAfter: t.target, hdd, demandGJ: demand, calibration: 1 });
  // 74.5 m² × (1/RSI 3.52 − 1/RSI 9.69) × 3559 × 86 400 ÷ 1e9 × 0.75 ≈ 3.1 GJ
  within(attic.gj, 3.10, 0.02, 'attic GJ');
  const dense = wallMeasure({ areaM2: g.wallNetM2, option: 'dense', rsiBefore: 2.1, hdd, demandGJ: demand, calibration: 1 });
  assert.equal(dense.applicable, false);
  const ext = wallMeasure({ areaM2: g.wallNetM2, option: 'exterior', rsiBefore: 2.1, hdd, demandGJ: demand, calibration: 1 });
  assert.ok(ext.gj > 0);
  const base = basementMeasure({ areaM2: g.basementWallM2, rsiBefore: 0.5, rsiAfter: 3.5, hdd, demandGJ: demand, calibration: 1.6 });
  assert.ok(base.capped, 'basement saving at 1.6× calibration hits the 35% cap');
  within(base.gj, 0.35 * demand, 1e-9, 'cap');
  const win = windowMeasure({ areaM2: g.windowM2, before: 'doubleClear', after: 'energyStar', hdd, demandGJ: demand, calibration: 1 });
  const air = airMeasure({ volumeM3: g.volumeM3, hdd, demandGJ: demand, calibration: 1 });
  within(air.gj, 0.25 * 0.2 * demand * 0.75, 1e-9, 'air share method');
  const air50 = airMeasure({ volumeM3: g.volumeM3, hdd, demandGJ: demand, calibration: 1, ach50: 6.1 });
  assert.equal(air50.method, 'ach50');
  within(air50.ach50After!, 6.1 * 0.8, 1e-9, 'after ACH50');
  const tight = airMeasure({ volumeM3: g.volumeM3, hdd, demandGJ: demand, calibration: 1, ach50: 3 });
  assert.equal(tight.reduction, 0.15);
  const all = [attic, ext, base, win, air];
  const comb = combineMeasures(all, demand);
  assert.ok(comb.fraction <= 0.6 + 1e-12);
  assert.ok(comb.fraction <= comb.sumFraction + 1e-12);
  for (const r of all) assert.ok(r.gj >= 0 && Number.isFinite(r.gj));
});

test('thermostat setback: 2% per °C per 8 h; heat pumps limited to 2 °C', () => {
  const s = setbackMeasure({ degrees: 3, hours: 8, demandGJ: 100, heatPump: false });
  within(s.gj, 6, 1e-9, 'setback');
  const hp = setbackMeasure({ degrees: 4, hours: 8, demandGJ: 100, heatPump: true });
  assert.equal(hp.limited, true);
  within(hp.gj, 4, 1e-9, 'heat pump setback');
});

test('payback is never negative, NaN or Infinity', () => {
  assert.deepEqual(payback(1000, 1200, 50), { kind: 'immediate', years: 0 });
  assert.deepEqual(payback(1000, 0, 0), { kind: 'never', years: null });
  assert.deepEqual(payback(1000, 0, -20), { kind: 'never', years: null });
  assert.deepEqual(payback(null, 0, 50), { kind: 'unknown', years: null });
  assert.deepEqual(payback(1000, 200, 100), { kind: 'years', years: 8 });
  assert.equal(payback(1e9, 0, 1).kind, 'never');
});

test('rebates: per-unit defaults, caps, fuel rules', () => {
  const flat: RebateEntry = { id: 'a', program: 'x', status: 'open', kind: 'flat', rate: 900, cap: 1500 };
  assert.equal(rebateAmount(flat, {}).amount, 900);
  assert.equal(rebateAmount(flat, { cost: 500 }).amount, 500, 'never more than the cost');
  const bc: RebateEntry = { id: 'b', program: 'x', status: 'open', kind: 'perSqftR', rate: 0.02, cap: 900, minRAdded: 12 };
  assert.equal(rebateAmount(bc, { sqft: 1000, rBefore: 12, rAfter: 50 }).amount, 760);
  assert.equal(rebateAmount(bc, { sqft: 3000, rBefore: 12, rAfter: 50 }).amount, 900);
  assert.equal(rebateAmount(bc, { sqft: 1000, rBefore: 40, rAfter: 50 }).eligible, false);
  const pei: RebateEntry = { id: 'c', program: 'x', status: 'open', kind: 'per100SqftR', rate: 3.5, cap: null };
  assert.equal(rebateAmount(pei, { sqft: 1000, rBefore: 12, rAfter: 50 }).amount, 1330);
  const hp: RebateEntry = { id: 'd', program: 'x', status: 'open', kind: 'perTon', rate: 1250, cap: 7500, fuels: ['electricity', 'oil', 'propane', 'wood'] };
  assert.equal(rebateAmount(hp, { tons: 3, fuel: 'oil' }).amount, 3750);
  assert.equal(rebateAmount(hp, { tons: 3, fuel: 'gas' }).eligible, false);
  const closed: RebateEntry = { ...flat, status: 'closed' };
  assert.equal(rebateAmount(closed, {}).eligible, false);
  const pct: RebateEntry = { id: 'e', program: 'x', status: 'open', kind: 'pctCost', rate: null, cap: 10500, pct: 0.5 };
  assert.equal(rebateAmount(pct, {}).amount, null);
  assert.equal(rebateAmount(pct, { cost: 30000 }).amount, 10500);
});

test('water heating: inlet = annual mean + 3.3 °C (floor 5 °C), 75 L/person/day', () => {
  const tor = byName('toronto');
  const w = waterHeatingDemand(3, tor.eccc.annualMean);
  assert.equal(w.litresPerDay, 225);
  within(w.inletC, 12.7, 1e-9, 'inlet');
  within(w.gj, (225 * 4.186 * (55 - 12.7) * 365) / 1e6, 1e-9, 'GJ');
  assert.equal(inletTempC(byName('yellowknife').eccc.annualMean), 5);
  const gas = waterHeaterCost('gasTank', w.gj, PRICES, 'now');
  within(gas.units, w.gj / 0.58 / 0.0375, 1e-9, 'm³');
  const hpwh = waterHeaterCost('heatPump', w.gj, PRICES, 'now', { sys: 'gasFurnaceMid', hdd: 3559 });
  assert.ok(hpwh.extraHeatGJ > 0 && (hpwh.extraCost ?? 0) > 0);
});

test('cooling: NRCan worked example and the Ontario mean (1,321 kWh) within ±15%', () => {
  // NRCan: 24 × 359 ÷ (30 − 18) = 718 h; 718 × 36,000 ÷ 10 ÷ 1000 = 2,585 kWh (before our 0.8 usage factor)
  within(eflh(359, 30), 718, 1e-9, 'EFLH');
  const ex = coolingKwh({ cdd18: 359, designCool: 30, capacityBtuh: 36000, seer: 10 });
  within(ex.kwh / MODEL.cooling.usageFactor, 2585, 0.001, 'NRCan example kWh');
  // Population-weighted average for the site's Ontario cities, NRCan CEUD average unit (32,700 Btu/h) and stock SEER 13.5
  let w = 0, sum = 0;
  for (const c of cities.filter((x) => x.prov === 'ON')) {
    const k = coolingKwh({ cdd18: c.eccc.cdd18, designCool: c.hot2000.designCool, capacityBtuh: 32700, seer: 13.5 }).kwh;
    sum += k * c.population; w += c.population;
  }
  const mean = sum / w;
  within(mean, 1321, 0.15, 'Ontario mean');
  const [lo, hi] = MODEL.cooling.ontarioCentralRange;
  assert.ok(mean >= lo && mean <= hi, `inside NRCan's 2018–2023 range (${mean.toFixed(0)})`);
  assert.equal(defaultAcTons(149), 2.5);
});

test('condensation physics: Magnus dew point, glass temperature, CBD-4 check', () => {
  within(dewPoint(21, 50), 10.2, 0.02, 'dew point');
  // CBD-4 validation: glass at 50 °F (10 °C) with room air at 70 °F (21.1 °C) → max RH 49%
  const es = (t: number) => 6.112 * Math.exp((17.67 * t) / (t + 243.5));
  within((100 * es(10)) / es(21.1), 49, 0.02, 'CBD-4 49%');
  const tg = glassTemp(21, -20, 2.86);
  within(tg, 21 - (2.86 * 41) / 8.33, 1e-9, 'glass');
  const rh = maxRhNoCondensation(21, -20, 1.8);
  const tStart = condensationStartsAt(21, rh, 1.8);
  within(tStart, -20, 0.001, 'round trip');
  assert.ok(maxRhNoCondensation(21, -20, 1.22) > maxRhNoCondensation(21, -20, 2.86));
});

test('radon unit conversion', () => {
  within(bqToPci(200), 5.4, 0.01, '200 Bq');
  assert.equal(pciToBq(4), 148);
});

test('alarm counts separate provincial law from the new-home standard', () => {
  const layout = { levels: 3, bedroomLevels: 1, bedrooms: 3, sleepingAreas: 1, fuelBurning: true, attachedGarage: false };
  const on = alarmCounts(layout, 'ON', { existingHomesRequired: true, everyStorey: true, outsideSleepingAreas: true, inEachBedroom: false }, true);
  assert.equal(on.smokeLaw, 3);
  assert.equal(on.smokeRecommended, 6);
  assert.equal(on.coLaw, 3);
  assert.equal(on.coRecommended, 2);
  const bc = alarmCounts(layout, 'BC', { existingHomesRequired: true, everyStorey: null, outsideSleepingAreas: true, inEachBedroom: false }, false);
  assert.equal(bc.smokeLaw, 1);
  assert.equal(bc.coLaw, null);
  const sk = alarmCounts(layout, 'SK', { existingHomesRequired: true, everyStorey: true, outsideSleepingAreas: true, inEachBedroom: true }, true);
  assert.equal(sk.smokeLaw, 6);
  const qc = alarmCounts(layout, 'QC', { existingHomesRequired: null, everyStorey: null, outsideSleepingAreas: null, inEachBedroom: null }, false);
  assert.equal(qc.smokeLaw, null);
});

test('sanity: every city × system × water heater gives finite, non-negative numbers', () => {
  for (const c of cities) {
    const demand = baselineDemandGJ({ vintage: '1966-1980', floorAreaM2: 149, hdd: c.hot2000.hdd, type: 'detached' });
    assert.ok(demand > 20 && demand < 200, `${c.slug} demand ${demand}`);
    for (const s of SYSTEM_KEYS) {
      const r = heatingCost(demand, s, c.hot2000.hdd, PRICES, 'now');
      assert.ok(Number.isFinite(r.units) && r.units > 0, `${c.slug} ${s}`);
      if (r.cost !== null) assert.ok(Number.isFinite(r.cost) && r.cost > 0);
      const sv = savingValue(1, s, c.hot2000.hdd, PRICES);
      assert.ok(Number.isFinite(sv.units));
    }
    const w = waterHeatingDemand(3, c.eccc.annualMean);
    for (const t of WATER_HEATER_KEYS) {
      const r = waterHeaterCost(t, w.gj, PRICES, 'now', { sys: 'electricResistance', hdd: c.hot2000.hdd });
      assert.ok(Number.isFinite(r.units) && r.units > 0);
    }
    const ac = coolingKwh({ cdd18: c.eccc.cdd18, designCool: c.hot2000.designCool, capacityBtuh: 30000, seer: 13 });
    assert.ok(Number.isFinite(ac.kwh) && ac.kwh >= 0);
  }
});

test('appliances: kWh × price, minutes converted to hours, savings never negative', async () => {
  const { appliancePayload } = await import('./pages/appliance');
  const { applianceDefaults, computeAppliances } = await import('../../components/calc/appliance-energy');
  type City = Parameters<typeof appliancePayload>[0];
  const tor = appliancePayload(byName('toronto') as unknown as City);
  const s = applianceDefaults(tor);
  const r = computeAppliances(s, tor);
  assert.ok(Number.isFinite(r.totalKwh) && r.totalKwh > 0);
  assert.ok(r.totalCost !== null && Number.isFinite(r.totalCost) && r.totalCost > 0);
  const row = (id: string) => r.rows.find((x) => x.item.id === id)!;
  // 1,200 W microwave, 10 minutes a day: 1.2 × 10/60 × 365 = 73 kWh (not 4,380)
  within(row('microwave').kwh!, 73, 0.01, 'microwave kWh');
  // fridge marked older by default: 458 kWh, saving 458 − 372 = 86 kWh
  assert.equal(row('fridge').kwh, 458);
  assert.equal(row('fridge').saveKwh, 86);
  // pool pump 8 h a day over 120 days: 1.31 → 1,257.6 kWh; low speed saves (1.31 − 0.31) × 960 h
  s.rows.poolPump = { on: true, qty: 1, version: 'old', use: 8 };
  const r2 = computeAppliances(s, tor);
  within(r2.rows.find((x) => x.item.id === 'poolPump')!.kwh!, 1257.6, 0.001, 'pool pump kWh');
  within(r2.rows.find((x) => x.item.id === 'poolPump')!.saveKwh!, 960, 0.001, 'pool pump saving');
  // a blank price gives no cost rather than NaN
  const r3 = computeAppliances({ ...s, price: null }, tor);
  assert.equal(r3.totalCost, null);
  assert.ok(Number.isFinite(r3.totalKwh));
  // block heater nights follow the city's ECCC count of nights below −20 °C
  const wpg = appliancePayload(byName('winnipeg') as unknown as City);
  const bh = wpg.items.find((i) => i.id === 'blockHeater')!;
  assert.equal(bh.defaultUse, Math.round(byName('winnipeg').eccc.nightsBelowMinus20));
  assert.ok(bh.defaultOn);
  for (const c of cities) {
    const p = appliancePayload(c as unknown as City);
    const x = computeAppliances(applianceDefaults(p), p);
    assert.ok(p.price > 0.05 && p.price < 0.5, `${c.slug} price ${p.price}`);
    assert.ok(Number.isFinite(x.totalKwh) && x.totalKwh > 0 && x.saveKwh >= 0, c.slug);
  }
});
