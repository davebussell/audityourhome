// Checks for the US Home Energy Planner: the heating model, the cooling model and electric-bill
// split, the sequence rules, the build-time payload (one source of truth for state rebate status)
// and the ZIP3 table.
// Usage: node tools/us/test-plan.mjs
// esbuild (a dependency of Astro) bundles the TypeScript and JSON first, as scripts/test-calc.mjs does.
// data.ts uses Vite's import.meta.glob for the metro files; a tiny plugin turns it into plain imports.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = mkdtempSync(path.join(tmpdir(), 'us-plan-test-'));
const entry = path.join(dir, 'entry.test.ts');
const lib = (f) => JSON.stringify(path.join(root, 'src/lib/us', f));
const data = (f) => JSON.stringify(path.join(root, 'src/data/us', f));

const viteGlob = {
  name: 'vite-glob',
  setup(b) {
    b.onLoad({ filter: /src[\\/]lib[\\/]us[\\/]data\.ts$/ }, (args) => {
      const metros = path.join(root, 'src/data/us/metros');
      const files = readdirSync(metros).filter((f) => f.endsWith('.json')).sort();
      const imports = files.map((f, i) => `import __m${i} from ${JSON.stringify(path.join(metros, f))};`).join('\n');
      const obj = `{${files.map((f, i) => `${JSON.stringify(`../../data/us/metros/${f}`)}: __m${i}`).join(',')}}`;
      const src = readFileSync(args.path, 'utf8').replace(/import\.meta\.glob\([^)]*\)/, obj);
      return { contents: `${imports}\n${src}`, loader: 'ts', resolveDir: path.dirname(args.path) };
    });
  },
};

