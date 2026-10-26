/** Content for /calculators/upgrade-payback/<city>/ (build time). */
import { MODEL, atticTargetR, rsiToR, fuelOf, systemEfficiency, type SystemKey } from '../engine';
import { resolvePrices, enginePrices, defaultSystem, rebatesCompact, rebatesFull, provinceRebates, municipalPrograms, shortProgram, cityName, climateOf, type CalcCity } from '../data';
import { money, unitPrice, int, gj, longDate, pct, range } from '../format';
import { TYPICAL_LINE, srcs, addSrc, type Fact, type Faq, type SourceRef, fit } from './common';
import { upgradeDefaults, computeUpgrade, pbRange, MEASURE_LABEL, type UpgradePayload, type UpgradeResult } from '../../../components/calc/upgrade-payback';
import { placeClimate } from '../../climate';

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The summer side of insulation, shading and heat pumps, for cities whose climate data says summers are moderate or hot. */
function summerSide(city: CalcCity, name: string): { line: string; faq: string; coastal: boolean } | null {
  const pc = placeClimate('ca', city.slug);
  const level = pc?.place.summerCooling;
  if (!pc || !level || level === 'low') return null;
  const key = pc.profile.key;
  const interior = key === 'bc-southern-interior';
  const why = key === 'coastal-bc'
    ? `most ${name} summers are mild, but in the 2021 heat dome 98% of BC's heat deaths happened indoors, mostly in homes without adequate cooling`
    : interior
      ? `${name}'s summers are hot and often smoky`
      : level === 'high'
        ? `${name}'s summers are hot and humid`
        : `heat waves reach ${name} too`;
  const how = `attic insulation and air sealing slow heat${interior ? ' and smoke' : level === 'high' ? ' and humid air' : ''} getting in, exterior shades or awnings on sunny windows block the sun before it heats the room, and a heat pump adds cooling${level === 'high' ? ' and can replace the air conditioner' : ''}`;
  return {
    line: `Summer counts too: ${why}. ${capFirst(how)}. These savings count heating only${level === 'high' ? ', so if you run air conditioning the real payback is a little shorter' : ''}.`,
    faq: `Yes. ${capFirst(why)}. The upgrades that keep heat in during winter keep it out in summer: ${how}. The calculator counts heating savings only, so ${level === 'high' ? 'with air conditioning the real payback is a little shorter' : 'its payback is on the cautious side'}.`,
    coastal: key === 'coastal-bc',
  };
}

export function upgradePayload(city: CalcCity): UpgradePayload {
  const rp = resolvePrices(city);
  const cl = climateOf(city);
  const reb = rebatesCompact(city, ['attic', 'walls', 'basement', 'airSealing', 'windows', 'thermostat']);
  return {
    city: { slug: city.slug, name: cityName(city), prov: city.prov, provName: city.provName, hdd: cl.hdd, zone: cl.zone },
    summerLine: summerSide(city, cityName(city))?.line ?? null,
    prices: enginePrices(rp),
    defaultSystem: defaultSystem(city),
    rebates: {
      attic: reb.attic ?? [], walls: reb.walls ?? [], basement: reb.basement ?? [], airSealing: reb.airSealing ?? [], windows: reb.windows ?? [], thermostat: reb.thermostat ?? [],
    },
  };
}

/** The standard measures for the typical house, heated by `sys`. */
export function typicalUpgrade(payload: UpgradePayload, sys: SystemKey): UpgradeResult {
  const s = upgradeDefaults({ ...payload, defaultSystem: sys });
  s.system = sys;
  return computeUpgrade(s, payload);
}

