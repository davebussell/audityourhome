/** Content for /calculators/appliance-energy/<city>/ (build time). */
import { APPLIANCES, resolvePrices, cityName, climateOf, type CalcCity } from '../data';
import { money, unitPrice, int, qty, longDate, degC, rateDate, stationName } from '../format';
import { srcs, addSrc, addTariffSources, type Fact, type Faq, type SourceRef, fit } from './common';
import type { AppliancePayload, ApItem } from '../../../components/calc/appliance-energy';

type Raw = (typeof APPLIANCES.items)[number] & Record<string, unknown>;
const A = (id: string) => {
  const x = APPLIANCES.items.find((i) => i.id === id) as Raw | undefined;
  if (!x) throw new Error(`appliance ${id}`);
  return x;
};
const n = (v: unknown) => (typeof v === 'number' ? v : null);

export function applianceItems(city: CalcCity): (ApItem & { useScale?: number; source: string })[] {
  const cl = climateOf(city);
  const pool = A('poolPump').kWhPerHour as unknown as Record<string, number>;
  const ev = A('evCharging');
  const items: (ApItem & { useScale?: number; source: string })[] = [
    { id: 'fridge', label: 'Refrigerator, top freezer', kind: 'annual', oldKwh: n(A('fridge').oldKwh), newKwh: n(A('fridge').newKwh), oldLabel: 'Older (2002–2008)', newLabel: 'Newer (2017 or later)', hint: 'Hydro-Québec data by model year.', defaultVersion: 'old', defaultOn: true, defaultQty: 1, source: String(A('fridge').source) },
    { id: 'fridgeSecond', label: 'Second fridge (garage or basement)', kind: 'annual', oldKwh: n(A('fridgeSecond').oldKwh), newKwh: n(A('fridgeSecond').newKwh), removeKwh: n(A('fridgeSecond').removeSavingsKwh), oldLabel: 'Older (1994–2001)', newLabel: 'Newer (2017 or later)', hint: 'Unplugging it saves the whole amount.', defaultVersion: 'old', defaultOn: false, defaultQty: 1, source: String(A('fridgeSecond').source) },
    { id: 'chestFreezer', label: 'Chest freezer', kind: 'annual', oldKwh: n(A('chestFreezer').oldKwh), newKwh: n(A('chestFreezer').newKwh), oldLabel: 'Older (2004–2009)', newLabel: 'Newer (2017 or later)', hint: 'Hydro-Québec data by model year.', defaultOn: false, defaultQty: 1, source: String(A('chestFreezer').source) },
    { id: 'uprightFreezer', label: 'Upright freezer, frost-free', kind: 'annual', oldKwh: n(A('uprightFreezer').oldKwh), newKwh: n(A('uprightFreezer').newKwh), oldLabel: 'Older (2004–2014)', newLabel: 'Newer (2017 or later)', hint: 'Hydro-Québec data by model year.', defaultOn: false, defaultQty: 1, source: String(A('uprightFreezer').source) },
    { id: 'dishwasher', label: 'Dishwasher (machine only)', kind: 'annual', oldKwh: n(A('dishwasher').oldKwh), newKwh: n(A('dishwasher').newKwh), oldLabel: 'Older (2008 model)', newLabel: 'Newer (2022 model)', hint: 'NRCan rated use; the hot water is counted in the heating calculator.', defaultOn: true, defaultQty: 1, source: String(A('dishwasher').source) },
    { id: 'clothesWasher', label: 'Clothes washer (machine only)', kind: 'annual', oldKwh: n(A('clothesWasher').oldKwh), newKwh: n(A('clothesWasher').newKwh), oldLabel: 'Older (2008 model)', newLabel: 'Newer (2022 model)', hint: 'NRCan rated use; most of a washer\'s energy is hot water.', defaultOn: true, defaultQty: 1, source: String(A('clothesWasher').source) },
    { id: 'clothesDryer', label: 'Electric clothes dryer', kind: 'annual', oldKwh: n(A('clothesDryer').oldKwh), newKwh: n(A('clothesDryer').newKwh), oldLabel: 'Older (2008 model)', newLabel: 'Newer (2022 model)', hint: 'NRCan rated use.', defaultOn: true, defaultQty: 1, source: String(A('clothesDryer').source) },
    { id: 'heatPumpDryer', label: 'Heat pump dryer instead of a vented dryer', kind: 'annual', oldKwh: n(A('heatPumpDryer').oldKwh), newKwh: n(A('heatPumpDryer').newKwh), oldLabel: 'Vented electric dryer', newLabel: 'Heat pump dryer', hint: 'ENERGY STAR medians for models sold in Canada, 283 loads a year (a different test basis from the dryer above).', defaultVersion: 'old', defaultOn: false, defaultQty: 1, source: String(A('heatPumpDryer').source) },
    { id: 'electricRange', label: 'Electric range and oven', kind: 'annual', oldKwh: n(A('electricRange').oldKwh), newKwh: n(A('electricRange').newKwh), oldLabel: 'Older (2008 model)', newLabel: 'Newer (2022 model)', hint: 'Ranges haven\'t become more efficient since the mid-2000s.', defaultOn: true, defaultQty: 1, source: String(A('electricRange').source) },
    { id: 'microwave', label: 'Microwave oven (1,200 W)', kind: 'perHour', kwhPerHour: n(A('microwave').kWhPerHour), useScale: 1 / 60, days: 365, useLabel: 'Minutes a day', useUnit: 'min/day', defaultUse: 10, hint: 'Hydro-Québec wattage. 10 minutes a day is an example; enter yours.', defaultOn: true, defaultQty: 1, source: String(A('microwave').source) },
    { id: 'tv55', label: 'Television, about 55 inches', kind: 'annual', oldKwh: n(A('tv55').oldKwh), newKwh: n(A('tv55').newKwh), oldLabel: 'Older (2008–2009 LCD)', newLabel: 'Newer (ENERGY STAR LED)', hint: '3 hours a day on, standby the rest.', defaultOn: true, defaultQty: 1, source: String(A('tv55').source) },
    { id: 'desktopComputer', label: 'Desktop computer and monitor', kind: 'annual', oldKwh: n(A('desktopComputer').oldKwh), newKwh: n(A('desktopComputer').newKwh), oldLabel: 'Desktop', newLabel: 'Laptop instead', hint: '3 hours a day in use, asleep the rest.', defaultVersion: 'old', defaultOn: false, defaultQty: 1, source: String(A('desktopComputer').source) },
    { id: 'gameConsole', label: 'Game console', kind: 'annual', oldKwh: n(A('gameConsole').oldKwh), newKwh: n(A('gameConsole').newKwh), oldLabel: 'Left in instant-on standby', newLabel: 'Switched fully off', hint: '3 hours of play a day.', defaultVersion: 'old', defaultOn: false, defaultQty: 1, source: String(A('gameConsole').source) },
    { id: 'dehumidifier', label: 'Portable dehumidifier', kind: 'annual', oldKwh: n(A('dehumidifier').oldKwh), newKwh: n(A('dehumidifier').newKwh), oldLabel: 'Standard model', newLabel: 'ENERGY STAR model', hint: 'ENERGY STAR median; actual use depends on how damp the basement is.', defaultVersion: 'old', defaultOn: false, defaultQty: 1, source: String(A('dehumidifier').source) },
    { id: 'blockHeater', label: 'Engine block heater (500 W)', kind: 'perNight', oldKwh: n(A('blockHeater').oldKwh), newKwh: n(A('blockHeater').newKwh), oldLabel: 'No timer (12 hours)', newLabel: 'On a timer (4 hours)', useLabel: 'Nights a year', useUnit: 'nights', defaultUse: Math.round(cl.nights20), hint: `Pre-filled with the ${int(cl.nights20)} nights a year below −20 °C at the ${stationName(city.eccc.station)} station (ECCC); SaskPower suggests plugging in below −15 °C, so you may use it more.`, defaultVersion: 'old', defaultOn: cl.nights20 >= 5, defaultQty: 1, source: String(A('blockHeater').source) },
    { id: 'hotTub', label: 'Outdoor hot tub', kind: 'typical', typicalKwh: n(A('hotTub').typicalKwh), hint: `Hydro-Québec's figure for Quebec's climate, used year-round. ${cityName(city)}'s annual mean is ${degC(cl.annualMean)}: colder places use more, coastal BC less.`, defaultOn: false, defaultQty: 1, source: String(A('hotTub').source) },
    { id: 'poolPump', label: 'Pool filter pump, in-ground', kind: 'perHour', kwhPerHour: pool.inGroundSingleSpeed, lowKwhPerHour: pool.inGroundLowSpeed, days: n(A('poolPump').seasonDays) ?? 120, oldLabel: 'Single-speed (1,310 W)', newLabel: 'Low speed (310 W)', useLabel: 'Hours a day', useUnit: 'h/day', defaultUse: null, hint: '120-day season (Hydro-Québec default). Enter your daily run time.', defaultVersion: 'old', defaultOn: false, defaultQty: 1, source: String(A('poolPump').source) },
    { id: 'spaceHeater', label: 'Portable electric space heater (1,500 W)', kind: 'perHour', kwhPerHour: n(A('spaceHeater').kWhPerHour), days: 1, useLabel: 'Hours a year', useUnit: 'h/yr', defaultUse: null, hint: 'All resistance heaters are about 100% efficient; only fewer hours save money.', defaultOn: false, defaultQty: 1, source: String(A('spaceHeater').source) },
    { id: 'lighting', label: 'Light bulbs, 3 hours a day each', kind: 'perBulb', oldKwh: n(A('lighting').oldKwh), newKwh: n(A('lighting').newKwh), oldLabel: '60 W incandescent', newLabel: '10 W LED', hint: 'Count only bulbs that are on about 3 hours a day. 10 is an example.', defaultOn: true, defaultQty: 10, source: String(A('lighting').source) },
    { id: 'standby', label: 'Standby power (example set of devices)', kind: 'typical', typicalKwh: n(A('standby').exampleKwh), hint: 'A PVR, game console, computer, printer, TV and Blu-ray player on standby: 40 W around the clock (Hydro-Québec wattages).', defaultOn: true, defaultQty: 1, source: String(A('standby').source) },
    { id: 'hrv', label: 'Heat recovery ventilator', kind: 'annual', oldKwh: null, newKwh: n(A('hrv').newKwh), newLabel: 'ENERGY STAR minimum', hint: 'Derived: 22 L/s around the clock at the ENERGY STAR minimum fan efficacy.', defaultOn: false, defaultQty: 1, source: String(A('hrv').source) },
    { id: 'evCharging', label: 'Electric vehicle charging', kind: 'ev', kwhPer100km: (ev.kWhPer100km as Record<string, number>).median, useLabel: 'Kilometres a year', useUnit: 'km', defaultUse: n(ev.annualKm) ?? 20000, hint: 'Median of the 221 battery-electric listings in NRCan\'s 2026 Fuel Consumption Guide (24.1 kWh/100 km). 20,000 km is NRCan\'s costing basis.', defaultOn: false, defaultQty: 1, source: String(ev.source) },
    { id: 'routerModem', label: 'Other always-on device', kind: 'watts', useLabel: 'Watts (from its label)', useUnit: 'W', defaultUse: null, hint: 'We found no verified figure for routers or modems. Enter the watts it draws; the rating on a power adapter is its maximum, so using it overstates the cost.', defaultOn: false, defaultQty: 1, source: String(A('routerModem').sourcesChecked ?? A('fridge').source) },
  ];
  return items;
}

