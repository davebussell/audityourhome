/**
 * Appliance energy calculator: kWh a year × the price of one more kWh.
 * Pure compute + HTML render, shared by the build-time first render and the browser.
 */
import { money, qty, esc, int } from '../../lib/calc/format';

export type ApKind = 'annual' | 'perNight' | 'perHour' | 'typical' | 'perBulb' | 'ev' | 'watts';
export interface ApItem {
  id: string;
  label: string;
  kind: ApKind;
  oldKwh?: number | null;
  newKwh?: number | null;
  /** what "remove it" saves (second fridge) */
  removeKwh?: number | null;
  kwhPerHour?: number | null;
  lowKwhPerHour?: number | null;
  typicalKwh?: number | null;
  kwhPer100km?: number | null;
  oldLabel?: string;
  newLabel?: string;
  hint: string;
  defaultOn: boolean;
  /** the model the example household starts with; 'new' when left out */
  defaultVersion?: 'old' | 'new';
  defaultQty: number;
  defaultUse?: number | null;
  useLabel?: string;
  useUnit?: string;
  /** converts the entered use to hours (minutes a day → 1/60) */
  useScale?: number;
  days?: number;
}
export interface AppliancePayload {
  city: { slug: string; name: string; prov: string; nights20: number; nights10: number; annualMean: number };
  price: number;
  items: ApItem[];
}
export interface ApState {
  price: number | null;
  rows: Record<string, { on: boolean; qty: number; version: 'old' | 'new' | 'remove'; use: number | null }>;
}

export function applianceDefaults(p: AppliancePayload): ApState {
  const rows: ApState['rows'] = {};
  for (const it of p.items) rows[it.id] = { on: it.defaultOn, qty: it.defaultQty, version: it.defaultVersion ?? 'new', use: it.defaultUse ?? null };
  return { price: p.price, rows };
}

export interface ApRowResult {
  item: ApItem;
  on: boolean;
  kwh: number | null;
  cost: number | null;
  saveKwh: number | null;
  saveCost: number | null;
  needsInput: boolean;
}

export function computeAppliances(s: ApState, p: AppliancePayload) {
  const price = s.price !== null && s.price > 0 ? s.price : null;
  const rows: ApRowResult[] = p.items.map((it) => {
    const r = s.rows[it.id] ?? { on: false, qty: 1, version: 'old', use: null };
    const q = Math.max(0, r.qty || 0);
    const use = r.use !== null && r.use >= 0 ? r.use : null;
    let kwh: number | null = null;
    let saveKwh: number | null = null;
    switch (it.kind) {
      case 'annual':
      case 'perBulb': {
        const old = it.oldKwh ?? null, nw = it.newKwh ?? null;
        if (r.version === 'new' || old === null) kwh = nw !== null ? nw * q : null;
        else kwh = old * q;
        if (old !== null && nw !== null && r.version === 'old') saveKwh = (old - nw) * q;
        if (r.version === 'remove' && it.removeKwh) { kwh = 0; saveKwh = it.removeKwh * q; }
        break;
      }
      case 'perNight': {
        const old = it.oldKwh ?? 0, nw = it.newKwh ?? 0;
        if (use !== null) {
          kwh = (r.version === 'new' ? nw : old) * use * q;
          saveKwh = r.version === 'old' ? (old - nw) * use * q : null;
        }
        break;
      }
      case 'perHour': {
        if (use !== null) {
          const days = it.days ?? 365;
          const hours = use * (it.useScale ?? 1);
          const rate = r.version === 'new' && it.lowKwhPerHour ? it.lowKwhPerHour : it.kwhPerHour ?? 0;
          kwh = rate * hours * days * q;
          if (r.version === 'old' && it.lowKwhPerHour) saveKwh = ((it.kwhPerHour ?? 0) - it.lowKwhPerHour) * hours * days * q;
        }
        break;
      }
      case 'typical':
        kwh = (it.typicalKwh ?? 0) * q;
        break;
      case 'ev':
        if (use !== null) kwh = ((it.kwhPer100km ?? 0) * use) / 100 * q;
        break;
      case 'watts':
        if (use !== null) kwh = (use * 8760) / 1000 * q;
        break;
    }
    const cost = kwh !== null && price !== null ? kwh * price : null;
    const saveCost = saveKwh !== null && price !== null ? saveKwh * price : null;
    return { item: it, on: r.on, kwh, cost, saveKwh, saveCost, needsInput: kwh === null };
  });
  const on = rows.filter((x) => x.on && x.kwh !== null);
  const totalKwh = on.reduce((a, x) => a + (x.kwh ?? 0), 0);
  const totalCost = price !== null ? totalKwh * price : null;
  const saveKwh = on.reduce((a, x) => a + Math.max(0, x.saveKwh ?? 0), 0);
  const saveCost = price !== null ? saveKwh * price : null;
  return { rows, totalKwh, totalCost, saveKwh, saveCost, price, count: on.length };
}
export type ApResult = ReturnType<typeof computeAppliances>;

const NEEDS_USE: ApKind[] = ['perHour', 'watts', 'ev', 'perNight'];

export function renderRow(x: ApRowResult): string {
  if (x.needsInput) return `<span class="muted">${NEEDS_USE.includes(x.item.kind) ? (x.on ? 'Enter your use to see the cost.' : 'Tick it, then enter your use.') : '—'}</span>`;
  if (!x.on) return `<span class="muted">Not counted · about ${money(x.cost)}/yr</span>`;
  const save = x.saveCost !== null && x.saveCost > 0.5 ? ` · <span class="save">save ${money(x.saveCost)}/yr</span>` : '';
  return `<strong>${money(x.cost)}</strong>/yr · ${qty(x.kwh)} kWh${save}`;
}

/** One-line total repeated under the list, so phone users see it without scrolling back up. */
export function renderFootTotal(r: ApResult): string {
  return `Total for the ${r.count} ticked item${r.count === 1 ? '' : 's'}: <strong>${money(r.totalCost)}</strong> a year (${qty(r.totalKwh)} kWh)${r.saveCost !== null && r.saveCost > 0.5 ? ` · <span class="save">savings shown: ${money(r.saveCost)}/yr</span>` : ''}`;
}

export function renderTotals(r: ApResult, p: AppliancePayload): string {
  return `<div class="res-head">
      <p class="res-big"><span class="money">${money(r.totalCost)}</span><span class="res-unit">a year for ${r.count} item${r.count === 1 ? '' : 's'}</span></p>
      <p class="res-sub">About ${qty(r.totalKwh)} kWh a year at ${r.price !== null ? `$${r.price.toFixed(3)}` : '—'} per kWh in ${esc(p.city.name)}.</p>
    </div>
    ${r.saveKwh > 0 ? `<div class="verdict"><p>The savings shown in green on the ticked rows (a newer model, a timer, or switching off) add up to about <strong>${qty(r.saveKwh)} kWh</strong>, or <strong>${money(r.saveCost)} a year</strong>.</p></div>` : '<p class="small">Set a row to its older model to see what a newer one would save.</p>'}
    <p class="small foot">We use the price of one more kWh because switching an appliance off doesn't change your fixed charges. Rated figures come from standard tests; real use depends on habits and where the appliance sits.</p>`;
}

export { int };
