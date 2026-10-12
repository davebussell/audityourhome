/**
 * Home health check: radon, winter humidity and window condensation, smoke/CO alarms, mould.
 * Pure compute + HTML render, shared by the build-time first render and the browser.
 */
import {
  MODEL, bqToPci, pciToBq, dewPoint, glassTemp, maxRhNoCondensation, condensationStartsAt, alarmCounts,
  type WindowKey, type AlarmRules, type AlarmLayout,
} from '../../lib/calc/engine';
import { esc, degC, int, num, pct } from '../../lib/calc/format';

export interface HealthPayload {
  city: { slug: string; name: string; prov: string; provName: string; janMean: number; designHeat: number; nights10: number; nights20: number };
  radonDefault: { bq: number; label: string };
  alarms: { smoke: AlarmRules; coExisting: boolean | null; smokeRule: string; coRule: string; municipal: string | null };
  hIn: number;
}

export interface HealthState {
  radon: number | null;
  radonUnit: 'bq' | 'pci';
  tIn: number | null;
  rh: number | null;
  window: WindowKey;
  outdoor: 'jan' | 'design' | 'custom';
  tOut: number | null;
  layout: AlarmLayout;
  patches: number | null;
  area: number | null;
  areaUnit: 'm2' | 'sqft';
}

export function healthDefaults(p: HealthPayload): HealthState {
  return {
    radon: p.radonDefault.bq, radonUnit: 'bq',
    tIn: 21, rh: 40, window: 'doubleClear', outdoor: 'jan', tOut: null,
    layout: { levels: 3, bedroomLevels: 1, bedrooms: 3, sleepingAreas: 1, fuelBurning: true, attachedGarage: false },
    patches: 2, area: 0.5, areaUnit: 'm2',
  };
}

/* ------------------------------------------------------------------ radon */

export function renderRadon(s: HealthState, p: HealthPayload): string {
  const v = s.radon;
  if (v === null || !(v >= 0)) return '<p class="small">Enter a long-term test result to see what it means.</p>';
  const bq = s.radonUnit === 'pci' ? pciToBq(v) : v;
  const pci = bqToPci(bq);
  const g = 200;
  let verdict: string;
  if (bq > g) {
    verdict = `<div class="verdict bad"><p><strong>Above the Canadian guideline of 200 Bq/m³.</strong> Health Canada recommends taking corrective action within 1 year, and sooner the higher the level${bq >= 600 ? ': at three times the guideline, plan the fix now' : ''}.</p><p>A sub-slab depressurization system usually cuts radon by more than 80% (Health Canada) and costs about $2,000–$3,000; Take Action on Radon's data put the national average near $2,700. Hire a C-NRPP-certified mitigation professional.</p></div>`;
  } else if (bq === g) {
    verdict = `<div class="verdict warn"><p><strong>At the guideline.</strong> Health Canada's guideline is 200 Bq/m³; it advises keeping radon as low as reasonably achievable, so consider retesting in the heating season.</p></div>`;
  } else {
    verdict = `<div class="verdict"><p><strong>Below the guideline of 200 Bq/m³.</strong> No action is required. Health Canada still advises keeping radon as low as reasonably achievable, and retesting after major renovations or changes to the basement.</p></div>`;
  }
  const ratio = Math.min(1, bq / 800);
  return `<div class="res-head">
      <p class="res-big"><span class="money ${bq > g ? 'more' : ''}">${int(bq)}</span><span class="res-unit">Bq/m³ (${num(pci, 1)} pCi/L)</span></p>
      <div class="bar" aria-hidden="true"><span style="width:${(ratio * 100).toFixed(0)}%;${bq > g ? 'background:var(--dead)' : ''}"></span></div>
      <p class="small">Scale to 800 Bq/m³. 1 pCi/L = 37 Bq/m³.</p>
    </div>${verdict}
    <p class="small foot">Health Canada's lifetime lung cancer risk: for a never-smoker about 1% at low radon, 2% after lifetime exposure at 200 Bq/m³ and 5% at 800; for a smoker 12%, 17% and 30%. Only a test of 3 months or longer gives an annual average; short tests can mislead.</p>`;
}

/* ------------------------------------------------------------------ humidity & condensation */

export function outdoorTemp(s: HealthState, p: HealthPayload): number {
  if (s.outdoor === 'design') return p.city.designHeat;
  if (s.outdoor === 'custom' && s.tOut !== null) return s.tOut;
  return p.city.janMean;
}

