/**
 * US program tracker (/us/programs/): state-by-state Home Energy Rebate status, the federal
 * program records and the metro links those pages share.
 *
 * Facts come only from the research files read through ./data (federal.json and metros/*.json,
 * verified October 12, 2026). Nothing here adds an amount, date or program; helpers only select,
 * group and format what the research recorded.
 */
import {
  FEDERAL,
  METROS,
  metroBySlug,
  metrosInState,
  statusChip,
  US_VERIFIED,
  type Metro,
  type NormStatus,
} from './data';

export interface Source {
  label: string;
  href: string;
}
export type Chip = { cls: string; label: string; status: NormStatus };

// ---------------------------------------------------------------- text helpers
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10-12" → "October 12, 2026" (other strings pass through) */
export function fmtISO(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : iso;
}

/** Research text writes some dates as 2026-02-24; show them the way the rest of the page does. */
export const fmtDates = (s: string) =>
  s.replace(/\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, (_, y, mo, d) => `${MONTHS[+mo - 1]} ${+d}, ${y}`);

/**
 * Research notes are written in a researcher's voice ("I could not find") with data-file shorthand
 * ("BPA", "status left null", fetch errors). This turns them into page copy without changing what
 * they say.
 */
export const voice = (s: string) =>
  s
    // the notes abbreviate the trade group the pages name in full
    .replace(/\bBPA's\b|\bBPA(?= (June|March) 2026)/g, "the Building Performance Association's")
    .replace(/(^|[.!?]\s+|['‘“(]\s*)the Building Performance Association's/g, (_, lead) => `${lead}The Building Performance Association's`)
    .replace(/\bnot verified here\b/g, 'not confirmed')
    // fetch-tool details from the research log mean nothing to a reader; the plain sentence stays
    .replace(/\s*\((?:Cloudflare challenge \/ )?(?:403|fetch)[^)]*\)/g, '')
    .replace(/; content read via WebFetch\b/g, '')
    // "null" is a data-file word; on the page the status reads as unconfirmed
    .replace(/\bStatus left null\b/g, 'We left the status unconfirmed')
    .replace(/\b(HOMES|HEAR|HEEHR) status is null\b/g, 'we list the $1 status as unconfirmed')
    .replace(/\bthat I could find\b/g, 'that we could find')
    .replace(/(^|[.!?]\s+)I (didn't|did not|couldn't|could not)\b/g, (_, lead, verb) => `${lead}We ${verb}`)
    .replace(/\bI (didn't|did not|couldn't|could not)\b/g, 'we $1');

/** Display form of a research string: dates spelled out, researcher voice made editorial. */
export const clean = (s: string | null | undefined) => (s ? voice(fmtDates(s)) : '');

export const VERIFIED = US_VERIFIED;

// ---------------------------------------------------------------- sources
const ROWS = FEDERAL.homeEnergyRebates.states as any[];
const ALL_SOURCES: Source[] = [
  ...(FEDERAL.sources as Source[]),
  ...ROWS.flatMap((r) => r.sources as Source[]),
  ...METROS.flatMap((m) => (m.data.sources ?? []) as Source[]),
];

/** A source recorded in the research, found by href or label. Fails the build if it isn't there. */
export function src(test: RegExp): Source {
  const s = ALL_SOURCES.find((x) => test.test(x.href) || test.test(x.label));
  if (!s) throw new Error(`programs.ts: no research source matches ${test}`);
  return s;
}

/** Same list without repeats (by href), order kept. */
export function dedupe(list: Source[]): Source[] {
  const seen = new Set<string>();
  return list.filter((s) => (s && !seen.has(s.href) ? (seen.add(s.href), true) : false));
}

// ---------------------------------------------------------------- federal records
export const TAX: Record<'25C' | '25D' | '45L', any> = Object.fromEntries((FEDERAL.taxCredits as any[]).map((t) => [t.id, t])) as any;
export const REBATES = FEDERAL.homeEnergyRebates.overview as { summary: string; keyDates: { date: string; event: string }[]; notes: string; sources: Source[] };
export const WAP = FEDERAL.weatherization as { summary: string; findUrl: string; sources: Source[] };
export const LIHEAP = FEDERAL.liheap as { summary: string; sources: Source[] };
export const ESTAR = FEDERAL.energyStar as { summary: string; sources: Source[] };
export const HES = FEDERAL.homeEnergyScore as { summary: string; sources: Source[] };
export const OTHER = FEDERAL.otherFederal as { name: string; summary: string; url: string }[];
export const otherFederal = (re: RegExp) => {
  const o = OTHER.find((x) => re.test(x.name));
  if (!o) throw new Error(`programs.ts: no otherFederal record matches ${re}`);
  return o;
};

/** The trade-group map used as the 50-state baseline (DOE publishes no current list). */
export const BPA_SOURCE = src(/06\.2026-State-Home-Energy-Rebates-Factsheet/);

// ---------------------------------------------------------------- states
export type ProgKey = 'hear' | 'homes';
export const PROG_LABEL: Record<ProgKey, { short: string; full: string; what: string }> = {
  hear: { short: 'HEEHR', full: 'High-Efficiency Electric Home Rebates (formerly HEAR)', what: 'electric appliances' },
  homes: { short: 'HOMES', full: 'Home Owner Managing Energy Savings', what: 'whole-home upgrades' },
};

export interface ProgView {
  key: ProgKey;
  short: string;
  /** the source's own status wording, or null when no state page stated one */
  status: string | null;
  chip: Chip;
  programName: string | null;
  administrator: string | null;
  launched: string | null;
  amounts: string | null;
  url: string | null;
  checked: string;
  /** set when the status comes from one of our metro research records instead of the state table */
  via?: { metro: Metro; note: string; sources: Source[] };
}

export type GroupKey = 'open' | 'limited' | 'closed' | 'not-open';

export interface StateView {
  code: string;
  name: string;
  slug: string;
  hear: ProgView;
  homes: ProgView;
  notes: string;
  sources: Source[];
  /** Building Performance Association map status, June 2026 */
  baseline: string;
  group: GroupKey;
  /** at least one program is taking applications */
  taking: boolean;
  /** our status rests on the trade-group map alone (no state page could be checked) */
  mapOnly: boolean;
  /** the state's page and the trade-group map disagree */
  differs: boolean;
  metros: Metro[];
}

export const stateSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Where a metro record checked a state's program more specifically than the state table did,
 * its finding is used and the page says so.
 *  - AZ: the state table could not reach Arizona's energy office; our Phoenix research reached
 *    Efficiency Arizona, the state's HEEHR program site, the same day.
 *  - CA: the state table quotes the CEC page (multifamily "open while funds last"); our California
 *    metro records quote TECH Clean California, which runs Phase I, saying multifamily has also
 *    been fully reserved since September 1, 2026 (the Los Angeles record notes the conflict).
 */
const FROM_METRO: Record<string, Partial<Record<ProgKey, { metro: string; all: boolean; sources: RegExp; note: string; status?: (metroStatus: string) => string | null }>>> = {
  AZ: {
    hear: {
      metro: 'phoenix',
      all: true,
      sources: /efficiencyarizona\.com\/(|eligibility\/|significant-changes[^/]*\/)$/,
      note: "This status comes from Efficiency Arizona, the state's HEEHR program site, checked October 12, 2026.",
    },
    homes: {
      metro: 'phoenix',
      all: false,
      sources: /efficiencyarizona\.com\/$/,
      note: 'From Efficiency Arizona, the state’s program site, checked October 12, 2026.',
      status: (s) => /No HOMES[^.]*\./.exec(s)?.[0] ?? null,
    },
  },
  CA: {
    hear: {
      metro: 'los-angeles',
      all: false,
      sources: /techcleanca\.com\/incentives\/(heehrarebates\/)?$/,
      note: "The California Energy Commission's Q&A still says multifamily HEEHRA rebates are available, but TECH Clean California, which runs Phase I for the state, says they were fully reserved as of September 1, 2026. This status follows TECH (checked October 12, 2026).",
    },
  },
};

/**
 * statusChip() reads the first clause of the wording. Where that clause hides the operative
 * limit, the chip is computed from a plain status instead (the full wording still shows).
 *  - MI: open, but new income-qualified applications are paused in several districts, all of metro Detroit among them.
 *  - WV: a pilot with select households; the public can only join the waitlist.
 */
const CHIP_TEXT: Record<string, Partial<Record<ProgKey, string>>> = {
  MI: { hear: 'open with restrictions', homes: 'open with restrictions' },
  WV: { hear: 'waitlist', homes: 'waitlist' },
};

function progView(row: any, key: ProgKey): ProgView {
  const r = row[key] ?? {};
  const view: ProgView = {
    key,
    short: PROG_LABEL[key].short,
    status: r.status ?? null,
    chip: statusChip(null),
    programName: r.programName ?? null,
    administrator: r.administrator ?? null,
    launched: r.launched ?? null,
    amounts: r.amountsSummary ?? null,
    url: r.url ?? null,
    checked: r.checked ?? '2026-10-12',
  };
  const ov = FROM_METRO[row.state]?.[key];
  if (ov) {
    const m = metroBySlug(ov.metro);
    const s = m?.data.stateHomeEnergyRebates;
    if (!m || !s) throw new Error(`programs.ts: metro ${ov.metro} has no stateHomeEnergyRebates`);
    view.status = ov.status ? ov.status(s.status) : s.status;
    if (ov.all) {
      view.programName = s.programName ?? view.programName;
      view.administrator = s.administrator ?? view.administrator;
      view.amounts = s.summary ?? view.amounts;
      view.url = s.url ?? view.url;
    }
    view.checked = s.checked ?? view.checked;
    view.via = { metro: m, note: ov.note, sources: ((m.data.sources ?? []) as Source[]).filter((x) => ov.sources.test(x.href)) };
  }
  view.chip = statusChip(CHIP_TEXT[row.state]?.[key] ?? view.status);
  return view;
}

/** taking applications: open, or open with limits (not paused or waitlist-only) */
export const takesApplications = (c: Chip) => c.status === 'open' || (c.status === 'limited' && (c.label === 'Open · limits apply' || c.label === 'Partly open'));
/** the state says it launched at some point (open, limited other than a pre-launch pause, or launched and closed) */
const launchedPerState = (c: Chip) => c.status === 'open' || c.status === 'closed' || (c.status === 'limited' && c.label !== 'Paused');

function groupOf(a: Chip, b: Chip): GroupKey {
  const s = [a.status, b.status];
  if (s.includes('open')) return 'open';
  if (s.includes('limited')) return 'limited';
  if (s.includes('closed')) return 'closed';
  return 'not-open';
}

export const STATES: StateView[] = ROWS.map((row) => {
  const hear = progView(row, 'hear');
  const homes = progView(row, 'homes');
  const baseline: string = row.baseline?.status ?? '';
  const mapLaunched = /Rebates Available/i.test(baseline);
  const stateLaunched = launchedPerState(hear.chip) || launchedPerState(homes.chip);
  const mapOnly = hear.chip.status === 'unknown' && homes.chip.status === 'unknown' && !hear.via && !homes.via;
  const viaSources = [...(hear.via?.sources ?? []), ...(homes.via?.sources ?? [])];
  return {
    code: row.state,
    name: row.stateName,
    slug: stateSlug(row.stateName),
    hear,
    homes,
    notes: clean(row.notes),
    sources: dedupe([...(row.sources as Source[]), ...viaSources]),
    baseline,
    group: groupOf(hear.chip, homes.chip),
    taking: takesApplications(hear.chip) || takesApplications(homes.chip),
    mapOnly,
    differs: !mapOnly && /launched|participating/i.test(baseline) && mapLaunched !== stateLaunched,
    metros: metrosInState(row.state),
  } satisfies StateView;
}).sort((a, b) => a.name.localeCompare(b.name));

export const stateByCode = (code: string) => STATES.find((s) => s.code === code);
export const stateBySlug = (slug: string) => STATES.find((s) => s.slug === slug);

export const GROUP_ORDER: GroupKey[] = ['open', 'limited', 'closed', 'not-open'];
export const GROUPS: Record<GroupKey, { label: string; cls: string; desc: string; anchor: string }> = {
  open: { label: 'Open', cls: 'chip-active', anchor: 'open', desc: 'At least one of the two programs is taking applications.' },
  limited: {
    label: 'Open with limits, paused or waitlist',
    cls: 'chip-limited',
    anchor: 'limited',
    desc: 'Some households can apply, or the state has paused its program or opened only a waitlist.',
  },
  closed: { label: 'Closed', cls: 'chip-closed', anchor: 'closed', desc: 'Launched, then closed to new applicants once the money was reserved.' },
  'not-open': {
    label: 'Not launched or no status posted',
    cls: 'chip-info',
    anchor: 'not-launched',
    desc: 'No rebates yet, or no status posted by the state.',
  },
};
export const statesIn = (g: GroupKey) => STATES.filter((s) => s.group === g);

const TAKING = STATES.filter((s) => s.taking);
export const COUNTS = {
  taking: TAKING,
  /** states only (DC counted separately) */
  takingStates: TAKING.filter((s) => s.code !== 'DC').length,
  takingDC: TAKING.some((s) => s.code === 'DC'),
  group: Object.fromEntries(GROUP_ORDER.map((g) => [g, statesIn(g).length])) as Record<GroupKey, number>,
};
/** "10 states plus DC" */
export const takingPhrase = () => `${COUNTS.takingStates} ${COUNTS.takingStates === 1 ? 'state' : 'states'}${COUNTS.takingDC ? ' plus DC' : ''}`;

/** "the District of Columbia" mid-sentence, the plain name for states */
export const nameIn = (s: { code: string; name: string }) => (s.code === 'DC' ? `the ${s.name}` : s.name);
/** sentence-initial form */
export const NameStart = (s: { code: string; name: string }) => (s.code === 'DC' ? `The ${s.name}` : s.name);

/** One-sentence plain summary of a state's two programs. */
export function stateLede(s: StateView): string {
  const verb = (p: ProgView) => {
    const c = p.chip;
    if (c.status === 'open') return 'are open';
    if (c.status === 'limited') return c.label === 'Paused' ? 'are paused' : c.label === 'Waitlist' ? 'have only a waitlist' : 'are open with limits';
    if (c.status === 'closed') return 'are closed to new applicants';
    if (c.status === 'not-open') return "haven't launched";
    return 'have no status posted by the state';
  };
  const a = verb(s.hear);
  const b = verb(s.homes);
  if (s.mapOnly) return `${NameStart(s)} hasn’t posted a status for the federal Home Energy Rebates on a state page we can link to, so ask the state energy office before you count on them.`;
  if (a === b && s.hear.chip.status === 'not-open') return `${NameStart(s)} hasn't launched either federal Home Energy Rebate program: HEEHR for electric appliances or HOMES for whole-home upgrades.`;
  if (a === b) return `In ${nameIn(s)}, HEEHR rebates for electric appliances and HOMES rebates for whole-home upgrades ${a}.`;
  return `In ${nameIn(s)}, HEEHR rebates for electric appliances ${a}, and HOMES rebates for whole-home upgrades ${b}.`;
}

/** What the trade-group map says, and whether it disagrees with the state's page. */
export function baselineNote(s: StateView): string {
  const map = `The Building Performance Association's June 2026 map, a trade-group source and the only national list since DOE stopped publishing one, lists ${nameIn(s)} as “${s.baseline}”.`;
  if (s.mapOnly) return `${map} It is the only status we have for ${nameIn(s)}, so ask the state energy office before you count on it.`;
  if (s.differs) return `${map} The state's own page, checked ${fmtISO(s.hear.checked)}, says otherwise, and this page reports the state's version.`;
  return map;
}

// ---------------------------------------------------------------- metros
/** How a metro record marks programs on one side of a state line. */
const STATE_RX: Record<string, RegExp> = {
  NY: /New York|\bNYS?\b|NYSERDA|Long Island|Westchester/,
  NJ: /New Jersey|\bNJ\b/,
  IL: /Illinois/,
  IN: /Indiana|NIPSCO/,
  PA: /Pennsylvania|\bPA\b|PECO|PGW/,
  DE: /Delaware/,
  MD: /Maryland|\bMD\b|EmPOWER/,
  DC: /District of Columbia|\bDC\b|DCSEU|DOEE/,
  VA: /(?<!West )Virginia|\bVA\b/,
  WV: /West Virginia|\bWV\b/,
  MA: /Massachusetts|Mass Save|\bMA\b/,
  NH: /New Hampshire|\bNH\b/,
  MO: /Missouri|\bMO\b|Spire/,
  NC: /North Carolina|\bNC\b/,
  SC: /South Carolina|\bSC\b/,
  MN: /Minnesota|\bMN\b|Minneapolis/,
  WI: /Wisconsin|\bWI\b/,
  OR: /Oregon|Portland|Energy Trust/,
  WA: /Washington State|Washington side|Washington Commerce|Southwest Washington|Clark|Vancouver|\bWA\b/,
};

/** Whether a metro record's program or utility (by its name and description) serves the side of the metro in `st`. */
export function appliesTo(text: string, st: string, m: Metro): boolean {
  const states: string[] = m.data.states ?? [];
  if (states.length < 2) return true;
  const mentions = (code: string) => STATE_RX[code]?.test(text) ?? false;
  if (states[0] === st) return mentions(st) || !states.filter((c) => c !== st).some(mentions);
  return mentions(st);
}

/** A metro audit or rebate program is open now: open, or open with limits (including a short window or an end date); not paused, waitlist-only or mostly closed. */
export function programOpen(status: string | null | undefined): boolean {
  const c = statusChip(status);
  return c.status === 'open' || (c.status === 'limited' && !['Paused', 'Waitlist', 'Partly open'].includes(c.label));
}

export interface MetroPrograms {
  metro: Metro;
  primary: boolean;
  electric: string[];
  gas: string[];
  /** audit and rebate programs open now (statusChip open or limited), audits first; `by` is set when two share a name */
  open: { name: string; url: string; kind: 'audit' | 'rebate'; by?: string }[];
  /** programs in the record for this side of the metro that are closed, reserved or unconfirmed */
  notOpen: number;
  /** the metro record's own Home Energy Rebate status, when it differs from the state's chips (e.g. MiHER paused across metro Detroit) */
  localRebates?: { status: string; chip: Chip };
}

/** A metro's utilities and open audit/rebate programs, limited to the side of the metro in `st`. */
export function metroProgramsFor(m: Metro, st: string): MetroPrograms {
  const u = m.data.utilities ?? {};
  const util = (list: any[] = []) => list.filter((x) => appliesTo(`${x.name} ${x.serves ?? ''}`, st, m)).map((x) => x.name as string);
  const items = [
    ...((m.data.auditPrograms ?? []) as any[]).map((x) => ({ ...x, kind: 'audit' as const })),
    ...((m.data.rebates ?? []) as any[]).map((x) => ({ ...x, kind: 'rebate' as const })),
  ].filter((x) => appliesTo(`${x.name} ${x.runBy ?? ''}`, st, m));
  const isOpen = (x: any) => programOpen(x.status);
  const open = items.filter(isOpen);
  const dupName = (n: string) => open.filter((x) => x.name === n).length > 1;
  const primary = (m.data.states ?? [])[0] === st;

  // The metro's own rebate status, shown only on its primary state's page and only when it says something the
  // state's chips don't.
  let localRebates: MetroPrograms['localRebates'];
  const sr = m.data.stateHomeEnergyRebates;
  const state = stateByCode(st);
  if (primary && sr?.status && state) {
    const chip = statusChip(sr.status);
    if (chip.status !== 'unknown' && chip.label !== state.hear.chip.label && chip.label !== state.homes.chip.label) {
      localRebates = { status: sr.status, chip };
    }
  }
  return {
    metro: m,
    primary,
    electric: util(u.electric),
    gas: util(u.gas),
    open: open.map((x) => ({ name: x.name, url: x.url, kind: x.kind, by: dupName(x.name) ? x.runBy : undefined })),
    notOpen: items.filter((x) => !isOpen(x)).length,
    localRebates,
  };
}

/** Weatherization entries in a metro record: the federal WAP agencies, and other weatherization help. */
export function weatherizationFor(m: Metro) {
  const iq = (m.data.incomeQualified ?? []) as { name: string; runBy: string; summary: string; url: string }[];
  const isWap = (x: { name: string }) => /Weatherization Assistance Program|\bWAP\b|IHWAP/.test(x.name) && !/Duke Energy|Building Blocks/.test(x.name);
  return {
    wap: iq.filter(isWap),
    other: iq.filter((x) => !isWap(x) && /weatheriz/i.test(x.name)),
  };
}

export const metroName = (m: Metro) => m.data.name as string;
export const metroStates = (m: Metro) => ((m.data.states ?? []) as string[]).join(', ');
export { METROS };
