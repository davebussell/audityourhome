/** Content for /calculators/energy-costs/<city>/ (build time). */
import {
  MODEL, baselineDemandGJ, heatingCost, systemEfficiency, fuelUnit, waterHeatingDemand, waterHeaterCost, coolingKwh,
  defaultAcTons, tanklessClaim, type SystemKey, type WaterHeaterKey,
} from '../engine';
import { resolvePrices, enginePrices, defaultSystem, rebatesCompact, cityName, climateOf, type CalcCity, type ResolvedPrices } from '../data';
import { money, unitPrice, int, qty, gj, longDate, signed, pct, degC } from '../format';
import { TYPICAL, TYPICAL_LINE, srcs, addSrc, type Fact, type Faq, type SourceRef, addTariffSources, fit } from './common';
import type { EnergyPayload } from '../../../components/calc/energy-costs';

const GLANCE_SYSTEMS: SystemKey[] = [
  'gasFurnaceMid', 'gasFurnaceHigh', 'oilFurnaceMid', 'oilFurnaceNew', 'propaneFurnaceStd', 'propaneFurnaceCond',
  'electricResistance', 'ashpStandard', 'ashpCold', 'gshp', 'woodCertified', 'pellet',
];

export function energyPayload(city: CalcCity, rp: ResolvedPrices = resolvePrices(city)): EnergyPayload {
  const cl = climateOf(city);
  const reb = rebatesCompact(city, ['ashp', 'gshp', 'hpwh']);
  return {
    city: { slug: city.slug, name: cityName(city), prov: city.prov, provName: city.provName, hdd: cl.hdd, cdd18: cl.cdd18, designCool: cl.designCool, annualMean: cl.annualMean, zone: cl.zone },
    prices: enginePrices(rp),
    defaultSystem: defaultSystem(city),
    rebates: { ashp: reb.ashp ?? [], gshp: reb.gshp ?? [], hpwh: reb.hpwh ?? [] },
  };
}

