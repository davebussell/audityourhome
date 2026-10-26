/**
 * Data helpers for the US common-problem guides (/us/issues/). Not a route: Astro skips files that
 * start with an underscore. Content lives in src/data/us/issues.json; where each problem is common comes
 * from the symptom lists of the climate profiles in src/data/climate/us.json, so the metro links stay
 * in step with the climate research. Every test, glossary term and symptom is checked at build time.
 */
import data from '../../../data/us/issues.json';
import climate from '../../../data/climate/us.json';
import { METROS } from '../../../lib/us/data';
import { GLOSSARY, termFor, shortFor, hrefFor } from '../../../lib/glossary';
import { testName, testHref } from '../../../lib/climate';

export const GROUP_ORDER = ['hot-humid', 'hot-dry', 'mixed', 'cold', 'marine'] as const;
export type GroupKey = (typeof GROUP_ORDER)[number];

export interface Group { label: string; where: string; profiles: string[] }
export interface Issue {
  slug: string;
  name: string;
  short: string;
  symptom: string;
  /** Hero photo key; left out for hot-weather problems because the site's photos are cold-weather scenes. */
  photo?: string;
  symptoms: string[];
  meaning: string[];
  causes: Record<GroupKey, string>;
  tests: { test: string; why: string }[];
  diyFirst: string[];
  fixLadder: { step: string; cost: string }[];
  callPro: string[];
  avoid?: string[];
  glossary: string[];
  related: string[];
  faq: { q: string; a: string }[];
  sources: { label: string; url: string }[];
  metaDescription: string;
}

const D = data as unknown as {
  checked: string;
  costLegend: string;
  groups: Record<GroupKey, Group>;
  sections: { title: string; slugs: string[] }[];
  issues: Issue[];
};
interface Profile { label: string; symptoms: string[]; places: string[] }
const PROFILES = (climate as unknown as { profiles: Record<string, Profile> }).profiles;

export const ISSUES_CHECKED = D.checked;
export const COST_LEGEND = D.costLegend;
export const GROUPS = D.groups;
export const SECTIONS = D.sections;
export const ISSUES = D.issues;
export const issueBySlug = (slug: string) => ISSUES.find((i) => i.slug === slug);

export const groupOf = (profileKey: string): GroupKey | undefined =>
  GROUP_ORDER.find((g) => GROUPS[g].profiles.includes(profileKey));

/** Climate profiles whose symptom list names this problem. */
export function profilesFor(issue: Issue): string[] {
  return Object.entries(PROFILES)
    .filter(([, p]) => p.symptoms.some((s) => issue.symptoms.includes(s)))
    .map(([k]) => k);
}

/** Climate groups where this problem is common, in display order. */
export function commonGroups(issue: Issue): GroupKey[] {
  const keys = new Set(profilesFor(issue).map(groupOf).filter(Boolean) as GroupKey[]);
  return GROUP_ORDER.filter((g) => keys.has(g));
}

export interface MetroLink { slug: string; name: string; href: string }

/** Metro guides where this problem is common, grouped by climate, metros in population order. */
export function metrosFor(issue: Issue): { group: GroupKey; label: string; metros: MetroLink[] }[] {
  const prof = new Set(profilesFor(issue));
  const out: { group: GroupKey; label: string; metros: MetroLink[] }[] = [];
  for (const g of GROUP_ORDER) {
    const inGroup = new Set(GROUPS[g].profiles.filter((p) => prof.has(p)).flatMap((p) => PROFILES[p]?.places ?? []));
    const metros = METROS.filter((m) => inGroup.has(m.slug)).map((m) => ({
      slug: m.slug,
      name: m.data.name as string,
      href: `/us/cities/${m.slug}/`,
    }));
    if (metros.length) out.push({ group: g, label: GROUPS[g].label, metros });
  }
  return out;
}

/** Problems that a metro's climate profile lists, for links from the metro guides. */
export function issuesForProfile(profileKey: string): Issue[] {
  const p = PROFILES[profileKey];
  if (!p) return [];
  return ISSUES.filter((i) => i.symptoms.some((s) => p.symptoms.includes(s)));
}

const usEntry = (slug: string) =>
  GLOSSARY.find((e) => e.countries.includes('us') && ((e.slugUs ?? e.slug) === slug || e.slug === slug));

export function glossaryFor(issue: Issue): { term: string; short: string; href: string }[] {
  return issue.glossary.map((s) => {
    const e = usEntry(s);
    if (!e) throw new Error(`us/issues: glossary term "${s}" (${issue.slug}) has no US entry`);
    // Shared definitions sometimes give both bases ("18°C or 65°F"); US readers get the °F one.
    const short = shortFor(e, 'us').replace(/\b\d+(?:\.\d+)?°C or (\d+(?:\.\d+)?°F)/g, '$1');
    return { term: termFor(e, 'us'), short, href: hrefFor(e, 'us') };
  });
}

export function testsFor(issue: Issue): { name: string; href: string; why: string }[] {
  return issue.tests.map((t) => {
    const href = testHref('us', t.test);
    if (!href) throw new Error(`us/issues: test "${t.test}" (${issue.slug}) has no US page`);
    return { name: testName('us', t.test), href, why: t.why };
  });
}

// Build-time checks: every symptom label exists in the climate data, and every related slug is a page.
const ALL_SYMPTOMS = new Set(Object.values(PROFILES).flatMap((p) => p.symptoms));
for (const i of ISSUES) {
  for (const s of i.symptoms) if (!ALL_SYMPTOMS.has(s)) throw new Error(`us/issues: symptom "${s}" (${i.slug}) is not in climate/us.json`);
  for (const r of i.related) if (!issueBySlug(r)) throw new Error(`us/issues: related "${r}" (${i.slug}) is not an issue`);
  for (const g of GROUP_ORDER) if (!i.causes[g]) throw new Error(`us/issues: ${i.slug} has no cause text for ${g}`);
}
for (const s of SECTIONS) for (const slug of s.slugs) if (!issueBySlug(slug)) throw new Error(`us/issues: section slug "${slug}" missing`);
