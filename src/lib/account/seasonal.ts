/** Which seasonal checks apply to a home this month (same rules as tools/alerts/lib.mjs). */
import data from '../../data/seasonal-checks.json';

export type SeasonalCheck = {
  id: string;
  months: number[];
  title: string;
  body: string;
  when?: { heating?: string[]; cooling?: string[]; water_supply?: string[]; noAudit?: string; years?: number };
  link?: string;
  source: { name: string; url: string };
};

export const CHECKS = (data as { items: SeasonalCheck[] }).items;

type HomeLike = { heating?: string | null; cooling?: string | null; water_supply?: string | null } | null | undefined;
type AuditLike = { kind: string; done_on?: string | null };

function known(v?: string | null) {
  return v && v !== 'unsure' ? v : null;
}

export function applies(c: SeasonalCheck, home: HomeLike, audits: AuditLike[] = [], today = new Date()): boolean {
  const w = c.when;
  if (!w) return true;
  if (w.noAudit) {
    const cutoff = new Date(today);
    cutoff.setFullYear(cutoff.getFullYear() - (w.years ?? 5));
    const recent = audits.some((a) => a.kind === w.noAudit && (!a.done_on || new Date(`${a.done_on}T12:00:00`) >= cutoff));
    if (recent) return false;
  }
  const tests: boolean[] = [];
  if (w.heating) {
    const v = known(home?.heating);
    tests.push(v === null || w.heating.includes(v));
  }
  if (w.cooling) {
    const v = known(home?.cooling);
    tests.push(v === null || w.cooling.includes(v));
  }
  if (w.water_supply) {
    const v = known(home?.water_supply);
    tests.push(v !== null && w.water_supply.includes(v));
  }
  return tests.length === 0 || tests.some(Boolean);
}

export function checksFor(month: number, home: HomeLike, audits: AuditLike[] = [], today = new Date()) {
  return CHECKS.filter((c) => c.months.includes(month) && applies(c, home, audits, today));
}
