/**
 * US Home Energy Planner, browser side. Reads the build-time payload embedded in the page, runs the
 * wizard and renders the plan. Nothing a visitor enters is stored or sent anywhere: the ZIP lookup,
 * the heating and cooling models and the program data are all in the page. Answers are kept in the
 * address bar's #fragment (never sent to a server or in a Referer header) so a plan can be reloaded
 * or shared; a ?query from another page is read once and removed.
 *
 * Results, top to bottom: the next three steps (one primary action: book the audit), what homes in
 * this climate need, the homeowner's own concerns, bills, the upgrade sequence (heating plus
 * cooling dollars, with the local rebates that pay for each), tests with reading guides, programs,
 * finding an auditor, and the numbers behind it all in collapsed panels.
 */
import { MODEL, isHeatPump } from '../calc/engine';
import type { SystemKey, Vintage, WindowKey } from '../calc/engine';
import {
  GJ_PER_MMBTU, houseModel, calibrateFuelBill, calibrateElectricHeat, typicalFuelBill, itemSaving, usHeatingCost, usWaterHeaterCost,
  costPerMMBtuDelivered, zoneNumber, atticTargetR, heatPumpFor, COMPARE, eraAssumptions, WINDOW_LABEL_US,
} from './plan-model';
import type { UsPrices, UsClimate, HouseModel, UsWaterHeater, UsCalibration, HouseInput } from './plan-model';
import {
  ERAS, SYMPTOMS, LEGACY_SYMPTOM, buildSequence, energyTests, specialtyTests, watchFor, concernText, foundationText,
} from './plan-content';
import type { TestPick, TestInput, ClimClass, SeqItem } from './plan-content';
import {
  coolingBaseline, coolingMeasures, combineCooling, billSplit, clampFactor, defaultMonths, acKind, minSeer, hotZone,
} from './plan-cooling';
import type { CoolingData, CoolMeasureKey, CoolPct, CoolingBaseline, BillResult, CoolingInput } from './plan-cooling';
import type { PlanPayload } from './plan-payload';

type Chip = { cls: string; label: string; status: string };
type HerProg = { s: string | null; chip: Chip; name: string | null; url: string | null; amt: string | null };
type StateRec = {
  n: string; slug: string; so: boolean;
  p: { e: number; g: number | null; gy: string | null; o: number | null; pr: number | null };
  her: { lede: string; taking: boolean; homes: HerProg; heehr: HerProg; via: string | null } | null;
};
type Util = { id: string; n: string; al: string[]; st: string[]; runs: number; gas: boolean };
type Audit = {
  n: string; by: string | null; cost: string | null; s: string | null; chip: Chip; open: boolean; url: string | null; ul: string | null;
  how: string | null; st: string[]; ut: string[]; f: { ol: boolean; vi: boolean; ip: boolean; iq: boolean; fr: boolean };
  tests: string[]; sc: number;
};
type Rebate = {
  n: string; amt: string | null; url: string | null; cat: string; keys: string[]; st: string[]; ut: string[]; chip: Chip; open: boolean; iq: boolean;
  /** limited to one heating fuel */
  fu: 'oil' | 'elec' | 'gas' | 'fossil' | null;
};
/** a metro's own climate notes; `k` names its climate profile */
type Needs = { k: string; note: string | null; hz: string[] };
type Profile = { cls: ClimClass | null; one: string; pri: { t: string; w: string }[]; season: string; sym: string[] };
type MetroRec = {
  n: string; msa: string; st: string[];
  c: { h: number; k: number; z: string | null; r: number | null; co: string | null; stn: string | null; my: number | null; place: string | null; acs: string | null };
  meaning: string; needs: Needs | null;
  u: { list: Util[]; ask: Record<string, boolean> };
  a: Audit[]; rb: Rebate[]; iqp: { n: string; url: string | null; st: string[] }[];
};
type Guide = { u: string; b: { l: string; r: string; m: string; d: string }[] };

declare global {
  interface Window { AYHGloss?: { link: (el: Element) => number } }
}

