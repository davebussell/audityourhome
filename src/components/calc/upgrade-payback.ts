/**
 * Upgrade payback calculator: attic, walls, basement walls, windows, air sealing, setbacks.
 * Pure compute + HTML render, shared by the build-time first render and the browser.
 */
import {
  MODEL, VINTAGE_LABEL, baselineDemandGJ, floorAreaM2, geometry, calibrate, fuelOf, fuelUnit, isHeatPump,
  atticMeasure, atticTargetR, wallMeasure, wallAfterRsi, basementMeasure, windowMeasure, windowU, airMeasure, setbackMeasure,
  combineMeasures, savingValue, rebateAmount, payback, m2ToSqft, sqftToM2, rToRsi, rsiToR, climateZone,
  type Vintage, type HouseType, type SizeBand, type SystemKey, type Prices, type RebateEntry, type WindowKey,
  type WallOption, type Calibration, type MeasureResult, type Payback,
} from '../../lib/calc/engine';
import { money, qty, gj, pct, years, esc, range, int, num } from '../../lib/calc/format';
import { calBadge, calNote, pickRebate, type RebateOption } from './energy-costs';

export interface UpgradePayload {
  city: { slug: string; name: string; prov: string; provName: string; hdd: number; zone: string };
  prices: Prices;
  defaultSystem: SystemKey;
  rebates: Record<'attic' | 'walls' | 'basement' | 'airSealing' | 'windows' | 'thermostat', RebateEntry[]>;
}

export type MeasureKey = 'attic' | 'walls' | 'basement' | 'windows' | 'airSealing' | 'setback';
export const MEASURE_KEYS: MeasureKey[] = ['attic', 'walls', 'basement', 'windows', 'airSealing', 'setback'];
export const MEASURE_LABEL: Record<MeasureKey, string> = {
  attic: 'Attic insulation',
  walls: 'Wall insulation',
  basement: 'Basement wall insulation',
  windows: 'New windows',
  airSealing: 'Air sealing',
  setback: 'Thermostat setback',
};
const REBATE_KEY: Record<MeasureKey, keyof UpgradePayload['rebates']> = { attic: 'attic', walls: 'walls', basement: 'basement', windows: 'windows', airSealing: 'airSealing', setback: 'thermostat' };

export interface UpgradeState {
  vintage: Vintage;
  type: HouseType;
  size: SizeBand;
  sqft: number | null;
  storeys: number;
  basement: boolean;
  system: SystemKey;
  waterSame: boolean;
  billMode: 'none' | 'usage' | 'bill';
  usage: number | null;
  monthly: number | null;
  summer: number | null;
  priceNow: number | null;
  priceVar: number | null;
  on: Record<MeasureKey, boolean>;
  attic: { rBefore: number | null; rAfter: number | null; sqft: number | null; perSqftLow: number | null; perSqftHigh: number | null; quote: number | null; rebateId: string };
  walls: { option: WallOption; rsiBefore: number | null; sqft: number | null; quote: number | null; rebateId: string };
  basementM: { rsiBefore: number | null; rsiAfter: number | null; sqft: number | null; quote: number | null; rebateId: string };
  windows: { before: WindowKey; after: WindowKey; count: number | null; eachLow: number | null; eachHigh: number | null; quote: number | null; rebateId: string };
  air: { reductionPct: number | null; ach50: number | null; low: number | null; high: number | null; quote: number | null; rebateId: string };
  setback: { degrees: number | null; hours: number | null; cost: number | null; rebateId: string };
}

/** Values that follow the house description until the user types over them. */
export function derivedDefaults(s: Pick<UpgradeState, 'vintage' | 'size' | 'sqft' | 'storeys' | 'basement'>, hdd: number) {
  const E = MODEL.envelope;
  const area = floorAreaM2({ sizeBand: s.size, sqft: s.sqft });
  const g = geometry(area, s.storeys, s.basement);
  const rBefore = E.atticRByVintage[s.vintage];
  const t = atticTargetR(hdd);
  const wallRsi = E.wallRsiByVintage[s.vintage];
  return {
    atticR: rBefore,
    atticTarget: t.target,
    atticSqft: Math.round(m2ToSqft(g.atticM2) / 10) * 10,
    wallRsi,
    wallOption: (wallRsi < E.denseRsi ? 'dense' : 'exterior') as WallOption,
    wallSqft: Math.round(m2ToSqft(g.wallNetM2) / 10) * 10,
    basementRsi: E.basementRsiByVintage[s.vintage],
    basementSqft: s.basement ? Math.round(m2ToSqft(g.basementWallM2) / 10) * 10 : 0,
    windowBefore: E.windowByVintage[s.vintage] as WindowKey,
    windowCount: g.windowCount,
  };
}

