/**
 * US Home Energy Planner, browser side. Reads the build-time payload embedded in the page,
 * runs the wizard and renders the plan. Nothing a visitor enters is stored or sent anywhere:
 * the ZIP lookup, the model and the program data are all in the page. Answers are kept in the
 * address bar's #fragment (never sent to a server or in a Referer header) so a plan can be
 * reloaded or shared; a ?query from another page is read once and removed.
 */
import { MODEL, isHeatPump } from '../calc/engine';
import type { SystemKey, Vintage, WindowKey } from '../calc/engine';
import {
  GJ_PER_MMBTU, houseModel, calibrateFuelBill, typicalFuelBill, itemSaving, usHeatingCost, usWaterHeaterCost,
  costPerMMBtuDelivered, zoneNumber, COMPARE, eraAssumptions, WINDOW_LABEL_US,
} from './plan-model';
import type { UsPrices, UsClimate, HouseModel, UsWaterHeater, UsCalibration, HouseInput } from './plan-model';
import { ERAS, buildSequence, energyTests, specialtyTests } from './plan-content';
import type { TestPick, TestInput } from './plan-content';
import type { PlanPayload } from './plan-payload';

type Chip = { cls: string; label: string; status: string };
type HerProgram = { s: string | null; chip: Chip; name: string | null; url: string | null };
type StateRec = {
  n: string; slug: string;
  p: { e: number; g: number | null; gy: string | null; o: number | null; pr: number | null };
  her: { homes: HerProgram; heehr: HerProgram } | null;
};
type MetroRec = {
  n: string; msa: string; st: string[];
  c: { h: number; k: number; z: string | null; r: number | null; co: string | null; stn: string | null; my: number | null; place: string | null; acs: string | null };
  a: { n: string; by: string | null; cost: string | null; s: string | null; chip: Chip; url: string | null }[];
};

