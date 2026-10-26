/**
 * Energy costs calculator: heating, switching systems, hot water and cooling.
 * compute*() and render*() are pure, so the page renders the first result at build time and
 * the browser re-renders the same HTML when inputs change.
 */
import {
  MODEL, VINTAGE_LABEL, HOUSE_TYPE_LABEL, SYSTEM_KEYS, WATER_HEATER_KEYS, FUEL_LABEL,
  baselineDemandGJ, floorAreaM2, heatingCost, calibrate, fuelOf, fuelUnit, isHeatPump, systemEfficiency,
  waterHeatingDemand, waterHeaterCost, tanklessClaim, coolingKwh, defaultAcTons, rebateAmount, payback, m2ToSqft,
  type Vintage, type HouseType, type SizeBand, type SystemKey, type WaterHeaterKey, type Prices, type RebateEntry,
  type AcAge, type Calibration, type HeatingCost, type WaterHeaterCost,
} from '../../lib/calc/engine';
import { money, moneyDiff, qty, gj, pct, unitPrice, years, esc, degC, range, int } from '../../lib/calc/format';

export interface EnergyPayload {
  city: { slug: string; name: string; prov: string; provName: string; hdd: number; cdd18: number; designCool: number; annualMean: number; zone: string };
  prices: Prices;
  defaultSystem: SystemKey;
  rebates: { ashp: RebateEntry[]; gshp: RebateEntry[]; hpwh: RebateEntry[] };
}

export type BillMode = 'none' | 'usage' | 'bill';
export type AcType = 'none' | 'central' | 'room' | 'heatPump';
export type SwitchTo = SystemKey | 'none';

export interface EnergyState {
  vintage: Vintage;
  type: HouseType;
  size: SizeBand;
  sqft: number | null;
  system: SystemKey;
  billMode: BillMode;
  usage: number | null;
  monthly: number | null;
  summer: number | null;
  prices: Prices;
  persons: number;
  litres: number | null;
  waterHeater: WaterHeaterKey;
  acType: AcType;
  acAge: AcAge;
  acTons: number | null;
  roomUnits: number;
  switchTo: SwitchTo;
  hpDucted: boolean;
  hpTons: number | null;
  costLow: number | null;
  costHigh: number | null;
  rebateId: string;
}

export const SWITCH_COST: Partial<Record<SystemKey, keyof typeof MODEL.costs>> = {
  ashpCold: 'ashpColdDucted',
  ashpStandard: 'ashpColdDucted',
  gshp: 'gshp',
  gasFurnaceHigh: 'gasFurnace',
};
export function switchCostDefault(to: SwitchTo, ducted: boolean): { low: number | null; high: number | null; src: string | null; note: string | null } {
  if (to === 'none') return { low: null, high: null, src: null, note: null };
  let key = SWITCH_COST[to];
  if ((to === 'ashpCold' || to === 'ashpStandard') && !ducted) key = 'ashpDuctless';
  if (!key) return { low: null, high: null, src: null, note: null };
  const c = MODEL.costs[key] as { low: number; high: number; src: string; note: string };
  return { low: c.low, high: c.high, src: c.src, note: c.note };
}

export function energyDefaults(p: EnergyPayload): EnergyState {
  const hasGas = p.prices.gas !== null;
  const sys = p.defaultSystem;
  const fa = floorAreaM2({ sizeBand: 'medium' });
  const to: SwitchTo = isHeatPump(sys) ? 'none' : 'ashpCold';
  const c = switchCostDefault(to, true);
  return {
    vintage: '1966-1980', type: 'detached', size: 'medium', sqft: null,
    system: sys,
    billMode: 'none', usage: null, monthly: null, summer: null,
    prices: JSON.parse(JSON.stringify(p.prices)),
    persons: 3, litres: null,
    waterHeater: fuelOf(sys) === 'gas' && hasGas ? 'gasTank' : fuelOf(sys) === 'oil' ? 'oilTank' : 'electricTank',
    acType: 'central', acAge: '2006to2022', acTons: defaultAcTons(fa), roomUnits: 2,
    switchTo: to, hpDucted: true, hpTons: defaultAcTons(fa),
    costLow: c.low, costHigh: c.high, rebateId: 'auto',
  };
}

