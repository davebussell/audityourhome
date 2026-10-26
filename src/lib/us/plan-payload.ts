/**
 * Build-time data for the US Home Energy Planner (/us/plan/). Everything comes from the US
 * research files (src/data/us/, verified October 12, 2026) through the helpers in data.ts and
 * programs.ts, the cooling model (src/data/us/cooling-model.json, checked October 26, 2026), the
 * regional climate profiles (src/data/climate/us.json), the test reading guides
 * (src/data/reading-guides.json) and the Census-built ZIP3 table (src/data/us/zip3.json). The page
 * embeds the result as JSON, so the planner runs entirely in the browser and nothing a visitor
 * enters is sent anywhere.
 *
 * Federal Home Energy Rebate status comes from programs.ts STATES, the same records
 * /us/programs/states/<state>/ and the /us/ home page read, including the metro research that
 * programs.ts folds in (Arizona's status comes from our Phoenix research on Efficiency Arizona).
 */
import { STATE_NAMES, METROS, statePrices, statusChip, PRICE_META, FEDERAL, US_VERIFIED, type Metro } from './data';
import { stateByCode, stateLede, appliesTo, programOpen, clean, type ProgView } from './programs';
import { stateLine } from './state-text';
import { cleanStatus } from './clean';
import pricesJson from '../../data/us/prices.json';
import climateJson from '../../data/us/climate.json';
import testsJson from '../../data/us/tests.json';
import zip3Json from '../../data/us/zip3.json';
import coolingJson from '../../data/us/cooling-model.json';
import guidesJson from '../../data/reading-guides.json';
import { placeClimate, climateMeaning } from '../climate';
import { climClass, profileSymptoms, coNote, type TestFacts } from './plan-content';
import type { CoolingData } from './plan-cooling';

const P = pricesJson as any;
const T = testsJson as any;
const C = coolingJson as any;

export const stateSlug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** First sentence of a licensing requirement, without its parenthetical citations. */
function requirementSentence(text: string): string {
  let s = text;
  for (let prev = ''; prev !== s; ) { prev = s; s = s.replace(/\s*\([^()]*\)/g, ''); } // nested citations too
  s = s.replace(/\s+([,;.])/g, '$1').trim();
  const m = s.match(/^(.+?\.)(?:\s+(?=[A-Z])|$)/);
  return cap((m ? m[1] : s).trim());
}