export function startPlanner() {
  const D = JSON.parse(document.getElementById('planner-data')!.textContent!) as PlanPayload & {
    states: Record<string, StateRec>; metros: Record<string, MetroRec>;
  };

  const form = document.getElementById('plannerForm') as HTMLFormElement;
  const stepsNav = document.getElementById('stepsNav')!;
  const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
  const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
  const resultsEl = document.getElementById('results')!;
  const plannerEl = document.getElementById('planner')!;
  const zipEl = document.getElementById('zip') as HTMLInputElement;
  const zipFb = document.getElementById('zipFeedback')!;
  const climField = document.getElementById('climField')!;
  const climPick = document.getElementById('climPick') as HTMLSelectElement;
  const climLabel = document.getElementById('climLabel')!;
  const billEl = document.getElementById('fuelBill') as HTMLInputElement;
  const billOut = document.getElementById('fuelOut')!;
  const TOTAL = 6;
  let step = 1;
  let billTouched = false;
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
  const unitsTxt = (units: number, unit: string) => {
    if (!(units > 0)) return '';
    if (unit === 'kWh') return `${int(roundTo(units, units >= 1000 ? 100 : 10))} kWh`;
    const r = units >= 100 ? roundTo(units, 10) : Math.max(1, Math.round(units));
    return `${int(r)} ${r === 1 ? unit.replace(/s$/, '') : unit}`;
  };
  const ext = (href: string | null, text: string) => href ? `<a href="${esc(href)}" rel="noopener" target="_blank">${esc(text)} ↗</a>` : esc(text);

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

  function locate(raw: string, override: string): { loc?: Loc; error?: 'empty' | 'format' | 'unknown'; zip5?: string } {
    if (!raw.trim()) return { error: 'empty' };
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

  function zipFeedback(showErrors: boolean) {
    const r = locate(zipEl.value, climPick.value);
    syncClimPicker(r.loc);
    zipFb.className = 'zip-feedback';
    if (r.error === 'empty') { zipFb.innerHTML = showErrors ? '<p class="field-error">Enter the home’s 5-digit ZIP code.</p>' : ''; return r; }
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

  function show(n: number) {
    step = n;
    form.querySelectorAll<HTMLElement>('fieldset.step').forEach((f) => f.classList.toggle('on', f.dataset.step === String(n)));
    stepsNav.querySelectorAll<HTMLElement>('li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('on', s === n);
      li.classList.toggle('done', s < n);
      if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    backBtn.hidden = n === 1;
    nextBtn.textContent = n === TOTAL ? 'See my plan' : 'Next';
    if (n === 2) eraHint();
    if (n === 6) initBills();
    form.querySelectorAll('.step-error').forEach((e) => e.remove());
    const first = form.querySelector<HTMLElement>(`fieldset[data-step="${n}"] input`);
    first?.focus({ preventScroll: true });
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
    zip: string; age: Vintage; htype: string; size: string; found: string; water: string; win: string; prev: string;
    heat: string; hage: string; sec: string[]; wh: string; ac: string; syms: string[]; goals: string[]; clim: string;
  }
  function readAnswers(): Answers {
    return {
      zip: fieldVal('zip'),
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

  interface Ctx {
    a: Answers; loc: Loc; hi: HeatInfo; wk: UsWaterHeater | 'boiler'; prices: PriceInfo; clim: UsClimate | null;
    m: HouseModel | null; cal: UsCalibration; input: HouseInput; bill: number | null;
  }

  function context(): Ctx | null {
    const a = readAnswers();
    const r = locate(a.zip, a.clim);
    if (!r.loc) return null;
    const hi = heatInfo(a.heat, a.hage, a.age);
    const wk = whKey(a.wh, hi);
    const prices = pricesFor(r.loc.st);
    const clim = climateFor(r.loc.clim);
    const input: HouseInput = { age: a.age, htype: a.htype, size: a.size as HouseInput['size'], found: a.found, sys: hi.sys, wh: wk };
    const m = clim ? houseModel(input, clim, prices.p) : null;
    const bill = billTouched && hi.fuel !== 'elec' && m ? parseFloat(billEl.value) || null : null;
    const cal: UsCalibration = m && bill ? calibrateFuelBill(m, hi.sys, bill) : NO_CAL;
    return { a, loc: r.loc, hi, wk, prices, clim, m, cal, input, bill };
  }

  /* ------------------------------------------------------------------ bills step */

  const FUEL_BILL_LABEL: Record<string, string> = {
    gas: 'Average monthly natural gas bill',
    oil: 'Average monthly heating oil spend',
    propane: 'Average monthly propane spend',
  };
  function fmtBill() { billOut.textContent = billEl.value === '0' ? '$0' : `$${billEl.value}/mo`; }
  billEl.addEventListener('input', () => { billTouched = true; fmtBill(); });

  function initBills() {
    const c = context();
    const fuelBox = document.getElementById('billFuel')!;
    const elecBox = document.getElementById('billElec')!;
    const noClim = document.getElementById('billNoClim')!;
    if (!c) return;
    const electric = c.hi.fuel === 'elec';
    elecBox.hidden = !electric;
    fuelBox.hidden = electric || !c.m;
    noClim.hidden = electric || !!c.m;
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

  /* ------------------------------------------------------------------ results */

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

    renderArea(c);
    renderBenchmark(c);
    renderProfile(c);
    renderSequence(c);
    renderCompare(c);
    renderSystems(c);
    renderMethod(c);
    renderTests(c);
    renderPrograms(c);
    renderFind();
    renderResources(c);

    plannerEl.hidden = true;
    resultsEl.hidden = false;
    writeHash(c);
    const t = $('#rTitle');
    t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
    resultsEl.scrollIntoView({ block: 'start' });
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
    lines.push(['Heating oil', pr.national.oil
      ? `${dollars2(N.oilPerGal)}/gallon, U.S. average for the week of ${esc(P.oilWeek)} (national; EIA publishes no residential price for ${esc(sn(st))})`
      : `${dollars2(st.p.o!)}/gallon, ${esc(sn(st))}, week of ${esc(P.oilWeek)}`]);
    lines.push(['Propane', pr.national.propane
      ? `${dollars2(N.propanePerGal)}/gallon, U.S. average for the week of ${esc(P.propaneWeek)} (national; EIA publishes no residential price for ${esc(sn(st))})`
      : `${dollars2(st.p.pr!)}/gallon, ${esc(sn(st))}, week of ${esc(P.propaneWeek)}`]);
    return lines;
  }

  function renderArea(c: Ctx) {
    const loc = c.loc;
    const m = loc.clim ? D.metros[loc.clim] : null;
    const place = loc.metro
      ? `${esc(metroArea(loc.metro))} (${esc(D.metros[loc.metro].msa)}), ${esc(loc.st.n)}`
      : loc.near
        ? `${esc(loc.st.n)}, outside the 26 metro areas we cover`
        : `${esc(loc.st.n)}; none of the 26 metro areas we cover is in ${esc(sn(loc.st))}`;
    const climate = m
      ? `${int(m.c.h)} heating and ${int(m.c.k)} cooling degree days a year (°F, base 65)${m.c.z ? `, IECC climate zone ${esc(m.c.z)}` : ''}. <span class="src">${climSource(c)}.</span>`
      : `<b>No climate numbers.</b> Prices and programs below are for ${esc(sn(loc.st))}; dollar savings need a climate, so pick a stand-in below or leave them out.`;
    const rows = [['Location', place.charAt(0).toUpperCase() + place.slice(1)], ['Climate', climate], ...priceLines(c)];
    $('#rArea').innerHTML = `
      <div class="card card-pad area-card">
        <h3>The numbers behind your plan</h3>
        <ul class="kv">${rows.map(([k, v]) => `<li><span class="k">${k}</span><span>${v}</span></li>`).join('')}</ul>
        ${climPickerHtml(c, 'climPickArea')}
        <p class="meta">Prices: U.S. Energy Information Administration (EIA). Heating oil and propane prices exclude taxes. <a href="#assumptions">Sources and assumptions</a></p>
      </div>`;
  }

  function renderBenchmark(c: Ctx) {
    const el = $('#rBenchmark');
    el.innerHTML = '';
    if (!c.m || !c.bill || !c.cal.calibrated || c.a.htype === 'condo') return;
    const typical = typicalFuelBill(c.m);
    if (!typical) return;
    const fuelWord = c.hi.fuel === 'gas' ? 'natural gas' : c.hi.fuel === 'oil' ? 'heating oil' : 'propane';
    const user = c.bill * 12, typ = typical * 12;
    const lo = typ * 0.75, hi = typ * 1.25;
    const delta = Math.round(((user - typ) / typ) * 100);
    let verdict = '', cls = 'bench-ok';
    if (delta > 25) { verdict = `You’re spending about <b class="bench-up">${delta}% more</b> on ${fuelWord} than our estimate for a similar home. Part of that can be how a household lives (more people, warmer settings), and part is the house itself; a blower door test and your bill history separate the two.`; cls = 'bench-up'; }
    else if (delta < -25) verdict = `You’re spending about <b class="bench-ok">${Math.abs(delta)}% less</b> than our estimate for a similar home, so the house may already have had upgrades. We’ve scaled the savings below down to match.`;
    else verdict = 'You’re within the typical range for a similar home. Targeted upgrades can still take a meaningful bite.';
    const where = c.loc.climKind === 'metro' ? `in ${esc(metroArea(c.loc.clim!))}` : `with ${esc(metroName(c.loc.clim))}’s climate`;
    el.innerHTML = `
      <div class="card bench-card">
        <h3>Your ${fuelWord} spending vs. a similar home</h3>
        <div class="figures">
          <div class="fig"><div class="n ${cls}">${money(user)}</div><div class="l">your yearly ${fuelWord} spend, from your bill</div></div>
          <div class="fig"><div class="n">${money(lo)}–${money(hi)}</div><div class="l">typical for a similar home ${where}, at ${esc(sn(c.loc.st))} prices</div></div>
        </div>
        <p class="small">${verdict}</p>
        <p class="meta">Our model: about ${int(mmbtu(c.m.demand))} million Btu of heat a year for a typical house like yours, plus hot water if it uses the same fuel. Your bill puts your heating at about ${int(mmbtu(c.cal.actualDemandGJ ?? 0))} million Btu, so savings below are scaled by ${c.cal.factor.toFixed(2)}${c.cal.clamped ? ' (capped)' : ''}.</p>
      </div>`;
  }

  function renderProfile(c: Ctx) {
    const a = c.a;
    const era = ERAS[a.age];
    const ea = eraAssumptions(a.age);
    const win = a.win !== 'unsure' ? `${WINDOW_LABEL_US[winKey(a.win, a.age)]} (your answer)` : `${WINDOW_LABEL_US[ea.window]} (typical for the era)`;
    const found = a.found === 'basement' ? `Basement walls about R-${ea.basementR}`
      : a.found === 'crawl' ? 'Crawlspace (no dollar estimate for it)'
        : a.found === 'slab' ? 'Slab on grade, so no basement walls to insulate'
          : `Modeled as a basement, walls about R-${ea.basementR}`;
    $('#rWalls').innerHTML = `
      <h3>What the model assumes is behind your walls</h3>
      <p class="small">Starting points for a typical house of this era. They are the same as our Canadian model’s; US homes of the same age vary, and an audit measures yours.</p>
      <ul class="kv">
        <li><span class="k">Walls</span><span>About R-${ea.wallR}</span></li>
        <li><span class="k">Attic</span><span>About R-${ea.atticR}</span></li>
        <li><span class="k">Air leaks</span><span>${esc(era.air)}</span></li>
        <li><span class="k">Windows</span><span>${esc(win.charAt(0).toUpperCase() + win.slice(1))}</span></li>
        <li><span class="k">Foundation</span><span>${esc(found)}</span></li>
      </ul>`;
    $('#rWatch').innerHTML = `
      <h3>Watch for these</h3>
      ${era.watch.map((w) => `<div class="watch-item ${w.severity}"><b>${esc(w.flag)}</b>${esc(w.detail)}</div>`).join('')}`;
  }

  function renderSequence(c: Ctx) {
    const el = $('#rSequence');
    const a = c.a;
    if (a.htype === 'condo') {
      el.innerHTML = `
        <div class="rsec"><h3>Condos and apartments work differently</h3>
        <p class="sub">Most audits and rebates are built around houses and townhouses. In a condo or apartment, the building envelope and often the heating belong to the association. Your levers: sealing and weatherstripping inside your unit, window coverings, a heat pump conversation with your board, and pushing the association toward a building-level audit.</p></div>`;
      return;
    }
    const seq = buildSequence({ age: a.age, heat: a.heat, wh: a.wh, win: a.win, found: a.found, syms: a.syms, goals: a.goals });
    const m = c.m;
    const rText = (t: string) => t.replace(/\bR(\d+)/g, 'R-$1').replace(/[.\s]+$/, '');
    const atticNote = () => {
      const z = zoneNumber(c.clim?.zone);
      return z && D.insulation.atticText[z] ? `ENERGY STAR’s retrofit table for climate zone ${esc(c.clim!.zone)}: ${esc(rText(D.insulation.atticText[z]))}.` : '';
    };
    const rows = seq.map((item) => {
      let saveTxt = '';
      let note = '';
      let chips = '';
      let extra = '';
      if (m && c.clim) {
        const s = itemSaving(item.category, c.input, m, c.clim, c.prices.p, c.cal.factor, D.insulation.attic, winKey(a.win, a.age));
        if (s.note) note = s.note;
        if (s.dollars !== null) {
          if (s.dollars >= 15) {
            const u = s.units ? unitsTxt(s.units, s.unit) : '';
            saveTxt = `about ${money(s.dollars)}/yr <span class="save-range">(likely ${money(s.dollars * 0.75)}–${money(s.dollars * 1.25)}${u ? `; about ${u}` : ''})</span>`;
          } else if (item.category === 'heat-pump' && s.dollars < 0) {
            saveTxt = `<span class="save-neg">costs about ${money(-s.dollars)}/yr more to run than your current heating at these prices</span>`;
          } else if (!['ventilation', 'solar', 'crawlspace'].includes(item.category)) {
            const coolingSide = c.clim.cdd65 > c.clim.hdd65 && ['air-sealing', 'attic-insulation', 'wall-insulation', 'windows-doors'].includes(item.category);
            saveTxt = coolingSide
              ? '<span class="save-small">little heating-bill saving here; the air-conditioning saving isn’t estimated</span>'
              : '<span class="save-small">little or no heating-bill saving for a house like yours</span>';
          }
          if (item.category === 'heat-pump' && s.dollars < 15) {
            extra = c.clim.cdd65 > c.clim.hdd65
              ? ' Air conditioning dominates here and this estimate counts heating only, so a heat pump’s cooling efficiency is the bigger story.'
              : ' At these prices, the case for a heat pump is comfort and air conditioning more than the heating bill.';
          }
        }
      }
      if (item.category === 'attic-insulation' && c.clim) extra += ' ' + atticNote();
      if (item.category === 'crawlspace') {
        const z = zoneNumber(c.clim?.zone);
        if (z && D.insulation.floorText[z]) extra += ` ENERGY STAR’s retrofit table gives ${esc(rText(D.insulation.floorText[z]))} for floors in climate zone ${esc(c.clim!.zone)}.`;
        extra += ' We don’t estimate a dollar saving for crawlspaces.';
      }
      if (item.category === 'heat-pump') chips += '<span class="chip chip-closed" title="The federal 25C tax credit ended for work after December 31, 2025">25C credit ended 2025</span>';
      if (item.category === 'solar') chips += '<span class="chip chip-closed" title="The federal 25D tax credit ended for systems installed after December 31, 2025">25D credit ended 2025</span>';
      return `
        <div class="seq-item">
          <h4>${esc(item.action)}${note ? ` <span class="small">(${esc(note)})</span>` : ''}</h4>
          <p class="why">${esc(item.why)}${extra}</p>
          ${saveTxt || chips ? `<div class="nums">${saveTxt ? `<span class="save">${saveTxt}</span>` : ''}${chips}</div>` : ''}
        </div>`;
    });
    let basis = '';
    if (!m) {
      basis = `<span class="chip chip-neutral">No dollar estimates</span> None of the metro areas we cover is in ${esc(sn(c.loc.st))}, so there are no climate numbers to estimate with. Pick a stand-in under “The numbers behind your plan” to see rough figures.`;
    } else if (c.cal.calibrated) {
      basis = `<span class="chip chip-active">Scaled to your bill</span> Dollar figures use your ${c.hi.fuel === 'gas' ? 'gas' : c.hi.fuel} bill, ${esc(sn(c.loc.st))} prices and ${c.loc.climKind === 'metro' ? 'your area’s climate' : `${esc(metroName(c.loc.clim))}’s climate`}.`;
    } else {
      const add = c.hi.fuel === 'elec' ? '' : ' <a href="#" id="addBills">Add your heating bill</a> to scale these to your house.';
      basis = `<span class="chip chip-neutral">Typical house estimate</span> Based on ${esc(ERAS[a.age].typical)} with ${c.loc.climKind === 'metro' ? 'your area’s climate' : `${esc(metroName(c.loc.clim))}’s climate`} and ${esc(sn(c.loc.st))} prices.${add}`;
    }
    el.innerHTML = `
      <div class="rsec">
        <h3>Your upgrade sequence</h3>
        <p class="sub">Ordered for your home’s era, heating and the problems you flagged. ${basis}</p>
        <div class="seq">${rows.join('')}</div>
        <p class="small">Savings don’t simply add up: once the attic is insulated there is less heat left to save elsewhere. The figures count heating only, not air conditioning, and stay on the low side on purpose. We don’t show installed prices or paybacks because we haven’t verified US installation costs yet; get two or three written quotes.</p>
        <p class="small tax-note"><b>Federal tax credits:</b> the 25C (Energy Efficient Home Improvement) and 25D (Residential Clean Energy) credits ended for work after December 31, 2025, so none of these upgrades earns a federal tax credit in 2026. State and utility programs are listed under <a href="#rPrograms">Programs</a>.</p>
      </div>`;
    document.getElementById('addBills')?.addEventListener('click', (e) => {
      e.preventDefault();
      resultsEl.hidden = true;
      plannerEl.hidden = false;
      show(6);
      plannerEl.scrollIntoView({ block: 'start' });
    });
  }

  function renderCompare(c: Ctx) {
    const el = $('#rCompare');
    if (c.a.htype === 'condo') { el.innerHTML = ''; return; }
    const p = c.prices.p;
    const st = c.loc.st;
    const fuelOfRow = (sys: SystemKey) => (MODEL.systems[sys] as { fuel: string }).fuel;
    const current = c.hi.sys;
    const rows = [...COMPARE];
    if (!rows.some((r) => r.sys === current)) rows.unshift({ key: 'current', label: `Your ${c.hi.short} (${(MODEL.systems[current] as { label: string }).label.replace(/^[^(]*\(/, '').replace(/\)$/, '')})`, sys: current });
    if (c.m && c.clim) {
      const demand = c.m.demand * c.cal.factor;
      const list = rows.map((r) => ({ r, cost: usHeatingCost(demand, r.sys, c.m!.hddC, p) })).sort((x, y) => (x.cost.cost ?? 1e12) - (y.cost.cost ?? 1e12));
      const nat = (fuel: string) => (fuel === 'gas' && c.prices.national.gas) || (fuel === 'oil' && c.prices.national.oil) || (fuel === 'propane' && c.prices.national.propane);
      const body = list.map(({ r, cost }) => `
        <tr class="${r.sys === current ? 'is-current' : ''}">
          <td data-label="System">${esc(r.label)}${r.sys === current ? ' <span class="chip chip-info">yours</span>' : ''}${r.note ? `<span class="small block">${esc(r.note)}</span>` : ''}</td>
          <td data-label="Energy a year">${unitsTxt(cost.units, cost.unit)}${isHeatPump(r.sys) ? ` <span class="small">(seasonal COP ${cost.eff.toFixed(1)})</span>` : ''}</td>
          <td data-label="Cost a year"><b>${cost.cost !== null ? money(cost.cost) : '—'}</b>${nat(fuelOfRow(r.sys)) ? ' <span class="small">(U.S. price)</span>' : ''}</td>
        </tr>`).join('');
      el.innerHTML = `
        <div class="rsec">
          <h3>Heating costs compared</h3>
          <p class="sub">The same house, about ${int(mmbtu(demand))} million Btu of heat a year${c.cal.calibrated ? ' (scaled to your bill)' : ''}, heated different ways at ${esc(sn(st))} prices. Heat pump efficiency is set for ${c.loc.climKind === 'metro' ? 'your climate' : `${esc(metroName(c.loc.clim))}’s climate`} and includes backup heat.</p>
          <div class="tablewrap card"><table class="stack compare">
            <thead><tr><th>System</th><th>Energy a year</th><th>Cost a year</th></tr></thead>
            <tbody>${body}</tbody>
          </table></div>
          <p class="small">Equipment prices aren’t included. Efficiencies and heat pump performance are the same planning values as our Canadian model.</p>
        </div>`;
    } else {
      const N = D.national;
      const band = MODEL.ashpCopBands;
      const mild = band[0], cold = band[band.length - 1];
      const perRow = rows.filter((r) => !isHeatPump(r.sys)).map((r) => {
        const s = MODEL.systems[r.sys] as { fuel: string; eff?: number };
        return { r, v: costPerMMBtuDelivered(s.fuel as never, s.eff ?? 1, p) };
      }).sort((x, y) => (x.v ?? 1e9) - (y.v ?? 1e9)).map(({ r, v }) =>
        `<tr class="${r.sys === current ? 'is-current' : ''}"><td data-label="System">${esc(r.label)}${r.sys === current ? ' <span class="chip chip-info">yours</span>' : ''}${r.note ? `<span class="small block">${esc(r.note)}</span>` : ''}</td><td data-label="Cost per million Btu of heat"><b>${v !== null ? dollars2(v) : '—'}</b></td></tr>`);
      const hp = (label: string, mildCop: number, coldCop: number, sys: SystemKey) => {
        const a1 = costPerMMBtuDelivered('electricity', mildCop, p), a2 = costPerMMBtuDelivered('electricity', coldCop, p);
        const val = mildCop === coldCop ? `<b>${dollars2(a1!)}</b>` : `<b>${dollars2(a1!)}–${dollars2(a2!)}</b> <span class="small">(mild to cold winters)</span>`;
        return `<tr class="${sys === current ? 'is-current' : ''}"><td data-label="System">${esc(label)}${sys === current ? ' <span class="chip chip-info">yours</span>' : ''}</td><td data-label="Cost per million Btu of heat">${val}</td></tr>`;
      };
      el.innerHTML = `
        <div class="rsec">
          <h3>What a unit of heat costs</h3>
          <p class="sub">Without climate numbers we can’t total a year, but we can price the heat itself: the cost of 1 million Btu delivered into the house at ${esc(sn(st))} prices.</p>
          <div class="tablewrap card"><table class="stack compare">
            <thead><tr><th>System</th><th>Cost per million Btu of heat</th></tr></thead>
            <tbody>${perRow.join('')}${hp('Air-source heat pump, cold-climate', mild.coldClimate, cold.coldClimate, 'ashpCold')}${hp('Air-source heat pump, standard', mild.standard, cold.standard, 'ashpStandard')}${hp('Geothermal (ground-source) heat pump', (MODEL.systems.gshp as { eff: number }).eff, (MODEL.systems.gshp as { eff: number }).eff, 'gshp')}</tbody>
          </table></div>
          <p class="small">Heat pump figures span our model’s seasonal efficiency from its mildest to its coldest climate band (${mild.coldClimate} down to ${cold.coldClimate} for cold-climate models).${nationalNote(c)}</p>
        </div>`;
    }
  }

  /** " Heating oil uses the U.S. average ($6.04 a gallon) because EIA publishes no Montana price." */
  function nationalNote(c: Ctx): string {
    const N = D.national;
    const parts: string[] = [];
    if (c.prices.national.gas) parts.push(`natural gas the U.S. average (${dollars2(N.gasPerTherm)} a therm)`);
    if (c.prices.national.oil) parts.push(`heating oil the U.S. average (${dollars2(N.oilPerGal)} a gallon)`);
    if (c.prices.national.propane) parts.push(`propane the U.S. average (${dollars2(N.propanePerGal)} a gallon)`);
    if (!parts.length) return '';
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return ` EIA publishes no ${esc(sn(c.loc.st))} price for ${parts.length > 1 ? 'some fuels' : 'one fuel'}, so we use ${list}.`;
  }

  function renderSystems(c: Ctx) {
    const el = $('#rSystems');
    const a = c.a;
    if (a.htype === 'condo') { el.innerHTML = ''; return; }
    const cards: string[] = [];
    const m = c.m;
    const p = c.prices.p;
    if (m && c.clim) {
      const wc = m.waterCost;
      if (wc.cost !== null) {
        const alts: string[] = [];
        if (c.wk !== 'heatPump') {
          const hp = usWaterHeaterCost('heatPump', m.water.gj, p, { sys: c.hi.sys, hddC: m.hddC });
          if (hp.cost !== null) alts.push(`a heat pump water heater about ${money(hp.cost + hp.extraCost)}/yr`);
        }
        if (c.wk === 'gasTank') {
          const tl = usWaterHeaterCost('gasTankless', m.water.gj, p);
          if (tl.cost !== null) alts.push(`gas tankless about ${money(tl.cost)}/yr (DOE: on-demand units can be 24–34% more efficient than tanks in homes using 41 gallons or less a day)`);
        }
        cards.push(`<div class="sys-card"><h4>Hot water: ${esc(WH_NAME[c.wk] ?? c.wk)}${a.wh === 'unsure' ? ' (assumed)' : ''}</h4>
          <p class="small">About <b>${money(wc.cost)}/yr</b> (${unitsTxt(wc.units, wc.unit)}) for a household of three; cold water arrives at about ${Math.round(fahrenheit(m.water.inletC))}\u00a0°F with this climate.${alts.length ? ' Alternatives: ' + alts.join('; ') + '.' : ''}${c.wk === 'heatPump' || alts.length ? ' Heat pump water heater costs include the extra heating to replace the warmth they pull from the house in winter.' : ''}</p></div>`);
      }
      const cool = c.clim.cdd65 > c.clim.hdd65;
      const acTxt = a.ac === 'central-old' ? ' Replacing an older central air conditioner is a natural time to switch to a heat pump: one unit then cools and heats.'
        : a.ac === 'room' ? ' Window units cool one room at a time; a ductless heat pump can replace several and heat as well.'
          : a.ac === 'none' ? '' : '';
      cards.push(`<div class="sys-card"><h4>Cooling</h4>
        <p class="small">${int(c.clim.cdd65)} cooling degree days a year against ${int(c.clim.hdd65)} heating degree days${cool ? ': cooling, not heating, drives energy use here' : ''}. We don’t estimate air-conditioning energy: the method our model uses needs a design temperature we don’t have for US metro areas. A Manual J load calculation sizes the equipment.${acTxt}</p></div>`);
    }
    if (a.win !== 'unsure') {
      const wk = winKey(a.win, a.age);
      const msg = (wk === 'single' || wk === 'singleStorm')
        ? 'Single glazing loses far more heat than an insulated wall, so replacement can pay here, but air sealing, attic and basement work usually pay faster. Storm windows are a cheaper middle step.'
        : wk === 'doubleClear'
          ? 'Older double-pane windows still work; replacing them mostly buys comfort and quiet. Do it when they fail or during a renovation, and seal around the frames now.'
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
      cards.push('<div class="sys-card"><h4>Free heat from the sun</h4><p class="small">Sunny south windows supply real heat on clear winter days. Our estimate allows for typical solar gain; if your bills come in below the typical range, this is one reason. Keep low-e coatings in mind when replacing south-facing glass.</p></div>');
    }
    if (a.prev === 'recent' || a.prev === 'older') {
      cards.push(`<div class="sys-card prev"><h4>You’ve had an audit before</h4><p class="small">Dig out the report: its blower door number and upgrade list are still useful for planning${a.prev === 'older' ? ', though renovations since then change the numbers' : ''}. Whether an old audit counts toward a program depends on that program’s rules.</p></div>`);
    }
    el.innerHTML = cards.length ? `<div class="rsec"><h3>Your home’s systems</h3><p class="sub">At ${esc(sn(c.loc.st))} prices${c.clim ? ` and ${c.loc.climKind === 'metro' ? 'your area’s' : `${esc(metroName(c.loc.clim))}’s`} climate` : ''}.</p><div class="sys-grid">${cards.join('')}</div></div>` : '';
  }

  function renderMethod(c: Ctx) {
    const loc = c.loc;
    const m = c.m;
    const where = loc.metro
      ? `Your ZIP code (${esc(loc.zip5)}) is in ${esc(metroArea(loc.metro))}, using Census ZIP code areas and the 2023 metro area definitions.`
      : loc.near
        ? `Your ZIP code (${esc(loc.zip5)}) is in ${esc(sn(loc.st))}, outside the 26 metro areas we cover.`
        : `Your ZIP code (${esc(loc.zip5)}) is in ${esc(sn(loc.st))}; none of the 26 metro areas we cover is in ${esc(sn(loc.st))}.`;
    const clim = c.clim && m
      ? ` Climate: ${int(c.clim.hdd65)} heating degree days (°F), ${climSource(c)}. The model works in °C degree days, so we divide by 1.8. A typical house like yours needs about <b>${int(mmbtu(m.demand))} million Btu</b> of heat a year (our Canadian model’s heating need per square foot for your era, scaled to this climate).${c.cal.calibrated ? ` Your bill points to about <b>${int(mmbtu(c.cal.actualDemandGJ ?? 0))} million Btu</b>, so we scaled every saving by ${c.cal.factor.toFixed(2)}${c.cal.clamped ? ' (we cap the scaling between 0.5 and 1.6)' : ''}.` : c.hi.fuel === 'elec' ? ' We don’t scale electrically heated homes to a bill, because one electric bill mixes heating, cooling, hot water and appliances.' : ' Without your bill, we use the typical figure.'}`
      : ' Without climate numbers there are no yearly dollar figures; the order of the upgrades, the prices and the programs still apply.';
    $('#rMethod').innerHTML = `
      <details class="card card-pad method">
        <summary><strong>How we got these numbers</strong> <span class="small">(and why they’re conservative)</span></summary>
        <p class="small">${where}${clim}</p>
        <p class="small">Each upgrade’s saving comes from the physics of that part of the house (R-values, window U-factors, air leakage) at your degree days, then we multiply by 0.75 (0.4 for basements) because sun, people and appliances already supply free heat and real installations underperform their labels. No single upgrade is credited with more than 35% of your heating, and all of them together with no more than 60%. Those rules, the efficiencies and the heat pump performance are the same as our Canadian model’s.</p>
        <p class="small">Savings are valued at EIA’s average prices, which include fixed monthly charges, so they can run a little high: one more therm or kilowatt-hour usually costs less than the average. (The Canadian model uses that lower next-unit price; we don’t have it for US utilities.)</p>
        ${climPickerHtml(c, 'climPickMethod')}
        <p class="small"><a href="#assumptions">Every assumption and source →</a> · <a href="/us/how-it-works/">How a home energy audit works →</a></p>
      </details>`;
    wireClimPickers(c);
  }

  /* ---------------------------------------------------------------- tests */

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
  const LEVEL_CHIP: Record<string, string> = {
    'strongly-flagged': '<span class="chip chip-info">flagged for your home</span>',
    flagged: '<span class="chip chip-limited">flagged</span>',
    recommended: '<span class="chip chip-neutral">recommended</span>',
  };

  function testCard(t: TestPick, health: boolean) {
    return `
      <div class="test-card${health ? ' health' : ''}">
        <span class="ticon" aria-hidden="true">${ICONS[t.icon] ?? ''}</span>
        <div>
          <h4><a class="tname" href="/us/tests/${t.slug}/">${esc(t.name)}</a>${t.level ? ` ${LEVEL_CHIP[t.level]}` : ''}</h4>
          <p class="tw">${esc(t.why)}</p>
          ${t.note ? `<p class="test-est">${esc(t.note)}</p>` : ''}
        </div>
      </div>`;
  }

  function renderTests(c: Ctx) {
    const el = $('#rTests');
    const a = c.a;
    const metro = c.loc.metro ? D.metros[c.loc.metro] : null;
    const ti: TestInput = {
      age: a.age, heat: a.heat, wh: a.wh, sec: a.sec, water: a.water, syms: a.syms, goals: a.goals, ac: a.ac,
      state: c.loc.state, stateName: c.loc.st.n, zone: c.clim?.zone ?? null,
      radonZone: metro?.c.r ?? null, radonCounty: metro?.c.co ?? null,
    };
    const energy = a.htype === 'condo' ? [] : energyTests(ti, D.tests);
    const health = specialtyTests(ti, D.tests);
    el.innerHTML = `
      <div class="rsec">
        ${energy.length ? `<h3>Tests to ask your auditor for</h3>
        <p class="sub">Ask for these by name; they turn “probably” into measurements. <a href="/us/tests/">The complete testing guide →</a></p>
        <div class="test-grid">${energy.map((t) => testCard(t, false)).join('')}</div>` : ''}
        <h3 class="${energy.length ? 'spec-h' : ''}">Health and safety tests flagged for your home</h3>
        <p class="sub">Screened from your answers: era, heating, water source and symptoms. Each links to its full guide.</p>
        <div class="test-grid">${health.map((t) => testCard(t, true)).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="copyTests">Copy my test checklist</button>
      </div>`;
    const names = [...energy, ...health].map((t) => t.name);
    document.getElementById('copyTests')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText('Tests to include in my home energy audit:\n' + names.map((n) => '• ' + n).join('\n'));
        btn.textContent = 'Checklist copied ✓';
        setTimeout(() => (btn.textContent = 'Copy my test checklist'), 2000);
      } catch { /* clipboard unavailable */ }
    });
  }

  /* ---------------------------------------------------------------- programs */

  const isOpen = (chip: Chip) => chip.status === 'open' || (chip.status === 'limited' && !/^(Paused|Waitlist)/.test(chip.label));

  function renderPrograms(c: Ctx) {
    const el = $('#rPrograms');
    const st = c.loc.st;
    const stLink = `/us/programs/states/${st.slug}/`;
    const metro = c.loc.metro ? D.metros[c.loc.metro] : null;
    const her = st.her;
    const herRow = (label: string, prog: HerProgram) => `
      <div class="prog-row">
        <span class="pname">${esc(label)}</span>
        <span class="chip ${prog.chip.cls}">${esc(prog.chip.label)}</span>
        <span class="hl">${prog.s ? esc(prog.s) : `No status we could confirm on ${esc(sn(st))}’s own program pages.`}</span>
        ${prog.url ? `<span class="hl hl-link">${ext(prog.url, 'State program page')}</span>` : ''}
      </div>`;
    const herOpen = her ? isOpen(her.homes.chip) || isOpen(her.heehr.chip) : false;
    const herCard = `
      <div class="card card-pad prog-card">
        <h4>Federal home energy rebates in ${esc(sn(st))}</h4>
        <p class="small">Two federally funded programs run by each state: HOMES (whole-home efficiency rebates) and HEEHR (electric home rebates, formerly called HEAR).</p>
        ${her ? herRow('HOMES: whole-home efficiency', her.homes) + herRow('HEEHR: electric appliances and heat pumps', her.heehr) : ''}
        ${herOpen ? '' : `<p class="nothing-open"><b>Nothing open:</b> neither federal home energy rebate program is taking applications in ${esc(sn(st))} right now, based on our October 2026 check.</p>`}
        <p class="small"><a href="${stLink}">${esc(sn(st))} rebates and programs →</a></p>
      </div>`;

    let auditCard = '';
    if (metro) {
      const sorted = [...metro.a].sort((x, y) => Number(isOpen(y.chip)) - Number(isOpen(x.chip)));
      const anyOpen = metro.a.some((x) => isOpen(x.chip));
      auditCard = `
        <div class="card card-pad prog-card">
          <h4>Home energy assessments in ${esc(metroArea(c.loc.metro!))}</h4>
          ${sorted.map((x) => `
            <div class="prog-row">
              <span class="pname">${ext(x.url, x.n)}</span>
              <span class="chip ${x.chip.cls}">${esc(x.chip.label)}</span>
              ${x.by ? `<span class="hl">${esc(x.by)}</span>` : ''}
              ${x.cost ? `<span class="hl"><b>Cost:</b> ${esc(x.cost)}</span>` : ''}
              ${x.s ? `<span class="hl"><b>Status:</b> ${esc(x.s)}</span>` : ''}
            </div>`).join('')}
          ${anyOpen ? '' : `<p class="nothing-open"><b>Nothing open:</b> none of the assessment programs we track for ${esc(metroArea(c.loc.metro!))} is taking sign-ups right now.</p>`}
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

    const credits = `
      <div class="card card-pad prog-card">
        <h4>Federal tax credits ended</h4>
        <p class="small">The 25C (Energy Efficient Home Improvement) and 25D (Residential Clean Energy) tax credits ended for work after December 31, 2025, including 25C’s $150 credit for a home energy audit. Work done in 2025 is still claimed on 2025 returns (Form 5695).${D.rebateFinderUrl ? ` ENERGY STAR’s ${ext(D.rebateFinderUrl, 'Rebate Finder')} searches utility and local offers by ZIP code.` : ''}</p>
      </div>`;

    const help = `
      <div class="card card-pad prog-card">
        <h4>If money is tight</h4>
        <p class="small">The federal Weatherization Assistance Program pays for an energy audit and the cost-effective work it finds for households at or below 200% of the federal poverty guidelines (Program Year 2026 average spending limit: $8,813 per home). ${ext(D.wapUrl, 'How to apply, from DOE')}. LIHEAP helps with heating and cooling bills through your state or local LIHEAP office.</p>
      </div>`;

    el.innerHTML = `
      <div class="rsec">
        <h3>Programs for your area</h3>
        <p class="sub">Checked against official pages on ${esc(D.verified)}. Program details change, so confirm before spending. <a href="/us/programs/">All US programs →</a></p>
        <div class="prog-grid">${herCard}${auditCard}${credits}${help}</div>
      </div>`;
  }

  function renderFind() {
    const items = (D.credentials as { name: string; by: string; url: string | null }[]).map((cr) =>
      `<li>${cr.url ? ext(cr.url, cr.name) : esc(cr.name)} <span class="small">${esc(cr.by.split(';')[0])}</span></li>`).join('');
    $('#rFind').innerHTML = `
      <div class="rsec">
        <h3>Find a certified auditor</h3>
        <p class="sub">Ask which credential the auditor holds and whether the visit includes a blower door test. These official finders search by location; you can also start with <a href="/us/find/">our US directory</a>.</p>
        <ul class="res-list">${items}</ul>
      </div>`;
  }

  function renderResources(c: Ctx) {
    const items = [
      `<li><a href="/us/how-it-works/">How a home energy audit works</a>: what happens during the visit, step by step</li>`,
      `<li><a href="/us/cost/">What an audit costs</a>, and who pays for some or all of it</li>`,
      `<li><a href="/us/programs/states/${c.loc.st.slug}/">${esc(sn(c.loc.st))} rebates and programs</a>, checked against official pages</li>`,
      c.loc.metro ? `<li><a href="/us/cities/${c.loc.metro}/">The ${esc(metroName(c.loc.metro))} metro guide</a>: utilities, assessments and local rules</li>` : '',
      `<li><a href="/us/tests/">The complete testing guide</a>: every test from blower doors to radon, and who performs it</li>`,
      `<li><a href="/us/products/">Monitoring and testing gear</a>: radon, CO and humidity monitors</li>`,
    ].filter(Boolean);
    $('#rResources').innerHTML = `<div class="rsec"><h3>Resources for your plan</h3><ul class="res-list">${items.join('')}</ul></div>`;
  }

  /* ------------------------------------------------------------------ share, restart, prefill */

  const KEYS = ['zip', 'age', 'htype', 'size', 'found', 'water', 'win', 'prev', 'heat', 'hage', 'wh', 'ac'] as const;
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
    q.set('done', '1');
    planHash = q.toString();
    history.replaceState(null, '', `${location.pathname}#${planHash}`);
  }

  // In-page links (#assumptions, #rPrograms) would replace the #fragment that holds the plan,
  // so scroll to their targets instead.
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a || !a.closest('#results, #assumptions')) return;
    const id = a.getAttribute('href')!.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ block: 'start' });
  });

  document.getElementById('restartBtn')?.addEventListener('click', () => {
    resultsEl.hidden = true;
    plannerEl.hidden = false;
    history.replaceState(null, '', location.pathname);
    planHash = '';
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
    // Read ?query (links from other pages, such as the ZIP form on /us/) and #fragment (saved
    // plans); then drop the query so the answers never travel in a Referer header.
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    h.forEach((v, k) => q.set(k, v));
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    syncHeatAge();
    if (![...q.keys()].length) return;
    const set = (name: string, val: string | null) => {
      if (!val) return;
      const radio = form.querySelector<HTMLInputElement>(`[name="${name}"][value="${CSS.escape(val)}"]`);
      if (radio) { radio.checked = true; return; }
      const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]:not([type=radio]):not([type=checkbox])`);
      if (input) input.value = val;
    };
    const zip = q.get('zip') ?? (parseZip(q.get('postal') ?? '') ? q.get('postal') : null);
    if (zip) zipEl.value = zip;
    for (const k of KEYS) if (k !== 'zip') set(k, q.get(k));
    (q.get('sec') ?? '').split(',').filter(Boolean).forEach((v) => set('sec', v));
    (q.get('sym') ?? '').split(',').filter(Boolean).forEach((v) => set('sym', v === 'condensation-mould' ? 'condensation-mold' : v));
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
    const heat = fieldVal('heat');
    const bill = q.get('bill') ?? (heat.startsWith('gas') ? q.get('gas') : ['oil', 'propane'].includes(heat) ? q.get('other') : null);
    if (bill && Number(bill) > 0) {
      billTouched = true;
      billEl.max = String(Math.max(Number(billEl.max), Math.ceil(Number(bill) / 50) * 50));
      billEl.value = String(Number(bill));
      fmtBill();
    }
    if (q.get('done') === '1' && fieldVal('age') && locate(zipEl.value, climPick.value).loc) finish();
  })();
}
