// Checks for the US Home Energy Planner's model, sequence rules and ZIP3 table.
// Usage: node tools/us/test-plan.mjs
// esbuild (a dependency of Astro) bundles the TypeScript and JSON first, as scripts/test-calc.mjs does.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = mkdtempSync(path.join(tmpdir(), 'us-plan-test-'));
const entry = path.join(dir, 'entry.test.ts');
const lib = (f) => JSON.stringify(path.join(root, 'src/lib/us', f));
const data = (f) => JSON.stringify(path.join(root, 'src/data/us', f));

writeFileSync(entry, `
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from ${lib('plan-model.ts')};
import * as C from ${lib('plan-content.ts')};
import zip3 from ${data('zip3.json')};
import climate from ${data('climate.json')};

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg ?? '') + ' expected ' + b + ' ± ' + tol + ', got ' + a);
const chicago = { slug: 'chicago', hdd65: climate.metros.chicago.hdd65, cdd65: climate.metros.chicago.cdd65, zone: climate.metros.chicago.iecc2021ClimateZone };
const prices = { electricity: 0.1922, gas: 1.09, oil: 6.042, propane: 1.829 };
const house = { age: '1946-1965', htype: 'detached', size: 'medium', found: 'basement', sys: 'gasFurnaceMid', wh: 'gasTank' };

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

test('electric heat is never scaled to a bill', () => {
  const m = M.houseModel({ ...house, sys: 'electricResistance', wh: 'electricTank' }, chicago, prices);
  assert.equal(M.calibrateFuelBill(m, 'electricResistance', 300).calibrated, false);
});

test('attic target follows ENERGY STAR by zone, capped at R-60', () => {
  const t = { 1: 30, 2: 49, 3: 49, 4: 60, 5: 60, 6: 60, 7: 60, 8: 60 };
  assert.equal(M.atticTargetR('1A', t), 30);
  assert.equal(M.atticTargetR('3C', t), 49);
  assert.equal(M.atticTargetR('5A', t), 60);
  assert.equal(M.atticTargetR(null, t), 60);
});

test('heat pump saving is the difference of the two running costs', () => {
  const m = M.houseModel(house, chicago, prices);
  const s = M.itemSaving('heat-pump', house, m, chicago, prices, 1, { 5: 60 }, 'singleStorm');
  const now = M.usHeatingCost(m.demand, 'gasFurnaceMid', m.hddC, prices).cost;
  const hp = M.usHeatingCost(m.demand, 'ashpCold', m.hddC, prices).cost;
  close(s.dollars, now - hp, 1e-6);
});

const seq = (o) => C.buildSequence({ age: '1966-1980', heat: 'gas', wh: 'gastank', win: 'unsure', found: 'basement', syms: [], goals: [], ...o });
const cats = (items) => items.map((i) => i.category);

test('sequence: foundation answers', () => {
  assert.ok(cats(seq({})).includes('basement-insulation'));
  assert.ok(!cats(seq({ found: 'slab' })).includes('basement-insulation'));
  assert.ok(cats(seq({ found: 'crawl' })).includes('crawlspace'));
});

test('sequence: heat pump wording fits the fuel', () => {
  assert.ok(!/electric/i.test(seq({}).find((i) => i.category === 'heat-pump').action), 'gas home');
  assert.ok(/electric/i.test(seq({ heat: 'electric' }).find((i) => i.category === 'heat-pump').action), 'electric home');
  assert.equal(seq({ heat: 'oil' })[0].category, 'heat-pump', 'oil puts the heat pump first');
  assert.ok(!cats(seq({ heat: 'heatpump' })).includes('heat-pump'), 'already has one');
});

test('sequence: no heat pump water heater suggestion when there is one', () => {
  assert.ok(!cats(C.buildSequence({ age: '1981-1995', heat: 'gas', wh: 'heatpump', win: 'unsure', found: 'basement', syms: [], goals: [] })).includes('water-heating'));
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
await build({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', target: 'node20', loader: { '.json': 'json' }, logLevel: 'warning' });
const r = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