/* ------------------------------------------------------------------ compute */

export interface SystemRow {
  key: SystemKey;
  label: string;
  now: HeatingCost;
  variable: HeatingCost;
  diff: number | null;
}
export interface RebateOption { id: string; program: string; amountLow: number | null; amountHigh: number | null; eligible: boolean; reason?: string }

export interface EnergyResult {
  state: EnergyState;
  p: EnergyPayload;
  areaM2: number;
  modelDemand: number;
  demand: number;
  cal: Calibration;
  current: SystemRow;
  rows: SystemRow[];
  cheapest: SystemKey | null;
  sw: null | {
    to: SystemKey;
    saving: number | null;
    costLow: number | null;
    costHigh: number | null;
    rebates: RebateOption[];
    chosen: RebateOption | null;
    paybackLow: ReturnType<typeof payback>;
    paybackHigh: ReturnType<typeof payback>;
    twenty: number | null;
    tons: number;
  };
  water: {
    litres: number; inletC: number; gj: number;
    rows: { key: WaterHeaterKey; label: string; r: WaterHeaterCost; total: number | null }[];
    mine: { key: WaterHeaterKey; total: number | null };
    claim: [number, number] | null;
    hpwhRebates: RebateOption[];
  };
  cool: null | { kind: AcType; tons: number; seer: number; eflh: number; kwh: number; cost: number | null; newKwh: number; newCost: number | null; units: number };
}

const SYS_ORDER: SystemKey[] = SYSTEM_KEYS;

function rowFor(key: SystemKey, demand: number, hdd: number, prices: Prices, current: HeatingCost | null): SystemRow {
  const now = heatingCost(demand, key, hdd, prices, 'now');
  const variable = heatingCost(demand, key, hdd, prices, 'variable');
  const diff = current && current.cost !== null && variable.cost !== null ? variable.cost - current.cost : null;
  return { key, label: MODEL.systems[key].label, now, variable, diff };
}

export function rebateOptions(entries: RebateEntry[], q: Parameters<typeof rebateAmount>[1], costLow: number | null, costHigh: number | null): RebateOption[] {
  return entries.map((e) => {
    const lo = rebateAmount(e, { ...q, cost: costLow ?? undefined });
    const hi = rebateAmount(e, { ...q, cost: costHigh ?? undefined });
    return { id: e.id, program: e.program, amountLow: lo.amount, amountHigh: hi.amount, eligible: lo.eligible && (lo.amount ?? 0) > 0, reason: lo.reason };
  });
}
/** Default rebate: the smallest positive eligible amount (conservative), unless the user picked one. */
export function pickRebate(opts: RebateOption[], id: string, entries: RebateEntry[]): RebateOption | null {
  if (id === 'none') return null;
  if (id !== 'auto') return opts.find((o) => o.id === id && o.eligible) ?? null;
  const ok = opts.filter((o) => o.eligible && !entries.find((e) => e.id === o.id)?.defaultOff);
  if (!ok.length) return null;
  return ok.reduce((a, b) => ((a.amountLow ?? 0) <= (b.amountLow ?? 0) ? a : b));
}