export function priceDefaults(p: Prices, sys: SystemKey) {
  const f = fuelOf(sys);
  switch (f) {
    case 'electricity': return { now: p.electricity.now, variable: p.electricity.variable };
    case 'gas': return { now: p.gas?.now ?? null, variable: p.gas?.variable ?? null };
    case 'oil': return { now: p.oil, variable: p.oil };
    case 'propane': return { now: p.propane, variable: p.propane };
    case 'wood': return { now: p.wood, variable: p.wood };
    case 'pellets': return { now: p.pellets, variable: p.pellets };
  }
}

export function upgradeDefaults(p: UpgradePayload): UpgradeState {
  const base = { vintage: '1966-1980' as Vintage, size: 'medium' as SizeBand, sqft: null, storeys: 2, basement: true };
  const d = derivedDefaults(base, p.city.hdd);
  const pr = priceDefaults(p.prices, p.defaultSystem);
  const C = MODEL.costs;
  return {
    ...base, type: 'detached', system: p.defaultSystem, waterSame: true,
    billMode: 'none', usage: null, monthly: null, summer: null,
    priceNow: pr.now, priceVar: pr.variable,
    on: { attic: true, walls: true, basement: true, windows: true, airSealing: true, setback: true },
    attic: { rBefore: d.atticR, rAfter: d.atticTarget, sqft: d.atticSqft, perSqftLow: C.atticPerSqft.low, perSqftHigh: C.atticPerSqft.high, quote: null, rebateId: 'auto' },
    walls: { option: d.wallOption, rsiBefore: d.wallRsi, sqft: d.wallSqft, quote: null, rebateId: 'auto' },
    basementM: { rsiBefore: d.basementRsi, rsiAfter: MODEL.envelope.basementTargetRsi, sqft: d.basementSqft, quote: null, rebateId: 'auto' },
    windows: { before: d.windowBefore, after: 'energyStar', count: d.windowCount, eachLow: C.windowEach.low, eachHigh: C.windowEach.high, quote: null, rebateId: 'auto' },
    air: { reductionPct: null, ach50: null, low: C.airSealing.low, high: C.airSealing.high, quote: null, rebateId: 'auto' },
    setback: { degrees: 3, hours: 8, cost: 0, rebateId: 'none' },
  };
}

/* ------------------------------------------------------------------ compute */

export interface MeasureOut {
  key: MeasureKey;
  on: boolean;
  m: MeasureResult;
  units: number;
  unit: string;
  dollars: number | null;
  costLow: number | null;
  costHigh: number | null;
  costNote: string;
  rebates: RebateOption[];
  rebate: RebateOption | null;
  pbLow: Payback;
  pbHigh: Payback;
  twenty: number | null;
  detail: string;
}
export interface UpgradeResult {
  s: UpgradeState;
  p: UpgradePayload;
  area: number;
  modelDemand: number;
  demand: number;
  cal: Calibration;
  unit: string;
  measures: MeasureOut[];
  combined: { gj: number; fraction: number; sumFraction: number; capped: boolean; overlap: boolean; dollars: number | null; units: number; costLow: number; costHigh: number; missingCost: string[]; rebateLow: number; rebateHigh: number; priced: { n: number; dollars: number | null; pbLow: Payback; pbHigh: Payback } | null; pbLow: Payback; pbHigh: Payback };
}

function pricesWith(p: Prices, sys: SystemKey, now: number | null, variable: number | null): Prices {
  const q: Prices = JSON.parse(JSON.stringify(p));
  const f = fuelOf(sys);
  if (f === 'electricity') q.electricity = { now, variable };
  else if (f === 'gas') q.gas = { now, variable };
  else if (f === 'oil') q.oil = variable;
  else if (f === 'propane') q.propane = variable;
  else if (f === 'wood') q.wood = variable;
  else q.pellets = variable;
  return q;
}

