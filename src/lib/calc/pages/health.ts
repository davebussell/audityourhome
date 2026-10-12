/** Content for /calculators/home-health/<city>/ (build time). */
import { MODEL, maxRhNoCondensation, type AlarmRules, type WindowKey } from '../engine';
import { HEALTH, provinceAlarms, provinceWells, provinceRadon, cityName, climateOf, type CalcCity } from '../data';
import { int, degC, longDate, num } from '../format';
import { srcs, addSrc, type Fact, type Faq, type SourceRef, fit } from './common';
import type { HealthPayload } from '../../../components/calc/home-health';

type Newer = { scope: string; figure: string; source: string };
/** The survey report writes "Bq/m3"; show the unit properly. */
const fixUnits = (t: string) => t.replace(/Bq\/m3\b/g, 'Bq/m³');

function localRadon(city: CalcCity): { item: Newer | null; gm: number | null } {
  const list = ((city.radon.newer ?? []) as Newer[]).map((n) => ({ ...n, figure: fixUnits(n.figure) }));
  const rank = (n: Newer) => (n.scope.startsWith('city:') ? 0 : n.scope.startsWith('city/metro') ? 1 : 2);
  const sorted = [...list].sort((a, b) => rank(a) - rank(b));
  for (const n of sorted) {
    const m = n.figure.match(/geometric mean ([0-9.]+) Bq/);
    if (m) return { item: n, gm: parseFloat(m[1]) };
  }
  return { item: sorted[0] ?? null, gm: null };
}
const scopeName = (s: string) => s.replace(/^(city\/metro area|city|province sub-region|province): /, '').replace(/\s*\(.*$/, '');

export function healthPayload(city: CalcCity): HealthPayload {
  const cl = climateOf(city);
  const al = provinceAlarms(city.prov);
  const lr = localRadon(city);
  const smoke = al.smoke as unknown as AlarmRules & { rule?: string };
  let municipal: string | null = null;
  if (city.slug === 'vancouver') municipal = HEALTH.alarmsNational.vancouverCo;
  if (city.prov === 'QC') {
    const ex = (al.smoke as { municipalExamples?: { city: string; rule: string }[] }).municipalExamples;
    const q = ex?.find((x) => x.city === 'Québec City');
    municipal = city.slug === 'quebec-city' && q ? `Québec City: ${q.rule}` : 'In Quebec, smoke and CO alarm rules for houses come from your municipality; ask your fire service.';
  }
  return {
    city: { slug: city.slug, name: cityName(city), prov: city.prov, provName: city.provName, janMean: cl.janMean, designHeat: cl.designHeat, nights10: cl.nights10, nights20: cl.nights20 },
    radonDefault: lr.gm !== null
      ? { bq: Math.round(lr.gm), label: `Pre-filled with the 2024 Cross-Canada survey's average (geometric mean) for ${scopeName(lr.item!.scope)}.` }
      : { bq: 200, label: 'Example value: the Health Canada guideline.' },
    alarms: {
      smoke: { existingHomesRequired: smoke.existingHomesRequired ?? null, everyStorey: smoke.everyStorey ?? null, outsideSleepingAreas: smoke.outsideSleepingAreas ?? null, inEachBedroom: smoke.inEachBedroom ?? null },
      coExisting: (al.co.existingHomes as boolean | null) ?? null,
      smokeRule: String(smoke.rule ?? ''),
      coRule: String(al.co.summary ?? ''),
      municipal,
    },
    hIn: HEALTH.humidity.hIn,
  };
}

export function healthPage(city: CalcCity) {
  const name = cityName(city);
  const cl = climateOf(city);
  const payload = healthPayload(city);
  const al = provinceAlarms(city.prov);
  const wells = provinceWells(city.prov) as Record<string, string | string[] | null | undefined>;
  const rp = provinceRadon(city.prov);
  const r12 = { ...city.radon, newer: ((city.radon.newer ?? []) as Newer[]).map((n) => ({ ...n, figure: fixUnits(n.figure) })) };
  const lr = localRadon(city);
  const winRows = (['singleStorm', 'doubleClear', 'doubleLowE', 'energyStar', 'triple'] as WindowKey[]).map((k) => ({
    key: k, label: MODEL.envelope.windowU[k].label, u: MODEL.envelope.windowU[k].u,
    jan: Math.floor(maxRhNoCondensation(21, cl.janMean, MODEL.envelope.windowU[k].u, HEALTH.humidity.hIn)),
    design: Math.floor(maxRhNoCondensation(21, cl.designHeat, MODEL.envelope.windowU[k].u, HEALTH.humidity.hIn)),
  }));
  const dc = winRows.find((w) => w.key === 'doubleClear')!;
  const smoke = al.smoke as Record<string, unknown>;
  const co = al.co as Record<string, unknown>;
  const coWord = co.existingHomes === true ? 'requires' : co.existingHomes === false ? 'does not require' : 'has no rule we could confirm for';

  const title = fit([
    `Home health check for ${name}: radon, humidity, well water, alarms`,
    `Home health check for ${name}: radon, humidity, alarms`,
    `Home health check for ${name}: radon and humidity`,
    `Home health check for ${name}`,
  ], 60);
  const description = fit([
    `${name} radon survey results, the winter humidity that keeps windows dry at ${degC(cl.janMean)}, ${city.provName} smoke and CO alarm rules, and well-water testing advice.`,
    `${name} radon survey results, the winter humidity that keeps windows dry, ${city.provName} smoke and CO alarm rules, and well-water testing.`,
    `Radon results, winter window humidity, ${city.provName} smoke and CO alarm rules and well-water testing for ${name}.`,
  ], 160);
  const h1 = `Home health check for ${name}`;
  const kicker = `${city.provName} · rules and data checked ${longDate(HEALTH.asOf)}`;
  const radonLine = r12.pct !== null && r12.pct !== undefined
    ? `In Health Canada's 2012 survey, <strong>${num(r12.pct, 1)}%</strong> of ${int(r12.tested)} homes tested in the ${r12.region} region were above the 200 Bq/m³ radon guideline${lr.item ? `; the 2024 Cross-Canada survey found ${lr.item.figure.split(';')[0]} for ${scopeName(lr.item.scope)}` : ''}.`
    : '';
  const lede = `${radonLine} ${name}'s January averages <strong>${degC(cl.janMean)}</strong> (ECCC), with about ${int(cl.nights10)} nights a year below −10 °C, when CMHC advises keeping indoor humidity near 30% to stop window condensation. ${city.provName} ${coWord} carbon monoxide alarms in existing houses.`;

  const facts: Fact[] = [
    { k: 'Radon, 2012 survey', v: r12.pct !== null && r12.pct !== undefined ? `${num(r12.pct, 1)}%` : '—', s: `above 200 Bq/m³ (${int(r12.tested)} homes)` },
    { k: 'Radon, 2024 survey', v: lr.item ? (lr.item.figure.match(/^([0-9.]+%)/)?.[1] ?? '—') : '—', s: lr.item ? scopeName(lr.item.scope) : 'no figure for this area' },
    { k: 'January average', v: degC(cl.janMean), s: `${int(cl.nights10)} nights a year below −10 °C` },
    { k: 'Private wells', v: city.wells.level ? city.wells.level.charAt(0).toUpperCase() + city.wells.level.slice(1) : '—', s: `in ${name}` },
  ];

  const faqs: Faq[] = [];
  faqs.push({
    q: `How common is radon in ${name}?`,
    a: `${r12.pct !== null && r12.pct !== undefined ? `Health Canada's 2012 survey found ${num(r12.pct, 1)}% of ${int(r12.tested)} homes tested in the ${r12.region} region at or above 200 Bq/m³. ` : ''}${lr.item ? `The 2024 Cross-Canada survey, which pools tests that households volunteered, reports ${lr.item.figure.split(';')[0]} for ${scopeName(lr.item.scope)}. ` : ''}Neighbouring houses can differ a lot, so the only way to know is a long-term test of at least 3 months, ideally in the heating season.`,
  });
  faqs.push({
    q: `What indoor humidity should I keep in winter in ${name}?`,
    a: `Health Canada and CMHC advise 30% to 50%, and CMHC says to keep it at about 30% when it is below −10 °C outside (as low as 25% in extreme cold). ${name} averages ${int(cl.nights10)} nights a year below −10 °C. At the January average of ${degC(cl.janMean)}, clear double-glazed windows start to fog at about ${dc.jan}% humidity at the centre of the glass, and at about ${dc.design}% in a cold snap of ${degC(cl.designHeat)}; the edges fog sooner.`,
  });
  faqs.push({
    q: `How many smoke alarms does a house need in ${city.provName}?`,
    a: `${String(smoke.rule ?? '').replace(/\s+/g, ' ').slice(0, 520)} New homes built to the National Building Code need hardwired, interconnected alarms on every storey and in every bedroom, which is the standard we recommend for full coverage.`,
  });
  faqs.push({
    q: `Are carbon monoxide alarms required in ${city.provName}?`,
    a: `${String(co.summary ?? '').replace(/\s+/g, ' ').slice(0, 560)}`,
  });
  if (wells && (wells.bacteria || wells.chemistry)) {
    faqs.push({
      q: `How often should I test my well water in ${city.provName}?`,
      a: `${wells.bacteria ? `Bacteria: ${wells.bacteria}.` : ''} ${wells.chemistry ? `Chemistry: ${wells.chemistry}.` : ''} ${wells.bacteriaCost ? `Bacteria test cost: ${wells.bacteriaCost}.` : ''} ${city.wells.sentence ?? ''}`.replace(/\.\./g, '.').replace(/\s+/g, ' ').trim(),
    });
  }

  const sources: SourceRef[] = srcs(['hc-radon-guideline', 'hc-radon-measurement', 'hc-radon-testing', 'hc-radon-reduction', 'hc-radon-risk', 'hc-radon-survey-2012', 'evict-radon-2024', 'tar-reduction', 'wechu-radon', 'hc-humidity', 'cmhc-mould-kit', 'cmhc-clean-mould', 'nrc-cbd4', 'nrc-cbd36', 'nws-magnus', 'nbc-2020', 'nrcan-condensation', 'nbc-2020-alarms', 'nfc-2020', 'nrcan-kthi-s2-co', 'eccc-normals', 'nrcan-hot2000-map']);
  addSrc(sources, `${city.provName} smoke alarm rule: ${String(smoke.law ?? '').slice(0, 120)}`, smoke.source as string);
  addSrc(sources, `${city.provName} carbon monoxide alarm rule`, co.source as string);
  for (const u of (wells?.sources as string[] | undefined) ?? []) addSrc(sources, `${city.provName} well-water testing guidance`, u);
  if (city.wells.source) addSrc(sources, `${name} water supply`, city.wells.source);

  return {
    title, description, h1, kicker, lede, facts, faqs, sources, payload,
    glance: { r12, lr: lr.item, winRows, cl, smoke, co, wells, wellsCity: city.wells, rp, national: HEALTH.alarmsNational, radonGeneral: HEALTH.radon },
  };
}
export type HealthPage = ReturnType<typeof healthPage>;