export function computeEnergy(s: EnergyState, p: EnergyPayload): EnergyResult {
  const hdd = p.city.hdd;
  const areaM2 = floorAreaM2({ sizeBand: s.size, sqft: s.sqft });
  const modelDemand = baselineDemandGJ({ vintage: s.vintage, floorAreaM2: areaM2, hdd, type: s.type });
  const sameFuel = MODEL.water.types[s.waterHeater].fuel === fuelOf(s.system);
  const cal = calibrate(modelDemand, s.system, hdd, s.prices, {
    mode: s.billMode,
    annualUnits: s.usage,
    monthlyBill: s.monthly,
    summerBill: s.billMode === 'bill' ? s.summer : null,
    summerKwh: s.billMode === 'usage' ? s.summer : null,
    waterHeaterSameFuel: sameFuel,
  });
  const demand = modelDemand * cal.factor;
  const curNow = heatingCost(demand, s.system, hdd, s.prices, 'variable');
  const current = rowFor(s.system, demand, hdd, s.prices, curNow);
  const rows = SYS_ORDER.filter((k) => !(fuelOf(k) === 'gas' && s.prices.gas === null)).map((k) => rowFor(k, demand, hdd, s.prices, curNow));
  let cheapest: SystemKey | null = null;
  let best = Infinity;
  for (const r of rows) if (r.now.cost !== null && r.now.cost < best) { best = r.now.cost; cheapest = r.key; }

  // switching
  let sw: EnergyResult['sw'] = null;
  if (s.switchTo !== 'none' && s.switchTo !== s.system) {
    const to = s.switchTo;
    const target = rowFor(to, demand, hdd, s.prices, curNow);
    const saving = target.diff !== null ? -target.diff : null;
    const tons = s.hpTons && s.hpTons > 0 ? s.hpTons : defaultAcTons(areaM2);
    const isAshp = to === 'ashpCold' || to === 'ashpStandard';
    const entries = isAshp ? p.rebates.ashp : to === 'gshp' ? p.rebates.gshp : [];
    const q = { tons, kBtu: tons * 12, ducted: s.hpDucted, coldClimate: to === 'ashpCold', fuel: fuelOf(s.system) };
    const rebates = rebateOptions(entries, q, s.costLow, s.costHigh);
    const chosen = pickRebate(rebates, s.rebateId, entries);
    const rbLo = chosen?.amountLow ?? 0, rbHi = chosen?.amountHigh ?? 0;
    sw = {
      to, saving, costLow: s.costLow, costHigh: s.costHigh, rebates, chosen,
      paybackLow: payback(s.costLow, rbLo, saving),
      paybackHigh: payback(s.costHigh, rbHi, saving),
      twenty: saving !== null ? saving * 20 : null,
      tons,
    };
  }

  // hot water
  const w = waterHeatingDemand(s.persons, p.city.annualMean, s.litres);
  const space = { sys: s.system, hdd };
  const wrows = WATER_HEATER_KEYS.filter((k) => !(MODEL.water.types[k].fuel === 'gas' && s.prices.gas === null)).map((k) => {
    const r = waterHeaterCost(k, w.gj, s.prices, 'now', space);
    const total = r.cost !== null ? r.cost + (r.extraCost ?? 0) : null;
    return { key: k, label: MODEL.water.types[k].label, r, total };
  });
  const mineRow = wrows.find((x) => x.key === s.waterHeater) ?? wrows[0];
  const hpwhRebates = rebateOptions(p.rebates.hpwh, { waterHeaterFuel: MODEL.water.types[s.waterHeater].fuel, fuel: fuelOf(s.system) }, null, null);

  // cooling
  let cool: EnergyResult['cool'] = null;
  if (s.acType !== 'none') {
    const C = MODEL.cooling;
    const room = s.acType === 'room';
    const tons = room ? C.room.capacityBtuh / 12000 : s.acTons && s.acTons > 0 ? s.acTons : defaultAcTons(areaM2);
    const seer = s.acType === 'heatPump' ? C.heatPumpSeer : room ? C.room.eerStock : C.seerByAge[s.acAge];
    const r = room
      ? coolingKwh({ cdd18: p.city.cdd18, designCool: p.city.designCool, capacityBtuh: C.room.capacityBtuh, eer: C.room.eerStock, room: true, units: s.roomUnits })
      : coolingKwh({ cdd18: p.city.cdd18, designCool: p.city.designCool, capacityBtuh: tons * 12000, seer });
    const n = room
      ? coolingKwh({ cdd18: p.city.cdd18, designCool: p.city.designCool, capacityBtuh: C.room.capacityBtuh, eer: C.room.ceerNew, room: true, units: s.roomUnits })
      : coolingKwh({ cdd18: p.city.cdd18, designCool: p.city.designCool, capacityBtuh: tons * 12000, seer: C.seerByAge['2023on'] });
    const price = s.prices.electricity.variable;
    cool = { kind: s.acType, tons, seer, eflh: r.eflh, kwh: r.kwh, cost: price ? r.kwh * price : null, newKwh: n.kwh, newCost: price ? n.kwh * price : null, units: room ? s.roomUnits : 1 };
  }

  return {
    state: s, p, areaM2, modelDemand, demand, cal, current, rows, cheapest, sw,
    water: { litres: w.litresPerDay, inletC: w.inletC, gj: w.gj, rows: wrows, mine: { key: mineRow.key, total: mineRow.total }, claim: tanklessClaim(w.litresPerDay), hpwhRebates },
    cool,
  };
}