export function computeUpgrade(s: UpgradeState, p: UpgradePayload): UpgradeResult {
  const hdd = p.city.hdd;
  const area = floorAreaM2({ sizeBand: s.size, sqft: s.sqft });
  const modelDemand = baselineDemandGJ({ vintage: s.vintage, floorAreaM2: area, hdd, type: s.type });
  const prices = pricesWith(p.prices, s.system, s.priceNow, s.priceVar);
  const cal = calibrate(modelDemand, s.system, hdd, prices, { mode: s.billMode, annualUnits: s.usage, monthlyBill: s.monthly, summerBill: s.billMode === 'bill' ? s.summer : null, summerKwh: s.billMode === 'usage' ? s.summer : null, waterHeaterSameFuel: s.waterSame });
  const demand = modelDemand * cal.factor;
  const k = cal.factor;
  const g = geometry(area, s.storeys, s.basement, s.windows.count);
  const fuel = fuelOf(s.system);
  const unit = fuelUnit(fuel).unit;
  const val = (x: number) => savingValue(x, s.system, hdd, prices, 'variable');
  const out: MeasureOut[] = [];

  const finish = (key: MeasureKey, m: MeasureResult, costLow: number | null, costHigh: number | null, costNote: string, q: Parameters<typeof rebateAmount>[1], detail: string) => {
    const v = val(m.gj);
    const entries = p.rebates[REBATE_KEY[key]] ?? [];
    const opts: RebateOption[] = entries.map((e) => {
      const lo = rebateAmount(e, { ...q, fuel, cost: costLow ?? undefined });
      const hi = rebateAmount(e, { ...q, fuel, cost: costHigh ?? undefined });
      return { id: e.id, program: e.program, amountLow: lo.amount, amountHigh: hi.amount, eligible: lo.eligible && (lo.amount ?? 0) > 0, reason: lo.reason };
    });
    const state: { rebateId: string } = { attic: s.attic, walls: s.walls, basement: s.basementM, windows: s.windows, airSealing: s.air, setback: s.setback }[key];
    const chosen = m.applicable ? pickRebate(opts, state.rebateId, entries) : null;
    const dollars = m.applicable ? v.dollars : 0;
    out.push({
      key, on: s.on[key], m, units: m.applicable ? v.units : 0, unit: v.unit, dollars, costLow, costHigh, costNote, rebates: opts, rebate: chosen,
      pbLow: m.applicable ? payback(costLow, chosen?.amountLow ?? 0, dollars) : { kind: 'never', years: null },
      pbHigh: m.applicable ? payback(costHigh, chosen?.amountHigh ?? 0, dollars) : { kind: 'never', years: null },
      twenty: dollars !== null ? dollars * 20 : null,
      detail,
    });
  };

  // attic
  {
    const a = s.attic;
    const rB = a.rBefore ?? MODEL.envelope.atticRByVintage[s.vintage];
    const rA = a.rAfter ?? atticTargetR(hdd).target;
    const sq = a.sqft && a.sqft > 0 ? a.sqft : m2ToSqft(g.atticM2);
    const m = atticMeasure({ areaM2: sqftToM2(sq), rBefore: rB, rAfter: rA, hdd, demandGJ: demand, calibration: k });
    const lo = a.quote ?? (a.perSqftLow !== null ? a.perSqftLow * sq : null);
    const hi = a.quote ?? (a.perSqftHigh !== null ? a.perSqftHigh * sq : null);
    finish('attic', m, lo, hi, a.quote ? 'your quote' : `${int(sq)} sq ft × $${num(a.perSqftLow, 2)}–$${num(a.perSqftHigh, 2)}`, { sqft: sq, rBefore: rB, rAfter: rA }, `R-${int(rB)} → R-${int(rA)} over ${int(sq)} sq ft`);
  }
  // walls
  {
    const w = s.walls;
    const rsiB = w.rsiBefore ?? MODEL.envelope.wallRsiByVintage[s.vintage];
    const sq = w.sqft && w.sqft > 0 ? w.sqft : m2ToSqft(g.wallNetM2);
    const m = wallMeasure({ areaM2: sqftToM2(sq), option: w.option, rsiBefore: rsiB, hdd, demandGJ: demand, calibration: k });
    const after = wallAfterRsi(w.option, rsiB);
    finish('walls', m, w.quote, w.quote, w.quote ? 'your quote' : 'enter your quote', { sqft: sq, rBefore: rsiToR(rsiB), rAfter: rsiToR(after), option: w.option }, `${w.option === 'dense' ? 'Dense-pack the cavities' : 'R-10 exterior insulation'}: RSI ${rsiB.toFixed(1)} → ${after.toFixed(1)} over ${int(sq)} sq ft`);
  }
  // basement
  {
    const b = s.basementM;
    const rsiB = b.rsiBefore ?? MODEL.envelope.basementRsiByVintage[s.vintage];
    const rsiA = b.rsiAfter ?? MODEL.envelope.basementTargetRsi;
    const sq = s.basement ? (b.sqft && b.sqft > 0 ? b.sqft : m2ToSqft(g.basementWallM2)) : 0;
    const m = basementMeasure({ areaM2: sqftToM2(sq), rsiBefore: rsiB, rsiAfter: rsiA, hdd, demandGJ: demand, calibration: k });
    finish('basement', m, b.quote, b.quote, b.quote ? 'your quote' : 'enter your quote', { sqft: sq, rBefore: rsiToR(rsiB), rAfter: rsiToR(rsiA) }, s.basement ? `RSI ${rsiB.toFixed(1)} → ${rsiA.toFixed(1)} over ${int(sq)} sq ft of wall` : 'No basement');
  }
  // windows
  {
    const w = s.windows;
    const count = w.count && w.count > 0 ? w.count : g.windowCount;
    const areaM2 = count * MODEL.envelope.windowM2Each;
    const m = windowMeasure({ areaM2, before: w.before, after: w.after, hdd, demandGJ: demand, calibration: k });
    const lo = w.quote ?? (w.eachLow !== null ? w.eachLow * count : null);
    const hi = w.quote ?? (w.eachHigh !== null ? w.eachHigh * count : null);
    finish('windows', m, lo, hi, w.quote ? 'your quote' : `${int(count)} windows × ${money(w.eachLow)}–${money(w.eachHigh)}`, { count, windowAfter: w.after }, `${int(count)} windows: U ${windowU(w.before).toFixed(2)} → ${windowU(w.after).toFixed(2)}`);
  }
  // air sealing
  {
    const a = s.air;
    const m = airMeasure({ volumeM3: g.volumeM3, hdd, demandGJ: demand, calibration: k, ach50: a.ach50, reduction: a.reductionPct !== null ? a.reductionPct / 100 : null });
    const lo = a.quote ?? a.low;
    const hi = a.quote ?? a.high;
    const detail = m.method === 'ach50'
      ? `${num(m.ach50Before, 1)} → ${num(m.ach50After, 1)} ACH50 (a ${pct(m.reduction)} cut)`
      : `A ${pct(m.reduction)} cut in air leakage (NRCan: about 25% of heat loss)`;
    finish('airSealing', m, lo, hi, a.quote ? 'your quote' : 'typical add-on to an attic job', {}, detail);
  }
  // setback
  {
    const t = s.setback;
    const m = setbackMeasure({ degrees: t.degrees ?? 0, hours: t.hours ?? 0, demandGJ: demand, heatPump: isHeatPump(s.system) });
    const c = t.cost ?? 0;
    finish('setback', m, c, c, c > 0 ? 'thermostat' : 'no cost if you set it back yourself', { count: 1 }, `${num(m.degrees, 1)} °C lower for ${num(m.hours, 0)} hours a day${m.limited ? ' (limited to 2 °C for a heat pump)' : ''}`);
  }

  // combined
  const sel = out.filter((o) => o.on && o.m.applicable);
  const comb = combineMeasures(sel.map((o) => o.m), demand);
  const cv = val(comb.gj);
  let costLow = 0, costHigh = 0, rebateLow = 0, rebateHigh = 0;
  const missingCost: string[] = [];
  for (const o of sel) {
    if (o.costLow === null || o.costHigh === null) { missingCost.push(MEASURE_LABEL[o.key].toLowerCase()); continue; }
    costLow += o.costLow; costHigh += o.costHigh;
    rebateLow += o.rebate?.amountLow ?? 0; rebateHigh += o.rebate?.amountHigh ?? 0;
  }
  const can = sel.length > 0 && missingCost.length === 0;
  // when some included measures have no cost yet, still show the payback of the ones that do
  const pricedSel = sel.filter((o) => o.costLow !== null && o.costHigh !== null);
  let priced: { n: number; dollars: number | null; pbLow: Payback; pbHigh: Payback } | null = null;
  if (missingCost.length && pricedSel.length) {
    const pv = val(combineMeasures(pricedSel.map((o) => o.m), demand).gj);
    priced = { n: pricedSel.length, dollars: pv.dollars, pbLow: payback(costLow, rebateLow, pv.dollars), pbHigh: payback(costHigh, rebateHigh, pv.dollars) };
  }
  const combined = {
    gj: comb.gj, fraction: comb.fraction, sumFraction: comb.sumFraction, capped: comb.capped, overlap: comb.overlap,
    dollars: cv.dollars, units: cv.units, costLow, costHigh, missingCost, rebateLow, rebateHigh, priced,
    pbLow: can ? payback(costLow, rebateLow, cv.dollars) : ({ kind: 'unknown', years: null } as Payback),
    pbHigh: can ? payback(costHigh, rebateHigh, cv.dollars) : ({ kind: 'unknown', years: null } as Payback),
  };
  return { s, p, area, modelDemand, demand, cal, unit, measures: out, combined };
}

