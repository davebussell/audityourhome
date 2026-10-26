/**
 * US specialty-test screener: a pure flag engine for /us/tests/screener/.
 *
 * No DOM and no data imports, so it bundles small for the browser. The page builds a
 * ScreenerFacts payload at build time from src/data/us/tests.json (via lib/us/tests.ts)
 * and passes it in. Nothing is stored or sent anywhere.
 */

export interface Src {
  label: string;
  href: string;
  /** short display name; defaults to the publisher part of the label */
  short?: string;
}

export type Built = 'pre1978' | '1978-1989' | '1990plus' | 'unsure';
export type Water = 'public' | 'well' | 'unsure';
export type Plan = 'reno' | 'sale' | 'sealing' | 'hvac';
export type Level = 'start' | 'next' | 'good';

export interface ScreenerInput {
  built: Built;
  /** metro slug, or '' */
  metro: string;
  /** EPA radon zone picked by hand when no metro is chosen; 0 = don't know */
  radonZone: 0 | 1 | 2 | 3;
  /** two-letter state code, or '' */
  state: string;
  water: Water;
  /** gas, oil, propane or wood-burning appliances, or a fireplace */
  fuel: boolean;
  garage: boolean;
  /** moisture, leaks or a musty odor */
  moisture: boolean;
  vermiculite: boolean;
  /** young children, someone pregnant or nursing, or older adults live here */
  household: boolean;
  plans: Plan[];
}

export interface StateRule {
  /** true: a credential is required (radon, mold) or a statewide CO law exists; null: not confirmed */
  on: boolean | null;
  text: string;
  src: Src;
}

export interface StateFacts {
  name: string;
  /** one of the 20 jurisdictions checked in full */
  checked: boolean;
  slug: string;
  radon?: StateRule;
  mold?: StateRule;
  co?: StateRule;
  lead: { rrp: 'state' | 'EPA'; abatement: 'state' | 'EPA' };
  /** on AARST's list of ten homebuyer radon notification states */
  radonNotice: boolean;
}

export interface MetroFacts {
  slug: string;
  name: string;
  st: string;
  county: string | null;
  radonZone: number | null;
  climateZone: string | null;
  /** ENERGY STAR attic targets for the zone: uninsulated, and with 3-4 in. already */
  attic: { bare: string; topped: string } | null;
}

export type SrcKey =
  | 'radonAction' | 'radonCitizen' | 'radonZones' | 'radonSales' | 'aarst'
  | 'cpsc' | 'leadSources' | 'rrp' | 'disclosure' | 'leadStates'
  | 'asbestos' | 'vermiculite' | 'mold' | 'wellTest' | 'wellContaminants' | 'labs'
  | 'caz' | 'acca' | 'accaCode' | 'doeAssess' | 'energyStar';

export interface ScreenerFacts {
  verified: string;
  metros: MetroFacts[];
  states: Record<string, StateFacts>;
  src: Record<SrcKey, Src>;
  /** "R30 to R60" style range across zones, for when no zone is known */
  atticRange: string;
}

export interface Flag {
  slug: string;
  name: string;
  level: Level;
  reasons: string[];
  sources: Src[];
}

export interface ScreenerResult {
  flags: Flag[];
  metro: MetroFacts | null;
  zone: number | null;
  zoneFrom: 'metro' | 'picked' | null;
  state: (StateFacts & { code: string }) | null;
}

export const LEVELS: Record<Level, { label: string; note: string }> = {
  start: { label: 'Start here', note: 'Your answers put these squarely on your list.' },
  next: { label: 'Also on your list', note: 'Worth planning for, given your home and plans.' },
  good: { label: 'Good practice', note: 'Sensible for any home like yours.' },
};

export const ZONE_TEXT: Record<number, string> = {
  1: 'highest potential: predicted average indoor level may be above 4 pCi/L',
  2: 'moderate potential: predicted average 2 to 4 pCi/L',
  3: 'low potential: predicted average below 2 pCi/L',
};

const ORDER = ['radon', 'carbon-monoxide', 'lead-paint', 'asbestos-vermiculite', 'mold-iaq', 'well-water', 'combustion-safety', 'blower-door', 'attic-inspection', 'heat-loss-calc'];

function uniq(list: Src[]): Src[] {
  const seen = new Set<string>();
  return list.filter((s) => (s && !seen.has(s.href) ? (seen.add(s.href), true) : false));
}