/* ------------------------------------------------------------------ render */

const unitWord = (u: string) => (u === 'm³' ? 'm³' : u);
/** Systems shown in the interactive comparison (plus whatever the user has). */
export const COMPARE: SystemKey[] = ['gasFurnaceMid', 'gasFurnaceHigh', 'oilFurnaceNew', 'propaneFurnaceCond', 'electricResistance', 'ashpStandard', 'ashpCold', 'gshp', 'woodCertified', 'pellet'];
export const effText = (k: SystemKey, eff: number) => (MODEL.systems[k].fuel === 'electricity' ? `seasonal COP ${eff.toFixed(1)}` : `${Math.round(eff * 100)}% seasonal efficiency`);
const usesLine = (h: HeatingCost) => `${qty(h.units)} ${unitWord(h.unit)}`;

export function houseLine(r: EnergyResult): string {
  const s = r.state;
  const sqft = Math.round(m2ToSqft(r.areaM2) / 10) * 10;
  return `${HOUSE_TYPE_LABEL[s.type].toLowerCase()} house of about ${int(sqft)} sq ft built ${VINTAGE_LABEL[s.vintage].toLowerCase().replace('before', 'before')}`;
}

export function calBadge(cal: Calibration): string {
  if (!cal.calibrated) return '<span class="chip chip-neutral">Based on a typical house</span>';
  const f = cal.factor.toFixed(2);
  return `<span class="chip chip-active">Calibrated to your bills</span>${cal.clamped ? ` <span class="chip chip-limited">limited to ${f}×</span>` : ''}`;
}
export function calNote(cal: Calibration, modelDemand: number): string {
  if (!cal.calibrated) return 'Add your annual use or a monthly bill to calibrate these numbers to your house.';
  const raw = cal.raw ?? cal.factor;
  const base = `Your bills point to about ${gj(cal.actualDemandGJ)} of heat a year, ${raw >= 1 ? `${(raw).toFixed(2)}× ` : `${raw.toFixed(2)}× `}what a typical house like yours needs (${gj(modelDemand)}).`;
  const clamp = cal.clamped ? ` That is outside the range we trust (0.5× to 1.6×), so we use ${cal.factor.toFixed(2)}×; an energy audit can explain the gap.` : '';
  const method = cal.method === 'summer' ? ' We took your summer use as the non-heating baseload.' : '';
  return base + clamp + method;
}