/* ------------------------------------------------------------------ render */

export const pbText = (b: Payback) => (b.kind === 'years' ? years(b.years) : b.kind === 'immediate' ? 'right away' : b.kind === 'never' ? 'no payback' : '—');
export function pbRange(lo: Payback, hi: Payback): string {
  if (lo.kind === 'unknown' && hi.kind === 'unknown') return 'enter a cost';
  const a = pbText(lo), b = pbText(hi);
  if (a === b) return a;
  if (lo.kind === 'years' && hi.kind === 'years') {
    const ly = lo.years as number, hy = hi.years as number;
    if (ly > 100) return 'over 100 years';
    if (hy > 100) return `${years(ly)} to over 100 years`;
    const la = years(ly), lb = years(hy);
    if (la === 'under 1 year') return `under 1 to ${lb}`;
    return `${la.replace(' years', '')}–${lb}`;
  }
  return `${a} to ${b}`;
}

export function renderSummary(r: UpgradeResult): string {
  const c = r.combined;
  const n = r.measures.filter((m) => m.on && m.m.applicable).length;
  const sysLabel = MODEL.systems[r.s.system].short.toLowerCase();
  const capNote = c.capped ? '<p class="res-warn">Together these would pass 60% of your heating need, so we cap the total there.</p>' : '';
  const overlap = c.overlap ? `<p class="small">Measures overlap, so the total (${pct(c.fraction)} of your heating need) is less than the sum of each one alone (${pct(c.sumFraction)}).</p>` : '';
  const missing = c.missingCost.length > 0;
  const cost = missing
    ? `${c.costLow || c.costHigh ? range(c.costLow, c.costHigh, money) + ' + ' : ''}your quote${c.missingCost.length > 1 ? 's' : ''}`
    : range(c.costLow, c.costHigh, money);
  const pb = !missing
    ? pbRange(c.pbLow, c.pbHigh)
    : c.priced
      ? `${pbRange(c.priced.pbLow, c.priced.pbHigh)} <span class="muted">for the ${c.priced.n} upgrade${c.priced.n === 1 ? '' : 's'} with a cost</span>`
      : 'add your quotes';
  const missingNote = missing
    ? `<p class="small">Enter your quote for ${esc(c.missingCost.join(' and '))} to add ${c.missingCost.length > 1 ? 'them' : 'it'} to the cost and payback.${c.priced ? ` The ${c.priced.n} upgrade${c.priced.n === 1 ? '' : 's'} with a cost save about ${money(c.priced.dollars)} a year together.` : ''}</p>`
    : '';
  return `<div class="res-head">
      <p class="res-kicker">${calBadge(r.cal)}</p>
      <p class="res-big"><span class="money">${money(c.dollars)}</span><span class="res-unit">saved a year with ${n} upgrade${n === 1 ? '' : 's'}</span></p>
      <p class="res-sub">About ${qty(c.units)} ${esc(r.unit)} a year less for your ${esc(sysLabel)}: ${gj(c.gj)} of the ${gj(r.demand)} of heat the house needs (${pct(c.fraction)}).</p>
      ${capNote}
    </div>
    <dl class="kv-grid">
      <dt>Installed cost</dt><dd>${cost}</dd>
      <dt>Rebates counted</dt><dd>${range(c.rebateLow, c.rebateHigh, money)}</dd>
      <dt>Simple payback</dt><dd>${pb}</dd>
      <dt>Saving over 20 years</dt><dd>${money((c.dollars ?? 0) * 20)}</dd>
    </dl>
    ${missingNote}
    ${overlap}
    <p class="small res-note">${esc(calNote(r.cal, r.modelDemand))} Most rebates need an EnerGuide evaluation before and after the work; their conditions are listed further down this page.</p>`;
}