writeFileSync(entry, `
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from ${lib('plan-model.ts')};
import * as C from ${lib('plan-content.ts')};
import * as K from ${lib('plan-cooling.ts')};
import { buildPlanPayload } from ${lib('plan-payload.ts')};
import { stateByCode } from ${lib('programs.ts')};
import zip3 from ${data('zip3.json')};
import climate from ${data('climate.json')};
import cooling from ${data('cooling-model.json')};

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg ?? '') + ' expected ' + b + ' ± ' + tol + ', got ' + a);
const clim = (slug) => ({ slug, hdd65: climate.metros[slug].hdd65, cdd65: climate.metros[slug].cdd65, zone: climate.metros[slug].iecc2021ClimateZone });
const chicago = clim('chicago');
const prices = { electricity: 0.1922, gas: 1.09, oil: 6.042, propane: 1.829 };
const house = { age: '1946-1965', htype: 'detached', size: 'medium', found: 'basement', sys: 'gasFurnaceMid', wh: 'gasTank' };
const P = buildPlanPayload();
const D = P.cooling;

test('units', () => {
  close(M.usUnit('gas').gjPerUnit, 0.105505585, 1e-9, 'therm');
  close(M.usUnit('oil').gjPerUnit, 0.0382 * 3.785411784, 1e-9, 'oil gallon');
  close(M.usUnit('propane').gjPerUnit, 0.0253 * 3.785411784, 1e-9, 'propane gallon');
  close(M.cDegreeDays(1800), 1000, 1e-9);
});

test('yearly mean temperature from degree days', () => {
  // Chicago: 65 - (5974.3 - 1003.3) / 365 = 51.38 °F = 10.77 °C
  close(M.annualMeanC(chicago.hdd65, chicago.cdd65), 10.77, 0.02);
});

test('typical house: heating need and cost', () => {
  const m = M.houseModel(house, chicago, prices);
  // 0.7 GJ/m² × 149 m² × (5974.3 / 1.8 / 4200) = 82.4 GJ
  close(m.demand, 82.4, 0.2, 'demand');
  close(m.heat.units, 82.4 / 0.8 / 0.105505585, 3, 'therms');
  close(m.heat.cost, m.heat.units * 1.09, 0.01, 'cost');
});

test('bill calibration: the typical bill scales by exactly 1', () => {
  const m = M.houseModel(house, chicago, prices);
  const typical = M.typicalFuelBill(m);
  const cal = M.calibrateFuelBill(m, house.sys, typical);
  assert.equal(cal.calibrated, true);
  close(cal.factor, 1, 1e-9);
  const high = M.calibrateFuelBill(m, house.sys, typical * 3);
  assert.equal(high.factor, 1.6, 'clamped at 1.6');
});

test('electric heat: never scaled to a fuel bill, scaled to the heating kWh two electric bills give', () => {
  const m = M.houseModel({ ...house, sys: 'electricResistance', wh: 'electricTank' }, chicago, prices);
  assert.equal(M.calibrateFuelBill(m, 'electricResistance', 300).calibrated, false);
  const cal = M.calibrateElectricHeat(m, m.heat.units * 1.2);
  assert.equal(cal.calibrated, true);
  close(cal.factor, 1.2, 1e-9);
  assert.equal(M.calibrateElectricHeat(m, m.heat.units * 5).factor, 1.6, 'clamped');
});

test('attic target follows ENERGY STAR by zone, capped at R-60', () => {
  const t = { 1: 30, 2: 49, 3: 49, 4: 60, 5: 60, 6: 60, 7: 60, 8: 60 };
  assert.equal(M.atticTargetR('1A', t), 30);
  assert.equal(M.atticTargetR('3C', t), 49);
  assert.equal(M.atticTargetR('5A', t), 60);
  assert.equal(M.atticTargetR(null, t), 60);
});

test('heat pump saving: cold-climate model where winters are long, standard elsewhere', () => {
  const m = M.houseModel(house, chicago, prices);
  const s = M.itemSaving('heat-pump', house, m, chicago, prices, 1, { 5: 60 }, 'singleStorm');
  const now = M.usHeatingCost(m.demand, 'gasFurnaceMid', m.hddC, prices).cost;
  const hp = M.usHeatingCost(m.demand, 'ashpCold', m.hddC, prices).cost;
  close(s.dollars, now - hp, 1e-6);
  assert.equal(M.heatPumpFor(clim('phoenix')), 'ashpStandard');
  assert.equal(M.heatPumpFor(clim('phoenix'), 'ashpCold'), 'ashpCold', 'an existing cold-climate unit is replaced like for like');
  // a home that already has a heat pump never gets a worse one priced as an "upgrade"
  const px = clim('phoenix');
  const hpHouse = { ...house, age: '1981-1995', found: 'slab', sys: 'ashpCold', wh: 'electricTank' };
  const mp = M.houseModel(hpHouse, px, prices);
  assert.ok(M.itemSaving('heat-pump', hpHouse, mp, px, prices, 1, { 2: 49 }, 'doubleClear').dollars >= 0);
});

test('heat pump water heater: the heat it takes is charged for the heating share of the year only', () => {
  assert.equal(M.hpwhHeatShare(chicago), 2 / 3, 'cold: the engine figure');
  const mia = clim('miami');
  close(M.hpwhHeatShare(mia), mia.hdd65 / (mia.hdd65 + mia.cdd65), 1e-9, 'Miami');
  assert.ok(M.hpwhHeatShare(mia) < 0.05);
});

/* ---------------------------------------------------------------- cooling */

const base = (o) => ({ metro: 'miami', zone: '1A', cdd65: climate.metros.miami.cdd65, size: 'medium', age: '1981-1995', htype: 'detached', ac: 'unsure', heat: 'elecfurnace', hage: 'unsure', south: true, ...o });

test('cooling: reproduces the model examples (1,600 sq ft, 1981–1995, a 2006–2014 central AC at SEER 13.5)', () => {
  const D135 = { ...D, seer: { ...D.seer, centralOldOld: 13.5 } };
  const ex = Object.fromEntries(cooling.model.examples.map((e) => [e.metro, e.coolingKwh.typical]));
  for (const slug of ['miami', 'phoenix', 'houston', 'minneapolis', 'seattle', 'washington-dc']) {
    const c = clim(slug);
    const b = K.coolingBaseline(base({ metro: slug, zone: c.zone, cdd65: c.cdd65, ac: 'central-old' }), D135);
    close(b.kwh, ex[slug], ex[slug] * 0.01, slug);
  }
  close(ex.miami, 9400, 100, 'Miami about 9,400 kWh');
  close(ex.phoenix, 6800, 100, 'Phoenix about 6,800 kWh');
});

test('cooling: stock-average AC, ranges, room units and no AC', () => {
  const b = K.coolingBaseline(base(), D);
  close(b.kwh, 9213, 60, 'Miami, average AC');
  close(b.lo / b.kwh, 0.7, 1e-9);
  close(b.hi / b.kwh, 1.35, 1e-9);
  const sea = clim('seattle');
  const s = K.coolingBaseline(base({ metro: 'seattle', zone: sea.zone, cdd65: sea.cdd65, south: false }), D);
  close(s.lo / s.kwh, 0.5, 1e-9, 'marine low');
  assert.equal(K.coolingBaseline(base({ ac: 'none' }), D).kwh, 0);
  const room = K.coolingBaseline(base({ ac: 'room' }), D);
  assert.equal(room.kind, 'room');
  assert.ok(room.kwh > 1500 && room.kwh < 4000, 'window units: ' + room.kwh);
  const old = K.coolingBaseline(base({ ac: 'central-old' }), D);
  const fresh = K.coolingBaseline(base({ ac: 'central-new' }), D);
  assert.ok(old.kwh > b.kwh && fresh.kwh < b.kwh, 'older units use more, newer ones less');
});

test('cooling measures: hot-climate set, overlaps and the setpoint', () => {
  const m = K.coolingMeasures({ ...base({ ac: 'central-old', age: '1966-1980' }), found: 'slab', storeys: 1, atticBefore: 11, atticTarget: 30, win: 'single' }, D);
  for (const k of ['attic-insulation', 'air-sealing', 'duct-sealing', 'attic-heat', 'cool-roof', 'window-film', 'windows-doors', 'setpoint', 'ac-upgrade']) assert.ok(m[k], k);
  close(m['duct-sealing'].typ, 0.12, 1e-9, 'ducts in a hot attic');
  close(m['attic-heat'].typ, 0.08, 1e-9, 'radiant barrier over thin insulation');
  close(m['ac-upgrade'].typ, 1 - D.seer.centralOldOld / D.seer.newVs, 1e-9, 'SEER ratio');
  close(m.setpoint.typ, 1 - (1 - 0.071) ** 2, 1e-9, 'Miami: 7.1% per °F, compounded for 2 °F');
  // attic formula: 1.7 × 0.75 (zone 1A) × (1/13 − 1/32)
  close(m['attic-insulation'].typ, 1.7 * 0.75 * (1 / 13 - 1 / 32), 1e-9);
  const full = K.combineCooling(['attic-insulation', 'attic-heat'], m);
  const a = m['attic-insulation'].typ, h = m['attic-heat'].typ;
  close(full, 1 - (1 - Math.max(a, h)) * (1 - 0.5 * Math.min(a, h)), 1e-12, 'second attic measure at half');
  const duct = K.combineCooling(['duct-sealing', 'attic-heat'], m);
  close(duct, 1 - (1 - h) * (1 - 0.75 * m['duct-sealing'].typ), 1e-12, 'ducts at 75% with a radiant barrier');
  const cold = K.coolingMeasures({ ...base({ metro: 'minneapolis', zone: '6A', cdd65: 830, south: false }), found: 'basement', storeys: 2, atticBefore: 12, atticTarget: 60, win: 'doubleClear' }, D);
  assert.ok(!cold['attic-heat'] && !cold['window-film'], 'no radiant barrier or film advice in a cold zone');
  close(cold['duct-sealing'].typ, 0.04, 1e-9, 'ducts mostly inside a basement');
  assert.deepEqual(K.coolingMeasures({ ...base({ ac: 'none' }), found: 'slab', storeys: 1, atticBefore: 11, atticTarget: 30, win: 'single' }, D), {});
});

test('electric bills: the model method examples (Miami and Houston)', () => {
  const mia = K.billSplit({ metro: 'miami', summer: { amt: 280, month: 6 }, winter: { amt: 160, month: 0 }, price: 0.153, elecHeat: false }, D);
  assert.equal(mia.ok, true);
  assert.equal(mia.mode, 'cooling');
  close(mia.coolCost, 1287, 5, 'Miami cooling dollars');
  const hou = K.billSplit({ metro: 'houston', summer: { amt: 250, month: 6 }, winter: { amt: 120, month: 0 }, price: 0.1606, elecHeat: false }, D);
  close(hou.coolCost, 705, 5, 'Houston cooling dollars');
  close(hou.coolKwh, 4390, 30, 'Houston cooling kWh');
  close(hou.baseKwhPerDay, 3.76 / 0.1606, 0.3, 'Houston baseload');
});

test('electric bills: sanity checks fall back with a reason', () => {
  const same = K.billSplit({ metro: 'miami', summer: { amt: 280, month: 6 }, winter: { amt: 270, month: 7 }, price: 0.153, elecHeat: false }, D);
  assert.equal(same.ok, false);
  assert.match(same.reason, /similar weather/);
  const backwards = K.billSplit({ metro: 'houston', summer: { amt: 100, month: 6 }, winter: { amt: 200, month: 0 }, price: 0.16, elecHeat: false }, D);
  assert.equal(backwards.ok, false);
  const huge = K.billSplit({ metro: 'houston', summer: { amt: 900, month: 6 }, winter: { amt: 700, month: 0 }, price: 0.16, elecHeat: false }, D);
  assert.equal(huge.ok, false, 'baseload over 60 kWh a day');
  assert.match(huge.reason, /pools|other electricity/);
});

test('electric bills: electric heat where heating outweighs cooling calibrates heating', () => {
  const r = K.billSplit({ metro: 'seattle', summer: { amt: 90, month: 7 }, winter: { amt: 260, month: 0 }, price: 0.1471, elecHeat: true, heatKwh: 9000, hddAnnual: climate.metros.seattle.hdd65, coolKwh: 900 }, D);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.mode, 'heating');
  assert.ok(r.heatKwh > 4000 && r.heatKwh < 20000, 'heating kWh ' + r.heatKwh);
});

test('default bill months: the hottest and coldest months', () => {
  assert.deepEqual(K.defaultMonths('miami', D), { summer: 7, winter: 0 });
  assert.equal(K.defaultMonths('minneapolis', D).winter, 0);
});

/* ---------------------------------------------------------------- sequence and content */

const seq = (o) => C.buildSequence({ age: '1966-1980', heat: 'gas', wh: 'gastank', win: 'unsure', found: 'basement', syms: [], goals: [], ...o });
const cats = (items) => items.map((i) => i.category);

test('sequence: foundation answers', () => {
  assert.ok(cats(seq({})).includes('basement-insulation'));
  assert.ok(!cats(seq({ found: 'slab' })).includes('basement-insulation'));
  assert.ok(cats(seq({ found: 'crawl' })).includes('crawlspace'));
  assert.ok(!seq({ found: 'slab' }).some((i) => /rim joist/i.test(i.why)), 'no rim joists in a slab house');
});

test('sequence: heat pump wording fits the fuel', () => {
  assert.ok(!/electric/i.test(seq({}).find((i) => i.category === 'heat-pump').action), 'gas home');
  assert.ok(/electric/i.test(seq({ heat: 'electric' }).find((i) => i.category === 'heat-pump').action), 'electric home');
  assert.equal(seq({ heat: 'oil' })[0].category, 'heat-pump', 'oil puts the heat pump first');
  assert.ok(!cats(seq({ heat: 'heatpump' })).includes('heat-pump'), 'already has one (cold climate)');
});

test('sequence: no heat pump water heater suggestion when there is one', () => {
  assert.ok(!cats(C.buildSequence({ age: '1981-1995', heat: 'gas', wh: 'heatpump', win: 'unsure', found: 'basement', syms: [], goals: [] })).includes('water-heating'));
});

test('sequence: hot-humid climate leads with cooling and never prescribes an HRV for humidity', () => {
  const hot = { cls: 'hot-humid', coolDom: true, hot: true, ducted: true };
  const s = seq({ age: '1981-1995', heat: 'elecfurnace', wh: 'electric', found: 'slab', ac: 'central-old', syms: ['humid-indoors'], clim: hot,
    money: { 'duct-sealing': 190, 'heat-pump': 540, controls: 220, 'attic-heat': 80, 'air-sealing': 60, 'water-heating': 120 } });
  const c = cats(s);
  assert.ok(c.includes('duct-sealing') && c.includes('humidity'), c.join());
  assert.ok(!c.includes('ventilation'), 'humidity control replaces the HRV item');
  assert.ok(c.indexOf('heat-pump') >= 0 && c.indexOf('heat-pump') < 3, 'an old AC makes the heat pump a now item: ' + c.join());
  assert.ok(!c.includes('water-heating') || c.indexOf('water-heating') > c.indexOf('controls'), 'a water heater waits until it is due: ' + c.join());
  assert.ok(!s.some((i) => /HRV or ERV if humidity/i.test(i.action)));
  const fresh = cats(seq({ age: '1981-1995', heat: 'gas', found: 'slab', ac: 'central-new', clim: hot, money: { 'duct-sealing': 190, 'heat-pump': 540, controls: 220 } }));
  assert.ok(fresh.indexOf('duct-sealing') < fresh.indexOf('heat-pump'), 'a newer AC: equipment waits');
});

test('symptoms: profile chips and legacy values', () => {
  assert.deepEqual(C.profileSymptoms(['High summer bills', 'Humid or sticky indoors', 'AC runs all the time', 'Musty smell', 'Hot upstairs rooms']),
    ['high-summer-bills', 'humid-indoors', 'ac-runs-constantly', 'musty-smell', 'hot-upstairs']);
  assert.equal(C.LEGACY_SYMPTOM['summer-overheating'], 'ac-runs-constantly');
  assert.equal(C.SYMPTOMS.length, 11);
  for (const s of C.SYMPTOMS) assert.ok(C.concernText(s.value, 'hot-humid'), s.value);
  assert.match(C.concernText('humid-indoors', 'hot-humid').cause, /oversized AC/);
});

test('watch list: no oil tanks in hot climates unless the house burns oil', () => {
  const e = C.ERAS['1946-1965'];
  assert.ok(!C.watchFor(e, { cls: 'hot-dry', heat: 'heatpump' }).some((w) => w.flag === 'Old oil tanks'));
  assert.ok(C.watchFor(e, { cls: 'cold', heat: 'gas' }).some((w) => w.flag === 'Old oil tanks'));
});

test('screener: well water, lead paint and radon', () => {
  const facts = { blowerLimitByZone: { warm: 5, cold: 3 }, ductLimit: 4, radonLicense: {}, coLaw: {}, moldLicense: {} };
  const t = { age: 'pre-1946', heat: 'gas', wh: 'gastank', sec: [], water: 'well', syms: [], goals: [], ac: 'none', state: 'MT', stateName: 'Montana', zone: null, radonZone: null, radonCounty: null };
  const flags = C.specialtyTests(t, facts);
  const by = Object.fromEntries(flags.map((f) => [f.slug, f.level]));
  assert.equal(by['well-water'], 'strongly-flagged');
  assert.equal(by['lead-paint'], 'strongly-flagged');
  assert.ok(by.radon);
  assert.ok(!('lead-paint' in Object.fromEntries(C.specialtyTests({ ...t, age: '1996-2010' }, facts).map((f) => [f.slug, 1]))));
  const co = C.specialtyTests({ ...t, state: 'AZ', stateName: 'Arizona' }, { ...facts, coLaw: { AZ: 'In Arizona: No statute in NCSL’s compilation; not confirmed either way.' } }).find((f) => f.slug === 'carbon-monoxide');
  assert.match(co.note, /CPSC recommends/, 'research notes become an action');
});

test('tests: hot climates put the duct leakage test first', () => {
  const facts = { blowerLimitByZone: { warm: 5, cold: 3 }, ductLimit: 4, radonLicense: {}, coLaw: {}, moldLicense: {} };
  const t = { age: '1981-1995', heat: 'heatpump', wh: 'electric', sec: [], water: 'municipal', syms: ['high-summer-bills'], goals: ['bills'], ac: 'heatpump', state: 'AZ', stateName: 'Arizona', zone: '2B', radonZone: null, radonCounty: null, found: 'slab', cls: 'hot-dry', coolDom: true };
  assert.equal(C.energyTests(t, facts)[0].slug, 'duct-leakage');
});

/* ---------------------------------------------------------------- payload */

test('payload: state rebate status comes from the programs tracker (Arizona is open with limits)', () => {
  const az = P.states.AZ.her;
  assert.ok(az, 'Arizona');
  assert.equal(az.taking, stateByCode('AZ').taking);
  assert.equal(az.taking, true, 'HEEHR open with restrictions via Efficiency Arizona');
  assert.equal(az.heehr.chip.status, 'limited');
  assert.match(az.lede, /Arizona/);
  for (const [code, s] of Object.entries(P.states)) assert.equal(s.her?.taking ?? false, stateByCode(code)?.taking ?? false, code);
});

test('payload: utilities, programs and rebates per metro', () => {
  const phx = P.metros.phoenix;
  assert.equal(phx.u.ask.AZ, true, 'APS or SRP');
  const ids = phx.u.list.map((u) => u.id);
  assert.ok(ids.includes('srp') && ids.includes('aps'), ids.join());
  const srpAudit = phx.a.find((a) => /^SRP Home Energy Assessment/.test(a.n));
  assert.deepEqual(srpAudit.ut, ['srp']);
  const ins = phx.rb.find((r) => /SRP Insulation Rebate/.test(r.n));
  assert.ok(ins && ins.keys.includes('attic-insulation'), 'insulation rebate on the attic card');
  assert.ok(phx.rb.find((r) => /Duct Test/.test(r.n)).keys.includes('duct-sealing'));
  assert.ok(phx.rb.find((r) => /Shade Screen/.test(r.n)).keys.includes('window-film'));
  assert.equal(P.metros.miami.u.ask.FL, false, 'FPL serves most of the Miami metro');
  assert.equal(P.metros.detroit.u.ask.MI, false, 'DTE and Consumers both sell gas: the electric bill rules nothing out');
  const sea = P.metros.seattle;
  assert.equal(sea.u.ask.WA, true);
  assert.equal(sea.u.list.find((u) => u.id === 'pse').gas, true, 'PSE sells gas in Seattle');
  assert.equal(sea.u.list.find((u) => u.id === 'seattle-city-light').gas, false);
  assert.equal(sea.rb.find((r) => /oil to heat pump/.test(r.n)).fu, 'oil', 'oil-to-heat-pump rebates are for oil homes');
  assert.equal(sea.rb.find((r) => /electric resistance to heat pump/.test(r.n)).fu, 'elec');
  const fpl = P.metros.miami.a.find((a) => /Home Energy Analysis/.test(a.n));
  assert.ok(fpl.ul && /ceiling insulation/i.test(fpl.ul), 'the FPL link is labeled for what it opens');
  assert.ok(fpl.how && /800-DIAL-FPL/.test(fpl.how), 'how to book');
  for (const [slug, m] of Object.entries(P.metros)) {
    assert.ok(m.needs && P.profiles[m.needs.k], slug + ' climate profile');
    assert.ok(P.profiles[m.needs.k].sym.length >= 3, slug + ' symptom chips');
    assert.ok(m.meaning, slug + ' meaning');
    assert.ok(D.metros[slug] && D.months[slug], slug + ' cooling data');
  }
});

test('payload: regional AC standards and reading guides', () => {
  assert.equal(P.states.FL.so, true);
  assert.equal(P.states.AZ.so, true);
  assert.equal(P.states.MN.so, false);
  for (const s of ['blower-door', 'duct-leakage', 'radon', 'mold-iaq', 'carbon-monoxide']) assert.ok(P.guides[s]?.b.length >= 2, s);
  assert.ok(!P.guides.radon.b.some((b) => /Bq\\/m³ or less/.test(b.r)), 'US radon bands only');
});

test('zip3 table', () => {
  const z = zip3.zip3;
  assert.deepEqual(z['606'].slice(0, 2), ['IL', 'chicago']);
  assert.deepEqual(z['021'].slice(0, 2), ['MA', 'boston']);
  assert.deepEqual(z['331'].slice(0, 2), ['FL', 'miami']);
  assert.deepEqual(z['596'], ['MT', null, null, null]);
  assert.equal(z['123'][0], 'NY');
  assert.equal(z['123'][2], 'new-york');
  assert.equal(Object.keys(zip3.meta.metros).length, 26);
  for (const [k, v] of Object.entries(z)) {
    assert.match(k, /^\\d{3}$/);
    assert.ok(!(v[1] && v[2]), k + ': a prefix in a metro has no nearest-metro entry');
  }
});
`);

const out = path.join(dir, 'entry.test.mjs');
await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', target: 'node20', loader: { '.json': 'json' }, logLevel: 'warning', plugins: [viteGlob] });
const r = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