export function upgradePage(city: CalcCity) {
  const name = cityName(city);
  const rp = resolvePrices(city);
  const prices = enginePrices(rp);
  const cl = climateOf(city);
  const payload = upgradePayload(city);
  const t = atticTargetR(cl.hdd);
  const hasGas = prices.gas !== null;
  const fossil: SystemKey | null = hasGas ? 'gasFurnaceMid' : prices.oil ? 'oilFurnaceMid' : null;
  const runs: { sys: SystemKey; label: string; r: UpgradeResult }[] = [];
  if (fossil) runs.push({ sys: fossil, label: hasGas ? 'Gas-heated (mid-efficiency furnace)' : 'Oil-heated (mid-efficiency furnace)', r: typicalUpgrade(payload, fossil) });
  runs.push({ sys: 'electricResistance', label: 'Electrically heated (baseboards)', r: typicalUpgrade(payload, 'electricResistance') });
  const first = runs[0];
  const elec = runs[runs.length - 1];
  const mOf = (r: UpgradeResult, k: string) => r.measures.find((x) => x.key === k)!;
  const atticF = mOf(first.r, 'attic');
  const atticE = mOf(elec.r, 'attic');
  const fuelWord = hasGas ? 'gas' : fossil ? 'oil' : 'electric';
  const prov = provinceRebates(city.prov);
  const full = rebatesFull(city, ['attic', 'walls', 'basement', 'airSealing', 'windows']);
  const openPrograms = [...new Set(Object.values(full).flat().filter((e) => e.status === 'open' && e.kind !== 'info').map((e) => shortProgram(e.program)))];
  const unitWord = (sys: SystemKey) => (fuelOf(sys) === 'gas' ? 'm³' : fuelOf(sys) === 'electricity' ? 'kWh' : 'L');
  const varPrice = (sys: SystemKey) => (fuelOf(sys) === 'gas' ? prices.gas?.variable ?? null : fuelOf(sys) === 'electricity' ? prices.electricity.variable : prices.oil);

  const title = fit([`Insulation and upgrade payback calculator: ${name}`, `Upgrade payback calculator: ${name}`], 60);
  const description = fit([
    `${name} attic, wall, basement, window and air-sealing savings at October 2026 prices, with open ${city.provName} rebates and simple payback. Calibrate it to your bills.`,
    `${name} attic, wall, basement, window and air-sealing savings at October 2026 prices, with open ${city.provName} rebates and simple payback.`,
    `Insulation, window and air-sealing savings in ${name} at 2026 prices, with open rebates and simple payback.`,
  ], 160);
  const h1 = `Insulation and upgrade payback calculator for ${name}`;
  const kicker = `${city.provName} · climate zone ${cl.zone} · prices and rebates checked ${longDate(rp.asOf)}`;
  const rbTxt = atticF.rebate ? `; the smallest open rebate that applies (${atticF.rebate.program}) is ${range(atticF.rebate.amountLow, atticF.rebate.amountHigh, money)}` : '; no open provincial rebate applies';
  const lede = `${name} has ${int(cl.hdd)} heating degree-days a year (climate zone ${cl.zone}), and NRCan recommends about <strong>R-${t.nrcan}</strong> in an attic here. For ${TYPICAL_LINE} with a ${fossil ? MODEL.systems[first.sys].short.toLowerCase() : 'baseboard heaters'}, topping up the attic from R-20 to R-${t.target} saves about <strong>${money(atticF.dollars)} a year</strong> at ${unitPrice(varPrice(first.sys), unitWord(first.sys))} and costs about ${range(atticF.costLow, atticF.costHigh, money)}${rbTxt}.${fossil ? ` In an electrically heated house the same attic saves about ${money(atticE.dollars)} a year.` : ''}`;

  const facts: Fact[] = [
    { k: 'Heating degree-days', v: int(cl.hdd), s: `NBC climate zone ${cl.zone}` },
    { k: 'NRCan attic target', v: `R-${t.nrcan}`, s: `code minimum for new homes R-${t.codeMinR}` },
    { k: hasGas ? 'Natural gas, one more m³' : 'Electricity, one more kWh', v: hasGas ? unitPrice(prices.gas!.variable, 'm³') : unitPrice(prices.electricity.variable, 'kWh'), s: 'used for every saving' },
    { k: 'Open rebate programs', v: openPrograms.length ? String(openPrograms.length) : 'None', s: openPrograms.length ? openPrograms.slice(0, 2).join('; ') : 'see financing options below' },
  ];

  const faqs: Faq[] = [];
  faqs.push({
    q: `Does attic insulation pay for itself in ${name}?`,
    a: `For ${TYPICAL_LINE}, going from R-20 to R-${t.target} saves about ${money(atticF.dollars)} a year with ${hasGas ? 'a mid-efficiency gas furnace' : fossil ? 'a mid-efficiency oil furnace' : 'electric heat'}${fossil ? ` and ${money(atticE.dollars)} with electric baseboards` : ''}, counted at the price of one more unit of energy. At HomeStars' $1.50–$2.45 per sq ft (about ${range(atticF.costLow, atticF.costHigh, money)}) ${atticF.rebate ? `and a ${range(atticF.rebate.amountLow, atticF.rebate.amountHigh, money)} rebate` : 'with no rebate'}, simple payback is ${pbRange(atticF.pbLow, atticF.pbHigh)}${fossil ? ` (${pbRange(atticE.pbLow, atticE.pbHigh)} for an electrically heated house)` : ''}. Attics with less than R-20 save more.`,
  });
  const ruleLines = (['attic', 'walls', 'basement'] as const).map((k) => {
    const list = (full[k] ?? []).filter((e) => e.status === 'open' && e.kind !== 'info');
    if (!list.length) return null;
    return `${MEASURE_LABEL[k]}: ${list.map((e) => `${shortProgram(e.program)} (${(e.amount ?? '').split('. ')[0].replace(/\s+/g, ' ').slice(0, 140)})`).join('; ')}`;
  }).filter(Boolean);
  faqs.push({
    q: `What insulation rebates are open in ${name}?`,
    a: ruleLines.length
      ? `As of ${longDate(rp.asOf)}: ${ruleLines.join(' ')}. Conditions apply (most need an EnerGuide evaluation before the work); the calculator counts the smallest amount for each and lets you switch it off.`
      : `We found no open provincial insulation rebate for ${city.provName} as of ${longDate(rp.asOf)}. ${(prov?.measureNotes?.all ?? prov?.summary ?? '').slice(0, 300)}`,
  });
  faqs.push({
    q: `How much insulation should an attic have in ${name}?`,
    a: `NRCan's Keeping the Heat In recommends about R-${t.nrcan} (RSI ${(t.nrcan / 5.678).toFixed(1)}) for an attic in climate zone ${cl.zone}, which covers ${name} at ${int(cl.hdd)} degree-days. The National Building Code minimum for a new house here is R-${t.codeMinR} without a heat recovery ventilator. Our calculator caps its default target at R-60.`,
  });
  const winF = mOf(first.r, 'windows');
  const winE = mOf(elec.r, 'windows');
  faqs.push({
    q: `Are new windows worth it for energy savings in ${name}?`,
    a: `Rarely on energy alone. Replacing ${int(first.r.s.windows.count ?? 15)} double-glazed windows with ENERGY STAR models saves about ${money(winF.dollars)} a year in a ${fuelWord}-heated house${fossil ? ` and ${money(winE.dollars)} with electric heat` : ''}, against ${range(winF.costLow, winF.costHigh, money)} at HomeStars' $800–$1,200 a window: payback ${pbRange(winF.pbLow, winF.pbHigh)}. Replace windows when they fail or for comfort; air sealing and attic insulation pay back much faster.`,
  });
  const airF = mOf(first.r, 'airSealing');
  const sbF = mOf(first.r, 'setback');
  faqs.push({
    q: `How much do air sealing and a thermostat setback save in ${name}?`,
    a: `Cutting air leakage by 20% saves about ${money(airF.dollars)} a year in a typical ${fuelWord}-heated house here (NRCan: about a quarter of heat loss is air leakage), and turning the thermostat down 3 °C for 8 hours a night saves about ${money(sbF.dollars)} a year (NRCan: about 2% per degree over eight hours). Heat pumps should be set back no more than 2 °C.`,
  });

  const summer = summerSide(city, name);
  if (summer) faqs.push({ q: `Do these upgrades help keep the house cool in summer in ${name}?`, a: summer.faq });

  const sources: SourceRef[] = srcs(['nrcan-hot2000-map', 'nrcan-ceud-t33', 'nrcan-hwg', 'nrcan-kthi-s2', 'nrcan-kthi-s3', 'nrcan-kthi-s5', 'nrcan-kthi-s6', 'nrcan-kthi-s7', 'nrcan-kthi-s8', 'nrcan-kthi-s9', 'nbc-2020', 'nrcan-windows-2003', 'energystar-windows-v5', 'wikipedia-blower-door', 'wikipedia-ach', 'wikipedia-shc', 'nrcan-heat-pump-guide', 'nrcan-energystar-wh', 'hq-consumption-by-use', 'homestars-attic', 'homestars-windows', 'dunsky-cci-2024']);
  for (const arr of Object.values(full)) for (const e of arr) addSrc(sources, `${shortProgram(e.program)} (checked ${e.checked ?? rp.asOf})`, e.source);
  addSrc(sources, `Electricity price: ${rp.elec.utility.split('(')[0].trim()}`, rp.elec.source);
  if (rp.gas) addSrc(sources, `Natural gas price: ${rp.gas.utility.split('(')[0].trim()}`, rp.gas.source);
  if (rp.oil) addSrc(sources, 'Heating oil price: Statistics Canada table 18-10-0001-01', rp.oil.source);
  if (summer?.coastal) addSrc(sources, 'BC Coroners Service, review of heat-related deaths in the 2021 heat dome', 'https://news.gov.bc.ca/releases/2022PSSG0042-000903');

  return {
    title, description, h1, kicker, lede, facts, faqs, sources, payload, rp,
    glance: { runs, t, prov, full, municipal: municipalPrograms(city), cop: systemEfficiency('ashpCold', cl.hdd), hasGas },
  };
}
export type UpgradePage = ReturnType<typeof upgradePage>;
export { pct, gj, rsiToR };
