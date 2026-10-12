/**
 * Number and text formatting shared by the build-time tables and the browser calculators.
 * Estimates are rounded so they never look more precise than they are.
 */

const nf = (d: number) => new Intl.NumberFormat('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF0 = nf(0);
const NF1 = nf(1);
const NF2 = nf(2);
const NF3 = nf(3);

const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** Whole number with thousands separators. */
export function int(n: number | null | undefined): string {
  return ok(n) ? NF0.format(Math.round(n)) : '—';
}
export function num(n: number | null | undefined, d = 1): string {
  if (!ok(n)) return '—';
  return d === 0 ? NF0.format(n) : d === 1 ? NF1.format(n) : d === 2 ? NF2.format(n) : NF3.format(n);
}
/** Round to 2 significant-ish steps for quantities (fuel units, kWh). */
export function qty(n: number | null | undefined): string {
  if (!ok(n)) return '—';
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a >= 1000) return NF0.format(Math.round(n / 10) * 10);
  if (a >= 100) return NF0.format(Math.round(n / 5) * 5);
  if (a >= 10) return NF0.format(Math.round(n));
  if (a >= 1) return NF1.format(n);
  return NF2.format(n);
}
/** Annual dollars, rounded: $1 steps under $100, $5 under $1,000, $10 above. */
export function money(n: number | null | undefined): string {
  if (!ok(n)) return '—';
  const a = Math.abs(n);
  const step = a >= 1000 ? 10 : a >= 100 ? 5 : 1;
  const r = Math.round(n / step) * step;
  return (r < 0 ? '−$' : '$') + NF0.format(Math.abs(r));
}
/** Signed money for differences: +$120 / −$80. */
export function moneyDiff(n: number | null | undefined): string {
  if (!ok(n)) return '—';
  const m = money(Math.abs(n));
  if (Math.abs(n) < 0.5) return '$0';
  return (n > 0 ? '+' : '−') + m;
}
/** Unit prices: $0.188/kWh, $0.478/m³, $1.95/L */
export function unitPrice(n: number | null | undefined, unit: string): string {
  if (!ok(n)) return '—';
  const d = n < 1 ? 3 : 2;
  return `$${n.toFixed(d)}/${unit}`;
}
export function pct(f: number | null | undefined, d = 0): string {
  if (!ok(f)) return '—';
  return `${(f * 100).toFixed(d)}%`;
}
export function gj(n: number | null | undefined): string {
  if (!ok(n)) return '—';
  return `${n >= 100 ? NF0.format(Math.round(n)) : NF1.format(n)} GJ`;
}
export function years(y: number | null | undefined): string {
  if (!ok(y)) return '—';
  if (y < 1) return 'under 1 year';
  if (y > 100) return 'over 100 years';
  if (y < 10) return `${NF1.format(y)} years`;
  return `${NF0.format(Math.round(y))} years`;
}
export function degC(n: number | null | undefined, d = 1): string {
  if (!ok(n)) return '—';
  const v = d === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${v < 0 ? '−' : ''}${d === 0 ? NF0.format(Math.abs(v)) : NF1.format(Math.abs(v))} °C`;
}
/** −16.3 → "−16.3" (typographic minus, no unit) */
export function signed(n: number | null | undefined, d = 1): string {
  if (!ok(n)) return '—';
  const s = d === 0 ? NF0.format(Math.abs(n)) : d === 1 ? NF1.format(Math.abs(n)) : NF2.format(Math.abs(n));
  return (n < 0 ? '−' : '') + s;
}
export function range(lo: number | null | undefined, hi: number | null | undefined, f: (n: number) => string): string {
  if (!ok(lo) && !ok(hi)) return '—';
  if (!ok(hi) || (ok(lo) && Math.abs(hi - lo) < 1e-9)) return f(lo as number);
  if (!ok(lo)) return f(hi);
  const a = f(lo), b = f(hi);
  return a === b ? a : `${a}–${b.replace(/^\$/, '$')}`;
}
export function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
/** "2026-10-08" → "October 8, 2026" */
export function longDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}(-\d{2})?$/.test(iso)) return iso ?? '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return d ? `${months[m - 1]} ${d}, ${y}` : `${months[m - 1]} ${y}`;
}
/** ECCC station names are upper case ("WINNIPEG RICHARDSON INT'L A"); show them in title case, keeping codes such as A, CS and WPCP. */
export function stationName(raw: string | null | undefined): string {
  const KEEP = new Set(['A', 'CS', 'RCS', 'AUT', 'WPCP', 'CDA', 'UBC', 'UA']);
  return String(raw ?? '')
    .split(' ')
    .map((w) => (KEEP.has(w) ? w : w.toLowerCase().replace(/(^|[\/\-.(])([a-zà-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase())))
    .join(' ');
}
/** The first ISO date inside a free-text "rates effective" note, as a long date (null when there is none). */
export function rateDate(note: string | null | undefined): string | null {
  const m = (note ?? '').match(/\d{4}-\d{2}-\d{2}/);
  return m ? longDate(m[0]) : null;
}