export function renderHeating(r: EnergyResult): string {
  const c = r.current;
  const priceMissing = c.now.cost === null;
  const head = `
    <div class="res-head">
      <p class="res-kicker">${calBadge(r.cal)}</p>
      <p class="res-big"><span class="money">${priceMissing ? '—' : money(c.now.cost)}</span><span class="res-unit">a year to heat</span></p>
      <p class="res-sub">${esc(c.label)}: about ${usesLine(c.now)} for ${gj(r.demand)} of heat, the need of a ${esc(houseLine(r))} in ${esc(r.p.city.name)} (${int(r.p.city.hdd)} heating degree-days).</p>
      ${priceMissing ? `<p class="res-warn">Enter a price for ${esc(FUEL_LABEL[c.now.fuel])} under “Prices” to see a dollar figure.</p>` : ''}
      <p class="small res-note">${esc(calNote(r.cal, r.modelDemand))}</p>
    </div>`;
  const rows = r.rows.filter((row) => COMPARE.includes(row.key) || row.key === c.key).map((row) => {
    const isMine = row.key === c.key;
    const cost = row.now.cost === null ? `<span class="muted">enter a price</span>` : money(row.now.cost);
    const diff = isMine ? '<span class="muted">your system</span>' : row.diff === null ? '<span class="muted">—</span>' : `<span class="${row.diff < 0 ? 'save' : 'more'}">${moneyDiff(row.diff)}</span>`;
    const perGJ = row.now.costPerGJ !== null ? `<span class="pergj">${money(row.now.costPerGJ)} per GJ of heat</span>` : '';
    const chip = row.key === r.cheapest ? ' <span class="chip chip-active">lowest</span>' : '';
    return `<tr class="${isMine ? 'mine' : ''}">
      <td class="c-main"><strong>${esc(MODEL.systems[row.key].short)}</strong>${chip}<span class="eff">${effText(row.key, row.now.eff)}</span></td>
      <td class="c-s1">${usesLine(row.now)}</td>
      <td class="c-val">${cost}${perGJ}</td>
      <td class="c-s2"${isMine ? '' : ' data-k="vs yours"'}>${diff}</td>
    </tr>`;
  }).join('');
  return `${head}
    <div class="tablewrap">
      <table class="compact calc-table">
        <caption>What other systems would cost for the same house</caption>
        <thead><tr><th scope="col">System</th><th scope="col">Energy a year</th><th scope="col">Cost a year</th><th scope="col">Change vs yours*</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="small foot">Cost a year uses today's average prices, including fixed charges. *The change column uses the price of one more unit of energy (fixed charges left out), the conservative way to count savings. Heat pump figures include backup heat.</p>
    ${heatTodo(r)}`;
}

const slugOf = (r: EnergyResult) => esc(r.p.city.slug);

/** Next step under the heating cost. */
function heatTodo(r: EnergyResult): string {
  const c = r.current;
  const cheaper = r.cheapest && r.cheapest !== c.key ? MODEL.systems[r.cheapest].short.toLowerCase() : null;
  const lead = c.now.cost === null
    ? 'add your fuel price under “Prices”, then compare the figure with your last 12 months of bills.'
    : `compare it with your last 12 months of bills (enter them above to calibrate). ${cheaper ? `The table shows a system that costs less to run here (${esc(cheaper)}): pick it under “Thinking of switching?” to see the installed cost, rebates and payback.` :'Your system is already the cheapest to run here, so cutting heat loss is the way to lower the bill.'}`;
  return `<p class="todo"><strong>What to do with this number:</strong> ${lead} <a href="/ca/calculators/upgrade-payback/${slugOf(r)}/">See what insulation and air sealing would save in ${esc(r.p.city.name)}</a>.</p>`;
}