/** Tiered rates (Hydro-Québec, BC Hydro, Yukon): the first-step price, the conservative choice for savings. */
export function appliancePrice(rp: ReturnType<typeof resolvePrices>): number {
  return rp.elec.firstStep?.perKwh ?? rp.elec.variable;
}

export function appliancePayload(city: CalcCity): AppliancePayload {
  const rp = resolvePrices(city);
  const cl = climateOf(city);
  const items = applianceItems(city).map(({ source, ...rest }) => { void source; return rest; });
  return { city: { slug: city.slug, name: cityName(city), prov: city.prov, nights20: cl.nights20, nights10: cl.nights10, annualMean: cl.annualMean }, price: appliancePrice(rp), items };
}

export function appliancePage(city: CalcCity) {
  const name = cityName(city);
  const rp = resolvePrices(city);
  const cl = climateOf(city);
  const payload = appliancePayload(city);
  const items = applianceItems(city);
  const price = appliancePrice(rp);
  const fs = rp.elec.firstStep;
  const elecUtil = rp.elec.utility.split('(')[0].split(',')[0].trim();
  const priceNote = fs
    ? `${elecUtil}'s first-step price with taxes, which applies to the first ${fs.threshold} your home uses; above that, each kWh costs about ${unitPrice(rp.elec.variable, 'kWh')}. Rates checked ${longDate(rp.asOf)}.`
    : `${elecUtil}: the energy and delivery charges that rise with each kWh, taxes in. Rates checked ${longDate(rp.asOf)}.`;
  const rows = items.filter((i) => i.kind === 'annual' || i.kind === 'perBulb' || i.kind === 'typical').map((i) => ({
    id: i.id, label: i.label, oldLabel: i.oldLabel, newLabel: i.newLabel,
    oldKwh: i.kind === 'typical' ? i.typicalKwh ?? null : i.oldKwh ?? null,
    newKwh: i.kind === 'typical' ? null : i.newKwh ?? null,
  }));
  const fr = items.find((i) => i.id === 'fridge')!;
  const f2 = items.find((i) => i.id === 'fridgeSecond')!;
  const dr = items.find((i) => i.id === 'clothesDryer')!;
  const bh = items.find((i) => i.id === 'blockHeater')!;
  const ht = items.find((i) => i.id === 'hotTub')!;
  const nights = Math.round(cl.nights20);

  const title = fit([`Appliance energy cost calculator: ${name}`, `Appliance running costs: ${name}`], 60);
  const description = fit([
    `What a fridge, freezer, dryer, block heater or hot tub costs to run in ${name} at ${unitPrice(price, 'kWh')} (${elecUtil}, 2026), and what a newer model saves.`,
    `What a fridge, freezer, dryer, block heater or hot tub costs to run in ${name} at ${unitPrice(price, 'kWh')} (2026 rates), and what a newer model saves.`,
    `What common appliances cost to run in ${name} at ${unitPrice(price, 'kWh')} (2026 rates), and what a newer model saves.`,
  ], 160);
  const h1 = `Appliance energy cost calculator for ${name}`;
  const kicker = `${city.provName} · electricity price checked ${longDate(rp.asOf)}`;
  const lede = `In ${name}, one more kWh from <strong>${elecUtil}</strong> costs about <strong>${unitPrice(price, 'kWh')}</strong> with taxes${fs ? ` for the first ${fs.threshold} your home uses, and ${unitPrice(rp.elec.variable, 'kWh')} above that` : ''}. At that rate an older top-freezer fridge (2002–2008) costs about ${money((fr.oldKwh ?? 0) * price)} a year to run and a 2017-or-newer one about ${money((fr.newKwh ?? 0) * price)}; a second fridge from the late 1990s in the garage costs about ${money((f2.oldKwh ?? 0) * price)} a year, all of it saved by unplugging it.`;
  const facts: Fact[] = [
    { k: 'One more kWh', v: unitPrice(price, 'kWh'), s: `${elecUtil}, taxes in` },
    { k: 'Average price', v: unitPrice(rp.elec.avg, 'kWh'), s: 'a 1,000 kWh month, fixed charges in' },
    { k: 'Older 2nd fridge', v: money((f2.oldKwh ?? 0) * price), s: 'a year to run' },
    { k: 'Nights below −20 °C', v: int(cl.nights20), s: `ECCC normals, ${stationName(city.eccc.station)}` },
  ];
  const faqs: Faq[] = [
    { q: `How much does it cost to run a fridge in ${name}?`, a: `At ${unitPrice(price, 'kWh')} for each extra kWh, a 2002–2008 top-freezer fridge (about ${int(fr.oldKwh)} kWh a year, Hydro-Québec data) costs about ${money((fr.oldKwh ?? 0) * price)} a year, and a 2017-or-newer model (about ${int(fr.newKwh)} kWh) about ${money((fr.newKwh ?? 0) * price)}. Bottom-freezer and ice-maker models use more.` },
    { q: `Is an old second fridge worth unplugging?`, a: `A 1994–2001 fridge uses about ${int(f2.oldKwh)} kWh a year, about ${money((f2.oldKwh ?? 0) * price)} at ${name}'s price of ${unitPrice(price, 'kWh')}. Unplugging it saves all of that; replacing it with a new model saves about ${money(((f2.oldKwh ?? 0) - (f2.newKwh ?? 0)) * price)} a year.` },
    { q: `What does electricity cost in ${name}?`, a: `${elecUtil} electricity averages about ${unitPrice(rp.elec.avg, 'kWh')} for a 1,000 kWh month including taxes and fixed charges. ${fs ? `One more kWh costs about ${unitPrice(fs.perKwh, 'kWh')} within the first ${fs.threshold} and ${unitPrice(rp.elec.variable, 'kWh')} above that; this calculator starts from the lower price, the conservative choice for savings.` : `One more kWh costs about ${unitPrice(price, 'kWh')}${rateDate(rp.elec.varDate) ? ` (rates of ${rateDate(rp.elec.varDate)})` : ''}.`} We use the price of one more kWh because turning an appliance off doesn't change fixed charges.` },
    { q: `How much does a block heater cost to run in ${name}?`, a: `A 500 W block heater left on 12 hours uses 6 kWh a night; on a 4-hour timer it uses 2 kWh (SaskPower). ${nights > 0 ? `${name} averages ${nights} night${nights === 1 ? '' : 's'} a year below −20 °C (ECCC normals), which costs about ${money((bh.oldKwh ?? 0) * nights * price)} without a timer and ${money((bh.newKwh ?? 0) * nights * price)} with one.` : `${name} averages fewer than one night a year below −20 °C (ECCC normals); each night plugged in costs about $${((bh.oldKwh ?? 0) * price).toFixed(2)} without a timer and $${((bh.newKwh ?? 0) * price).toFixed(2)} with one.`} SaskPower suggests plugging in below −15 °C, which happens more often.` },
    { q: `How much does a hot tub cost to run in ${name}?`, a: `Hydro-Québec's calculator puts a year-round outdoor hot tub at about ${int(ht.typicalKwh)} kWh a year in Quebec's climate, about ${money((ht.typicalKwh ?? 0) * price)} at ${unitPrice(price, 'kWh')}. Heat loss grows with the gap between water and air temperature, so expect more in a colder place than Quebec and less on the BC coast; a good cover matters most.` },
    { q: `Does a heat pump dryer save money?`, a: `ENERGY STAR data for models sold in Canada put a vented electric dryer at about ${int(items.find((i) => i.id === 'heatPumpDryer')!.oldKwh)} kWh a year and a heat pump dryer at about ${int(items.find((i) => i.id === 'heatPumpDryer')!.newKwh)} kWh (283 loads), a saving of about ${money(((items.find((i) => i.id === 'heatPumpDryer')!.oldKwh ?? 0) - (items.find((i) => i.id === 'heatPumpDryer')!.newKwh ?? 0)) * price)} a year in ${name}. NRCan's rated figures show a 2008 dryer at ${int(dr.oldKwh)} kWh and a 2022 model at ${int(dr.newKwh)} kWh.` },
  ];
  const sources: SourceRef[] = srcs(['eccc-normals']);
  for (const i of items) addSrc(sources, `${i.label}: ${new URL(i.source).hostname.replace('www.', '')}`, i.source);
  addSrc(sources, 'Hydro-Québec appliance calculator', 'https://www.hydroquebec.com/residential/customer-space/electricity-use/tools/home-appliances-calculator.html');
  addSrc(sources, 'NRCan CEUD Table 38: unit energy consumption of appliances', 'https://oee.nrcan.gc.ca/corporate/statistics/neud/dpa/showTable.cfm?type=CP&sector=res&juris=ca&year=2022&rn=38&page=0');
  addSrc(sources, 'SaskPower: factors affecting power use (block heaters)', 'https://www.saskpower.com/power-savings-and-programs/home/power-savings-and-tips/factors-affecting-power-use');
  addSrc(sources, `Electricity price: ${elecUtil}`, rp.elec.source);
  addTariffSources(sources, elecUtil, rp.elec.tariffSources);

  return { title, description, h1, kicker, lede, facts, faqs, sources, payload, priceNote, glance: { rows, price, nights, bh, cl, avg: rp.elec.avg, variable: rp.elec.variable, firstStep: fs, elecUtil } };
}
export type AppliancePage = ReturnType<typeof appliancePage>;
export { qty };