export function renderMeasureLine(o: MeasureOut): string {
  if (!o.m.applicable) {
    return `<p class="mres muted">${esc(o.m.note ?? 'Not applicable to this house.')}</p>`;
  }
  const rb = o.rebate ? `${range(o.rebate.amountLow, o.rebate.amountHigh, money)} rebate` : 'no rebate counted';
  const cost = o.costLow === null && o.costHigh === null ? 'enter your quote' : range(o.costLow, o.costHigh, money);
  const pb = pbRange(o.pbLow, o.pbHigh);
  return `<p class="mres"><strong class="save">${money(o.dollars)}/yr</strong> · ${gj(o.m.gj)} (${pct(o.m.fraction, 1)} of heating) · cost ${cost} · ${rb} · payback <strong>${pb}</strong>${o.m.capped ? ' · <span class="chip chip-limited">capped at 35%</span>' : ''}</p>`;
}

export function renderTable(r: UpgradeResult): string {
  const rows = r.measures.map((o) => {
    const off = !o.on || !o.m.applicable;
    const cost = o.costLow === null && o.costHigh === null ? '<span class="muted">your quote</span>' : range(o.costLow, o.costHigh, money);
    const rb = o.rebate ? range(o.rebate.amountLow, o.rebate.amountHigh, money) : '$0';
    return `<tr class="${off ? 'off' : ''}">
      <td class="c-main"><strong>${esc(MEASURE_LABEL[o.key])}</strong>${!o.on ? ' <span class="chip chip-neutral">not included</span>' : ''}<span class="eff">${esc(o.m.applicable ? o.detail : o.m.note ?? '')}</span></td>
      <td class="c-val">${o.m.applicable ? money(o.dollars) : '—'}<span class="pergj">${o.m.applicable ? `${qty(o.units)} ${esc(o.unit)} a year` : ''}</span></td>
      <td class="c-s1" data-k="cost">${o.m.applicable ? cost : '—'}${o.m.applicable && o.rebate ? `<span class="pergj">rebate ${rb}</span>` : ''}</td>
      <td class="c-s2" data-k="payback">${o.m.applicable ? pbRange(o.pbLow, o.pbHigh) : '—'}</td>
      <td class="c-s3" data-k="20 years">${o.m.applicable ? money(o.twenty) : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="tablewrap">
    <table class="compact calc-table up-table">
      <caption>Each upgrade on its own</caption>
      <thead><tr><th scope="col">Upgrade</th><th scope="col">Saved a year</th><th scope="col">Cost and rebate</th><th scope="col">Payback</th><th scope="col">20 years</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <p class="small foot">Savings use the price of one more unit of energy, not your average price. Each upgrade is shown on its own against your house as it is now; the total above accounts for overlap. Payback = (cost − rebate) ÷ yearly saving; the 20-year figure has no price increases or discounting.</p>`;
}

export { VINTAGE_LABEL, climateZone, rToRsi };