export function renderHumidity(s: HealthState, p: HealthPayload): string {
  const tIn = s.tIn !== null && s.tIn >= 10 && s.tIn <= 30 ? s.tIn : 21;
  const rh = s.rh !== null && s.rh > 0 && s.rh <= 100 ? s.rh : 40;
  const tOut = Math.min(tIn - 0.1, outdoorTemp(s, p));
  const u = MODEL.envelope.windowU[s.window].u;
  const tg = glassTemp(tIn, tOut, u, p.hIn);
  const td = dewPoint(tIn, rh);
  const maxRh = maxRhNoCondensation(tIn, tOut, u, p.hIn);
  const startAt = condensationStartsAt(tIn, rh, u, p.hIn);
  const wet = tg < td;
  const cold = tOut < -10;
  const cmhc = cold
    ? `CMHC: when it is below −10 °C outside, keep indoor humidity at about 30%, and as low as 25% in extremely cold regions. ${esc(p.city.name)} averages ${int(p.city.nights10)} nights a year below −10 °C.`
    : `Health Canada and CMHC: keep indoor humidity between 30% and 50%. Below −10 °C outside, CMHC advises about 30%; ${esc(p.city.name)} averages ${int(p.city.nights10)} nights a year that cold.`;
  const verdict = wet
    ? `<div class="verdict bad"><p><strong>Condensation likely.</strong> At ${degC(tOut)} outside, the centre of the glass is about ${degC(tg)}, below the ${degC(td)} dew point of ${int(rh)}% humidity at ${degC(tIn, 0)}.</p></div>`
    : `<div class="verdict"><p><strong>The centre of the glass stays dry at ${degC(tOut)}.</strong> It is about ${degC(tg)}, above the ${degC(td)} dew point. The bottom edge and frame run colder, so condensation can start there first.</p></div>`;
  return `<div class="res-head">
      <p class="res-big"><span class="money">${int(Math.floor(maxRh))}%</span><span class="res-unit">highest humidity before the glass fogs at ${degC(tOut)}</span></p>
      <p class="res-sub">${esc(MODEL.envelope.windowU[s.window].label)} (U ${u}): condensation starts at about ${startAt > tIn ? 'any outdoor temperature' : degC(startAt)} outside with ${int(rh)}% humidity inside.</p>
    </div>${verdict}
    <p class="small foot">${cmhc}</p>`;
}

/* ------------------------------------------------------------------ alarms */

export function renderAlarms(s: HealthState, p: HealthPayload): string {
  const a = alarmCounts(s.layout, p.city.prov, p.alarms.smoke, p.alarms.coExisting);
  const lawTxt = a.smokeLaw === null
    ? `<span class="muted">${esc(a.smokeLawNote)}</span>`
    : `<strong>${a.smokeLaw}</strong>`;
  const coLaw = !a.coApplies
    ? 'No fuel-burning appliance or attached garage: no CO alarm needed under the rules we found.'
    : p.alarms.coExisting === true
      ? (a.coLaw !== null ? `Required: at least <strong>${a.coLaw}</strong> under ${esc(p.city.provName)} rules.` : `Required in ${esc(p.city.provName)}; the count isn't set out in the sources we read, so follow the recommendation.`)
      : p.alarms.coExisting === false
        ? `Not required by ${esc(p.city.provName)} law in an existing house, but strongly recommended.`
        : `We couldn't confirm a ${esc(p.city.provName)} rule for existing houses; install them anyway.`;
  return `<dl class="kv-grid">
      <dt>Smoke alarms required by law</dt><dd>${lawTxt}</dd>
      <dt>Smoke alarms for full coverage <span class="muted">(new-home standard)</span></dt><dd><strong>${a.smokeRecommended}</strong></dd>
      <dt>CO alarms recommended</dt><dd><strong>${a.coRecommended}</strong></dd>
    </dl>
    <p class="small" style="margin-top:10px">${coLaw}</p>
    ${p.alarms.municipal ? `<p class="small">${esc(p.alarms.municipal)}</p>` : ''}
    <p class="small foot">“Full coverage” follows the National Building Code for new homes: one on every storey including the basement, one in each bedroom and one outside each sleeping area, interconnected. CO: NRCan advises one near the furnace or other fuel-burning appliance and one in each bedroom area.</p>`;
}

/* ------------------------------------------------------------------ mould */

export function renderMould(s: HealthState): string {
  const patches = s.patches !== null && s.patches >= 0 ? Math.round(s.patches) : 0;
  const raw = s.area !== null && s.area >= 0 ? s.area : 0;
  const m2 = s.areaUnit === 'sqft' ? raw / 10.7639 : raw;
  if (patches === 0 || m2 === 0) return '<p class="small">No visible mould: keep humidity in range and fix any leaks quickly.</p>';
  let cls = 'verdict', title = '', body = '';
  if (m2 > 3) {
    cls = 'verdict bad'; title = 'Extensive: hire a professional.';
    body = 'A patch larger than 3 m² (about a 4 × 8 ft sheet of plywood) needs a trained mould remediation contractor (CMHC), and Health Canada advises professional help for extensive growth or mould that keeps coming back.';
  } else if (patches > 3 || m2 >= 1) {
    cls = 'verdict warn'; title = 'Medium: get trained help.';
    body = 'More than three patches, or patches of 1–3 m², call for trained help; CMHC says occupants may attempt it only with training and proper precautions.';
  } else {
    title = 'Small: you can clean it yourself if you are healthy.';
    body = 'Up to three patches, each under 1 m²: clean with water and unscented dish detergent, wearing safety glasses, an N95 mask and rubber gloves (CMHC). People at risk from mould should not clean it.';
  }
  return `<div class="${cls}"><p><strong>${title}</strong></p><p>${body}</p></div>
    <p class="small foot">Fix the moisture source first. Testing for mould types is usually unnecessary (Health Canada). You entered ${patches} patch${patches === 1 ? '' : 'es'}, the largest about ${num(m2, 1)} m².</p>`;
}

export { pct };