export function renderSwitch(r: EnergyResult): string {
  if (!r.sw) {
    return `<p class="small">Pick a system to compare it with what you have now.</p>`;
  }
  const sw = r.sw;
  const label = MODEL.systems[sw.to].label;
  const save = sw.saving;
  let verdict: string;
  if (save === null) verdict = `<p class="res-warn">We need a price for both fuels to compare them.</p>`;
  else if (save <= 0) verdict = `<p class="res-big"><span class="money more">${money(-save)}</span><span class="res-unit">more a year</span></p><p class="res-sub">At ${esc(r.p.city.name)} prices a ${esc(label.toLowerCase())} would cost more to run than your ${esc(MODEL.systems[r.state.system].short.toLowerCase())}, so it does not pay back on energy savings alone. People switch for comfort, cooling or lower emissions too.</p>`;
  else verdict = `<p class="res-big"><span class="money">${money(save)}</span><span class="res-unit">saved a year</span></p><p class="res-sub">${esc(label)} instead of your ${esc(MODEL.systems[r.state.system].short.toLowerCase())}, counted at the price of one more unit of energy.</p>`;
  const cost = sw.costLow || sw.costHigh ? range(sw.costLow, sw.costHigh, money) : 'enter your quote';
  const rb = sw.chosen ? range(sw.chosen.amountLow, sw.chosen.amountHigh, money) : '$0';
  const pbText = (p: ReturnType<typeof payback>) => (p.kind === 'years' ? years(p.years) : p.kind === 'immediate' ? 'right away' : p.kind === 'never' ? 'does not pay back' : '—');
  let pb: string;
  if (sw.paybackLow.kind === 'unknown' && sw.paybackHigh.kind === 'unknown') pb = 'enter a cost';
  else if (pbText(sw.paybackLow) === pbText(sw.paybackHigh)) pb = pbText(sw.paybackLow);
  else pb = `${pbText(sw.paybackLow)} to ${pbText(sw.paybackHigh)}`;
  const reb = sw.rebates.length
    ? `<ul class="rb-list">${sw.rebates.map((o) => `<li>${esc(o.program)}: ${o.eligible ? `<strong>${range(o.amountLow, o.amountHigh, money)}</strong>` : `<span class="muted">${esc(o.reason ?? 'not available')}</span>`}</li>`).join('')}</ul>`
    : '<p class="small">No open provincial rebate for this switch in our records.</p>';
  return `<div class="res-head">${verdict}</div>
    <dl class="kv-grid">
      <dt>Installed cost</dt><dd>${cost}</dd>
      <dt>Rebate counted</dt><dd>${rb}${sw.chosen ? ` <span class="muted">(${esc(sw.chosen.program)})</span>` : ''}</dd>
      <dt>Simple payback</dt><dd>${pb}</dd>
      <dt>Saving over 20 years</dt><dd>${save !== null && save > 0 ? money(sw.twenty) : '—'}</dd>
      <dt>Size used for rebates</dt><dd>${sw.tons.toFixed(1)} tons</dd>
    </dl>
    <h4 class="mini-h">Rebates that apply in ${esc(r.p.city.provName)}</h4>${reb}
    <p class="todo"><strong>What to do with this number:</strong> ${save !== null && save > 0
      ? 'get two or three installed quotes, and check each rebate’s rules before you sign: most need an EnerGuide evaluation before the work.'
      : 'on running costs alone this switch does not pay, so weigh comfort, cooling and emissions, or compare another system.'} ${MODEL.systems[sw.to].fuel === 'electricity' && sw.to !== 'electricResistance'
      ? `A heat loss calculation sizes a heat pump correctly: <a href="/ca/services/heat-loss-calculation/${slugOf(r)}/">heat loss calculations in ${esc(r.p.city.name)}</a>.`
      : `<a href="/ca/services/home-energy-audit/${slugOf(r)}/">Energy audits in ${esc(r.p.city.name)}</a>.`}</p>`;
}