export function screenUsTests(input: ScreenerInput, facts: ScreenerFacts): ScreenerResult {
  const F = facts.src;
  const metro = input.metro ? facts.metros.find((m) => m.slug === input.metro) ?? null : null;
  const zone = metro?.radonZone ?? (input.radonZone || null);
  const zoneFrom = metro?.radonZone ? 'metro' : input.radonZone ? 'picked' : null;
  const stFacts = input.state ? facts.states[input.state] : undefined;
  const state = stFacts ? { ...stFacts, code: input.state } : null;
  const plans = new Set(input.plans);
  const reno = plans.has('reno');
  const sale = plans.has('sale');
  const sealing = plans.has('sealing');
  const hvac = plans.has('hvac');
  const flags: Flag[] = [];

  // ---------------------------------------------------------------- radon: every home
  {
    const reasons = [
      'EPA says every home should be tested, whatever its radon zone. Start with a short-term test (2 to 90 days); EPA recommends fixing the home at 4 pCi/L or more.',
    ];
    const sources: Src[] = [F.radonAction, F.radonCitizen];
    if (zone) {
      const where = zoneFrom === 'metro' && metro?.county ? `${metro.county} (${metro.name}’s principal county) is` : 'Your county is';
      reasons.push(`${where} in EPA radon Zone ${zone}, ${ZONE_TEXT[zone]}. EPA says the zone map is for planning and must not be used to decide whether to test.`);
      sources.push(F.radonZones);
    }
    if (sale) {
      reasons.push('Buying or selling: EPA’s Home Buyer’s and Seller’s Guide accepts three short-term options of at least 48 hours. Sellers should test before listing, and buyers may ask for a new test if the last one is more than about two years old.');
      sources.push(F.radonSales);
      if (state?.radonNotice) {
        reasons.push(`${state.name} is one of ten states with a homebuyer radon notification law (AARST, June 2024).`);
        sources.push(F.aarst);
      }
    }
    if (state?.radon) {
      reasons.push(`${state.name}${state.radon.on ? ' requires a credential to test or mitigate' : ''}: ${state.radon.text}`);
      sources.push(state.radon.src);
    }
    flags.push({ slug: 'radon', name: 'Radon test', level: 'start', reasons, sources: uniq(sources) });
  }

  // ---------------------------------------------------------------- carbon monoxide
  {
    const sourcesCo: Src[] = [F.cpsc];
    const reasons = [
      'CPSC recommends CO alarms on every level of the home and outside sleeping areas, ideally interconnected, replaced at the age given in the product literature.',
    ];
    const what = [input.fuel && 'fuel-burning appliances or a fireplace', input.garage && 'an attached garage'].filter(Boolean).join(' and ');
    if (what) reasons.push(`You have ${what}, the CO sources most of the state alarm laws we checked are written around.`);
    if (state?.co) {
      reasons.push(`${state.name} CO alarm law: ${state.co.text}`);
      sourcesCo.push(state.co.src);
    }
    flags.push({
      slug: 'carbon-monoxide',
      name: 'Carbon monoxide alarms',
      level: what ? 'start' : 'good',
      reasons,
      sources: uniq(sourcesCo),
    });
  }

  // ---------------------------------------------------------------- lead paint
  if (input.built === 'pre1978' || input.built === 'unsure') {
    const pre = input.built === 'pre1978';
    const reasons = [
      pre
        ? 'EPA says homes built before 1978 are more likely to have lead-based paint, and dust from it is the most common source of lead exposure.'
        : 'You’re not sure when the home was built. EPA says homes built before 1978 are more likely to have lead-based paint, so find out before any work that disturbs paint.',
    ];
    const sources: Src[] = [F.leadSources];
    if (reno) {
      reasons.push(`${pre ? 'Renovating' : 'If it’s pre-1978 and you’re renovating'}: most paid work that disturbs paint must be done by a lead-safe certified firm under EPA’s RRP rule, and window replacement is always covered.`);
      sources.push(F.rrp);
    }
    if (sale) {
      reasons.push('Buying or selling a pre-1978 home: sellers must disclose known lead-based paint and hazards, and buyers get 10 days to arrange an inspection or risk assessment.');
      sources.push(F.disclosure);
    }
    if (input.household) {
      reasons.push('Lead is especially dangerous to children 6 and younger; EPA notes CDC recommends blood lead testing at 12 and 24 months.');
    }
    if (state) {
      reasons.push(`In ${state.name}, lead-safe renovation firms are certified by ${state.lead.rrp === 'state' ? 'the state' : 'EPA'}, and inspectors and risk assessors by ${state.lead.abatement === 'state' ? 'the state' : 'EPA'}.`);
      sources.push(F.leadStates);
    }
    flags.push({
      slug: 'lead-paint',
      name: 'Lead paint testing',
      level: pre && (reno || sale || input.household) ? 'start' : 'next',
      reasons,
      sources: uniq(sources),
    });
  }

  // ---------------------------------------------------------------- asbestos & vermiculite
  {
    const oldHome = input.built === 'pre1978' || input.built === '1978-1989';
    const reasons: string[] = [];
    const sources: Src[] = [F.vermiculite];
    let level: Level | null = null;
    if (input.vermiculite) {
      level = 'start';
      reasons.push('You noted vermiculite insulation. EPA says to assume it may contain asbestos, leave it undisturbed, limit trips into the attic and not try to remove it yourself.');
    } else if (oldHome) {
      level = reno || sealing ? 'start' : 'next';
      reasons.push('Your home was built before 1990. A Libby, Montana mine supplied more than 70% of U.S. vermiculite sold from 1919 to 1990, and it was contaminated with asbestos. Check, without disturbing anything, whether the attic or walls have vermiculite.');
    } else if (input.built === 'unsure') {
      level = 'next';
      reasons.push('Not sure of the year? If the attic or walls have vermiculite insulation, EPA says to assume it may contain asbestos and leave it undisturbed.');
    }
    if (level) {
      if (reno || sealing) {
        reasons.push('Before remodeling, insulation or air sealing: EPA says damaged material, or material the work will disturb, should be assessed by an accredited asbestos professional. Don’t take samples yourself.');
        sources.push(F.asbestos);
      }
      flags.push({ slug: 'asbestos-vermiculite', name: 'Asbestos & vermiculite', level, reasons, sources: uniq(sources) });
    }
  }

  // ---------------------------------------------------------------- mold
  if (input.moisture) {
    const reasons = [
      'You noted moisture, leaks or a musty odor. EPA says fix the water problem first, dry everything and clean hard surfaces with detergent and water; areas under about 10 sq ft are usually a DIY job.',
      'There are no federal limits for mold, and EPA says sampling is usually unnecessary when mold is visible.',
    ];
    const sources: Src[] = [F.mold];
    if (state?.mold) {
      reasons.push(`${state.name}${state.mold.on ? ' requires a credential for mold work' : ''}: ${state.mold.text}`);
      sources.push(state.mold.src);
    }
    flags.push({ slug: 'mold-iaq', name: 'Mold & indoor air', level: 'start', reasons, sources: uniq(sources) });
  }

  // ---------------------------------------------------------------- well water
  if (input.water === 'well') {
    const reasons = [
      'Private wells aren’t covered by the Safe Drinking Water Act. EPA says test every year for total coliform bacteria, nitrates, total dissolved solids and pH, using a lab certified for drinking water.',
    ];
    const sources: Src[] = [F.wellTest, F.labs];
    if (input.household) reasons.push('With young children, older adults, or someone pregnant or nursing at home, EPA says to test more often.');
    if (zone === 1) {
      reasons.push('EPA lists a radon-rich area as a reason to test well water for radon, and your area is in EPA’s highest-potential radon zone.');
      sources.push(F.wellContaminants);
    }
    flags.push({ slug: 'well-water', name: 'Well water testing', level: 'start', reasons, sources: uniq(sources) });
  } else if (input.water === 'unsure') {
    flags.push({
      slug: 'well-water',
      name: 'Well water testing',
      level: 'good',
      reasons: ['Not sure where your water comes from? If it’s a private well, EPA says to test it every year for coliform bacteria, nitrates, total dissolved solids and pH.'],
      sources: [F.wellTest],
    });
  }

  // ---------------------------------------------------------------- energy work that changes the picture
  if (input.fuel && sealing) {
    flags.push({
      slug: 'combustion-safety',
      name: 'Combustion safety test',
      level: 'start',
      reasons: ['You have fuel-burning appliances and plan air sealing or insulation. DOE calls for combustion appliance zone testing in homes with natural-draft furnaces, boilers or water heaters, especially during air sealing, at the end of each workday.'],
      sources: [F.caz],
    });
  }
  if (sealing) {
    flags.push({
      slug: 'blower-door',
      name: 'Blower door test',
      level: 'next',
      reasons: ['Planning air sealing or insulation: DOE says many professional assessments include a blower door test and an infrared scan. A test before and after the work shows what changed.'],
      sources: [F.doeAssess],
    });
    const z = metro?.climateZone;
    flags.push({
      slug: 'attic-inspection',
      name: 'Attic insulation check',
      level: 'next',
      reasons: [
        z && metro?.attic
          ? `${metro.county ?? metro.name} is in IECC climate zone ${z}. ENERGY STAR recommends ${metro.attic.bare} for an uninsulated attic there, or ${metro.attic.topped} if there’s already 3 to 4 inches.`
          : `ENERGY STAR recommends ${facts.atticRange} for an uninsulated attic, depending on your climate zone.`,
      ],
      sources: [F.energyStar],
    });
  }
  if (hvac) {
    flags.push({
      slug: 'heat-loss-calc',
      name: 'Manual J load calculation',
      level: 'next',
      reasons: ['Replacing heating or cooling: where the IECC or IRC is adopted, equipment must be sized per ACCA Manual S from Manual J loads, or another approved method. Ask for the load calculation with each quote.'],
      sources: [F.accaCode, F.acca],
    });
  }

  const rank: Record<Level, number> = { start: 0, next: 1, good: 2 };
  flags.sort((a, b) => rank[a.level] - rank[b.level] || ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
  return { flags, metro, zone, zoneFrom, state };
}

// ---------------------------------------------------------------- rendering (shared by build and browser)
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (t: string) => String(t).replace(/[&<>"']/g, (c) => ESC[c]);
const shortName = (s: Src) => s.short ?? s.label.split(' - ')[0].replace(/\s*\([^)]*\)\s*/g, ' ').trim();
const CHIP: Record<Level, string> = { start: 'chip-info', next: 'chip-limited', good: 'chip-neutral' };
const BUILT_TEXT: Record<Built, string> = {
  pre1978: 'built before 1978',
  '1978-1989': 'built 1978 to 1989',
  '1990plus': 'built 1990 or later',
  unsure: 'year built not sure',
};

function cite(list: Src[], verified: string): string {
  const links = list.map((s) => `<a href="${esc(s.href)}" rel="noopener" title="${esc(s.label)}">${esc(shortName(s))}&nbsp;↗</a>`).join(', ');
  return `<p class="cite">${list.length > 1 ? 'Sources' : 'Source'}: ${links} · verified ${esc(verified)}</p>`;
}

/** Result panel markup. Every string is escaped; links point only at /us/ pages and cited sources. */
export function renderResultHtml(input: ScreenerInput, r: ScreenerResult, facts: ScreenerFacts): string {
  const where: string[] = [BUILT_TEXT[input.built]];
  if (r.metro) {
    const bits = [r.metro.county, r.metro.radonZone ? `EPA radon Zone ${r.metro.radonZone}` : '', r.metro.climateZone ? `IECC zone ${r.metro.climateZone}` : '']
      .filter(Boolean)
      .join(', ');
    where.push(`<a href="/us/cities/${esc(r.metro.slug)}/">${esc(r.metro.name)}</a>${bits ? ` (${esc(bits)})` : ''}`);
  } else if (r.zone) {
    where.push(`EPA radon Zone ${r.zone}`);
  }
  if (r.state) where.push(esc(r.state.name));

  const head = `
    <div class="rhead">
      <h2 class="rtitle">${r.flags.length} test${r.flags.length === 1 ? '' : 's'} to consider</h2>
      <p class="rfor">For: ${where.join(' · ')}</p>
    </div>`;

  const stateNote = r.state
    ? `<p class="rstate">${esc(r.state.name)}: ${
        r.state.checked
          ? 'one of the 20 jurisdictions we checked in full; its rules are in the cards below.'
          : 'not one of the 20 jurisdictions we checked in full, so state rules below are only what turned up in national reviews.'
      } <a href="/us/programs/states/${esc(r.state.slug)}/">Home energy rebates in ${esc(r.state.name)} →</a></p>`
    : '<p class="rstate">Pick your state to see its radon, mold, carbon monoxide and lead rules.</p>';

  const groups = (['start', 'next', 'good'] as Level[])
    .map((lvl) => {
      const list = r.flags.filter((f) => f.level === lvl);
      if (!list.length) return '';
      return `
        <h3 class="lvl">${esc(LEVELS[lvl].label)} <span>${esc(LEVELS[lvl].note)}</span></h3>
        ${list
          .map(
            (f) => `
          <article class="card sflag lvl-${lvl}">
            <h4><a href="/us/tests/${esc(f.slug)}/">${esc(f.name)}</a> <span class="chip ${CHIP[lvl]}">${esc(LEVELS[lvl].label)}</span></h4>
            <ul class="why">${f.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
            ${cite(f.sources, facts.verified)}
            <p class="go"><a href="/us/tests/${esc(f.slug)}/">Full guide: ${esc(f.name)} →</a></p>
          </article>`,
          )
          .join('')}`;
    })
    .join('');

  return `${head}${stateNote}${groups}
    <p class="rfoot">Take this list to your auditor or tester. <a href="/us/find/">Find a certified auditor →</a></p>`;
}