export function energyPage(city: CalcCity) {
  const name = cityName(city);
  const rp = resolvePrices(city);
  const prices = enginePrices(rp);
  const cl = climateOf(city);
  const payload = energyPayload(city, rp);
  const hdd = cl.hdd;
  const hasGas = prices.gas !== null;
  const demand = baselineDemandGJ({ vintage: TYPICAL.vintage, floorAreaM2: TYPICAL.areaM2, hdd, type: TYPICAL.type });
  const cost = (k: SystemKey, mode: 'now' | 'variable' = 'now') => heatingCost(demand, k, hdd, prices, mode);

  // ---------- table 1: heating by system
  const heatRows = GLANCE_SYSTEMS.filter((k) => hasGas || MODEL.systems[k].fuel !== 'gas').map((k) => {
    const h = cost(k);
    return { key: k, label: MODEL.systems[k].short, eff: h.eff, heatPump: MODEL.systems[k].fuel === 'electricity', units: h.units, unit: h.unit, cost: h.cost, perGJ: h.costPerGJ };
  });

  // ---------- table 2: cost per GJ of heat delivered by fuel
  const fuelRows: { label: string; price: string; perGJfuel: number | null; eff: string; perGJheat: number | null }[] = [];
  const addFuel = (label: string, sys: SystemKey, priceTxt: string, pricePerUnit: number | null) => {
    const fu = fuelUnit(MODEL.systems[sys].fuel as never);
    const eff = systemEfficiency(sys, hdd);
    const perFuel = pricePerUnit ? pricePerUnit / fu.gjPerUnit : null;
    fuelRows.push({ label, price: priceTxt, perGJfuel: perFuel, eff: MODEL.systems[sys].fuel === 'electricity' ? `COP ${eff.toFixed(1)}` : `${Math.round(eff * 100)}%`, perGJheat: perFuel ? perFuel / eff : null });
  };
  if (prices.gas) addFuel('Natural gas, condensing furnace', 'gasFurnaceHigh', unitPrice(prices.gas.now, 'm³'), prices.gas.now);
  addFuel('Heating oil, new furnace', 'oilFurnaceNew', prices.oil ? unitPrice(prices.oil, 'L') : 'not published', prices.oil);
  addFuel('Propane, condensing furnace', 'propaneFurnaceCond', prices.propane ? unitPrice(prices.propane, 'L') : 'enter yours', prices.propane);
  addFuel('Electricity, baseboards', 'electricResistance', unitPrice(prices.electricity.now, 'kWh'), prices.electricity.now);
  addFuel('Electricity, cold-climate heat pump', 'ashpCold', unitPrice(prices.electricity.now, 'kWh'), prices.electricity.now);
  addFuel('Electricity, ground-source heat pump', 'gshp', unitPrice(prices.electricity.now, 'kWh'), prices.electricity.now);
  addFuel('Firewood, certified stove', 'woodCertified', 'enter yours', null);
  addFuel('Wood pellets, pellet stove', 'pellet', 'enter yours', null);

  // ---------- table 3: water heaters, 3 people
  const w = waterHeatingDemand(3, cl.annualMean);
  const spaceSys = defaultSystem(city);
  const whRows = (Object.keys(MODEL.water.types) as WaterHeaterKey[])
    .filter((k) => hasGas || MODEL.water.types[k].fuel !== 'gas')
    .map((k) => {
      const r = waterHeaterCost(k, w.gj, prices, 'now', { sys: spaceSys, hdd });
      return { key: k, label: MODEL.water.types[k].label, uef: r.uef, units: r.units, unit: r.unit, cost: r.cost, extra: r.extraCost, total: r.cost !== null ? r.cost + (r.extraCost ?? 0) : null };
    });

  // ---------- table 4: cooling
  const tons = defaultAcTons(TYPICAL.areaM2);
  const central = coolingKwh({ cdd18: cl.cdd18, designCool: cl.designCool, capacityBtuh: tons * 12000, seer: MODEL.cooling.seerByAge['2006to2022'] });
  const centralNew = coolingKwh({ cdd18: cl.cdd18, designCool: cl.designCool, capacityBtuh: tons * 12000, seer: MODEL.cooling.seerByAge['2023on'] });
  const room = coolingKwh({ cdd18: cl.cdd18, designCool: cl.designCool, capacityBtuh: MODEL.cooling.room.capacityBtuh, eer: MODEL.cooling.room.eerStock, room: true });
  const ep = prices.electricity.variable ?? 0;

  // ---------- headline numbers
  const gasMid = hasGas ? cost('gasFurnaceMid') : null;
  const ccHp = cost('ashpCold');
  const elec = cost('electricResistance');
  const oilNew = cost('oilFurnaceNew');
  const hpVsGas = hasGas ? cost('ashpCold', 'variable').cost! - cost('gasFurnaceMid', 'variable').cost! : null;
  const hpVsElec = cost('ashpCold', 'variable').cost! - cost('electricResistance', 'variable').cost!;
  const elecUtil = rp.elec.utility.split('(')[0].split(',')[0].trim();
  const gasUtil = rp.gas ? rp.gas.utility.split('(')[0].split(' - ')[0].split(',')[0].trim() : null;
  const h2k = city.hot2000;

  const title = fit([`Home heating cost calculator for ${name} (2026)`, `Heating cost calculator for ${name} (2026)`, `Heating costs in ${name} (2026)`], 60);
  const leadSys = gasMid ? `${money(gasMid.cost)} with a mid-efficiency gas furnace` : `${money(elec.cost)} with electric baseboards`;
  const description = `${name}: a typical 1,600 sq ft house costs about ${gasMid ? money(gasMid.cost) + ' a year to heat with gas' : money(elec.cost) + ' a year to heat with electricity'}. Compare oil, electric and heat pumps at October 2026 prices.`;
  const h1 = `Home heating cost calculator for ${name}`;
  const kicker = `${city.provName} · prices checked ${longDate(rp.asOf)}`;
  const lede = hasGas
    ? `${name} averages ${int(hdd)} heating degree-days a year (NRCan HOT2000 data for ${h2k.station}). At prices checked ${longDate(rp.asOf)} — <strong>${elecUtil}</strong> electricity at about ${unitPrice(rp.elec.avg, 'kWh')} on average and <strong>${gasUtil}</strong> natural gas at about ${unitPrice(rp.gas!.now, 'm³')} with fixed charges — ${TYPICAL_LINE} costs about <strong>${leadSys}</strong>, ${money(ccHp.cost)} with a cold-climate heat pump and ${money(elec.cost)} with electric baseboards.`
    : `${name} averages ${int(hdd)} heating degree-days a year (NRCan HOT2000 data for ${h2k.station}) and has no natural gas service. At prices checked ${longDate(rp.asOf)} — <strong>${elecUtil}</strong> electricity at about ${unitPrice(rp.elec.avg, 'kWh')} on average${rp.oil ? ` and heating oil at ${unitPrice(rp.oil.perL, 'L')} (12-month average)` : ''} — ${TYPICAL_LINE} costs about <strong>${leadSys}</strong>, ${money(ccHp.cost)} with a cold-climate heat pump${oilNew.cost ? ` and ${money(oilNew.cost)} with a new oil furnace` : ''}.`;

  const facts: Fact[] = [
    { k: 'Heating degree-days', v: int(hdd), s: `NBC climate zone ${cl.zone}` },
    { k: 'Electricity', v: unitPrice(rp.elec.avg, 'kWh'), s: `${elecUtil}, average` },
    hasGas
      ? { k: 'Natural gas', v: unitPrice(rp.gas!.now, 'm³'), s: `${gasUtil}, incl. fixed charges` }
      : { k: 'Heating oil', v: rp.oil ? unitPrice(rp.oil.perL, 'L') : '—', s: rp.oil ? `12-month average to ${rp.oil.month}` : 'no published price' },
    { k: 'Typical house, per year', v: gasMid ? money(gasMid.cost) : money(elec.cost), s: gasMid ? 'mid-efficiency gas furnace' : 'electric baseboards' },
  ];

  // ---------- FAQs (with the city's own numbers)
  const faqs: Faq[] = [];
  faqs.push({
    q: `How much does it cost to heat a house in ${name}?`,
    a: `For ${TYPICAL_LINE}, which needs about ${gj(demand)} of heat a year in ${name}, we estimate ${gasMid ? `${money(gasMid.cost)} a year with a mid-efficiency gas furnace (about ${qty(gasMid.units)} m³), ` : ''}${money(elec.cost)} with electric baseboards (about ${qty(elec.units)} kWh) and ${money(ccHp.cost)} with a cold-climate heat pump, at average prices checked ${longDate(rp.asOf)}. Your own bills may differ; enter them in the calculator to calibrate the estimate.`,
  });
  if (hasGas && hpVsGas !== null) {
    faqs.push({
      q: `Is a heat pump cheaper to run than gas in ${name}?`,
      a: hpVsGas < 0
        ? `At ${name} prices a cold-climate heat pump (seasonal COP ${systemEfficiency('ashpCold', hdd).toFixed(1)} here, backup heat included) would cost about ${money(-hpVsGas)} a year less to run than a mid-efficiency gas furnace in a typical house, counting only the price of each extra unit of energy.`
        : `Not on running costs alone. At ${name} prices a cold-climate heat pump (seasonal COP ${systemEfficiency('ashpCold', hdd).toFixed(1)} here, backup heat included) would cost about ${money(hpVsGas)} a year more to run than a mid-efficiency gas furnace in a typical house, counting only the price of each extra unit of energy. Against electric baseboards it would save about ${money(-hpVsElec)} a year.`,
    });
  } else {
    faqs.push({
      q: `How much can a heat pump save over electric baseboards in ${name}?`,
      a: `About ${money(-hpVsElec)} a year for ${TYPICAL_LINE}, at the price of one more kWh (${unitPrice(prices.electricity.variable, 'kWh')}). We use a seasonal COP of ${systemEfficiency('ashpCold', hdd).toFixed(1)} for a cold-climate heat pump at ${int(hdd)} degree-days, backup heat included.`,
    });
  }
  faqs.push({
    q: `What do electricity${hasGas ? ' and natural gas' : ''} cost in ${name} in 2026?`,
    a: `${elecUtil} electricity averages about ${unitPrice(rp.elec.avg, 'kWh')} for a 1,000 kWh month with taxes and fixed charges; one more kWh costs about ${unitPrice(rp.elec.variable, 'kWh')}${rp.elec.tierHigher ? ' (the higher step price that electric heating reaches in winter)' : ''}.${hasGas ? ` ${gasUtil} natural gas averages about ${unitPrice(rp.gas!.now, 'm³')} including fixed charges, and one more m³ costs about ${unitPrice(rp.gas!.variable, 'm³')}.` : ''}${rp.oil ? ` Heating oil averaged ${unitPrice(rp.oil.perL, 'L')} over ${rp.oil.period} (Statistics Canada, ${rp.oil.city}).` : ''} The federal consumer carbon charge has been zero since April 1, 2025.`,
  });
  const whGas = whRows.find((x) => x.key === 'gasTank');
  const whEl = whRows.find((x) => x.key === 'electricTank');
  const whHp = whRows.find((x) => x.key === 'heatPump');
  faqs.push({
    q: `How much does hot water cost in ${name}?`,
    a: `A three-person household uses about 225 L of hot water a day (NRCan). Heating it from about ${degC(w.inletC)} to 55 °C takes ${gj(w.gj)} a year: about ${money(whEl?.total)} with an electric tank${whGas ? `, ${money(whGas.total)} with a standard gas tank` : ''} and ${money(whHp?.total)} with a heat pump water heater, including the heat it takes from the house in winter.`,
  });
  faqs.push({
    q: `What does central air conditioning cost to run in ${name}?`,
    a: `A ${tons.toFixed(1)}-ton central air conditioner at SEER 13 uses about ${qty(central.kwh)} kWh a year in ${name} (${int(central.eflh)} full-load hours from ${int(cl.cdd18)} cooling degree-days, times 0.8 for real-world use): about ${money(central.kwh * ep)} at ${unitPrice(ep, 'kWh')}. A new SEER 14 unit would use about ${qty(centralNew.kwh)} kWh.`,
  });

  // ---------- sources
  const sources: SourceRef[] = srcs(['nrcan-hot2000-map', 'eccc-normals', 'nrcan-ceud-t33', 'nrcan-hwg', 'cer-conversion', 'dunsky-cci-2024', 'rdh-bc-hp', 'yukon-hp-pilot', 'nrcan-heat-pump-guide', 'nrcan-energystar-wh', 'hq-consumption-by-use', 'nrcan-water-heater-guide', 'resnet-301-mains', 'nrcan-gas-wh-reg', 'nrcan-gas-tankless-reg', 'energystar-wh-criteria', 'ecfr-electric-wh', 'doe-hpwh-field', 'nrcan-oil-wh-reg', 'doe-tankless', 'trca-step-hpwh', 'nrcan-ac', 'nrcan-ac-regs', 'nrcan-ceud-t27-on', 'nrcan-ceud-t4-on', 'nrcan-room-ac-reg', 'nrcan-split-hp-reg', 'furnaceprices-hp', 'furnaceprices-furnace', 'furnaceprices-wh']);
  addSrc(sources, `Electricity price: ${elecUtil} (${rp.elec.avgBasis})`, rp.elec.source);
  addTariffSources(sources, elecUtil, rp.elec.tariffSources);
  if (rp.gas) addSrc(sources, `Natural gas price: ${gasUtil} (${rp.gas.date})`, rp.gas.source);
  if (rp.oil) addSrc(sources, `Heating oil price: Statistics Canada table 18-10-0001-01 (${rp.oil.city})`, rp.oil.source);
  if (rp.propane) addSrc(sources, 'Propane maximum price (provincial regulator)', rp.propane.source);

  return {
    title, description, h1, kicker, lede, facts, faqs, sources, payload, rp,
    glance: {
      demand, heatRows, fuelRows, hasGas,
      water: { gj: w.gj, inlet: w.inletC, litres: w.litresPerDay, rows: whRows, spaceSys, claim: tanklessClaim(w.litresPerDay) },
      cool: { tons, kwh: central.kwh, cost: central.kwh * ep, newKwh: centralNew.kwh, newCost: centralNew.kwh * ep, eflh: central.eflh, roomKwh: room.kwh, roomCost: room.kwh * ep, price: ep },
    },
  };
}
export type EnergyPage = ReturnType<typeof energyPage>;
export { signed, pct };