export function renderWater(r: EnergyResult): string {
  const w = r.water;
  const mine = w.rows.find((x) => x.key === w.mine.key);
  const rows = w.rows.map((x) => {
    const isMine = x.key === w.mine.key;
    const diff = isMine || x.total === null || w.mine.total === null ? (isMine ? '<span class="muted">yours</span>' : '<span class="muted">—</span>') : `<span class="${x.total - w.mine.total < 0 ? 'save' : 'more'}">${moneyDiff(x.total - w.mine.total)}</span>`;
    const extra = x.key === 'heatPump' && x.r.extraCost ? `<span class="pergj">incl. ${money(x.r.extraCost)} extra heating</span>` : '';
    return `<tr class="${isMine ? 'mine' : ''}">
      <td class="c-main"><strong>${esc(x.label)}</strong><span class="eff">${x.key === 'heatPump' ? `field COP ${x.r.uef}` : `UEF ${x.r.uef.toFixed(2)}`}</span></td>
      <td class="c-s1">${qty(x.r.units)} ${x.r.unit}</td>
      <td class="c-val">${x.total === null ? '<span class="muted">enter a price</span>' : money(x.total)}${extra}</td>
      <td class="c-s2"${isMine ? '' : ' data-k="vs yours"'}>${diff}</td>
    </tr>`;
  }).join('');
  const claim = w.claim
    ? `US DOE says tankless heaters can be ${pct(w.claim[0])}–${pct(w.claim[1])} more efficient than a storage tank for a home using ${w.litres <= 155 ? '155 L or less' : 'about 326 L'} a day.`
    : 'US DOE puts the tankless advantage at 24–34% for homes using 155 L a day or less, and 8–14% around 326 L a day; your use is in between.';
  return `<div class="res-head">
      <p class="res-big"><span class="money">${mine && mine.total !== null ? money(mine.total) : '—'}</span><span class="res-unit">a year for hot water</span></p>
      <p class="res-sub">${int(w.litres)} L of hot water a day heated from about ${degC(w.inletC)} to 55 °C: ${gj(w.gj)} of heat a year.</p>
    </div>
    <div class="tablewrap">
      <table class="compact calc-table">
        <caption>Water heater running costs for your household</caption>
        <thead><tr><th scope="col">Water heater</th><th scope="col">Energy a year</th><th scope="col">Cost a year</th><th scope="col">Change vs yours</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="small foot">${esc(claim)} A heat pump water heater cools the room it sits in; in winter your heating system replaces that heat, and we count it.</p>
    <p class="todo"><strong>What to do with this number:</strong> compare the yearly difference with the price gap between models, and plan the change before your old tank fails, so an emergency doesn't force a like-for-like replacement. <a href="/ca/services/energy-bill-analysis/${slugOf(r)}/">Energy bill analysis in ${esc(r.p.city.name)}</a>.</p>`;
}

export function renderCooling(r: EnergyResult): string {
  const c = r.cool;
  const coolTodo = `<p class="todo"><strong>What to do with this number:</strong> shade sunny windows by day and seal air leaks to cut the hours any cooling runs; when an air conditioner or furnace is due for replacement, a heat pump does both jobs. <a href="/ca/issues/summer-overheating/">Keeping a house cool in summer</a>.</p>`;
  if (!c) return `<p class="small">No air conditioning, no cooling cost.</p>${coolTodo}`;
  const what = c.kind === 'room' ? `${c.units} room air conditioner${c.units > 1 ? 's' : ''} (about 9,500 Btu/h each)` : c.kind === 'heatPump' ? `a ${c.tons.toFixed(1)}-ton heat pump cooling at SEER2 ${c.seer}` : `a ${c.tons.toFixed(1)}-ton central air conditioner at SEER ${c.seer}`;
  const better = c.kind === 'room' ? 'new room units (CEER 16)' : 'a new SEER 14 unit';
  const diff = c.cost !== null && c.newCost !== null ? c.cost - c.newCost : null;
  return `<div class="res-head">
      <p class="res-big"><span class="money">${money(c.cost)}</span><span class="res-unit">a year to cool</span></p>
      <p class="res-sub">About ${qty(c.kwh)} kWh a year for ${esc(what)}: ${int(c.eflh)} full-load hours in ${esc(r.p.city.name)}, times 0.8 because most homes don't run AC around the clock.</p>
    </div>
    <p class="small">${c.kind === 'heatPump' ? 'Heat pumps already cool at today\'s minimum efficiency.' : `Replacing it with ${better} would use about ${qty(c.newKwh)} kWh (${money(c.newCost)} a year${diff !== null && diff > 0 ? `, ${money(diff)} less` : ''}).`}</p>
    ${coolTodo}`;
}