/** Split research text into sentences, without breaking after common abbreviations. */
function splitSentences(s: string): string[] {
  const out: string[] = [];
  const re = /([.!?])(['’”)]*)\s+(?=[A-Z0-9'‘“($])/g;
  let start = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const end = m.index + m[1].length + m[2].length;
    const piece = s.slice(start, end);
    if (/\b(e\.g|i\.e|U\.S|St|Mr|Mrs|Dr|No|vs|approx|Inc|Co|Corp|Jr|Sr|Ave|Blvd|Rd|Mt|Ft)\.$/i.test(piece)) continue;
    out.push(piece.trim());
    start = end;
  }
  out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * Straight single quotes the research uses to mark a source's own words: curly pairs when they
 * balance; dropped when a cut sentence leaves one unmatched. Apostrophes inside words stay.
 */
function tidyQuotes(s: string): string {
  const open = /(^|[\s(“])'(?=\S)/g;
  const close = /(?<=[^\s'])'(?=$|[\s.,;:)!?…])/g;
  const o = (s.match(open) ?? []).length;
  const c = (s.match(close) ?? []).length;
  if (o && o === c) return s.replace(open, '$1‘').replace(close, '’');
  // unmatched: drop opening marks, and closing marks against punctuation (a cut quotation); a plain
  // possessive such as "customers' accounts" stays
  return s.replace(open, '$1').replace(/(?<=[^\s'])'(?=$|[.,;:)!?…])|(?<=[.,;:!?])'/g, '');
}

/** Up to `max` characters of whole sentences (at least the first sentence, cut at a word if it's much longer). */
function sentences(text: string | null | undefined, max: number): string | null {
  const s = clean(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  let out = '';
  for (const p of splitSentences(s)) {
    if (out && `${out} ${p}`.length > max) break;
    out = out ? `${out} ${p}` : p;
  }
  if (out.length > max + 40) out = out.slice(0, max).replace(/[\s,;:(]+\S*$/, '') + '…';
  return tidyQuotes(out);
}

/**
 * tests.json stateSummary notes read "Radon: … Mold: … CO: …"; split them by topic. Radon and
 * mold notes lose their research citations ("(ELI database through June 2026)"); the CO note keeps
 * its wording for coNote() in plan-content.ts, which turns unconfirmed laws into an action.
 */
function summarySegments(notes: string): Record<string, string> {
  const parts = notes.split(/(?:^|\s)(Radon|Mold|CO):\s*/);
  const out: Record<string, string> = {};
  for (let i = 1; i < parts.length - 1; i += 2) {
    let s = parts[i + 1].replace(/\s*\(null\)/g, '').trim();
    if (parts[i] !== 'CO') s = s.replace(/\s*\([^()]*\)/g, '').replace(/\s+([,;.])/g, '$1');
    out[parts[i]] = cap(s);
  }
  return out;
}

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) throw new Error(`plan-payload: missing ${what}`);
  return v;
}

/* ------------------------------------------------------------------ prices */

const btuPerCf = PRICE_META.gas.btuPerCf || 1036;
const therm = (perMcf: number) => +(perMcf / ((btuPerCf * 1000) / 100000)).toFixed(2);

export const NATIONAL = {
  elecCents: must<number>(P.electricity.unitedStates?.latest, 'US electricity price'),
  gasPerTherm: therm(must<number>(P.naturalGas.unitedStates?.annualAverageLastFullYear, 'US natural gas price')),
  oilPerGal: must<number>(P.heatingOil.regions?.US?.latest, 'US heating oil price'),
  propanePerGal: must<number>(P.propane.regions?.US?.latest, 'US propane price'),
};

export const PRICE_PERIODS = {
  elecMonth: PRICE_META.electricity.month,
  gasYear: PRICE_META.gas.lastFullYear,
  oilWeek: PRICE_META.oil.week,
  propaneWeek: PRICE_META.propane.week,
  btuPerCf,
  elecReleased: P.electricity.released as string,
  gasReleased: P.naturalGas.released as string,
  oilReleased: P.heatingOil.released as string,
  links: {
    elec: PRICE_META.electricity.url,
    gas: P.naturalGas.annualUrl as string,
    oil: PRICE_META.oil.url,
  },
};

export interface StatePriceRow {
  /** ¢/kWh */
  e: number;
  /** $/therm */
  g: number | null;
  /** year of the gas average, when not the last full year */
  gy: string | null;
  /** $/gal, null = EIA publishes none for the state (planner uses the national figure) */
  o: number | null;
  pr: number | null;
}

function statePriceRow(st: string): StatePriceRow {
  const sp = statePrices(st);
  const g = P.naturalGas.states?.[st] ?? {};
  const gy = g.annualAverageLastFullYear != null ? null : g.mostRecentAnnualPublished?.year ?? null;
  return {
    e: must(sp.elecCents, `electricity price for ${st}`),
    g: sp.gasPerTherm,
    gy,
    o: sp.oilPerGal,
    pr: sp.propanePerGal,
  };
}

/* ------------------------------------------------------------------ federal home energy rebates (programs.ts) */

function herProgram(p: ProgView) {
  return {
    s: p.status ? sentences(cap(cleanStatus(p.status)), 200) : null,
    chip: { cls: p.chip.cls, label: p.chip.label, status: p.chip.status },
    name: p.programName,
    url: p.url,
    amt: sentences(p.amounts, 200),
  };
}

function herFor(code: string) {
  const sv = stateByCode(code);
  if (!sv) return null;
  return {
    lede: stateLede(sv),
    taking: sv.taking,
    homes: herProgram(sv.homes),
    heehr: herProgram(sv.hear),
    via: sv.hear.via?.note ?? sv.homes.via?.note ?? null,
  };
}

/* ------------------------------------------------------------------ test facts (tests.json) */

function testFacts(): TestFacts {
  const bd: string = T.energyTests.blowerDoor.iecc2021;
  const m = bd.match(/([\d.]+) ACH50 or less in climate zones 0-2 and ([\d.]+) ACH50 or less in zones 3-8/);
  const dl: string = T.energyTests.ductLeakage.iecc2021;
  const d = dl.match(/([\d.]+) cfm25 or less per 100 sq ft/);
  // Per-state notes: the research file's state summaries first (20 states), then the state
  // licensing lists for states without a summary.
  const radonLicense: Record<string, string> = {};
  const coLaw: Record<string, string | null> = {};
  const moldLicense: Record<string, string> = {};
  const inState = (st: string) => `In ${st === 'DC' ? 'the District of Columbia' : STATE_NAMES[st] ?? st}: `;
  // Mold: the licensing list says more than the summaries' one-word notes, so it goes first.
  // stateLine() spells out agency initials, introduces statute cites and turns research notes into plain statements.
  const line = (st: string, text: string) => {
    const t = stateLine(text, st);
    return t ? inState(st) + t : '';
  };
  for (const r of T.mold.stateLicensing as any[]) {
    if (r.requirement) moldLicense[r.state] = line(r.state, requirementSentence(r.requirement));
  }
  for (const r of T.stateSummary as any[]) {
    const seg = summarySegments(r.notes ?? '');
    if (seg.Radon) radonLicense[r.state] = line(r.state, seg.Radon);
    // coNote() turns the research wording into guidance here, so the payload carries only what the plan shows
    if (seg.CO) coLaw[r.state] = coNote(inState(r.state) + seg.CO, STATE_NAMES[r.state] ?? r.state, r.state) ?? null;
    if (seg.Mold && !moldLicense[r.state]) moldLicense[r.state] = line(r.state, seg.Mold);
  }
  for (const r of T.radon.stateLicensing as any[]) {
    if (r.requirement && !radonLicense[r.state]) radonLicense[r.state] = line(r.state, requirementSentence(r.requirement));
  }
  for (const o of [radonLicense, moldLicense]) for (const k of Object.keys(o)) if (!o[k]) delete o[k];
  return {
    blowerLimitByZone: { warm: Number(must(m?.[1], 'IECC blower door limit (zones 0-2)')), cold: Number(must(m?.[2], 'IECC blower door limit (zones 3-8)')) },
    ductLimit: Number(must(d?.[1], 'IECC duct leakage limit')),
    radonLicense,
    coLaw,
    moldLicense,
  };
}

/* ------------------------------------------------------------------ ENERGY STAR insulation table */

function insulation() {
  const rows = T.energyTests.insulation.recommendedRValues as { zone: string; attic: string; floor: string }[];
  const attic: Record<string, number> = {};
  const atticText: Record<string, string> = {};
  const floorText: Record<string, string> = {};
  for (const r of rows) {
    const m = r.attic.match(/R(\d+) if uninsulated/);
    attic[r.zone] = Number(must(m?.[1], `ENERGY STAR attic R-value for zone ${r.zone}`));
    atticText[r.zone] = r.attic;
    floorText[r.zone] = r.floor;
  }
  for (const z of ['1', '2', '3', '4', '5', '6', '7', '8']) must(attic[z], `ENERGY STAR zone ${z}`);
  return { attic, atticText, floorText };
}

/* ------------------------------------------------------------------ cooling model (cooling-model.json) */

const hmean = (...xs: number[]) => xs.length / xs.reduce((s, x) => s + 1 / x, 0);
const r2 = (x: number) => Math.round(x * 100) / 100;
const triple = (o: any, what: string): [number, number, number] =>
  [must<number>(o?.low, `${what} low`), must<number>(o?.typical, `${what} typical`), must<number>(o?.high, `${what} high`)];

/** States under DOE's Southeast and Southwest regional AC standards (since 2015), from the research note. */
function southStates(): Set<string> {
  const row = (C.acEfficiencyByAge as any[]).find((r) => /^2015/.test(r.installed) && /central AC/.test(r.type));
  const note: string = must(row?.note, 'regional standards note');
  const se = note.match(/Southeast \(([A-Z ]+)\)/)?.[1];
  const sw = note.match(/Southwest \(([A-Z ]+?),/)?.[1];
  const list = `${must(se, 'Southeast states')} ${must(sw, 'Southwest states')}`.split(/\s+/).filter(Boolean);
  if (list.length < 15) throw new Error('plan-payload: regional standard state lists look wrong');
  return new Set(list);
}

function coolingData(): CoolingData {
  const Pm = C.model.parameters;
  const metros: CoolingData['metros'] = {};
  const months: CoolingData['months'] = {};
  for (const m of METROS) {
    const b = C.benchmarks.byMetro?.[m.slug];
    metros[m.slug] = {
      k: must<number>(b?.kwhRef2020, `${m.slug} cooling benchmark`),
      a: must<number>(b?.cooledSqftRef, `${m.slug} cooled area`),
      c: must<number>(b?.cdd65Ref2020, `${m.slug} benchmark CDD`),
    };
    const mn = C.billMethod.monthlyNormals?.[m.slug];
    if (!mn || mn.cdd65?.length !== 12 || mn.hdd65?.length !== 12) throw new Error(`plan-payload: monthly normals for ${m.slug}`);
    months[m.slug] = { c: mn.cdd65, h: mn.hdd65, ac: must<number>(mn.annualCdd65, `${m.slug} annual CDD`) };
  }
  const room: CoolingData['room'] = {};
  for (const [z, r] of Object.entries(C.benchmarks.roomAcByZone as Record<string, any>)) {
    room[z] = r.kwhPerHousehold ? { k: r.kwhPerHousehold, c: must<number>(r.cdd65Ref2020, `room AC CDD ${z}`) } : null;
  }
  const ac = C.acEfficiencyByAge as any[];
  const row = (installed: RegExp, type: RegExp) => must<any>(ac.find((r) => installed.test(r.installed) && type.test(r.type)), `AC row ${installed}`);
  const c9206 = row(/^1992/, /central AC/), c0614 = row(/^Jan 23, 2006/, /central AC/);
  const c1522 = row(/^2015/, /central AC/), c23 = row(/^2023/, /central AC/);
  const h9206 = row(/^1992/, /heat pump/), h0614 = row(/^Jan 23, 2006/, /heat pump/);
  const h1522 = row(/^2015/, /heat pump/), h23 = row(/^2023/, /heat pump/);
  const vs = row(/variable-speed/, /central AC or heat pump/);
  const M = C.measures;
  const setpoint: Record<string, number> = {};
  for (const [k, v] of Object.entries(M.raise_cooling_setpoint.byMetro as Record<string, number>)) setpoint[k] = Math.min(10, Math.max(4, v));
  const kwhH = M.hpwh_side_cooling.kwhPerYear;
  return {
    metros,
    room,
    p: {
      areaExp: must<number>(Pm.areaExponent, 'area exponent'),
      cddExp: Pm.cddExponent,
      sqft: Pm.sizeBandSqft,
      era: Pm.eraFactor,
      type: Pm.typeFactor,
      seerRef: Pm.seerRefByZone,
      seerCap: must<number>(Pm.seerRatioCap, 'SEER ratio cap'),
      roomEer: must<number>(Pm.roomEerRef, 'room AC EER'),
      attic: { one: Pm.atticFormula.oneStory, two: Pm.atticFormula.twoStory, z1A: Pm.atticFormula.zone1AMultiplier },
      range: { lo: Pm.baselineRange.lowMultiplier, hi: Pm.baselineRange.highMultiplier, mlo: Pm.baselineRange.marineLowMultiplier, mhi: Pm.baselineRange.marineHighMultiplier },
    },
    seer: {
      // under 10 years old: installed 2017 or later, so a 2015–2022 or a 2023+ unit (regional minimums in the South)
      centralNewS: r2(hmean(must(c1522.seer, '2015 SEER'), must(c23.seer, '2023 SEER'))),
      centralNewN: r2(hmean(must(c1522.seerNorth, '2015 SEER north'), must(c23.seerNorth, '2023 SEER north'))),
      // 10 years or older: in a house built since 1996, a 2006–2014 unit; in an older house it may also be a 1990s one
      centralOldNew: must(c0614.seer, '2006 SEER'),
      centralOldOld: r2(hmean(c0614.seer, must(c9206.seer, '1992 SEER'))),
      // heat pumps by the heating system's age: under 15 years (2012+), 15 years or more (before 2012)
      hpNew: r2(hmean(must(h0614.seer, 'HP 2006'), must(h1522.seer, 'HP 2015'), must(h23.seer, 'HP 2023'))),
      hpOld: r2(hmean(must(h9206.seer, 'HP 1992'), h0614.seer)),
      newVs: must(vs.seer, 'variable-speed SEER'),
      newVs2: must(vs.seer2, 'variable-speed SEER2'),
      minS: must(c23.seer, '2023 SEER'),
      minN: must(c23.seerNorth, '2023 SEER north'),
      minS2: must(c23.seer2, '2023 SEER2'),
      minN2: must(c23.seer2North, '2023 SEER2 north'),
    },
    m: {
      air: triple(M.air_sealing.coolingSavingsPct, 'air sealing'),
      duct: triple(M.duct_sealing.coolingSavingsPct, 'duct sealing'),
      radiant: triple(M.radiant_barrier.coolingSavingsPct, 'radiant barrier'),
      coolRoof: triple(M.cool_roof.coolingSavingsPct, 'cool roof'),
      film: triple(M.window_film_solar_screens.coolingSavingsPct, 'window film'),
      lowShgc: triple(M.low_shgc_windows.coolingSavingsPct, 'low-SHGC windows'),
      lowShgcDouble: triple(M.low_shgc_windows.fromDoubleClear, 'low-SHGC windows from double clear'),
      dehumKwh: must<number>(M.dehumidifier.kwhPerYearUsers?.hotHumidAllUsers, 'dehumidifier kWh'),
      dehumPct: must<number>(M.dehumidifier.coolingSavingsPct?.typical, 'dehumidifier saving'),
    },
    air: M.air_sealing.byZoneTypical,
    setpoint,
    months,
    hpwh: { hotHumid: must(kwhH?.hotHumid, 'HPWH hot-humid'), hotDry: must(kwhH?.hotDry, 'HPWH hot-dry'), mixedHumid: must(kwhH?.mixedHumid, 'HPWH mixed-humid') },
  };
}

/* ------------------------------------------------------------------ reading guides */

/** US reading bands for each test the planner can show: what a result means and what to do. */
function guides() {
  const out: Record<string, { u: string; b: { l: string; r: string; m: string; d: string }[] }> = {};
  for (const [slug, g] of Object.entries((guidesJson as any).tests as Record<string, any>)) {
    const bands = (g.bands as any[]).filter((b) => (b.countries ?? []).includes('us')).map((b) => ({ l: b.label, r: b.range, m: b.means, d: b.do }));
    const unit = (String(g.unit ?? '').split(' · ').find((x: string) => !/Canada/.test(x)) ?? String(g.unit ?? '')).replace(/\s*\(US\)/g, '');
    if (bands.length) out[slug] = { u: unit, b: bands };
  }
  for (const s of ['blower-door', 'duct-leakage', 'radon', 'mold-iaq']) must(out[s], `reading guide for ${s}`);
  return out;
}

/* ------------------------------------------------------------------ metros */

function housingPlace(notes: string | undefined): string | null {
  const m = (notes ?? '').match(/Housing figures are for (.+?) city, ([A-Za-z .]+?) \(Census place/);
  return m ? `${m[1]}, ${m[2]}` : null;
}

const slugId = (s: string) => s.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Names a program might use for a utility: "SRP (Salt River Project)" → SRP, Salt River Project. */
function utilAliases(name: string): string[] {
  const out: string[] = [];
  const base = name.split(' (')[0].trim().replace(/,.*$/, '').trim();
  out.push(base);
  const inner = name.match(/\(([^)]*)\)/)?.[1]?.split(',')[0]?.trim().replace(/^(e\.g\.|for example)\s*/i, '');
  if (inner && inner.length <= 40 && !/^(a|an|the|investor|community|city|municipal|fmpa)\b/i.test(inner)) out.push(inner);
  const first = base.split(/\s+/)[0];
  if (/^[A-Z][A-Z&]{1,6}$/.test(first) && !out.includes(first)) out.push(first);
  return out.filter((a) => a.length >= 2);
}
const mentions = (alias: string, text: string) => new RegExp(`(?<![A-Za-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).test(text);

/** `gas`: the utility also sells gas in the metro, so its programs reach its gas customers whatever the electric bill says */
interface UtilityRec { id: string; n: string; al: string[]; st: string[]; runs: number; gas: boolean }

function utilitiesFor(m: Metro, progText: string[]): { list: UtilityRec[]; ask: Record<string, boolean> } {
  const states: string[] = m.data.states ?? [];
  const gasNames = ((m.data.utilities?.gas ?? []) as any[]).map((g) => String(g.name));
  const list = ((m.data.utilities?.electric ?? []) as any[])
    // retail providers deliver over another company's wires; community choice aggregators bill through the utility
    .filter((u) => !/^(Retail electric providers|Other )/.test(u.name) && !/community choice/i.test(u.name))
    .map((u) => {
      const al = utilAliases(u.name);
      const short = al.find((a) => /^[A-Z][A-Z&]{1,6}$/.test(a));
      const n = u.name.length <= 44 ? u.name : al[0] + (short && short !== al[0] ? ` (${short})` : '');
      return {
        id: slugId(short ?? al[0]),
        n,
        al,
        st: states.filter((s) => appliesTo(`${u.name} ${u.serves ?? ''}`, s, m)),
        runs: progText.filter((t) => al.some((a) => mentions(a, t))).length,
        gas: gasNames.some((g) => al.some((a) => mentions(a, g))),
      };
    });
  // ask "Who sends your electric bill?" where two or more utilities run programs on this side of
  // the metro and the answer can rule some out (an electric-only utility's programs)
  const ask: Record<string, boolean> = {};
  for (const s of states) {
    const runners = list.filter((u) => u.st.includes(s) && u.runs > 0);
    ask[s] = runners.length >= 2 && runners.some((u) => !u.gas);
  }
  return { list, ask };
}

/** Rebates limited to one heating fuel (an oil-to-heat-pump program, a heat pump paired with a gas furnace). */
function rebateFuel(name: string): 'oil' | 'elec' | 'gas' | 'fossil' | null {
  if (/oil[- ]to\b|\(oil\b|oil heat|heating oil|oil furnace/i.test(name)) return 'oil';
  if (/electric(?:al)?(?: resistance| baseboard)? to\b|from electric|baseboard to/i.test(name)) return 'elec';
  if (/hybrid with gas|with (a )?gas furnace|dual[- ]fuel/i.test(name)) return 'gas';
  if (/fuel[- ]switch/i.test(name)) return 'fossil';
  return null;
}

const tiedTo = (text: string, utils: UtilityRec[]) => utils.filter((u) => u.al.some((a) => mentions(a, text))).map((u) => u.id);

/** Tests an audit program's own description says it includes. */
function testsIncluded(text: string): string[] {
  const t: string[] = [];
  if (/blower[- ]?door/i.test(text)) t.push('blower-door');
  if (/infrared|thermal (imag|scan|camera)|thermograph/i.test(text)) t.push('thermal-imaging');
  if (/duct(?:work)? (leakage|leak|test|blaster|testing)/i.test(text)) t.push('duct-leakage');
  if (/combustion/i.test(text)) t.push('combustion-safety');
  return t;
}

/**
 * A program name as the plan shows it. "(Maricopa County outside Phoenix and Mesa)" reads like it
 * serves the whole county; ZIP codes can't tell a Phoenix address from a Glendale one, so the name
 * says who it isn't for.
 */
const displayName = (name: string) =>
  name.replace(/\(([A-Z][\w.]+(?: [A-Z][\w.]+)*) County outside ([A-Z][\w.]+(?: [A-Z][\w.]+)*) and ([A-Z][\w.]+(?: [A-Z][\w.]+)*)\)/,
    (_m, county: string, a: string, b: string) => `(${county} County; not for ${a} or ${b} residents)`);

const IQ_NAME = /weatheriz|income-qualified|income-eligible|income qualified|low-income|limited income|\bEEA\b|EmPower\+|Casa Verde|HomeWise|\bHERO\b|CommunitySavers|Agencies in Action|Equitable Building|Empower My Home|EASE Home/i;
const IQ_WHO = /(household )?income (must|up to|at or below|under|below|limits?|guidelines|eligib|qualif)|at or (below|under) \d+%|\d+% of (area|the federal|state|federal)|\b(AMI|SMI|MFI)\b|\d+% FPL|poverty|LIHEAP|bill assistance|low-income|income-(eligible|qualified)/i;

function auditRecord(x: any, m: Metro, utils: UtilityRec[]) {
  const chip = statusChip(x.status);
  const name = String(x.name);
  const text = `${name} ${x.whatYouGet ?? ''}`;
  const cost = x.cost && x.cost !== 'None' ? String(x.cost) : '';
  const online = /online tool/i.test(String(x.status ?? '')) || /\bonline\b|self-assessment|HomeIntel/i.test(name);
  const virtual = /virtual/i.test(name) && !/in-home|in-person/i.test(name);
  const inPerson = /in-home|in-person|in person|house call|home visit|walk-through|squad|site visit/i.test(`${name} ${cost} ${x.whatYouGet ?? ''}`);
  const iq = IQ_NAME.test(name) || IQ_WHO.test(String(x.whoQualifies ?? '')) || /income-eligible|income-qualified/i.test(String(x.status ?? ''));
  const free = /^(free|\$0|no cost|no-cost)|\bfree\b|no additional cost|no out-of-pocket|complimentary|at no (additional )?cost/i.test(cost);
  const required = /required|directory|ordinance/i.test(name);
  const tests = testsIncluded(text);
  // first-stop ranking: an in-person visit open to everyone, free, with diagnostic tests, comes first
  const score = (inPerson ? 3 : virtual ? 1 : 0) - (online ? 4 : 0) + (free ? 2 : /\$\s?(\d{1,3})\b/.test(cost) ? 1 : 0)
    + (tests.includes('blower-door') ? 1 : 0) - (iq ? 5 : 0) - (required ? 3 : 0);
  return {
    n: displayName(name),
    by: (x.runBy as string) ?? null,
    cost: sentences(cost, 150),
    s: x.status ? sentences(cap(cleanStatus(String(x.status))), 160) : null,
    chip: { cls: chip.cls, label: chip.label, status: chip.status },
    open: programOpen(x.status),
    url: (x.url as string) ?? null,
    ul: (x.urlLabel as string) ?? null,
    how: x.howToBook && x.howToBook !== 'None' ? sentences(String(x.howToBook), 200) : null,
    st: (m.data.states ?? []).filter((s: string) => appliesTo(`${name} ${x.runBy ?? ''}`, s, m)),
    ut: tiedTo(`${x.runBy ?? ''} ${name}`, utils),
    f: { ol: online, vi: virtual, ip: inPerson, iq, fr: free },
    tests,
    sc: score,
  };
}

/** Which upgrade cards a metro rebate belongs on, from its category and name. */
function rebateKeys(r: any): string[] {
  const n = `${r.name ?? ''}`;
  const cat = String(r.category ?? '');
  const keys = new Set<string>();
  if (/duct/i.test(n)) keys.add('duct-sealing');
  if (/insulation|attic|comfort bundle/i.test(n)) keys.add('attic-insulation');
  if (/air seal|infiltration|weatheriz|weatherstrip/i.test(n)) keys.add('air-sealing');
  if (/water heater|HPWH/i.test(n)) keys.add('water-heating');
  else if (/heat pump|A\/C|air condition|mini-split|HVAC|cool cash|cooling|furnace conversion/i.test(n) && !/gas furnace|conversion rebates|switching .* to natural gas/i.test(n)) keys.add('heat-pump');
  if (/shade screen|solar screen|window film/i.test(n)) keys.add('window-film');
  else if (/window/i.test(n)) keys.add('windows-doors');
  if (/thermostat|cool rewards|demand response|load management|on call|peak|rush hour|power partner/i.test(n)) keys.add('controls');
  if (/dehumidif/i.test(n)) keys.add('humidity');
  if (/solar(?! screen)/i.test(n) && !/screen/i.test(n)) keys.add('solar');
  if (cat === 'whole-home') ['air-sealing', 'attic-insulation', 'duct-sealing'].forEach((k) => keys.add(k));
  if (cat === 'insulation-air-sealing' && !keys.size) ['air-sealing', 'attic-insulation'].forEach((k) => keys.add(k));
  return [...keys];
}

function rebateRecord(x: any, m: Metro, utils: UtilityRec[]) {
  const chip = statusChip(x.status);
  return {
    n: displayName(String(x.name)),
    amt: sentences(String(x.amount ?? ''), 130),
    url: (x.url as string) ?? null,
    cat: String(x.category ?? 'other'),
    keys: rebateKeys(x),
    fu: rebateFuel(String(x.name)),
    st: (m.data.states ?? []).filter((s: string) => appliesTo(`${x.name} ${x.runBy ?? ''}`, s, m)),
    ut: tiedTo(`${x.runBy ?? ''} ${x.name}`, utils),
    chip: { cls: chip.cls, label: chip.label, status: chip.status },
    /** open now; otherwise the program page states no status (shown as unconfirmed, never as open) */
    open: programOpen(x.status),
    iq: x.category === 'income-qualified' || IQ_NAME.test(String(x.name)),
  };
}

/** The metro's own climate notes; the profile they belong to is in the payload once (profilesFor). */
function needsFor(slug: string) {
  const pc = placeClimate('us', slug);
  if (!pc) return null;
  return { k: pc.profile.key, note: pc.place.note ?? null, hz: pc.place.hazards ?? [] };
}

/** What homes in each climate need, from the regional profiles (src/data/climate/us.json). */
function profilesFor() {
  const out: Record<string, { cls: string | null; one: string; pri: { t: string; w: string }[]; season: string; sym: string[]; smoke: string | null }> = {};
  for (const m of METROS) {
    const pc = placeClimate('us', m.slug);
    if (!pc || out[pc.profile.key]) continue;
    const p = pc.profile;
    out[p.key] = {
      cls: climClass(p.key),
      one: p.oneLiner,
      pri: p.priorities.slice(0, 3).map((x) => ({ t: x.title, w: x.why.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? x.why })),
      season: p.seasonNote,
      sym: profileSymptoms(p.symptoms),
      // the profile's wildfire smoke advice, for the climates where smoke days happen
      smoke: ((p as any).health as string[] | undefined)?.find((h) => /smok/i.test(h)) ?? null,
    };
  }
  return out;
}

function metroRecord(m: Metro) {
  const c = m.climate;
  const cl = (climateJson as any).metros?.[m.slug] ?? {};
  const audits = (m.data.auditPrograms ?? []) as any[];
  const rebates = (m.data.rebates ?? []) as any[];
  const progText = [...audits, ...rebates].map((x) => `${x.runBy ?? ''} ${x.name ?? ''}`);
  const u = utilitiesFor(m, progText);
  const h = must<number>(c?.hdd65, `${m.slug} HDD`);
  const k = must<number>(c?.cdd65, `${m.slug} CDD`);
  const states: string[] = m.data.states ?? [];
  return {
    n: m.data.name as string,
    msa: m.msa,
    st: states,
    c: {
      h,
      k,
      z: c?.iecc2021ClimateZone ?? null,
      r: c?.epaRadonZone ?? null,
      co: c?.principalCounty ?? null,
      stn: c?.station?.name ?? null,
      my: c?.medianYearBuilt ?? null,
      place: housingPlace(cl.notes),
      acs: c?.acsRelease ?? null,
    },
    meaning: climateMeaning('us', { hdd: h, cdd: k }),
    needs: needsFor(m.slug),
    u,
    a: audits.map((x) => auditRecord(x, m, u.list)),
    // open rebates, plus those whose page states no status at all (closed, paused and waitlist ones stay out)
    rb: rebates.filter((x) => programOpen(x.status) || statusChip(x.status).status === 'unknown').map((x) => rebateRecord(x, m, u.list)),
    iqp: ((m.data.incomeQualified ?? []) as any[])
      .map((x) => ({ n: displayName(String(x.name)), url: (x.url as string) ?? null, st: states.filter((s) => appliesTo(`${x.name} ${x.runBy ?? ''}`, s, m)) }))
      .slice(0, 6),
  };
}

/* ------------------------------------------------------------------ payload */

export function buildPlanPayload() {
  const south = southStates();
  const states: Record<string, unknown> = {};
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    states[code] = {
      n: name,
      slug: stateSlug(name),
      p: statePriceRow(code),
      her: herFor(code),
      so: south.has(code),
    };
  }
  const metros: Record<string, unknown> = {};
  for (const m of METROS) metros[m.slug] = metroRecord(m);
  if (Object.keys(metros).length !== 26) throw new Error(`plan-payload: expected 26 metros, got ${Object.keys(metros).length}`);

  const zip3 = (zip3Json as any).zip3 as Record<string, [string, string | null, string | null, number | null]>;
  for (const [k, v] of Object.entries(zip3)) {
    if (!states[v[0]]) throw new Error(`plan-payload: zip3 ${k} has unknown state ${v[0]}`);
    if (v[1] && !metros[v[1]]) throw new Error(`plan-payload: zip3 ${k} has unknown metro ${v[1]}`);
    if (v[2] && !metros[v[2]]) throw new Error(`plan-payload: zip3 ${k} has unknown nearest metro ${v[2]}`);
  }

  const cred = (FEDERAL.credentials as any[]);
  const pick = (re: RegExp) => cred.find((c) => re.test(c.name));
  const credentials = [pick(/^RESNET HERS Rater/), pick(/^BPI Building Analyst Professional/), pick(/^DOE Home Energy Score/)]
    .filter(Boolean)
    .map((c) => ({ name: c.name as string, by: c.certifiedBy as string, url: c.findAProUrl as string | null }));
  const rebateFinder = (FEDERAL.otherFederal as any[]).find((o) => /Rebate Finder/.test(o.name));

  return {
    verified: US_VERIFIED,
    coolChecked: C.checked as string,
    zip3,
    states,
    metros,
    profiles: profilesFor(),
    national: NATIONAL,
    periods: PRICE_PERIODS,
    insulation: insulation(),
    tests: testFacts(),
    guides: guides(),
    cooling: coolingData(),
    credentials,
    wapUrl: FEDERAL.weatherization.findUrl as string,
    rebateFinderUrl: (rebateFinder?.url as string) ?? null,
  };
}

export type PlanPayload = ReturnType<typeof buildPlanPayload>;