export function startPlanner() {
  const D = JSON.parse(document.getElementById('planner-data')!.textContent!) as Omit<PlanPayload, 'states' | 'metros' | 'guides' | 'cooling' | 'profiles'> & {
    states: Record<string, StateRec>; metros: Record<string, MetroRec>; guides: Record<string, Guide>; cooling: CoolingData;
    profiles: Record<string, Profile>;
  };
  /** the climate profile of a metro (what homes there need) */
  const profileOf = (m: MetroRec | null | undefined): Profile | null => (m?.needs ? D.profiles[m.needs.k] ?? null : null);
  const CD = D.cooling;

  const form = document.getElementById('plannerForm') as HTMLFormElement;
  const stepsNav = document.getElementById('stepsNav')!;
  const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
  const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
  const resultsEl = document.getElementById('results')!;
  const plannerEl = document.getElementById('planner')!;
  const journeyWizard = document.getElementById('journeyWizard');
  const zipEl = document.getElementById('zip') as HTMLInputElement;
  const zipFb = document.getElementById('zipFeedback')!;
  const utilField = document.getElementById('utilField')!;
  const utilOpts = document.getElementById('utilOpts')!;
  const climField = document.getElementById('climField')!;
  const climPick = document.getElementById('climPick') as HTMLSelectElement;
  const climLabel = document.getElementById('climLabel')!;
  const billEl = document.getElementById('fuelBill') as HTMLInputElement;
  const billOut = document.getElementById('fuelOut')!;
  const elS = document.getElementById('elecS') as HTMLInputElement;
  const elSm = document.getElementById('elecSm') as HTMLSelectElement;
  const elW = document.getElementById('elecW') as HTMLInputElement;
  const elWm = document.getElementById('elecWm') as HTMLSelectElement;
  const elOut = document.getElementById('elecOut')!;
  const TOTAL = 6;
  let step = 1;
  let maxStep = 1;
  let billTouched = false;
  let monthsTouched = false;
  let zipTouched = false;

  const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const int = (n: number) => Math.round(n).toLocaleString('en-US');
  const money = (n: number) => '$' + (Math.round(n / 10) * 10).toLocaleString('en-US');
  const money5 = (n: number) => '$' + (Math.round(n / 5) * 5).toLocaleString('en-US');
  const dollars2 = (n: number) => '$' + n.toFixed(2);
  const cents = (n: number) => n.toFixed(1) + '¢';
  const mmbtu = (gj: number) => gj / GJ_PER_MMBTU;
  const fahrenheit = (c: number) => c * 1.8 + 32;
  const roundTo = (n: number, s: number) => Math.round(n / s) * s;
  const kwhTxt = (k: number) => `${int(roundTo(k, k >= 1000 ? 100 : 10))} kWh`;
  const unitsTxt = (units: number, unit: string) => {
    if (!(units > 0)) return '';
    if (unit === 'kWh') return kwhTxt(units);
    const r = units >= 100 ? roundTo(units, 10) : Math.max(1, Math.round(units));
    return `${int(r)} ${r === 1 ? unit.replace(/s$/, '') : unit}`;
  };
  const ext = (href: string | null, text: string) => href ? `<a href="${esc(href)}" rel="noopener" target="_blank">${esc(text)}&nbsp;↗</a>` : esc(text);
  const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const lcfirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ------------------------------------------------------------------ location */

  interface Loc {
    zip5: string; zip3: string; state: string; st: StateRec;
    metro: string | null; near: string | null; nearMiles: number | null;
    clim: string | null; climKind: 'metro' | 'near' | 'standin' | 'none';
  }

  function parseZip(raw: string): { zip5: string; zip3: string } | null {
    const m = raw.trim().replace(/\s+/g, '').match(/^(\d{5})(?:-?\d{4})?$/);
    return m ? { zip5: m[1], zip3: m[1].slice(0, 3) } : null;
  }
  /** A Canadian postal code, like V6B 1A1. */
  const caPostal = (raw: string) => {
    const m = raw.trim().toUpperCase().match(/^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s?-?(\d[ABCEGHJ-NPRSTV-Z]\d)$/);
    return m ? `${m[1]} ${m[2]}` : null;
  };

  function locate(raw: string, override: string): { loc?: Loc; error?: 'empty' | 'format' | 'unknown' | 'canada'; zip5?: string; postal?: string } {
    if (!raw.trim()) return { error: 'empty' };
    const ca = caPostal(raw);
    if (ca) return { error: 'canada', postal: ca };
    const z = parseZip(raw);
    if (!z) return { error: 'format' };
    const row = (D.zip3 as Record<string, [string, string | null, string | null, number | null]>)[z.zip3];
    if (!row || !D.states[row[0]]) return { error: 'unknown', zip5: z.zip5 };
    const [state, metro, near, nearMiles] = row;
    let clim: string | null = null;
    let climKind: Loc['climKind'] = 'none';
    if (metro) { clim = metro; climKind = 'metro'; }
    else if (override && D.metros[override]) { clim = override; climKind = 'standin'; }
    else if (near) { clim = near; climKind = 'near'; }
    return { loc: { ...z, state, st: D.states[state], metro, near, nearMiles, clim, climKind } };
  }

  const metroName = (slug: string | null) => (slug ? D.metros[slug]?.n ?? slug : '');
  /** state name for running prose ("DC" reads better than "District of Columbia" mid-sentence) */
  const sn = (st: StateRec) => (st.slug === 'district-of-columbia' ? 'DC' : st.n);
  const metroArea = (slug: string) => `the ${metroName(slug)} metro area`;
  const areaShort = (slug: string) => `the ${metroName(slug).replace(/\s+metro( area)?$/i, '')} area`;

  function climOptions(loc: Loc) {
    const sorted = Object.entries(D.metros).sort((a, b) => b[1].c.h - a[1].c.h);
    const first = loc.near
      ? `<option value="">Keep ${esc(metroName(loc.near))} (nearest we cover in ${esc(sn(loc.st))})</option>`
      : '<option value="">No stand-in: skip the dollar estimates</option>';
    return first + sorted.map(([slug, m]) =>
      `<option value="${slug}">${esc(m.n)}: ${int(m.c.h)} heating, ${int(m.c.k)} cooling degree days</option>`).join('');
  }

  function syncClimPicker(loc: Loc | undefined) {
    if (!loc || loc.metro) { climField.hidden = true; return; }
    const cur = climPick.value;
    climPick.innerHTML = climOptions(loc);
    climPick.value = D.metros[cur] ? cur : '';
    climLabel.textContent = loc.near
      ? `Different climate from ${metroName(loc.near)}? Use another metro’s numbers (optional)`
      : 'Climate stand-in for dollar estimates (optional)';
    climField.hidden = false;
  }

  /** "Who sends your electric bill?" where two or more utilities in the metro run their own programs. */
  let utilFor = '';
  function syncUtil(loc: Loc | undefined) {
    const metro = loc?.metro ? D.metros[loc.metro] : null;
    const key = metro && loc ? `${loc.metro}|${loc.state}` : '';
    if (!metro || !loc || !metro.u.ask[loc.state]) {
      utilField.hidden = true;
      utilFor = '';
      return;
    }
    if (utilFor === key) { utilField.hidden = false; return; }
    const cur = fieldVal('util');
    const list = metro.u.list.filter((u) => u.st.includes(loc.state));
    utilOpts.innerHTML = list.map((u) =>
      `<label class="radio-pill"><input type="radio" name="util" value="${esc(u.id)}" /><span>${esc(u.n)}</span></label>`).join('')
      + '<label class="radio-pill"><input type="radio" name="util" value="other" /><span>Another utility</span></label>'
      + '<label class="radio-pill"><input type="radio" name="util" value="unsure" /><span>Not sure</span></label>';
    const keep = utilOpts.querySelector<HTMLInputElement>(`input[value="${CSS.escape(cur)}"]`);
    if (keep) keep.checked = true;
    utilFor = key;
    utilField.hidden = false;
  }

  function zipFeedback(showErrors: boolean) {
    const r = locate(zipEl.value, climPick.value);
    syncClimPicker(r.loc);
    syncUtil(r.loc);
    zipFb.className = 'zip-feedback';
    if (r.error === 'empty') { zipFb.innerHTML = showErrors ? '<p class="field-error">Enter the home’s 5-digit ZIP code.</p>' : ''; return r; }
    if (r.error === 'canada') {
      zipFb.innerHTML = `<p class="zip-ca">That looks like a Canadian postal code. This planner covers US homes; <a href="/ca/plan/#postal=${encodeURIComponent(r.postal!)}">open the Canadian planner&nbsp;→</a> (we’ll carry your postal code over).</p>`;
      return r;
    }
    if (r.error === 'format') { zipFb.innerHTML = showErrors ? '<p class="field-error">Enter a 5-digit ZIP code, like 60614 or 60614-1234.</p>' : ''; return r; }
    if (r.error === 'unknown') {
      zipFb.innerHTML = `<p class="field-error">We couldn’t place ZIP code ${esc(r.zip5)}. The planner covers the 50 states and DC; if this is a PO box ZIP code, try the ZIP code of the home’s street address.</p>`;
      return r;
    }
    const loc = r.loc!;
    let line = '';
    if (loc.metro) line = `<b>${esc(loc.st.n)}</b>, in ${esc(metroArea(loc.metro))}.`;
    else if (loc.near) line = `<b>${esc(loc.st.n)}</b>, outside the 26 metro areas we cover. Climate numbers will come from ${esc(metroName(loc.near))}, the nearest one we cover in ${esc(sn(loc.st))} (about ${int(loc.nearMiles ?? 0)} miles away).`;
    else line = `<b>${esc(loc.st.n)}</b>. None of the 26 metro areas we cover is in ${esc(sn(loc.st))}, so there are no local climate numbers. Prices and programs still apply; for rough dollar estimates, pick a metro with a similar climate.`;
    zipFb.innerHTML = `<p class="zip-ok">${line}</p>`;
    return r;
  }

  zipEl.addEventListener('input', () => zipFeedback(zipTouched));
  zipEl.addEventListener('blur', () => { zipTouched = true; zipFeedback(true); });
  climPick.addEventListener('change', () => zipFeedback(zipTouched));

  /* ------------------------------------------------------------------ wizard */

  function fieldVal(name: string): string {
    const el = form.querySelector<HTMLInputElement>(`[name="${name}"]:checked, input[name="${name}"]:not([type=radio]):not([type=checkbox]), select[name="${name}"]`);
    return el?.value.trim() ?? '';
  }
  const multiVal = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]:checked`)].map((el) => el.value);
  /** The words on the pill the homeowner picked. */
  const pickedLabel = (name: string, value: string) =>
    form.querySelector<HTMLElement>(`[name="${name}"][value="${CSS.escape(value)}"] + span`)?.textContent?.trim() ?? value;

  function show(n: number) {
    step = n;
    maxStep = Math.max(maxStep, n);
    form.querySelectorAll<HTMLElement>('fieldset.step').forEach((f) => f.classList.toggle('on', f.dataset.step === String(n)));
    stepsNav.querySelectorAll<HTMLElement>('li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('on', s === n);
      li.classList.toggle('done', s < n || (s <= maxStep && s !== n));
      const b = li.querySelector('button');
      if (b) {
        b.disabled = s > maxStep;
        if (s === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      }
    });
    backBtn.hidden = n === 1;
    nextBtn.textContent = n === TOTAL ? 'See my plan' : 'Next';
    if (n === 1) zipFeedback(false);
    if (n === 2) eraHint();
    if (n === 4) syncSymptoms();
    if (n === 6) initBills();
    form.querySelectorAll('.step-error').forEach((e) => e.remove());
    const first = form.querySelector<HTMLElement>(`fieldset[data-step="${n}"] input:not([type=hidden])`);
    first?.focus({ preventScroll: true });
    if (plannerEl.getBoundingClientRect().top < 0) plannerEl.scrollIntoView({ block: 'start' });
  }

  function stepError(n: number, msg: string) {
    const fs = form.querySelector(`fieldset[data-step="${n}"] .field`)!;
    if (!fs.querySelector('.step-error')) {
      const err = document.createElement('p');
      err.className = 'field-error step-error';
      err.setAttribute('role', 'alert');
      err.textContent = msg;
      fs.appendChild(err);
    }
  }

  function validate(n: number): boolean {
    if (n === 1) {
      zipTouched = true;
      const r = zipFeedback(true);
      if (!r.loc) { zipEl.focus(); return false; }
    }
    if (n === 2 && !fieldVal('age')) {
      stepError(2, 'Pick the closest era; a rough guess still gives a useful plan.');
      return false;
    }
    return true;
  }

  nextBtn.addEventListener('click', () => {
    if (!validate(step)) return;
    if (step < TOTAL) show(step + 1);
    else finish();
  });
  backBtn.addEventListener('click', () => show(Math.max(1, step - 1)));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    nextBtn.click();
  });
  // completed step labels jump straight to that step (W18)
  stepsNav.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-goto]');
    if (!b || b.disabled) return;
    const n = Number(b.dataset.goto);
    if (n === step) return;
    for (let s = step; s < n; s++) if (!validate(s)) { if (s !== step) show(s); return; }
    show(n);
  });

  function eraHint() {
    const r = locate(zipEl.value, climPick.value);
    const el = document.getElementById('eraHint')!;
    const slug = r.loc?.metro;
    const m = slug ? D.metros[slug] : null;
    el.textContent = m && m.c.my && m.c.place
      ? `For reference, the median home in the city of ${m.c.place} was built in ${m.c.my} (Census Bureau, ${m.c.acs ?? 'American Community Survey'}).`
      : '';
  }

  const heatAgeField = document.getElementById('heatAgeField')!;
  function syncHeatAge() {
    heatAgeField.hidden = ['electric', 'elecfurnace', 'geothermal'].includes(fieldVal('heat'));
  }
  form.querySelectorAll('input[name="heat"]').forEach((el) => el.addEventListener('change', syncHeatAge));

  /** Step 4: the problems homes in this climate report most come first; the rest sit behind "More". */
  function syncSymptoms() {
    const main = document.getElementById('symMain')!;
    const more = document.getElementById('symMore')!;
    const wrap = document.getElementById('symMoreWrap') as HTMLDetailsElement;
    const intro = document.getElementById('symIntro')!;
    const r = locate(zipEl.value, climPick.value);
    const cm = r.loc?.clim ? D.metros[r.loc.clim] : null;
    const prof = profileOf(cm)?.sym ?? [];
    const pill = (v: string) => form.querySelector<HTMLElement>(`label[data-sym="${CSS.escape(v)}"]`);
    if (!prof.length) {
      SYMPTOMS.forEach((s) => { const p = pill(s.value); if (p) main.appendChild(p); });
      wrap.hidden = true;
      intro.textContent = 'Pick everything that applies; it tunes your plan.';
      return;
    }
    prof.forEach((v) => { const p = pill(v); if (p) main.appendChild(p); });
    const rest = SYMPTOMS.filter((s) => !prof.includes(s.value));
    rest.forEach((s) => { const p = pill(s.value); if (p) more.appendChild(p); });
    wrap.hidden = rest.length === 0;
    const sum = wrap.querySelector('summary');
    if (sum) sum.textContent = `More problems (${rest.length})`;
    if (more.querySelector('input:checked')) wrap.open = true;
    const where = r.loc!.climKind === 'metro' ? areaShort(r.loc!.clim!) : `places with a climate like ${metroName(r.loc!.clim)}’s`;
    intro.textContent = `Pick everything that applies; it tunes your plan. First: the problems homes in ${where} report most.`;
  }

  /* ------------------------------------------------------------------ the house */

  interface HeatInfo { sys: SystemKey; label: string; short: string; fuel: 'gas' | 'elec' | 'oil' | 'propane' }
  function heatInfo(heat: string, hage: string, age: string): HeatInfo {
    const newer = hage === 'new' || (hage === 'unsure' && ['1996-2010', '2011-plus'].includes(age));
    switch (heat) {
      case 'gasboiler': return { sys: newer ? 'gasBoilerCondensing' : 'gasBoilerMid', label: 'a natural gas boiler', short: 'natural gas boiler', fuel: 'gas' };
      case 'electric': return { sys: 'electricResistance', label: 'electric baseboards', short: 'electric baseboards', fuel: 'elec' };
      case 'elecfurnace': return { sys: 'electricResistance', label: 'an electric furnace or boiler', short: 'electric furnace or boiler', fuel: 'elec' };
      case 'heatpump': return { sys: hage === 'old' ? 'ashpStandard' : 'ashpCold', label: 'an air-source heat pump', short: 'air-source heat pump', fuel: 'elec' };
      case 'geothermal': return { sys: 'gshp', label: 'a geothermal heat pump', short: 'geothermal heat pump', fuel: 'elec' };
      case 'oil': return { sys: hage === 'new' ? 'oilFurnaceNew' : hage === 'old' ? 'oilFurnaceOld' : 'oilFurnaceMid', label: 'heating oil', short: 'oil furnace or boiler', fuel: 'oil' };
      case 'propane': return { sys: newer ? 'propaneFurnaceCond' : 'propaneFurnaceStd', label: 'propane', short: 'propane furnace or boiler', fuel: 'propane' };
      default: return { sys: newer ? 'gasFurnaceHigh' : 'gasFurnaceMid', label: 'a natural gas furnace', short: 'natural gas furnace', fuel: 'gas' };
    }
  }

  function whKey(wh: string, hi: HeatInfo): UsWaterHeater | 'boiler' {
    switch (wh) {
      case 'gastank': return 'gasTank';
      case 'gastankless': return 'gasTankless';
      case 'electric': return 'electricTank';
      case 'heatpump': return 'heatPump';
      case 'oil': return 'oilTank';
      case 'propane': return 'propaneTank';
      case 'boiler': return 'boiler';
    }
    if (hi.fuel === 'gas') return 'gasTank';
    if (hi.fuel === 'oil') return 'oilTank';
    if (hi.fuel === 'propane') return 'propaneTank';
    return 'electricTank';
  }
  const WH_NAME: Record<string, string> = {
    gasTank: 'gas tank', gasTankless: 'gas tankless', electricTank: 'electric tank', heatPump: 'heat pump water heater',
    oilTank: 'oil-fired tank', propaneTank: 'propane tank', boiler: 'combi boiler', gasCondensing: 'condensing gas tank',
  };

  function winKey(win: string, age: Vintage): WindowKey {
    const M: Record<string, WindowKey> = { single: 'single', singlestorm: 'singleStorm', 'double-old': 'doubleClear', 'double-new': 'doubleLowE', triple: 'energyStar' };
    return M[win] ?? (MODEL.envelope.windowByVintage as Record<string, WindowKey>)[age] ?? 'doubleClear';
  }

  interface Answers {
    zip: string; util: string; age: Vintage; htype: string; size: string; found: string; water: string; win: string; prev: string;
    heat: string; hage: string; sec: string[]; wh: string; ac: string; syms: string[]; goals: string[]; clim: string;
  }
  function readAnswers(): Answers {
    return {
      zip: fieldVal('zip'),
      util: utilField.hidden ? '' : fieldVal('util'),
      age: (fieldVal('age') || '1966-1980') as Vintage,
      htype: fieldVal('htype') || 'detached',
      size: fieldVal('size') || 'medium',
      found: fieldVal('found') || 'unsure',
      water: fieldVal('water') || 'municipal',
      win: fieldVal('win') || 'unsure',
      prev: fieldVal('prev') || 'no',
      heat: fieldVal('heat') || 'gas',
      hage: fieldVal('hage') || 'unsure',
      sec: multiVal('sec'),
      wh: fieldVal('wh') || 'unsure',
      ac: fieldVal('ac') || 'unsure',
      syms: multiVal('sym'),
      goals: multiVal('goal'),
      clim: climPick.value,
    };
  }

  interface PriceInfo { p: UsPrices; national: { gas: boolean; oil: boolean; propane: boolean } }
  function pricesFor(st: StateRec): PriceInfo {
    const N = D.national;
    return {
      p: { electricity: st.p.e / 100, gas: st.p.g ?? N.gasPerTherm, oil: st.p.o ?? N.oilPerGal, propane: st.p.pr ?? N.propanePerGal },
      national: { gas: st.p.g == null, oil: st.p.o == null, propane: st.p.pr == null },
    };
  }

  const NO_CAL: UsCalibration = { calibrated: false, factor: 1, raw: null, clamped: false, actualDemandGJ: null, share: null };

  function climateFor(slug: string | null): UsClimate | null {
    const m = slug ? D.metros[slug] : null;
    return m ? { slug: slug!, hdd65: m.c.h, cdd65: m.c.k, zone: m.c.z } : null;
  }

  interface Cool {
    ci: CoolingInput; base: CoolingBaseline; measures: Partial<Record<CoolMeasureKey, CoolPct>>;
    /** yearly AC kWh after any bill calibration */
    kwh: number; factor: number; raw: number | null; clamped: boolean;
    res: BillResult | null; price: number;
  }
  interface ElecBills { s: number; sm: number; w: number; wm: number }

  interface Ctx {
    a: Answers; loc: Loc; hi: HeatInfo; wk: UsWaterHeater | 'boiler'; prices: PriceInfo; clim: UsClimate | null;
    m: HouseModel | null; cal: UsCalibration; input: HouseInput; bill: number | null;
    metro: MetroRec | null; cm: MetroRec | null; needs: Needs | null; prof: Profile | null; cls: ClimClass | null;
    coolDom: boolean; hot: boolean; ducted: boolean; util: string;
    cool: Cool | null; eb: ElecBills | null;
  }

  function elecBills(): ElecBills | null {
    const s = parseFloat(elS.value), w = parseFloat(elW.value);
    if (!(s > 0) || !(w > 0)) return null;
    return { s, sm: Number(elSm.value), w, wm: Number(elWm.value) };
  }

  const DUCTED_HEAT = ['gas', 'elecfurnace', 'heatpump', 'geothermal', 'propane', 'oil'];

  function context(): Ctx | null {
    const a = readAnswers();
    const r = locate(a.zip, a.clim);
    if (!r.loc) return null;
    const loc = r.loc;
    const hi = heatInfo(a.heat, a.hage, a.age);
    const wk = whKey(a.wh, hi);
    const prices = pricesFor(loc.st);
    const clim = climateFor(loc.clim);
    const input: HouseInput = { age: a.age, htype: a.htype, size: a.size as HouseInput['size'], found: a.found, sys: hi.sys, wh: wk };
    const m = clim ? houseModel(input, clim, prices.p) : null;
    const bill = billTouched && hi.fuel !== 'elec' && m ? parseFloat(billEl.value) || null : null;
    let cal: UsCalibration = m && bill ? calibrateFuelBill(m, hi.sys, bill) : NO_CAL;
    const metro = loc.metro ? D.metros[loc.metro] : null;
    const cm = loc.clim ? D.metros[loc.clim] : null;
    const needs = cm?.needs ?? null;
    const prof = profileOf(cm);
    const kind = acKind(a.ac, a.heat);
    const ducted = a.htype !== 'condo' && (kind === 'central' || kind === 'heatpump' || DUCTED_HEAT.includes(a.heat));
    const eb = elecBills();
    let cool: Cool | null = null;
    if (clim && m && prices.p.electricity) {
      const ci: CoolingInput = {
        metro: loc.clim!, zone: clim.zone, cdd65: clim.cdd65, size: a.size, age: a.age, htype: a.htype,
        ac: a.ac, heat: a.heat, hage: a.hage, south: loc.st.so,
      };
      const base = coolingBaseline(ci, CD);
      const measures = coolingMeasures({
        ...ci, found: a.found, storeys: m.storeys,
        atticBefore: (MODEL.envelope.atticRByVintage as Record<string, number>)[a.age],
        atticTarget: atticTargetR(clim.zone, D.insulation.attic),
        win: winKey(a.win, a.age),
      }, CD);
      let res: BillResult | null = null;
      let factor = 1, raw: number | null = null, clamped = false;
      if (eb && CD.months[loc.clim!]) {
        res = billSplit({
          metro: loc.clim!, summer: { amt: eb.s, month: eb.sm }, winter: { amt: eb.w, month: eb.wm }, price: prices.p.electricity,
          elecHeat: hi.fuel === 'elec', heatKwh: hi.fuel === 'elec' ? m.heat.units : undefined, hddAnnual: clim.hdd65, coolKwh: base.kwh,
        }, CD);
        if (res.ok && res.mode === 'cooling' && base.kwh > 0 && res.coolKwh) {
          raw = res.coolKwh / base.kwh;
          const f = clampFactor(raw);
          factor = f.factor;
          clamped = f.clamped;
        }
        if (res.ok && res.mode === 'heating' && hi.fuel === 'elec') cal = calibrateElectricHeat(m, res.heatKwh);
      }
      cool = { ci, base, measures, kwh: base.kwh * factor, factor, raw, clamped, res, price: prices.p.electricity };
    }
    return {
      a, loc, hi, wk, prices, clim, m, cal, input, bill, metro, cm, needs, prof, cls: prof?.cls ?? null,
      coolDom: !!clim && clim.cdd65 > clim.hdd65, hot: !!clim && hotZone(clim.zone), ducted,
      util: a.util, cool, eb,
    };
  }

  /* ------------------------------------------------------------------ bills step */

  const FUEL_BILL_LABEL: Record<string, string> = {
    gas: 'Average monthly natural gas bill',
    oil: 'Average monthly heating oil spend',
    propane: 'Average monthly propane spend',
  };
  function fmtBill() { billOut.textContent = billEl.value === '0' ? '$0' : `$${billEl.value}/mo`; }
  billEl.addEventListener('input', () => { billTouched = true; fmtBill(); });
  [elSm, elWm].forEach((s) => s.addEventListener('change', () => { monthsTouched = true; elecPreview(); }));
  [elS, elW].forEach((s) => s.addEventListener('input', elecPreview));

  /** Live check of the two electric bills, so a typo shows before the plan does. */
  function elecPreview() {
    const c = context();
    if (!c || !c.cool) { elOut.textContent = ''; return; }
    const r = c.cool.res;
    if (!c.eb) { elOut.textContent = ''; elOut.className = 'elec-out'; return; }
    if (!r || !r.ok) {
      elOut.className = 'elec-out warn';
      elOut.textContent = `We can’t split these two bills yet: ${r?.reason ?? 'pick the months they cover'}.`;
      return;
    }
    elOut.className = 'elec-out ok';
    elOut.textContent = r.mode === 'heating'
      ? `Your bills point to about ${kwhTxt(r.heatKwh ?? 0)} a year of heating.`
      : `Your bills point to about ${kwhTxt(r.coolKwh ?? 0)} (${money(r.coolCost ?? 0)}) a year of air conditioning.`;
  }

  function initBills() {
    const c = context();
    const fuelBox = document.getElementById('billFuel')!;
    const elecBox = document.getElementById('billElec')!;
    const noClim = document.getElementById('billNoClim')!;
    const title = document.getElementById('billTitle')!;
    if (!c) return;
    const electric = c.hi.fuel === 'elec';
    const hasAc = acKind(c.a.ac, c.a.heat) !== 'none';
    const showElec = !!c.m && !!c.loc.clim && !!CD.months[c.loc.clim] && (electric || hasAc);
    fuelBox.hidden = electric || !c.m;
    noClim.hidden = !!c.m;
    elecBox.hidden = !showElec;
    title.textContent = electric ? 'Add your electric bills for dollar estimates' : 'Add your bills for dollar estimates';
    if (showElec) {
      if (!monthsTouched) {
        const dm = defaultMonths(c.loc.clim!, CD);
        elSm.value = String(dm.summer);
        elWm.value = String(dm.winter);
      }
      document.getElementById('elecLead')!.textContent = electric
        ? `Your electric bill pays for heating as well as air conditioning, so a summer and a winter bill let us separate the two. Enter what each bill came to and the month it mostly covers.`
        : `Optional: a summer and a winter electric bill let us size your air conditioning from your own use. Enter what each bill came to and the month it mostly covers.`;
      elecPreview();
    }
    if (electric || !c.m) return;
    document.getElementById('fuelBillLabel')!.textContent = FUEL_BILL_LABEL[c.hi.fuel];
    const typical = typicalFuelBill(c.m) ?? 0;
    const max = Math.max(300, Math.ceil((typical * 2.5) / 50) * 50);
    billEl.max = String(max);
    if (!billTouched) billEl.value = String(Math.max(0, Math.round(typical / 5) * 5));
    else if (Number(billEl.value) > max) billEl.max = String(Math.ceil(Number(billEl.value) / 50) * 50);
    fmtBill();
    const where = c.loc.climKind === 'metro' ? `in ${metroArea(c.loc.clim!)}` : `using ${metroName(c.loc.clim)}’s climate`;
    document.getElementById('fuelHint')!.textContent = c.hi.fuel === 'gas'
      ? `Pre-set to a typical similar home ${where} at ${sn(c.loc.st)} prices; drag to match your bill.`
      : `Pre-set to a typical similar home ${where}; your yearly ${c.hi.fuel === 'oil' ? 'oil' : 'propane'} spend ÷ 12.`;
  }

  /* ------------------------------------------------------------------ savings: heating plus cooling */

  /** Which cooling measure each upgrade card carries. */
  const COOL_KEY: Record<string, CoolMeasureKey> = {
    'attic-insulation': 'attic-insulation', 'air-sealing': 'air-sealing', 'duct-sealing': 'duct-sealing', 'attic-heat': 'attic-heat',
    'window-film': 'window-film', 'windows-doors': 'windows-doors', controls: 'setpoint', 'heat-pump': 'ac-upgrade',
  };
  const MONEY_CATS = ['air-sealing', 'attic-insulation', 'wall-insulation', 'basement-insulation', 'windows-doors', 'heat-pump', 'water-heating', 'controls', 'duct-sealing', 'attic-heat', 'window-film'];

  interface Saving {
    h: number | null; hUnits: number | null; hUnit: string; hNote?: string;
    cool: { lo: number; typ: number; hi: number; kwh: number; note?: string } | null;
    total: number; lo: number; hi: number; known: boolean;
  }
  function saving(cat: string, c: Ctx): Saving {
    const s = c.m && c.clim ? itemSaving(cat, c.input, c.m, c.clim, c.prices.p, c.cal.factor, D.insulation.attic, winKey(c.a.win, c.a.age)) : null;
    const key = COOL_KEY[cat];
    const p = key && c.cool ? c.cool.measures[key] : undefined;
    const cool = p && c.cool && c.cool.kwh > 0
      ? { lo: c.cool.kwh * p.lo * c.cool.price, typ: c.cool.kwh * p.typ * c.cool.price, hi: c.cool.kwh * p.hi * c.cool.price, kwh: c.cool.kwh * p.typ, note: p.note }
      : null;
    const h = s?.dollars ?? null;
    const hh = h ?? 0;
    const total = hh + (cool?.typ ?? 0);
    const lo = (hh >= 0 ? hh * 0.75 : hh * 1.25) + (cool?.lo ?? 0);
    const hi = (hh >= 0 ? hh * 1.25 : hh * 0.75) + (cool?.hi ?? 0);
    return { h, hUnits: s?.units ?? null, hUnit: s?.unit ?? '', hNote: s?.note, cool, total, lo, hi, known: h !== null || !!cool };
  }

  /* ------------------------------------------------------------------ programs: state side and utility */

  const utilRec = (id: string, c: Ctx) => c.metro?.u.list.find((u) => u.id === id) ?? null;
  const utilName = (id: string, c: Ctx) => utilRec(id, c)?.n.replace(/\s*\(.*$/, '') ?? id;

  /**
   * A program or rebate applies to this home's side of the metro and its electric utility. A
   * program tied only to utilities that also sell gas here stays in: their gas customers qualify
   * whatever company sends the electric bill.
   */
  function applies(x: { st: string[]; ut: string[] }, c: Ctx): boolean {
    if (x.st.length && !x.st.includes(c.loc.state)) return false;
    if (!x.ut.length || !c.util || c.util === 'unsure') return true;
    if (x.ut.includes(c.util)) return true;
    return x.ut.every((id) => utilRec(id, c)?.gas);
  }
  /** "For SRP customers" on a program tied to some of the utilities here, unless it's the homeowner's own. */
  function forWhom(x: { ut: string[] }, c: Ctx): string {
    if (!x.ut.length || !c.metro || (c.util && x.ut.includes(c.util))) return '';
    const side = c.metro.u.list.filter((u) => u.st.includes(c.loc.state) && u.runs > 0);
    if (side.length < 2 || x.ut.length >= side.length) return '';
    const names = x.ut.map((id) => `${utilName(id, c)}${utilRec(id, c)?.gas ? ' electric or gas' : ''}`);
    return `For ${names.join(' or ')} customers`;
  }
  /** A rebate limited to one heating fuel fits this home's heating. */
  const fuelOk = (r: Rebate, c: Ctx) => {
    const h = c.a.heat;
    if (!r.fu) return true;
    if (r.fu === 'oil') return h === 'oil';
    if (r.fu === 'elec') return h === 'electric' || h === 'elecfurnace';
    if (r.fu === 'gas') return h === 'gas' || h === 'gasboiler';
    return ['gas', 'gasboiler', 'oil', 'propane'].includes(h);
  };
  const openAudits = (c: Ctx) => (c.metro ? c.metro.a.filter((x) => x.open && applies(x, c)) : []);
  const openRebates = (c: Ctx) => (c.metro ? c.metro.rb.filter((x) => x.open && applies(x, c)) : []);
  /** rebates whose program page states no status: shown as unconfirmed, never counted as open */
  const unconfirmedRebates = (c: Ctx) => (c.metro ? c.metro.rb.filter((x) => !x.open && applies(x, c)) : []);

  /**
   * The first stop: the best open assessment for this home (in person, free, open to all incomes
   * first). Where programs depend on the utility and the homeowner hasn't said which one they have,
   * the choice is per utility, with independent auditors for everyone else.
   */
  function firstStop(c: Ctx): { audit: Audit | null; pick: boolean; perUtil: { u: string; a: Audit }[]; others: string[] } {
    const list = openAudits(c).filter((x) => !x.f.ol).sort((x, y) => y.sc - x.sc);
    const best = list.find((x) => !x.f.iq) ?? null;
    const asking = !!c.metro?.u.ask[c.loc.state] && (!c.util || c.util === 'unsure');
    if (asking && best && best.ut.length) {
      const perUtil: { u: string; a: Audit }[] = [];
      const others: string[] = [];
      for (const u of c.metro!.u.list.filter((x) => x.st.includes(c.loc.state))) {
        const a = list.find((x) => !x.f.iq && x.ut.includes(u.id));
        const name = u.n.replace(/\s*\(.*$/, '');
        if (a) perUtil.push({ u: u.gas ? `${name} electric or gas` : name, a });
        else others.push(name);
      }
      if (perUtil.length) return { audit: null, pick: true, perUtil, others };
    }
    return { audit: best, pick: false, perUtil: [], others: [] };
  }
  const othersLine = (others: string[], perUtil: { u: string }[]) =>
    `<li><b>${perUtil.some((x) => /electric or gas$/.test(x.u)) || !others.length ? 'Everyone else' : `${esc(others.join(', '))} and other customers`}:</b> book a certified auditor directly; <a href="/us/find/">our guide to finding an auditor</a> shows how.</li>`;

  /* ------------------------------------------------------------------ results */

  let lastSeq: SeqItem[] = [];
  let bookHref = '/us/find/';

  function finish() {
    const c = context();
    if (!c) { show(1); validate(1); return; }
    const { a, loc } = c;
    const era = ERAS[a.age];

    $('#rTitle').textContent = `Your plan for ${era.title}`;
    const where = loc.metro ? `${metroName(loc.metro)} metro area, ${loc.st.n}` : loc.st.n;
    $('#rSub').textContent = [
      era.years,
      a.htype === 'condo' ? 'condo or apartment' : a.htype === 'semi' ? 'townhouse, rowhouse or duplex' : 'detached house',
      `heated by ${c.hi.label}`,
      `${where} (ZIP ${loc.zip5})`,
    ].join(' · ');

    const seq = sequenceFor(c);
    lastSeq = seq;
    const energy = a.htype === 'condo' ? [] : energyTests(testInput(c), D.tests);
    renderNext(c, seq, energy);
    renderNeeds(c);
    renderConcerns(c);
    renderBenchmark(c);
    renderSequence(c, seq);
    renderWatch(c);
    renderTests(c, energy);
    renderPrograms(c);
    renderFind(c);
    renderCompare(c);
    renderSystems(c);
    renderNumbers(c);
    renderResources(c);
    prefillLead(c, seq);
    wireCopyTests([...energy, ...specialtyTests(testInput(c), D.tests)].map((t) => t.name));

    plannerEl.hidden = true;
    if (journeyWizard) journeyWizard.hidden = true;
    resultsEl.hidden = false;
    writeHash(c);
    glossLink();
    const t = $('#rTitle');
    t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
    resultsEl.scrollIntoView({ block: 'start' });
  }

  function testInput(c: Ctx): TestInput {
    const a = c.a;
    const metro = c.loc.metro ? D.metros[c.loc.metro] : null;
    return {
      age: a.age, heat: a.heat, wh: a.wh, sec: a.sec, water: a.water, syms: a.syms, goals: a.goals, ac: a.ac,
      state: c.loc.state, stateName: c.loc.st.n, zone: c.clim?.zone ?? null,
      radonZone: metro?.c.r ?? null, radonCounty: metro?.c.co ?? null,
      found: a.found, cls: c.cls, coolDom: c.coolDom,
    };
  }

  function sequenceFor(c: Ctx): SeqItem[] {
    const a = c.a;
    if (a.htype === 'condo') return [];
    const money: Record<string, number> = {};
    if (c.m) for (const cat of MONEY_CATS) { const s = saving(cat, c); if (s.known) money[cat] = s.total; }
    return buildSequence({
      age: a.age, heat: a.heat, wh: a.wh, win: a.win, found: a.found, syms: a.syms, goals: a.goals, htype: a.htype, ac: a.ac, hage: a.hage,
      clim: { cls: c.cls, coolDom: c.coolDom, hot: c.hot, ducted: c.ducted },
      money: c.m ? money : undefined,
    });
  }

  /** Climate source, in words. */
  function climSource(c: Ctx): string {
    const loc = c.loc;
    if (!loc.clim) return '';
    const m = D.metros[loc.clim];
    const stn = m.c.stn ? ` at ${esc(m.c.stn)}` : '';
    if (loc.climKind === 'metro') return `NOAA 1991–2020 normals${stn}, in your metro area`;
    if (loc.climKind === 'near') return `NOAA 1991–2020 normals${stn}, borrowed from ${esc(m.n)}, the nearest metro area we cover in ${esc(sn(loc.st))} (about ${int(loc.nearMiles ?? 0)} miles away)`;
    return `NOAA 1991–2020 normals${stn}; you picked ${esc(m.n)} as a climate stand-in`;
  }
  const climWords = (c: Ctx) => (c.loc.climKind === 'metro' ? 'your area’s climate' : `${esc(metroName(c.loc.clim))}’s climate`);

  function climPickerHtml(c: Ctx, id: string) {
    const loc = c.loc;
    if (loc.metro) return '';
    const label = loc.near ? `Different climate from ${esc(metroName(loc.near))}? Use another metro’s numbers` : 'Pick a climate stand-in for rough dollar estimates';
    return `<div class="clim-inline"><label for="${id}">${label}</label><select id="${id}" data-clim-pick>${climOptions(loc)}</select></div>`;
  }

  function wireClimPickers(c: Ctx) {
    document.querySelectorAll<HTMLSelectElement>('[data-clim-pick]').forEach((sel) => {
      sel.value = c.a.clim && D.metros[c.a.clim] ? c.a.clim : '';
      sel.addEventListener('change', () => {
        climPick.value = sel.value;
        zipFeedback(false);
        finish();
      });
    });
  }

  /* ---------------------------------------------------------------- 1. your next 3 steps */

  function renderNext(c: Ctx, seq: SeqItem[], energy: TestPick[]) {
    const el = $('#rNext');
    const fs = firstStop(c);
    let book = '';
    let cta = '';
    if (fs.pick) {
      book = `<p>Programs here depend on who sends your electric bill; book the one for your utility:</p>
        <ul class="next-opts">${fs.perUtil.map((x) => `<li><b>${esc(x.u)} customers:</b> ${ext(x.a.url, x.a.n)}${x.a.cost ? ` <span class="small">(${esc(x.a.cost)})</span>` : ''}</li>`).join('')}${othersLine(fs.others, fs.perUtil)}</ul>`;
      bookHref = '#rFind';
      cta = `<a class="btn btn-primary" href="#rFind" data-book>Book my audit</a>`;
    } else if (fs.audit) {
      const x = fs.audit;
      book = `<p><b>${esc(x.n)}</b>${x.by ? `, run by ${esc(x.by.replace(/\s*\(.*$/, ''))}` : ''}.${x.cost ? ` <span class="small">Cost: ${esc(x.cost)}</span>` : ''}</p>
        ${x.how ? `<p class="small">${esc(x.how)}</p>` : ''}${forWhom(x, c) ? `<p class="small"><b>${esc(forWhom(x, c))}.</b></p>` : ''}`;
      // booked by phone (or the link is an information page, not a booking form): the button calls
      const phone = x.how?.match(/\(?\b(\d{3})\)?[-.\s](\d{3})-(\d{4})\b/);
      if (phone && (x.ul || /^call\b/i.test(x.how ?? ''))) {
        bookHref = `tel:+1${phone[1]}${phone[2]}${phone[3]}`;
        cta = `<a class="btn btn-primary" href="${bookHref}" data-book>Book my audit: call ${phone[1]}-${phone[2]}-${phone[3]}</a>${x.url ? ` <span class="small">${ext(x.url, x.ul ?? 'The program page')}</span>` : ''}`;
      } else {
        bookHref = x.url ?? '/us/find/';
        cta = x.url ? `<a class="btn btn-primary" href="${esc(x.url)}" rel="noopener" target="_blank" data-book>Book my audit&nbsp;↗</a>` : '';
      }
    } else {
      const iqOnly = openAudits(c).some((x) => x.f.iq);
      const lead = !c.metro
        ? 'Outside the 26 metro areas we track,'
        : c.util && !['unsure', 'other'].includes(c.util)
          ? `None of the assessment programs we track in ${esc(areaShort(c.loc.metro!))} serves ${esc(utilName(c.util, c))} customers right now${iqOnly ? ' except income-qualified ones (see “If money is tight” below)' : ''}, so`
          : iqOnly
            ? `The open assessment programs we track in ${esc(areaShort(c.loc.metro!))} are for income-qualified households (see “If money is tight” below). Otherwise,`
            : `None of the assessment programs we track in ${esc(areaShort(c.loc.metro!))} is taking sign-ups right now, so`;
      book = `<p>${lead} book a certified auditor directly. Ask your electric and gas utilities first: many pay for part of an audit.</p>`;
      bookHref = '/us/find/';
      cta = `<a class="btn btn-primary" href="/us/find/" data-book>Book my audit</a>`;
    }
    const top = energy.slice(0, 3);
    const tests = top.length
      ? `<p>${top.map((t) => `<a href="/us/tests/${t.slug}/">${esc(t.name)}</a>`).join(', ')}${energy.length > 3 ? `, plus ${energy.length - 3} more below` : ''}.</p>
        <p class="small">Ask for them by name when you book, and ask whether the visit includes them. <button type="button" class="linkish" data-copy-tests>Copy my test checklist</button></p>`
      : '<p>In a condo or apartment, ask the association about a building-level audit; the health checks below still apply to your unit.</p>';
    const reb = nextRebates(c, seq);
    const rebates = reb.length
      ? `<ul class="next-opts">${reb.map((r) => `<li>${ext(r.url, r.n)}${r.amt ? `: <span class="small">${esc(r.amt)}</span>` : ''}${forWhom(r, c) ? ` <span class="small">(${esc(forWhom(r, c))})</span>` : ''}</li>`).join('')}</ul>
        <p class="small">Most rebates need the work done by an approved contractor, and some need the audit first: check before you sign.</p>`
      : herLine(c);
    el.innerHTML = `
      <div class="card next-card">
        <h3>Your next 3 steps</h3>
        <ol class="next-steps">
          <li><h4>Book your home energy audit</h4>${book}${cta ? `<p class="next-cta">${cta}</p>` : ''}</li>
          <li><h4>Ask for these tests</h4>${tests}</li>
          <li><h4>Line up the rebates for after the audit</h4>${rebates}</li>
        </ol>
        <p class="small next-foot">This plan is a pre-audit estimate from your answers and typical homes. The audit measures your house and turns these ranges into numbers you can act on.</p>
      </div>`;
    const sticky = document.getElementById('stickyBookBtn') as HTMLAnchorElement | null;
    if (sticky) {
      sticky.href = bookHref;
      if (/^https?:/.test(bookHref)) { sticky.target = '_blank'; sticky.rel = 'noopener'; sticky.innerHTML = 'Book my audit&nbsp;↗'; }
      else { sticky.removeAttribute('target'); sticky.textContent = /^tel:/.test(bookHref) ? 'Call to book my audit' : 'Book my audit'; }
    }
  }

  /** Open rebates that pay for the plan's top upgrades (not income-qualified ones; those are under "If money is tight"). */
  function nextRebates(c: Ctx, seq: SeqItem[]): Rebate[] {
    const all = openRebates(c).filter((r) => !r.iq && r.cat !== 'financing' && fuelOk(r, c));
    const out: Rebate[] = [];
    for (const item of seq.slice(0, 4)) {
      for (const r of all) if (r.keys.includes(item.category) && !out.includes(r)) { out.push(r); break; }
      if (out.length >= 3) break;
    }
    return out;
  }

  function herLine(c: Ctx): string {
    const her = c.loc.st.her;
    if (her?.taking) return `<p>${esc(her.lede)} <a href="/us/programs/states/${c.loc.st.slug}/">${esc(sn(c.loc.st))} rebates and how to apply →</a></p>`;
    return `<p>We found no open rebate for your top upgrades in the programs we track. <a href="/us/programs/states/${c.loc.st.slug}/">${esc(sn(c.loc.st))} rebates and programs →</a>${D.rebateFinderUrl ? ` ENERGY STAR’s ${ext(D.rebateFinderUrl, 'Rebate Finder')} searches utility offers by ZIP code.` : ''}</p>`;
  }

  /* ---------------------------------------------------------------- 2. what homes here need */

  function renderNeeds(c: Ctx) {
    const el = $('#rNeeds');
    const n = c.needs;
    const p = c.prof;
    if (!n || !p || !c.cm) { el.innerHTML = ''; return; }
    const here = c.loc.climKind === 'metro';
    const title = here ? `What homes in ${esc(areaShort(c.loc.clim!))} need` : `What homes in a climate like ${esc(metroName(c.loc.clim))}’s need`;
    el.innerHTML = `
      <div class="rsec needs">
        <h3>${title}</h3>
        <p class="needs-one"><b>${esc(p.one)}</b> ${esc(c.cm.meaning)}</p>
        ${!here ? `<p class="small">Your ZIP code is outside the metro areas we cover, so this is the climate profile of ${esc(metroName(c.loc.clim))}; check that it matches your area.</p>` : ''}
        <ol class="needs-pri">${p.pri.map((x) => `<li><b>${esc(x.t)}.</b> ${esc(x.w)}</li>`).join('')}</ol>
        ${n.hz.length ? `<p class="needs-h"><b>Plan for:</b></p><ul class="needs-hz">${n.hz.slice(0, 3).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        <p class="small"><b>When to book:</b> ${esc(p.season)}</p>
        ${here && n.note ? `<p class="small">${esc(n.note)}</p>` : ''}
        <p class="small links">${here ? `<a href="/us/cities/${c.loc.metro}/">The ${esc(metroName(c.loc.metro))} metro guide →</a> <a href="/us/heat-pumps/${c.loc.metro}/">Heat pumps in ${esc(areaShort(c.loc.metro!))} →</a>` : `<a href="/us/cities/${c.loc.clim}/">The ${esc(metroName(c.loc.clim))} metro guide →</a>`}</p>
      </div>`;
  }

  /* ---------------------------------------------------------------- 3. your concerns */

  const TEST_NAME: Record<string, string> = {
    'blower-door': 'Blower door test', 'thermal-imaging': 'Infrared (thermal) scan', 'duct-leakage': 'Duct leakage test',
    'combustion-safety': 'Combustion safety test', 'heat-loss-calc': 'Manual J load calculation', 'bill-analysis': '12-month bill analysis',
    'attic-inspection': 'Attic inspection', 'mold-iaq': 'Mold and humidity check', radon: 'Radon test', 'carbon-monoxide': 'Carbon monoxide check',
  };
  const testLink = (slug: string) => `<a href="/us/tests/${slug}/">${esc(TEST_NAME[slug] ?? slug.replace(/-/g, ' '))}</a>`;

  function renderConcerns(c: Ctx) {
    const el = $('#rConcerns');
    const list = c.a.syms.map((s) => ({ s, t: concernText(s, c.cls) })).filter((x) => x.t);
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="rsec">
        <h3>Your concerns</h3>
        <p class="sub">What usually causes each problem you picked${c.cls ? ' in this climate' : ''}, the test that confirms it, and the fixes from cheapest up.</p>
        <div class="concern-grid">${list.map(({ s, t }) => `
          <div class="concern card">
            <h4>${esc(t!.label)}</h4>
            <p class="small"><b>Likely causes:</b> ${esc(t!.cause)}</p>
            <p class="small"><b>${t!.tests.length > 1 ? 'Tests that confirm it' : 'The test that confirms it'}:</b> ${t!.tests.map(testLink).join(', ')}.</p>
            <p class="small"><b>Fixes, cheapest first:</b></p>
            <ol class="ladder">${t!.ladder.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
            <p class="small"><a href="/us/issues/${s}/">More on ${esc(lcfirst(t!.label))} →</a></p>
          </div>`).join('')}</div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 4. bills */

  function renderBenchmark(c: Ctx) {
    const el = $('#rBenchmark');
    const cards: string[] = [];
    const where = c.loc.climKind === 'metro' ? `in ${esc(metroArea(c.loc.clim!))}` : `with ${esc(metroName(c.loc.clim))}’s climate`;
    if (c.m && c.bill && c.cal.calibrated && c.a.htype !== 'condo' && c.hi.fuel !== 'elec') {
      const typical = typicalFuelBill(c.m);
      if (typical) {
        const fuelWord = c.hi.fuel === 'gas' ? 'natural gas' : c.hi.fuel === 'oil' ? 'heating oil' : 'propane';
        const user = c.bill * 12, typ = typical * 12;
        const delta = Math.round(((user - typ) / typ) * 100);
        let verdict = '', cls = 'bench-ok';
        if (delta > 25) { verdict = `You’re spending about <b class="bench-up">${delta}% more</b> on ${fuelWord} than our estimate for a similar home. Part of that can be how a household lives (more people, warmer settings), and part is the house itself; a blower door test and your bill history separate the two.`; cls = 'bench-up'; }
        else if (delta < -25) verdict = `You’re spending about <b class="bench-ok">${Math.abs(delta)}% less</b> than our estimate for a similar home, so the house may already have had upgrades. We’ve scaled the heating savings below down to match.`;
        else verdict = 'You’re within the typical range for a similar home. Targeted upgrades can still take a meaningful bite.';
        cards.push(`
          <div class="card bench-card">
            <h3>Your ${fuelWord} spending vs. a similar home</h3>
            <div class="figures">
              <div class="fig"><div class="n ${cls}">${money(user)}</div><div class="l">your yearly ${fuelWord} spend, from your bill</div></div>
              <div class="fig"><div class="n">${money(typ * 0.75)}–${money(typ * 1.25)}</div><div class="l">typical for a similar home ${where}, at ${esc(sn(c.loc.st))} prices</div></div>
            </div>
            <p class="small">${verdict}</p>
            <p class="meta">Our model: about ${int(mmbtu(c.m.demand))} million Btu of heat a year for a typical house like yours, plus hot water if it uses the same fuel. Your bill puts your heating at about ${int(mmbtu(c.cal.actualDemandGJ ?? 0))} million Btu, so heating savings below are scaled by ${c.cal.factor.toFixed(2)}${c.cal.clamped ? ' (capped)' : ''}.</p>
          </div>`);
      }
    }
    const cool = c.cool;
    if (c.eb && cool) {
      const r = cool.res;
      if (!r || !r.ok) {
        cards.push(`<div class="card bench-card warn"><h3>Your electric bills</h3><p class="small">We couldn’t use your two bills: ${esc(r?.reason ?? 'there are no monthly climate numbers for this area')}. The plan uses a typical similar home instead. A full year of bills gives a much better answer: ask your auditor, or export it from your utility (Green Button “Download My Data”).</p></div>`);
      } else if (r.mode === 'cooling') {
        const share = r.baseKwhPerDay ? (r.coolKwh ?? 0) / ((r.coolKwh ?? 0) + r.baseKwhPerDay * 365) : null;
        cards.push(`
          <div class="card bench-card">
            <h3>Your air conditioning, from your bills</h3>
            <div class="figures">
              <div class="fig"><div class="n">${kwhTxt(r.coolKwh ?? 0)}</div><div class="l">a year for air conditioning, about ${money(r.coolCost ?? 0)}${share ? `, roughly ${Math.round(share * 100)}% of your electricity` : ''}</div></div>
              <div class="fig"><div class="n">${kwhTxt(cool.base.kwh)}</div><div class="l">a typical similar home ${where} (likely ${kwhTxt(cool.base.lo)}–${kwhTxt(cool.base.hi)})</div></div>
            </div>
            <p class="small">${cool.factor > 1.15 ? 'Your AC works harder than a typical similar home’s: leaky ducts, attic heat, an aging unit or a cool setting can all do that, and the audit finds which.' : cool.factor < 0.85 ? 'Your AC uses less than a typical similar home’s, so the house may already be tighter or the setting warmer.' : 'That’s in the typical range for a similar home.'} We’ve scaled the cooling savings below by ${cool.factor.toFixed(2)}${cool.clamped ? ' (we cap the scaling between 0.5 and 1.6)' : ''}.</p>
            <p class="meta">How: the difference between your ${MONTHS[c.eb.sm]} and ${MONTHS[c.eb.wm]} bills, divided by the difference in those months’ normal cooling degree days, gives your AC cost per degree day; times the yearly degree days gives the year. A pool pump, an electric car or a summer guest skews a two-bill estimate.</p>
          </div>`);
      } else {
        cards.push(`
          <div class="card bench-card">
            <h3>Your electric heating, from your bills</h3>
            <div class="figures">
              <div class="fig"><div class="n">${kwhTxt(r.heatKwh ?? 0)}</div><div class="l">a year for heating, about ${money((r.heatKwh ?? 0) * cool.price)}</div></div>
              <div class="fig"><div class="n">${kwhTxt(c.m?.heat.units ?? 0)}</div><div class="l">our estimate for a typical similar home ${where}</div></div>
            </div>
            <p class="small">Heating savings below are scaled by ${c.cal.factor.toFixed(2)}${c.cal.clamped ? ' (capped between 0.5 and 1.6)' : ''}. Air conditioning uses the typical figure, because your winter bill carries the heating.</p>
            <p class="meta">How: we set aside your baseline use and the air conditioning a typical home here runs in each month, then the winter bill’s extra over the summer one, divided by the difference in heating degree days, gives your heating cost per degree day.</p>
          </div>`);
      }
    }
    el.innerHTML = cards.join('');
  }

  /* ---------------------------------------------------------------- 5. the upgrade sequence */

  const rText = (t: string) => t.replace(/\bR(\d+)/g, 'R-$1').replace(/[.\s]+$/, '');

  function savingHtml(cat: string, c: Ctx): string {
    if (!c.m || !c.clim) return '';
    if (['ventilation', 'solar', 'crawlspace', 'humidity', 'filtration'].includes(cat)) return '';
    const s = saving(cat, c);
    if (!s.known) return '';
    if (cat === 'heat-pump' && s.total < -15) {
      return `<span class="save-neg">costs about ${money(-s.total)}/yr more to run than your current ${s.cool ? 'heating and cooling' : 'heating'} at these prices</span>`;
    }
    if (s.total < 15) return '<span class="save-small">little or no bill saving for a house like yours</span>';
    const parts: string[] = [];
    if (s.h !== null && Math.abs(s.h) >= 5) parts.push(`${s.h < 0 ? 'heating costs ' + money(-s.h) + ' more' : 'heating ' + money(s.h)}`);
    if (s.cool && s.cool.typ >= 5) parts.push(`cooling ${money(s.cool.typ)}`);
    const split = parts.length > 1 ? `; ${parts.join(', ')}` : s.cool && s.cool.typ >= 5 && (s.h === null || Math.abs(s.h) < 5) ? '; all of it cooling' : '';
    return `about ${money(s.total)}/yr <span class="save-range">(likely ${money(Math.max(0, s.lo))}–${money(s.hi)}${split})</span>`;
  }

  function rebateChips(cat: string, c: Ctx): string {
    const fits = (r: Rebate) => r.keys.includes(cat) && !r.iq && r.cat !== 'financing' && fuelOk(r, c);
    const open = openRebates(c).filter(fits).slice(0, 2);
    // no open rebate for this upgrade: point to one whose status the program page doesn't state
    const maybe = open.length ? [] : unconfirmedRebates(c).filter(fits).slice(0, 1);
    const her = c.loc.st.her;
    const out = [
      ...open.map((r) => `<span class="rebate"><span class="chip chip-active">Rebate</span> ${ext(r.url, r.n)}${r.amt ? ` <span class="small">${esc(r.amt)}</span>` : ''}${forWhom(r, c) ? ` <span class="small">(${esc(forWhom(r, c))})</span>` : ''}</span>`),
      ...maybe.map((r) => `<span class="rebate"><span class="chip chip-neutral">Status not stated</span> ${ext(r.url, r.n)} <span class="small">(the program page gives no open or closed status: check before you count on it${forWhom(r, c) ? `; ${esc(lcfirst(forWhom(r, c)))}` : ''})</span></span>`),
    ];
    if (her) {
      const prog = ['heat-pump', 'water-heating'].includes(cat) ? her.heehr : ['air-sealing', 'attic-insulation', 'duct-sealing', 'wall-insulation'].includes(cat) ? her.homes : null;
      if (prog && ['open', 'limited'].includes(prog.chip.status) && !['Paused', 'Waitlist'].includes(prog.chip.label)) {
        out.push(`<span class="rebate"><span class="chip ${prog.chip.cls}">${esc(prog.chip.label)}</span> <a href="/us/programs/states/${c.loc.st.slug}/">${esc(sn(c.loc.st))}’s federal ${prog === her.heehr ? 'HEEHR' : 'HOMES'} rebates</a>${prog.name ? ` <span class="small">(${esc(prog.name.replace(/\s*\(.*$/, ''))}; income limits apply)</span>` : ' <span class="small">(income limits apply)</span>'}</span>`);
      }
    }
    return out.length ? `<div class="rebates">${out.join('')}</div>` : '';
  }

  function renderSequence(c: Ctx, seq: SeqItem[]) {
    const el = $('#rSequence');
    const a = c.a;
    if (a.htype === 'condo') {
      el.innerHTML = `
        <div class="rsec"><h3>Condos and apartments work differently</h3>
        <p class="sub">Most audits and rebates are built around houses and townhouses. In a condo or apartment, the building envelope and often the heating and cooling belong to the association. Your levers: sealing and weatherstripping inside your unit, window coverings${c.hot ? ' and shades on sunny windows' : ''}, a heat pump conversation with your board, and pushing the association toward a building-level audit.</p></div>`;
      return;
    }
    const m = c.m;
    const atticNote = () => {
      const z = zoneNumber(c.clim?.zone);
      return z && D.insulation.atticText[z] ? `ENERGY STAR’s retrofit table for climate zone ${esc(c.clim!.zone)}: ${esc(rText(D.insulation.atticText[z]))}.` : '';
    };
    const rows = seq.map((item, idx) => {
      let note = '';
      let extra = '';
      const group = item.later && !seq[idx - 1]?.later
        ? `<p class="seq-later">When the equipment ${seq.slice(idx).some((x) => x.category === 'windows-doors') ? 'or windows are' : 'is'} due</p>` : '';
      if (m && c.clim) {
        const s = saving(item.category, c);
        note = (c.coolDom ? s.cool?.note ?? s.hNote : s.hNote ?? s.cool?.note) ?? '';
        if (item.category === 'heat-pump' && s.total < 15 && s.total >= -15) {
          extra = c.coolDom
            ? ' At these prices the case is comfort, humidity control and a reliable replacement when the old unit fails.'
            : ' At these prices, the case for a heat pump is comfort and air conditioning more than the bill.';
        }
        if (item.category === 'heat-pump' && s.total < -15) {
          extra = ['gas', 'gasboiler'].includes(a.heat)
            ? ' With natural gas this cheap here, a heat pump is mostly a cooling and comfort upgrade; ask about a dual-fuel setup that keeps the furnace for the coldest days.'
            : ' At these prices it costs more to run, so the case is comfort, cooling and replacing aging equipment.';
        }
        if (item.category === 'duct-sealing') extra += ' The saving shown is cooling; sealed ducts also trim heating where they carry heat.';
        if (item.category === 'attic-heat' && c.cool?.measures['cool-roof']) {
          const cr = c.cool.measures['cool-roof']!;
          extra += ` When the roof is due, a cool (light, reflective) roof saves about ${money(c.cool.kwh * cr.typ * c.cool.price)}/yr more on its own.`;
        }
        if (item.category === 'attic-insulation' && c.hot && m.storeys > 1) extra += ' Figures assume two storeys; a one-storey house saves more.';
        if (item.category === 'water-heating' && c.cool && c.hot) {
          const k = c.cls === 'hot-dry' ? CD.hpwh.hotDry : c.cls === 'hot-humid' ? CD.hpwh.hotHumid : CD.hpwh.mixedHumid;
          extra += ` Inside the house (a utility room or closet) it also takes about ${int(roundTo(k, 10))} kWh a year off the AC, about ${money(k * c.cool.price)}; in a garage it cools and dries the garage instead.`;
        }
        if (item.category === 'humidity' && c.cool && c.cls === 'hot-humid') {
          const k = CD.m.dehumKwh;
          extra += ` If you already run a dehumidifier, it likely uses about ${int(roundTo(k, 10))} kWh a year here (${money(k * c.cool.price)}); an ENERGY STAR model uses about ${CD.m.dehumPct}% less.`;
        }
      }
      if (item.category === 'attic-insulation' && c.clim) extra += ' ' + atticNote();
      if (item.category === 'crawlspace') {
        const z = zoneNumber(c.clim?.zone);
        if (z && D.insulation.floorText[z]) extra += ` ENERGY STAR’s retrofit table gives ${esc(rText(D.insulation.floorText[z]))} for floors in climate zone ${esc(c.clim!.zone)}.`;
        extra += ' We don’t estimate a dollar saving for crawlspaces.';
      }
      const save = savingHtml(item.category, c);
      const rb = rebateChips(item.category, c);
      return `${group}
        <div class="seq-item">
          <h4>${esc(item.action)}${note ? ` <span class="small">(${esc(note)})</span>` : ''}</h4>
          <p class="why">${esc(foundationText(item.why, a.found))}${extra}</p>
          ${save ? `<div class="nums"><span class="save">${save}</span></div>` : ''}
          ${rb}
        </div>`;
    });
    let basis = '';
    const calib = [c.cal.calibrated ? (c.hi.fuel === 'elec' ? 'your electric bills (heating)' : `your ${c.hi.fuel === 'gas' ? 'gas' : c.hi.fuel} bill (heating)`) : '', c.cool && c.cool.raw !== null ? 'your electric bills (cooling)' : ''].filter(Boolean);
    if (!m) {
      basis = `<span class="chip chip-neutral">No dollar estimates</span> None of the metro areas we cover is in ${esc(sn(c.loc.st))}, so there are no climate numbers to estimate with. Pick a stand-in under “How we calculated this” to see rough figures.`;
    } else if (calib.length) {
      basis = `<span class="chip chip-active">Scaled to your bills</span> Dollar figures use ${calib.join(' and ')}, ${esc(sn(c.loc.st))} prices and ${climWords(c)}.`;
    } else {
      basis = `<span class="chip chip-neutral">Typical house estimate</span> Based on ${esc(ERAS[a.age].typical)} with ${climWords(c)} and ${esc(sn(c.loc.st))} prices. <a href="#" id="addBills">Add your bills</a> to scale these to your house.`;
    }
    const order = c.coolDom
      ? 'Cooling drives the bills here, so this list is ordered by what each upgrade saves on air conditioning and heating together: the work you can do now first, then equipment and windows when they’re due, moved up for the problems you flagged.'
      : 'Ordered the way audits usually sequence the work: seal, then insulate, then replace equipment when it’s due, moved up for your home’s era, heating and the problems you flagged.';
    el.innerHTML = `
      <div class="rsec">
        <h3>Your upgrade sequence</h3>
        <p class="sub">${order} ${basis}</p>
        <div class="seq">${rows.join('')}</div>
        <p class="small">Savings don’t simply add up: once the attic is insulated there is less heat to stop elsewhere. The figures stay on the low side on purpose. We don’t show installed prices or paybacks because we haven’t verified US installation costs yet; get two or three written quotes, and ask each contractor which rebate they handle.</p>
        <p class="small tax-note"><b>Federal tax credits:</b> the 25C (Energy Efficient Home Improvement) and 25D (Residential Clean Energy) credits ended for work after December 31, 2025, so none of these upgrades earns a federal tax credit in 2026. Utility and state rebates are listed on each upgrade and under <a href="#rPrograms">Programs</a>.</p>
      </div>`;
    document.getElementById('addBills')?.addEventListener('click', (e) => {
      e.preventDefault();
      openWizard(6);
    });
  }

  function renderWatch(c: Ctx) {
    const items = watchFor(ERAS[c.a.age], { cls: c.cls, heat: c.a.heat });
    $('#rWatch').innerHTML = items.length ? `
      <div class="rsec">
        <h3>Watch for these in a house this age</h3>
        <div class="card card-pad watch-card">${items.map((w) => `<div class="watch-item ${w.severity}"><b>${esc(w.flag)}</b>${esc(w.detail)}</div>`).join('')}</div>
      </div>` : '';
  }

  /* ---------------------------------------------------------------- 6. tests */

  const ICONS: Record<string, string> = {
    fan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="2.2"/><path d="M12 9.8c0-3.2-1.2-5.3-3.4-5.3-1.8 0-2.6 1.4-2.6 2.7 0 2 2.4 2.9 6 2.6ZM14.2 12c3.2 0 5.3-1.2 5.3-3.4 0-1.8-1.4-2.6-2.7-2.6-2 0-2.9 2.4-2.6 6ZM12 14.2c0 3.2 1.2 5.3 3.4 5.3 1.8 0 2.6-1.4 2.6-2.7 0-2-2.4-2.9-6-2.6ZM9.8 12c-3.2 0-5.3 1.2-5.3 3.4 0 1.8 1.4 2.6 2.7 2.6 2 0 2.9-2.4 2.6-6Z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.4"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/></svg>',
    duct: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h8a4 4 0 0 1 4 4v4h6"/><path d="M3 12h6M15 20v-4M18 4l3 4-3 4"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s5.5 4.5 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 8.5 9 7 9 4.5c1.5 1 2 2.5 2 4 .8-1.2 1-3 1-5.5Z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V4M4 20h16"/><path d="m7 15 3.5-4 3 2.5L18 8"/></svg>',
    radon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13" r="2"/><path d="M12 4v4M5.5 20a7.5 7.5 0 0 1 13 0"/><path d="M3.8 15.5 7 17M20.2 15.5 17 17"/></svg>',
    co: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="6" width="16" height="12" rx="2"/><circle cx="9" cy="12" r="2.2"/><path d="M14 10h3M14 14h3"/></svg>',
    mold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="4.5"/><circle cx="16.5" cy="15.5" r="2.8"/><circle cx="8" cy="17.5" r="1.8"/></svg>',
    hazard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 10v4"/><circle cx="12" cy="16.6" r="0.4" fill="currentColor"/></svg>',
    paint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11v5H5zM16 6h3v4h-6"/><path d="M11 13v-3M9.5 14h3v6h-3z"/></svg>',
    water: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20v-8a5 5 0 0 1 10 0"/><path d="M4 20h16M12 3v2M12 8.5s2.2 2.6 2.2 4a2.2 2.2 0 1 1-4.4 0c0-1.4 2.2-4 2.2-4Z"/></svg>',
  };
  const LEVEL: Record<string, { cls: string; label: string }> = {
    'strongly-flagged': { cls: 'chip-info', label: 'Flagged for your home' },
    flagged: { cls: 'chip-limited', label: 'Likely for your home' },
    recommended: { cls: 'chip-neutral', label: 'Recommended' },
  };

  /** Local assessment programs whose own description says they include this test. */
  function includedIn(slug: string, c: Ctx): Audit[] {
    return openAudits(c).filter((x) => x.tests.includes(slug)).sort((x, y) => y.sc - x.sc).slice(0, 2);
  }

  /** What a good or bad result looks like and what to do about each (src/data/reading-guides.json), with the test's own note. */
  function readingGuide(slug: string, note?: string): string {
    const g = D.guides[slug];
    if (!g && !note) return '';
    return `
      <details class="reading">
        <summary>${g ? 'How to read your result' : 'More about this test'}${g?.u ? ` <span class="small">(${esc(g.u)})</span>` : ''}</summary>
        ${g ? `<ul class="bands">${g.b.map((b) => `<li><span class="band-l">${esc(b.l)}</span> <span class="band-r">${esc(b.r)}</span><span class="band-m">${esc(b.m)}</span><span class="band-d"><b>What to do:</b> ${esc(b.d)}</span></li>`).join('')}</ul>` : ''}
        ${note ? `<p class="test-est">${esc(note)}</p>` : ''}
      </details>`;
  }

  function testCard(t: TestPick, health: boolean, c: Ctx) {
    const inc = includedIn(t.slug, c);
    // state rules stay in view on the health checks; energy-test notes go with the reading guide
    const noteOut = health && t.note ? `<p class="test-est">${esc(t.note)}</p>` : '';
    return `
      <div class="test-card${health ? ' health' : ''}">
        <span class="ticon" aria-hidden="true">${ICONS[t.icon] ?? ''}</span>
        <div>
          <h4><a class="tname" href="/us/tests/${t.slug}/">${esc(t.name)}</a>${t.level ? ` <span class="chip ${LEVEL[t.level].cls}">${LEVEL[t.level].label}</span>` : ''}</h4>
          <p class="tw">${esc(t.why)}</p>
          ${noteOut}
          ${inc.length ? `<p class="test-inc"><b>Included in:</b> ${inc.map((x) => `${ext(x.url, x.n)}${x.cost ? ` <span class="small">(${esc(x.cost)})</span>` : ''}`).join('; ')}</p>` : ''}
          ${readingGuide(t.slug, health ? undefined : t.note)}
        </div>
      </div>`;
  }

  function renderTests(c: Ctx, energy: TestPick[]) {
    const el = $('#rTests');
    const health = specialtyTests(testInput(c), D.tests);
    el.innerHTML = `
      <div class="rsec">
        ${energy.length ? `<h3>Tests to ask your auditor for</h3>
        <p class="sub">Ask for these by name; they turn “probably” into measurements. Each card says what a good or bad result looks like and what to do about it. <a href="/us/tests/">The complete testing guide →</a></p>
        <div class="test-grid">${energy.map((t) => testCard(t, false, c)).join('')}</div>` : ''}
        <h3 class="${energy.length ? 'spec-h' : ''}">Health and safety checks</h3>
        <p class="sub">Screened from your answers: era, heating, water source and the problems you flagged.</p>
        <ul class="legend small">
          <li><span class="chip ${LEVEL['strongly-flagged'].cls}">${LEVEL['strongly-flagged'].label}</span> your answers point straight to it</li>
          <li><span class="chip ${LEVEL.flagged.cls}">${LEVEL.flagged.label}</span> common in homes like yours; check before work starts</li>
          <li><span class="chip ${LEVEL.recommended.cls}">${LEVEL.recommended.label}</span> good practice in any home</li>
        </ul>
        <div class="test-grid">${health.map((t) => testCard(t, true, c)).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-copy-tests>Copy my test checklist</button>
      </div>`;
  }

  function wireCopyTests(names: string[]) {
    resultsEl.querySelectorAll<HTMLButtonElement>('[data-copy-tests]').forEach((btn) => {
      const label = btn.textContent ?? 'Copy my test checklist';
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText('Tests to include in my home energy audit:\n' + names.map((n) => '• ' + n).join('\n'));
          btn.textContent = 'Checklist copied ✓';
          setTimeout(() => (btn.textContent = label), 2000);
        } catch { /* clipboard unavailable */ }
      });
    });
  }

  /* ---------------------------------------------------------------- 7. programs */

  function renderPrograms(c: Ctx) {
    const el = $('#rPrograms');
    const st = c.loc.st;
    const stLink = `/us/programs/states/${st.slug}/`;
    const metro = c.metro;
    const her = st.her;
    const herRow = (label: string, prog: HerProg) => `
      <div class="prog-row">
        <span class="pname">${esc(label)}</span>
        <span class="chip ${prog.chip.cls}">${esc(prog.chip.label)}</span>
        <span class="hl">${prog.s ? esc(prog.s) : `No status we could confirm on ${esc(sn(st))}’s own program pages.`}</span>
        ${prog.amt && ['open', 'limited'].includes(prog.chip.status) ? `<span class="hl">${esc(prog.amt)}</span>` : ''}
        ${prog.url ? `<span class="hl hl-link">${ext(prog.url, prog.name ? prog.name.replace(/\s*\(.*$/, '') : 'State program page')}</span>` : ''}
      </div>`;
    const local = openRebates(c).filter((r) => !r.iq);
    const herCard = `
      <div class="card card-pad prog-card">
        <h4>Federal home energy rebates in ${esc(sn(st))}</h4>
        <p class="small">${her ? esc(her.lede) : ''} These are two federally funded programs each state runs: HOMES (whole-home efficiency) and HEEHR (electric appliances and heat pumps, formerly called HEAR). Most have income limits.</p>
        ${her ? herRow('HEEHR: electric appliances and heat pumps', her.heehr) + herRow('HOMES: whole-home efficiency', her.homes) : ''}
        ${her?.via ? `<p class="meta">${esc(her.via)}</p>` : ''}
        ${her && !her.taking ? `<p class="nothing-open"><b>Neither federal program is taking applications in ${esc(sn(st))} right now</b>, based on our October 2026 check.${local.length ? ' The utility and local rebates below are separate, and they are open.' : ''}</p>` : ''}
        <p class="small"><a href="${stLink}">${esc(sn(st))} rebates and programs →</a></p>
      </div>`;

    let auditCard = '';
    if (metro) {
      const list = metro.a.filter((x) => applies(x, c)).sort((x, y) => Number(y.open) - Number(x.open) || y.sc - x.sc);
      auditCard = `
        <div class="card card-pad prog-card">
          <h4>Home energy assessments in ${esc(areaShort(c.loc.metro!))}</h4>
          ${c.util && !['unsure', 'other'].includes(c.util) ? `<p class="small">Showing programs for ${esc(utilName(c.util, c))} customers and programs open to everyone.</p>` : ''}
          ${list.map((x) => `
            <div class="prog-row">
              <span class="pname">${x.ul ? esc(x.n) : ext(x.url, x.n)}</span>
              <span class="chip ${x.chip.cls}">${esc(x.chip.label)}</span>
              ${forWhom(x, c) ? `<span class="hl"><b>${esc(forWhom(x, c))}</b></span>` : x.by ? `<span class="hl">${esc(x.by)}</span>` : ''}
              ${x.cost ? `<span class="hl"><b>Cost:</b> ${esc(x.cost)}</span>` : ''}
              ${x.open && x.how ? `<span class="hl"><b>How to book:</b> ${esc(x.how)}</span>` : ''}
              ${!x.open && x.s ? `<span class="hl"><b>Status:</b> ${esc(x.s)}</span>` : ''}
              ${x.ul && x.url ? `<span class="hl hl-link">${ext(x.url, x.ul)}</span>` : ''}
            </div>`).join('')}
          ${list.some((x) => x.open) ? '' : `<p class="nothing-open"><b>Nothing open:</b> none of the assessment programs we track for ${esc(areaShort(c.loc.metro!))} is taking sign-ups right now.</p>`}
          <p class="small"><a href="/us/cities/${c.loc.metro}/">The ${esc(metroName(c.loc.metro))} metro guide →</a></p>
        </div>`;
    } else {
      const near = c.loc.near;
      auditCard = `
        <div class="card card-pad prog-card">
          <h4>Home energy assessments near you</h4>
          <p class="small">We’ve checked assessment programs metro by metro, and your ZIP code is outside the 26 metro areas we cover, so we have none to list for it. Utility and state programs commonly pay for most or all of an assessment, so ask your electric and gas utilities first.${near ? ` The ${esc(metroName(near))} programs we track may not serve your address, but their guide shows what to look for.` : ''}</p>
          ${near ? `<p class="small"><a href="/us/cities/${near}/">The ${esc(metroName(near))} metro guide →</a></p>` : ''}
        </div>`;
    }

    const row = (r: Rebate) => `
          <div class="prog-row">
            <span class="pname">${ext(r.url, r.n)}</span>
            <span class="chip ${r.chip.cls}">${esc(r.chip.label)}</span>
            ${r.amt ? `<span class="hl">${esc(r.amt)}</span>` : ''}
            ${forWhom(r, c) ? `<span class="hl"><b>${esc(forWhom(r, c))}</b></span>` : ''}
          </div>`;
    const unsure = unconfirmedRebates(c).filter((r) => !r.iq);
    const rebateCard = metro ? `
      <div class="card card-pad prog-card">
        <h4>Utility and local rebates open now</h4>
        ${local.length ? `<p class="small">Each upgrade above shows the rebates that pay for it.</p>${local.slice(0, 4).map(row).join('')}` : `<p class="small">None of the rebate programs we track for ${esc(areaShort(c.loc.metro!))} is confirmed open for your answers right now.</p>`}
        ${local.length > 4 ? `<details class="more-rows"><summary>${local.length - 4} more open rebate${local.length - 4 === 1 ? '' : 's'}</summary>${local.slice(4, 14).map(row).join('')}</details>` : ''}
        ${unsure.length ? `<details class="more-rows"><summary>${unsure.length} more whose status the program page doesn’t state</summary>${unsure.slice(0, 10).map(row).join('')}</details>` : ''}
        <p class="small"><a href="/us/cities/${c.loc.metro}/">All of them in the ${esc(metroName(c.loc.metro))} metro guide →</a></p>
      </div>` : '';

    const credits = `
      <div class="card card-pad prog-card">
        <h4>Federal tax credits ended</h4>
        <p class="small">The 25C (Energy Efficient Home Improvement) and 25D (Residential Clean Energy) tax credits ended for work after December 31, 2025, including 25C’s $150 credit for a home energy audit. Work done in 2025 is still claimed on 2025 returns (Form 5695).${D.rebateFinderUrl ? ` ENERGY STAR’s ${ext(D.rebateFinderUrl, 'Rebate Finder')} searches utility and local offers by ZIP code.` : ''}</p>
      </div>`;

    const iqLocal = [
      ...(metro ? metro.a.filter((x) => x.open && x.f.iq && applies(x, c)).map((x) => ({ n: x.n, url: x.url })) : []),
      ...(metro ? metro.rb.filter((x) => x.iq && applies(x, c)).map((x) => ({ n: x.n, url: x.url })) : []),
      ...(metro ? metro.iqp.filter((x) => !x.st.length || x.st.includes(c.loc.state)).map((x) => ({ n: x.n, url: x.url })) : []),
    ].filter((x, i, arr) => arr.findIndex((y) => y.n === x.n) === i).slice(0, 5);
    const help = `
      <div class="card card-pad prog-card">
        <h4>If money is tight</h4>
        <p class="small">The federal Weatherization Assistance Program pays for an energy audit and the cost-effective work it finds for households at or below 200% of the federal poverty guidelines (Program Year 2026 average spending limit: $8,813 per home). ${ext(D.wapUrl, 'How to apply, from DOE')}. LIHEAP helps with heating and cooling bills through your state or local LIHEAP office.</p>
        ${iqLocal.length ? `<p class="small"><b>Near you:</b></p><ul class="small iq-list">${iqLocal.map((x) => `<li>${ext(x.url, x.n)}</li>`).join('')}</ul>` : ''}
      </div>`;

    el.innerHTML = `
      <div class="rsec">
        <h3>Programs for your area</h3>
        <p class="sub">Checked against official pages on ${esc(D.verified)}. Program details change, so confirm before spending. <a href="/us/programs/">All US programs →</a></p>
        <div class="prog-grid">${auditCard}${rebateCard}${herCard}${help}${credits}</div>
      </div>`;
  }

  /* ---------------------------------------------------------------- 8. find an auditor */

  function renderFind(c: Ctx) {
    const items = (D.credentials as { name: string; by: string; url: string | null }[]).map((cr) =>
      `<li>${cr.url ? ext(cr.url, cr.name) : esc(cr.name)} <span class="small">${esc(cr.by.split(';')[0])}</span></li>`).join('');
    const fs = firstStop(c);
    let lead = '';
    if (fs.pick) {
      lead = `<p>Start with your utility’s assessment:</p><ul class="res-list">${fs.perUtil.map((x) => `<li><b>${esc(x.u)} customers:</b> ${ext(x.a.url, x.a.n)}${x.a.cost ? ` <span class="small">${esc(x.a.cost)}</span>` : ''}${x.a.how ? ` <span class="small">${esc(x.a.how)}</span>` : ''}</li>`).join('')}${othersLine(fs.others, fs.perUtil)}</ul>`;
    } else if (fs.audit) {
      const x = fs.audit;
      lead = `<p class="find-first"><b>Start here:</b> ${ext(x.url, x.n)}${x.cost ? ` <span class="small">(${esc(x.cost)})</span>` : ''}.${x.how ? ` ${esc(x.how)}` : ''}</p>`;
    }
    $('#rFind').innerHTML = `
      <div class="rsec">
        <h3>Find a certified auditor</h3>
        ${lead}
        <p class="sub">${lead ? 'Or hire an independent certified auditor. ' : ''}Ask which credential the auditor holds and whether the visit includes a blower door test${c.hot || c.coolDom ? ' and a duct leakage test' : ''}. These official finders search by location; <a href="/us/find/">our guide to finding an auditor</a> explains the credentials and the red flags.</p>
        <ul class="res-list">${items}</ul>
      </div>`;
  }

  /* ---------------------------------------------------------------- 9. costs compared (collapsed) */

  /** Fuels sold here: oil and propane only where EIA prices them in the state, or where this home uses them. */
  function fuelMarket(c: Ctx, fuel: string): boolean {
    if (fuel === 'oil') return !c.prices.national.oil || c.hi.fuel === 'oil' || c.wk === 'oilTank';
    if (fuel === 'propane') return !c.prices.national.propane || c.hi.fuel === 'propane' || c.wk === 'propaneTank';
    return true;
  }

  function coolingTable(c: Ctx): string {
    const cool = c.cool;
    if (!cool || !(cool.kwh > 0)) return '';
    const kind = cool.base.kind;
    const price = cool.price;
    const sNow = cool.base.seer ?? cool.base.seerRef;
    const min = minSeer(cool.ci, CD);
    const env = combineCooling((['air-sealing', 'attic-insulation', 'duct-sealing', 'attic-heat', 'window-film'] as CoolMeasureKey[]).filter((k) => cool.measures[k]), cool.measures);
    const rows: { label: string; kwh: number; current?: boolean; note?: string }[] = [];
    if (kind === 'room') {
      rows.push({ label: `Your window or portable units (about EER ${CD.p.roomEer})`, kwh: cool.kwh, current: true });
      rows.push({ label: `Variable-speed ductless heat pump (about SEER ${CD.seer.newVs})`, kwh: cool.kwh * (CD.p.roomEer / CD.seer.newVs), note: 'heats as well' });
    } else {
      rows.push({ label: `Your ${kind === 'heatpump' ? 'heat pump' : 'central AC'}, as we assume it (about SEER ${sNow.toFixed(1)})`, kwh: cool.kwh, current: true });
      if (min.seer > sNow + 0.3) rows.push({ label: `A new unit at today’s federal minimum (${min.seer2} SEER2, about SEER ${min.seer})`, kwh: cool.kwh * (sNow / min.seer) });
      rows.push({ label: `A right-sized variable-speed AC or heat pump (about ${CD.seer.newVs2} SEER2)`, kwh: cool.kwh * (sNow / CD.seer.newVs) });
    }
    if (env > 0.02) rows.push({ label: `The same new unit after the duct, attic and air sealing work above`, kwh: cool.kwh * (kind === 'room' ? CD.p.roomEer : sNow) / CD.seer.newVs * (1 - env) });
    const body = rows.map((r) => `
      <tr class="${r.current ? 'is-current' : ''}">
        <td data-label="Cooling">${esc(r.label)}${r.current ? ' <span class="chip chip-info">yours</span>' : ''}${r.note ? `<span class="small block">${esc(r.note)}</span>` : ''}</td>
        <td data-label="Electricity a year">${kwhTxt(r.kwh)}</td>
        <td data-label="Cost a year"><b>${money(r.kwh * price)}</b></td>
      </tr>`).join('');
    let heatLine = '';
    if (c.m && c.clim && c.coolDom) {
      const d = c.m.demand * c.cal.factor;
      const hp = usHeatingCost(d, heatPumpFor(c.clim), c.m.hddC, c.prices.p).cost;
      const strip = usHeatingCost(d, 'electricResistance', c.m.hddC, c.prices.p).cost;
      const gas = usHeatingCost(d, 'gasFurnaceHigh', c.m.hddC, c.prices.p).cost;
      if (hp !== null && strip !== null) heatLine = `<p class="small">Heating is small here: a heat pump heats this house for about ${money(hp)} a year at ${esc(sn(c.loc.st))} prices, against ${money(strip)} with an AC plus electric strip heat${gas !== null ? ` and ${money(gas)} with a high-efficiency gas furnace` : ''}.</p>`;
    }
    return `
      <h4>Cooling costs compared</h4>
      <p class="small">The same house and summer, about ${kwhTxt(cool.kwh)} of air conditioning a year now${cool.raw !== null ? ' (scaled to your bills)' : ''}, at ${esc(sn(c.loc.st))}’s ${esc(D.periods.elecMonth)} price of ${cents(c.loc.st.p.e)}/kWh. SEER2 is the rating on new equipment since 2023; SEER is the older scale.</p>
      <div class="tablewrap card"><table class="stack compare">
        <thead><tr><th>Cooling</th><th>Electricity a year</th><th>Cost a year</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
      ${heatLine}`;
  }

  function heatingTable(c: Ctx): string {
    const p = c.prices.p;
    const st = c.loc.st;
    const fuelOfRow = (sys: SystemKey) => (MODEL.systems[sys] as { fuel: string }).fuel;
    const current = c.hi.sys;
    const rows = COMPARE.filter((r) => r.sys === current || fuelMarket(c, fuelOfRow(r.sys)));
    if (!rows.some((r) => r.sys === current)) rows.unshift({ key: 'current', label: `Your ${c.hi.short} (${(MODEL.systems[current] as { label: string }).label.replace(/^[^(]*\(/, '').replace(/\)$/, '')})`, sys: current });
    const nat = (fuel: string) => (fuel === 'gas' && c.prices.national.gas) || (fuel === 'oil' && c.prices.national.oil) || (fuel === 'propane' && c.prices.national.propane);
    if (c.m && c.clim) {
      const demand = c.m.demand * c.cal.factor;
      const list = rows.map((r) => ({ r, cost: usHeatingCost(demand, r.sys, c.m!.hddC, p) })).sort((x, y) => (x.cost.cost ?? 1e12) - (y.cost.cost ?? 1e12));
      const body = list.map(({ r, cost }) => `
        <tr class="${r.sys === current ? 'is-current' : ''}">
          <td data-label="Heating">${esc(r.label)}${r.sys === current ? ' <span class="chip chip-info">yours</span>' : ''}${r.note ? `<span class="small block">${esc(r.note)}</span>` : ''}</td>
          <td data-label="Energy a year">${unitsTxt(cost.units, cost.unit)}${isHeatPump(r.sys) ? ` <span class="small">(seasonal COP ${cost.eff.toFixed(1)})</span>` : ''}</td>
          <td data-label="Cost a year"><b>${cost.cost !== null ? money(cost.cost) : '—'}</b>${nat(fuelOfRow(r.sys)) ? ' <span class="small">(U.S. price)</span>' : ''}</td>
        </tr>`).join('');
      return `
        <h4>Heating costs compared</h4>
        <p class="small">The same house, about ${int(mmbtu(demand))} million Btu of heat a year${c.cal.calibrated ? ' (scaled to your bill)' : ''}, heated different ways at ${esc(sn(st))} prices. Heat pump efficiency is set for ${climWords(c)} and includes backup heat; COP is how many units of heat each unit of electricity delivers. Fuels without a local market here are left out.</p>
        <div class="tablewrap card"><table class="stack compare">
          <thead><tr><th>Heating</th><th>Energy a year</th><th>Cost a year</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>`;
    }
    const band = MODEL.ashpCopBands;
    const mild = band[0], cold = band[band.length - 1];
    const perRow = rows.filter((r) => !isHeatPump(r.sys)).map((r) => {
      const s = MODEL.systems[r.sys] as { fuel: string; eff?: number };
      return { r, v: costPerMMBtuDelivered(s.fuel as never, s.eff ?? 1, p) };
    }).sort((x, y) => (x.v ?? 1e9) - (y.v ?? 1e9)).map(({ r, v }) =>
      `<tr class="${r.sys === current ? 'is-current' : ''}"><td data-label="Heating">${esc(r.label)}${r.sys === current ? ' <span class="chip chip-info">yours</span>' : ''}${r.note ? `<span class="small block">${esc(r.note)}</span>` : ''}</td><td data-label="Cost per million Btu of heat"><b>${v !== null ? dollars2(v) : '—'}</b></td></tr>`);
    const hp = (label: string, mildCop: number, coldCop: number, sys: SystemKey) => {
      const a1 = costPerMMBtuDelivered('electricity', mildCop, p), a2 = costPerMMBtuDelivered('electricity', coldCop, p);
      const val = mildCop === coldCop ? `<b>${dollars2(a1!)}</b>` : `<b>${dollars2(a1!)}–${dollars2(a2!)}</b> <span class="small">(mild to cold winters)</span>`;
      return `<tr class="${sys === current ? 'is-current' : ''}"><td data-label="Heating">${esc(label)}${sys === current ? ' <span class="chip chip-info">yours</span>' : ''}</td><td data-label="Cost per million Btu of heat">${val}</td></tr>`;
    };
    return `
      <h4>What a unit of heat costs</h4>
      <p class="small">Without climate numbers we can’t total a year, but we can price the heat itself: the cost of 1 million Btu delivered into the house at ${esc(sn(st))} prices.</p>
      <div class="tablewrap card"><table class="stack compare">
        <thead><tr><th>Heating</th><th>Cost per million Btu of heat</th></tr></thead>
        <tbody>${perRow.join('')}${hp('Air-source heat pump, cold-climate', mild.coldClimate, cold.coldClimate, 'ashpCold')}${hp('Air-source heat pump, standard', mild.standard, cold.standard, 'ashpStandard')}${hp('Geothermal (ground-source) heat pump', (MODEL.systems.gshp as { eff: number }).eff, (MODEL.systems.gshp as { eff: number }).eff, 'gshp')}</tbody>
      </table></div>
      <p class="small">Heat pump figures span our model’s seasonal efficiency from its mildest to its coldest climate band (${mild.coldClimate} down to ${cold.coldClimate} for cold-climate models).${nationalNote(c)}</p>`;
  }

  function renderCompare(c: Ctx) {
    const el = $('#rCompare');
    if (c.a.htype === 'condo') { el.innerHTML = ''; return; }
    const cool = coolingTable(c);
    const heat = heatingTable(c);
    const first = c.coolDom && cool ? cool + heat : heat + cool;
    el.innerHTML = `
      <details class="card card-pad fold">
        <summary><strong>${c.coolDom && cool ? 'Cooling and heating costs compared' : cool ? 'Heating and cooling costs compared' : 'Heating costs compared'}</strong> <span class="small">(equipment options at ${esc(sn(c.loc.st))} prices)</span></summary>
        ${first}
        <p class="small">Equipment prices aren’t included.</p>
      </details>`;
  }

  /** " Heating oil uses the U.S. average ($6.04 a gallon) because EIA publishes no Montana price." */
  function nationalNote(c: Ctx): string {
    const N = D.national;
    const parts: string[] = [];
    if (c.prices.national.gas) parts.push(`natural gas the U.S. average (${dollars2(N.gasPerTherm)} a therm)`);
    if (c.prices.national.oil && fuelMarket(c, 'oil')) parts.push(`heating oil the U.S. average (${dollars2(N.oilPerGal)} a gallon)`);
    if (c.prices.national.propane && fuelMarket(c, 'propane')) parts.push(`propane the U.S. average (${dollars2(N.propanePerGal)} a gallon)`);
    if (!parts.length) return '';
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return ` EIA publishes no ${esc(sn(c.loc.st))} price for ${parts.length > 1 ? 'some fuels' : 'one fuel'}, so we use ${list}.`;
  }

  /* ---------------------------------------------------------------- 10. systems */

  function renderSystems(c: Ctx) {
    const el = $('#rSystems');
    const a = c.a;
    if (a.htype === 'condo') { el.innerHTML = ''; return; }
    const cards: string[] = [];
    const m = c.m;
    const p = c.prices.p;
    const cool = c.cool;
    if (cool && c.clim) {
      if (cool.base.kind === 'none') {
        cards.push(`<div class="sys-card"><h4>Cooling: none</h4><p class="small">${c.hot || c.coolDom ? 'Without AC in this climate, heat is a health risk in summer and outages. A right-sized heat pump adds cooling and replaces your heating; shades and attic work keep the house cooler meanwhile.' : `With ${int(c.clim.cdd65)} cooling degree days a year, many homes here manage without AC, but heat waves are getting hotter. A heat pump adds cooling when the heating system is due.`}</p></div>`);
      } else {
        const b = cool.base;
        const seerTxt = b.kind === 'room' ? 'window or portable units' : `${b.kind === 'heatpump' ? 'a heat pump' : 'a central AC'} around SEER ${(b.seer ?? b.seerRef).toFixed(1)}`;
        const share = c.coolDom ? 'In this climate it is usually the biggest single use of electricity in the house.' : 'In this climate cooling is a modest part of the year’s energy.';
        cards.push(`<div class="sys-card"><h4>Air conditioning</h4>
          <p class="small">About <b>${kwhTxt(cool.kwh)} a year (${money(cool.kwh * cool.price)})</b>${cool.raw !== null ? ', scaled to your bills' : `, likely ${kwhTxt(b.lo)}–${kwhTxt(b.hi)}`}, for ${seerTxt}${b.roomStandIn ? ' (a nearby climate zone’s figures, because few homes here use window units)' : ''}. ${share} A Manual J load calculation sizes any replacement; ${c.cls === 'hot-humid' || c.cls === 'mixed-warm' ? 'in humid air, an oversized unit cools without drying.' : 'oversized units short-cycle and wear early.'}</p></div>`);
      }
    }
    if (m && c.clim) {
      const wc = m.waterCost;
      if (wc.cost !== null) {
        const alts: string[] = [];
        if (c.wk !== 'heatPump') {
          const hp = usWaterHeaterCost('heatPump', m.water.gj, p, { sys: c.hi.sys, hddC: m.hddC, share: m.hpwhShare });
          if (hp.cost !== null) alts.push(`a heat pump water heater about ${money(hp.cost + hp.extraCost)}/yr`);
        }
        if (c.wk === 'gasTank') {
          const tl = usWaterHeaterCost('gasTankless', m.water.gj, p);
          if (tl.cost !== null) alts.push(`gas tankless about ${money(tl.cost)}/yr (DOE: on-demand units can be 24–34% more efficient than tanks in homes using 41 gallons or less a day)`);
        }
        const hpNote = c.coolDom
          ? ' A heat pump water heater pulls heat from the air around it, so it also cools and dries a garage or utility room; in the short heating season here, replacing that heat costs little.'
          : c.wk === 'heatPump' || alts.length ? ' Heat pump water heater costs include the extra heating to replace the warmth they pull from the house during the heating season.' : '';
        cards.push(`<div class="sys-card"><h4>Hot water: ${esc(WH_NAME[c.wk] ?? c.wk)}${a.wh === 'unsure' ? ' (assumed)' : ''}</h4>
          <p class="small">About <b>${money(wc.cost)}/yr</b> (${unitsTxt(wc.units, wc.unit)}) for a household of three; cold water arrives at about ${Math.round(fahrenheit(m.water.inletC))} °F with this climate.${alts.length ? ' Alternatives: ' + alts.join('; ') + '.' : ''}${hpNote}</p></div>`);
      }
      const acTxt = a.ac === 'central-old' ? ' Replacing an older central air conditioner is a natural time to switch to a heat pump: one unit then cools and heats.'
        : a.ac === 'room' ? ' Window units cool one room at a time; a ductless heat pump can replace several and heat as well.' : '';
      const tstat = c.coolDom
        ? 'Each degree warmer on the cooling setting saves several percent of AC use. On a time-of-use or peak plan, pre-cool the house before the peak (often late afternoon) and let it drift up a few degrees; ceiling fans let you sit comfortably 3–4 °F warmer.'
        : 'A setback at night and while you’re out trims heating; a degree or two warmer in summer trims cooling.';
      cards.push(`<div class="sys-card"><h4>Thermostat</h4><p class="small">${tstat}${acTxt}</p></div>`);
    }
    if (a.win !== 'unsure') {
      const wk = winKey(a.win, a.age);
      const msg = (wk === 'single' || wk === 'singleStorm')
        ? c.hot ? 'Clear single glazing lets in a lot of sun heat. Solar screens or film on east, west and south windows are the cheap fix; low-SHGC replacement windows are the long-term one.' : 'Single glazing loses far more heat than an insulated wall, so replacement can pay here, but air sealing, attic and basement work usually pay faster. Storm windows are a cheaper middle step.'
        : wk === 'doubleClear'
          ? c.hot ? 'Clear double-pane glass still lets in sun heat; screens or film on sunny windows cut it. Replace when they fail, with low-SHGC glass.' : 'Older double-pane windows still work; replacing them mostly buys comfort and quiet. Do it when they fail or during a renovation, and seal around the frames now.'
          : 'Your windows are already efficient. Caulk and weatherstrip, and spend elsewhere first.';
      cards.push(`<div class="sys-card"><h4>Windows: ${esc(WINDOW_LABEL_US[wk])}</h4><p class="small">${msg}</p></div>`);
    }
    if (a.sec.includes('woodstove')) {
      cards.push('<div class="sys-card"><h4>Wood stove or fireplace</h4><p class="small">Burning wood makes carbon monoxide: keep working CO alarms (CPSC recommends one on every level and outside sleeping areas), have the chimney inspected and swept as needed, and tell your auditor so the combustion safety test covers it.</p></div>');
    }
    if (a.sec.includes('spaceheaters')) {
      cards.push(`<div class="sys-card"><h4>Electric space heaters</h4><p class="small">A 1,500 W heater costs about ${money5(1.5 * (p.electricity ?? 0) * 100)} per 100 hours at ${esc(sn(c.loc.st))}’s ${esc(D.periods.elecMonth)} average price. Needing one usually points to a draft, a cold room over a garage or a duct problem worth finding.</p></div>`);
    }
    if (a.sec.includes('solar')) {
      cards.push(`<div class="sys-card"><h4>Sunny south windows</h4><p class="small">${c.coolDom ? 'Sun through big windows is free heat for a few winter weeks here and an AC load the rest of the year: shade them in summer (an overhang, exterior screens or film) and let the low winter sun in.' : 'Sunny south windows supply real heat on clear winter days. Our estimate allows for typical solar gain; if your bills come in below the typical range, this is one reason. Keep low-e coatings in mind when replacing south-facing glass.'}</p></div>`);
    }
    if (a.prev === 'recent' || a.prev === 'older') {
      cards.push(`<div class="sys-card prev"><h4>You’ve had an audit before</h4><p class="small">Dig out the report: its blower door number and upgrade list are still useful for planning${a.prev === 'older' ? ', though renovations since then change the numbers' : ''}. Whether an old audit counts toward a program depends on that program’s rules.</p></div>`);
    }
    el.innerHTML = cards.length ? `<div class="rsec"><h3>Your home’s systems</h3><p class="sub">At ${esc(sn(c.loc.st))} prices${c.clim ? ` and ${climWords(c)}` : ''}.</p><div class="sys-grid">${cards.join('')}</div></div>` : '';
  }

  /* ---------------------------------------------------------------- 11. how we calculated this (collapsed) */

  function priceLines(c: Ctx) {
    const st = c.loc.st;
    const N = D.national;
    const P = D.periods;
    const pr = c.prices;
    const lines: [string, string][] = [];
    lines.push(['Electricity', `${cents(st.p.e)}/kWh, ${esc(sn(st))} average for ${esc(P.elecMonth)}`]);
    lines.push(['Natural gas', pr.national.gas
      ? `${dollars2(N.gasPerTherm)}/therm, U.S. average for ${esc(P.gasYear)} (national; EIA has no ${esc(sn(st))} figure)`
      : `${dollars2(st.p.g!)}/therm, ${esc(sn(st))} average for ${esc(st.p.gy ?? P.gasYear)}${st.p.gy ? ` (EIA has no ${esc(P.gasYear)} figure for ${esc(sn(st))})` : ''}`]);
    if (fuelMarket(c, 'oil')) lines.push(['Heating oil', pr.national.oil
      ? `${dollars2(N.oilPerGal)}/gallon, U.S. average for the week of ${esc(P.oilWeek)} (national; EIA publishes no residential price for ${esc(sn(st))})`
      : `${dollars2(st.p.o!)}/gallon, ${esc(sn(st))}, week of ${esc(P.oilWeek)}`]);
    if (fuelMarket(c, 'propane')) lines.push(['Propane', pr.national.propane
      ? `${dollars2(N.propanePerGal)}/gallon, U.S. average for the week of ${esc(P.propaneWeek)} (national; EIA publishes no residential price for ${esc(sn(st))})`
      : `${dollars2(st.p.pr!)}/gallon, ${esc(sn(st))}, week of ${esc(P.propaneWeek)}`]);
    return lines;
  }

  const ZONE_WORDS: Record<string, string> = { A: 'humid', B: 'dry', C: 'marine' };

  function renderNumbers(c: Ctx) {
    const loc = c.loc;
    const a = c.a;
    const m = c.m;
    const cm = loc.clim ? D.metros[loc.clim] : null;
    const place = loc.metro
      ? `${esc(metroArea(loc.metro))} (${esc(D.metros[loc.metro].msa)}), ${esc(loc.st.n)}`
      : loc.near ? `${esc(loc.st.n)}, outside the 26 metro areas we cover` : `${esc(loc.st.n)}; none of the 26 metro areas we cover is in ${esc(sn(loc.st))}`;
    const z = cm?.c.z ?? null;
    const zoneTxt = z ? ` IECC climate zone ${esc(z)}: zones run from 1 (hottest) to 8 (coldest), and the letter means ${ZONE_WORDS[z.slice(-1)] ?? 'the moisture type'}.` : '';
    const climate = cm
      ? `${int(cm.c.h)} heating and ${int(cm.c.k)} cooling degree days a year (°F, base 65): how far, added up over the year, each day’s average temperature falls below or rises above 65 °F. <b>${esc(cm.meaning)}</b>${zoneTxt} <span class="src">${climSource(c)}.</span>`
      : `<b>No climate numbers.</b> Prices and programs are for ${esc(sn(loc.st))}; dollar savings need a climate, so pick a stand-in below or leave them out.`;
    const rows = [['Location', ucfirst(place)], ['Climate', climate], ...priceLines(c)];
    const ea = eraAssumptions(a.age);
    const win = a.win !== 'unsure' ? `${WINDOW_LABEL_US[winKey(a.win, a.age)]} (your answer)` : `${WINDOW_LABEL_US[ea.window]} (typical for the era)`;
    const found = a.found === 'basement' ? `Basement walls about R-${ea.basementR}`
      : a.found === 'crawl' ? 'Crawlspace (no dollar estimate for it)'
        : a.found === 'slab' ? 'Slab on grade, so no basement walls to insulate'
          : `Modeled as a basement, walls about R-${ea.basementR}`;
    const cool = c.cool;
    const where = loc.metro
      ? `Your ZIP code (${esc(loc.zip5)}) is in ${esc(metroArea(loc.metro))}, using Census ZIP code areas and the 2023 metro area definitions.`
      : loc.near ? `Your ZIP code (${esc(loc.zip5)}) is in ${esc(sn(loc.st))}, outside the 26 metro areas we cover.` : `Your ZIP code (${esc(loc.zip5)}) is in ${esc(sn(loc.st))}; none of the 26 metro areas we cover is in ${esc(sn(loc.st))}.`;
    const heatTxt = c.clim && m
      ? `A typical house like yours needs about <b>${int(mmbtu(m.demand))} million Btu</b> of heat a year: the heating need per square foot for your era, scaled to ${int(c.clim.hdd65)} heating degree days.${c.cal.calibrated ? ` Your bills point to about <b>${int(mmbtu(c.cal.actualDemandGJ ?? 0))} million Btu</b>, so we scaled every heating saving by ${c.cal.factor.toFixed(2)}${c.cal.clamped ? ' (we cap the scaling between 0.5 and 1.6)' : ''}.` : ' Without your bills, we use the typical figure.'}`
      : ' Without climate numbers there are no yearly dollar figures; the order of the upgrades, the prices and the programs still apply.';
    const coolTxt = cool && cool.base.kind !== 'none'
      ? ` Air conditioning: about <b>${kwhTxt(cool.base.kwh)}</b> a year for a typical similar home (likely ${kwhTxt(cool.base.lo)}–${kwhTxt(cool.base.hi)}), from EIA’s 2020 Residential Energy Consumption Survey (single-family homes with central AC${loc.clim ? ` in the survey cell that contains ${esc(metroName(loc.clim))}` : ''}), adjusted to this climate’s normal cooling degree days, the house’s size, age and type, and the efficiency of the unit your answers describe.${cool.raw !== null ? ` Your bills point to about ${kwhTxt(cool.kwh)}, so cooling savings are scaled by ${cool.factor.toFixed(2)}.` : ''}`
      : '';
    $('#rNumbers').innerHTML = `
      <details class="card card-pad fold numbers">
        <summary><strong>How we calculated this</strong> <span class="small">(the numbers behind your plan, and why they’re conservative)</span></summary>
        <ul class="kv">${rows.map(([k, v]) => `<li><span class="k">${k}</span><span>${v}</span></li>`).join('')}</ul>
        ${climPickerHtml(c, 'climPickArea')}
        <h4>Typical starting points for a house this age</h4>
        <p class="small">Your audit measures yours; these are what the model assumes until then.</p>
        <ul class="kv">
          <li><span class="k">Walls</span><span>About R-${ea.wallR}</span></li>
          <li><span class="k">Attic</span><span>About R-${ea.atticR}</span></li>
          <li><span class="k">Air leaks</span><span>${esc(foundationText(ERAS[a.age].air, a.found))}</span></li>
          <li><span class="k">Windows</span><span>${esc(ucfirst(win))}</span></li>
          <li><span class="k">Foundation</span><span>${esc(found)}</span></li>
        </ul>
        <h4>The method</h4>
        <p class="small">${where} Heating: ${heatTxt}${coolTxt}</p>
        <p class="small">Each upgrade’s heating saving comes from the physics of that part of the house (R-values, window U-factors, air leakage) at your degree days, multiplied by 0.75 (0.4 for basements) because sun, people and appliances already supply free heat and real installations underperform their labels; no single upgrade is credited with more than 35% of your heating, and all of them together with no more than 60%. Cooling savings are percentages of the air-conditioning estimate from field studies and NREL’s ResStock models, and they overlap: attic insulation, a radiant barrier and a cool roof all block the same attic heat, so we never add them at full value.</p>
        <p class="small">Savings are valued at EIA’s average prices, which include fixed monthly charges, so they can run a little high: one more therm or kilowatt-hour usually costs less than the average, though tiered summer rates can cost more.</p>
        <p class="small"><a href="#assumptions">Every assumption and source →</a> · <a href="/us/how-it-works/">How a home energy audit works →</a> · <a href="/us/glossary/">Glossary of audit terms →</a></p>
      </details>`;
    wireClimPickers(c);
  }

  function renderResources(c: Ctx) {
    const items = [
      `<li><a href="/us/how-it-works/">How a home energy audit works</a>: what happens during the visit, step by step</li>`,
      `<li><a href="/us/cost/">What an audit costs</a>, and who pays for some or all of it</li>`,
      `<li><a href="/us/programs/states/${c.loc.st.slug}/">${esc(sn(c.loc.st))} rebates and programs</a>, checked against official pages</li>`,
      c.loc.metro ? `<li><a href="/us/cities/${c.loc.metro}/">The ${esc(metroName(c.loc.metro))} metro guide</a>: utilities, assessments and local rules</li>` : '',
      `<li><a href="/us/tests/">The complete testing guide</a>: every test from blower doors to radon, and who performs it</li>`,
      `<li><a href="/us/glossary/">The glossary</a>: every audit term in plain language</li>`,
      `<li><a href="/us/products/">Monitoring and testing gear</a>: radon, CO and humidity monitors</li>`,
    ].filter(Boolean);
    $('#rResources').innerHTML = `<div class="rsec"><h3>Resources for your plan</h3><ul class="res-list">${items.join('')}</ul></div>`;
  }

  /* ------------------------------------------------------------------ the request form: prefilled, never sent until the homeowner presses Send */

  function planSummary(c: Ctx, seq: SeqItem[]): string {
    const a = c.a;
    const lines = [
      'From the AuditYourHome planner (a pre-audit estimate):',
      `Home: built ${lcfirst(pickedLabel('age', a.age))}, ${pickedLabel('htype', a.htype).toLowerCase()}, ${lcfirst(pickedLabel('size', a.size).replace(/\s*sq ft$/, ''))} sq ft, ${a.found === 'unsure' ? 'foundation not sure' : pickedLabel('found', a.found).toLowerCase()}; ZIP ${c.loc.zip5}${c.loc.metro ? ` (${metroName(c.loc.metro)} metro area)` : ''}`,
      `Heating: ${pickedLabel('heat', a.heat)} · Cooling: ${pickedLabel('ac', a.ac)} · Water heater: ${pickedLabel('wh', a.wh)}`,
    ];
    if (a.util && !['unsure', 'other'].includes(a.util)) lines.push(`Electric utility: ${utilName(a.util, c)}`);
    if (a.syms.length) lines.push(`Problems: ${a.syms.map((s) => pickedLabel('sym', s)).join('; ')}`);
    if (a.goals.length) lines.push(`Goals: ${a.goals.map((g) => pickedLabel('goal', g)).join('; ')}`);
    if (seq.length) lines.push(`Top upgrades: ${seq.slice(0, 3).map((s, i) => `${i + 1}) ${s.action}`).join(' ')}`);
    lines.push(`My plan: ${location.origin}${location.pathname}#${planHash}`);
    return lines.join('\n');
  }

  function prefillLead(c: Ctx, seq: SeqItem[]) {
    const box = document.getElementById('us-lead-form');
    if (!box) return;
    const f = box.querySelector('form');
    // the summary carries the plan link, so write the hash first
    writeHash(c);
    const summary = planSummary(c, seq);
    if (!f) {
      const mail = box.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
      if (mail) {
        const [base, query = ''] = mail.href.split('?');
        const q = new URLSearchParams(query);
        q.set('body', `ZIP code: ${c.loc.zip5}\n\n${summary}\n\nWhat I’m planning:\n`);
        mail.href = `${base}?${q.toString().replace(/\+/g, '%20')}`;
      }
      return;
    }
    // fill each field until the homeowner edits it; their own words are never overwritten
    const auto = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null, value: string) => {
      if (!el) return;
      if (!el.dataset.wired) {
        el.dataset.wired = '1';
        const mark = () => { el.dataset.touched = '1'; };
        el.addEventListener('input', mark);
        el.addEventListener('change', mark);
      }
      if (!el.dataset.touched) el.value = value;
    };
    auto(f.querySelector<HTMLInputElement>('input[name="postal"]'), c.loc.zip5);
    auto(f.querySelector<HTMLSelectElement>('select[name="home"]'), c.a.htype === 'condo' ? 'condo' : c.a.htype === 'semi' ? 'townhouse' : 'house');
    auto(f.querySelector<HTMLTextAreaElement>('textarea[name="message"]'), summary);
  }

  /* ------------------------------------------------------------------ glossary links inside the results */

  let glossWaiting = false;

  function glossLink() {
    const G = window.AYHGloss;
    if (!G?.link) {
      // gl.js is a deferred script that may run after this module: try again once it has
      if (!glossWaiting) {
        glossWaiting = true;
        const retry = () => { if (window.AYHGloss && !resultsEl.hidden) glossLink(); };
        document.addEventListener('DOMContentLoaded', retry, { once: true });
        window.addEventListener('load', retry, { once: true });
      }
      return;
    }
    // gl.js links a term once per page; the static text the build linked (the assumptions, the
    // audit box below the results) already carries links, so set those aside while the rendered
    // results get their own first-use links
    const outside = [...document.querySelectorAll<HTMLElement>('a.gl[data-gl]')].filter((x) => !x.closest('#results > [id^="r"]'));
    const saved = outside.map((x) => [x, x.getAttribute('data-gl')!] as const);
    saved.forEach(([x]) => x.removeAttribute('data-gl'));
    try { G.link(resultsEl); } finally { saved.forEach(([x, g]) => x.setAttribute('data-gl', g)); }
  }

  /* ------------------------------------------------------------------ share, edit, restart, prefill */

  const KEYS = ['zip', 'util', 'age', 'htype', 'size', 'found', 'water', 'win', 'prev', 'heat', 'hage', 'wh', 'ac'] as const;
  let planHash = '';
  function writeHash(c: Ctx) {
    const a = c.a;
    const q = new URLSearchParams();
    for (const k of KEYS) if (a[k]) q.set(k, a[k]);
    if (a.sec.length) q.set('sec', a.sec.join(','));
    if (a.syms.length) q.set('sym', a.syms.join(','));
    if (a.goals.length) q.set('goal', a.goals.join(','));
    if (a.clim && !c.loc.metro) q.set('clim', a.clim);
    if (c.bill) q.set('bill', String(c.bill));
    if (c.eb) { q.set('es', String(c.eb.s)); q.set('esm', String(c.eb.sm)); q.set('ew', String(c.eb.w)); q.set('ewm', String(c.eb.wm)); }
    q.set('done', '1');
    planHash = q.toString();
    history.replaceState(null, '', `${location.pathname}#${planHash}`);
  }

  // In-page links (#assumptions, #rPrograms) would replace the #fragment that holds the plan,
  // so scroll to their targets instead.
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a || !a.closest('#results, #assumptions, #stickyBook')) return;
    const id = a.getAttribute('href')!.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    // open a collapsed section the link points into (the assumptions, a folded panel)
    const fold = target.tagName === 'DETAILS' ? target : target.querySelector(':scope > details') ?? target.closest('details');
    if (fold && !(fold as HTMLDetailsElement).open) (fold as HTMLDetailsElement).open = true;
    target.scrollIntoView({ block: 'start' });
  });

  /** Back to the wizard with every answer kept (Edit answers, Add your bills). */
  function openWizard(n: number) {
    resultsEl.hidden = true;
    plannerEl.hidden = false;
    if (journeyWizard) journeyWizard.hidden = false;
    maxStep = TOTAL;
    show(n);
    plannerEl.scrollIntoView({ block: 'start' });
  }
  document.getElementById('editBtn')?.addEventListener('click', () => openWizard(1));

  document.getElementById('restartBtn')?.addEventListener('click', () => {
    resultsEl.hidden = true;
    plannerEl.hidden = false;
    if (journeyWizard) journeyWizard.hidden = false;
    history.replaceState(null, '', location.pathname);
    planHash = '';
    maxStep = 1;
    show(1);
    plannerEl.scrollIntoView({ block: 'start' });
  });
  document.getElementById('copyLink')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(planHash ? `${location.origin}${location.pathname}#${planHash}` : location.href);
      btn.textContent = 'Link copied ✓';
      setTimeout(() => (btn.textContent = 'Copy link to this plan'), 2000);
    } catch { btn.textContent = 'Copy the address bar to share'; }
  });

  (function prefill() {
    // Read ?query (links from other pages) and #fragment (saved plans, the home page quick start,
    // the test screener); then drop the query so the answers never travel in a Referer header.
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    h.forEach((v, k) => q.set(k, v));
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    syncHeatAge();
    if (![...q.keys()].length) { show(1); return; }
    const set = (name: string, val: string | null) => {
      if (!val) return;
      const radio = form.querySelector<HTMLInputElement>(`[name="${name}"][value="${CSS.escape(val)}"]`);
      if (radio) { radio.checked = true; return; }
      const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]:not([type=radio]):not([type=checkbox])`);
      if (input) input.value = val;
    };
    const zip = q.get('zip') ?? (parseZip(q.get('postal') ?? '') ? q.get('postal') : null);
    if (zip) zipEl.value = zip;
    for (const k of KEYS) if (k !== 'zip' && k !== 'util') set(k, q.get(k));
    (q.get('sec') ?? '').split(',').filter(Boolean).forEach((v) => set('sec', v));
    (q.get('sym') ?? '').split(',').filter(Boolean).forEach((v) => set('sym', LEGACY_SYMPTOM[v] ?? v));
    if (q.has('goal')) {
      form.querySelectorAll<HTMLInputElement>('[name="goal"]').forEach((el) => (el.checked = false));
      (q.get('goal') ?? '').split(',').filter(Boolean).forEach((v) => set('goal', v));
    }
    syncHeatAge();
    const r = locate(zipEl.value, '');
    syncClimPicker(r.loc);
    const clim = q.get('clim');
    if (clim && D.metros[clim]) climPick.value = clim;
    if (zipEl.value) zipFeedback(false);
    set('util', q.get('util'));
    const heat = fieldVal('heat');
    const bill = q.get('bill') ?? (heat.startsWith('gas') ? q.get('gas') : ['oil', 'propane'].includes(heat) ? q.get('other') : null);
    if (bill && Number(bill) > 0) {
      billTouched = true;
      billEl.max = String(Math.max(Number(billEl.max), Math.ceil(Number(bill) / 50) * 50));
      billEl.value = String(Number(bill));
      fmtBill();
    }
    if (Number(q.get('es')) > 0 && Number(q.get('ew')) > 0) {
      elS.value = String(Number(q.get('es')));
      elW.value = String(Number(q.get('ew')));
      const sm = Number(q.get('esm')), wm = Number(q.get('ewm'));
      if (sm >= 0 && sm <= 11 && q.has('esm')) { elSm.value = String(sm); monthsTouched = true; }
      if (wm >= 0 && wm <= 11 && q.has('ewm')) { elWm.value = String(wm); monthsTouched = true; }
    }
    const ok = !!locate(zipEl.value, climPick.value).loc;
    if (q.get('done') === '1' && fieldVal('age') && ok) { maxStep = TOTAL; finish(); return; }
    // the home page already asked for the ZIP code (and maybe the year), so pick up at step 2
    if (ok) { maxStep = 2; show(2); return; }
    show(1);
  })();
}
