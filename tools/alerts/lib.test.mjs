// node --test tools/alerts/lib.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reminderBucket, daysBetween, updateMatches, checksFor, layout, updateEmail, esc } from './lib.mjs';

const checks = JSON.parse(readFileSync(new URL('../../src/data/seasonal-checks.json', import.meta.url))).items;
const cfg = { siteUrl: 'https://audityourhome.com', sender: 'AuditYourHome, operated by Click Shift Marketing', mailingAddress: '1 Test Rd, Wakefield QC', contactEmail: 'dave@clickshift.ca' };

test('reminder buckets', () => {
  assert.equal(reminderBucket(31), null);
  assert.equal(reminderBucket(30), 30);
  assert.equal(reminderBucket(8), 30);
  assert.equal(reminderBucket(7), 7);
  assert.equal(reminderBucket(2), 7);
  assert.equal(reminderBucket(1), 1);
  assert.equal(reminderBucket(0), 1);
  assert.equal(reminderBucket(-1), null);
  assert.equal(daysBetween('2026-10-12', '2026-10-19'), 7);
});

test('updates go to matching provinces, national updates to everyone', () => {
  assert.ok(updateMatches({ provinces: ['ON'] }, { provinces: ['ON', 'QC'] }));
  assert.ok(!updateMatches({ provinces: ['BC'] }, { provinces: ['ON'] }));
  assert.ok(updateMatches({ provinces: [] }, { provinces: ['ON'] }));
});

test('seasonal checks follow the home', () => {
  const well = checksFor(checks, 5, { heating: 'gas', cooling: 'none', water_supply: 'well' }, [], new Date('2026-05-02T12:00:00'));
  assert.ok(well.some((c) => c.id === 'well-spring'), 'well owners get the spring well test');
  const city = checksFor(checks, 5, { heating: 'gas', cooling: 'none', water_supply: 'municipal' }, [], new Date('2026-05-02T12:00:00'));
  assert.ok(!city.some((c) => c.id === 'well-spring'), 'town water: no well test');
  assert.ok(!city.some((c) => c.id === 'cooling-service'), 'no AC, gas heat: no cooling service');
  const unknown = checksFor(checks, 5, null, [], new Date('2026-05-02T12:00:00'));
  assert.ok(!unknown.some((c) => c.id === 'well-spring'), 'unknown water supply: no well test');
  const radonDone = checksFor(checks, 10, null, [{ kind: 'radon-test', done_on: '2025-01-10' }], new Date('2026-10-02T12:00:00'));
  assert.ok(!radonDone.some((c) => c.id === 'radon-test'), 'recent radon test: no reminder');
  const radonOld = checksFor(checks, 10, null, [{ kind: 'radon-test', done_on: '2019-01-10' }], new Date('2026-10-02T12:00:00'));
  assert.ok(radonOld.some((c) => c.id === 'radon-test'), 'old radon test: reminder');
  const electric = checksFor(checks, 9, { heating: 'electric' }, [], new Date('2026-09-02T12:00:00'));
  assert.ok(!electric.some((c) => c.id === 'fuel-appliance-service'), 'baseboards: no fuel inspection');
});

test('every check has a source and a month', () => {
  for (const c of checks) {
    assert.ok(c.source?.url?.startsWith('https://'), c.id);
    assert.ok(c.months.length && c.months.every((m) => m >= 1 && m <= 12), c.id);
  }
});

test('emails carry CASL identification and an unsubscribe link', () => {
  const m = updateEmail(cfg, { title: 'Test <b>change</b>', summary: 'Summary', url: '/programs/renoclimat/', provinces: ['QC'] }, { provinces: ['QC'] }, '00000000-0000-4000-8000-000000000000');
  assert.ok(m.html.includes('Test &lt;b&gt;change&lt;/b&gt;'), 'escaped');
  assert.ok(m.html.includes('1 Test Rd, Wakefield QC'), 'mailing address');
  assert.ok(m.html.includes('/account/unsubscribe/?t=00000000-0000-4000-8000-000000000000'), 'unsubscribe link');
  assert.ok(m.text.includes('Unsubscribe from all alerts: https://audityourhome.com/account/unsubscribe/?t='), 'text unsubscribe');
  assert.equal(m.headers['List-Unsubscribe'], '<https://audityourhome.com/account/unsubscribe/?t=00000000-0000-4000-8000-000000000000>');
  assert.ok(m.html.includes('https://audityourhome.com/programs/renoclimat/'), 'absolute link');
  const admin = layout(cfg, { title: 'x' });
  assert.ok(!admin.html.includes('Unsubscribe'), 'no unsubscribe without token');
  assert.equal(esc('"<&>\''), '&quot;&lt;&amp;&gt;&#39;');
});
