// Hourly alert sender (GitHub Actions: .github/workflows/alerts.yml).
//
// 1. Tells admins about new, confirmed match requests.
// 2. Tells homeowners when their request is matched.
// 3. Copies new entries from src/data/program-updates.json into the database.
// 4. Emails program changes to people who turned those alerts on.
// 5. Sends deadline reminders 30, 7 and 1 day ahead.
// 6. Sends the monthly home checklist in the first week of each month.
// 7. Deletes unconfirmed requests after 7 days.
//
// The hourly database query also keeps a free Supabase project from pausing.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY (+ optional ALERTS_FROM,
// ALERTS_REPLY_TO, ADMIN_NOTIFY, MAILING_ADDRESS, SITE_URL, DAILY_CAP, DRY_RUN).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  todayET, daysBetween, reminderBucket, updateMatches, checksFor,
  adminNoticeEmail, matchedEmail, updateEmail, remindersEmail, seasonalEmail,
} from './lib.mjs';

const ROOT = new URL('../../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const accounts = readJson('src/config/accounts.json');

const env = (k, d = '') => (process.env[k] ?? '').trim() || d;
const cfg = {
  url: env('SUPABASE_URL', accounts.supabaseUrl),
  key: env('SUPABASE_SECRET_KEY'),
  resendKey: env('RESEND_API_KEY'),
  resendUrl: env('RESEND_API_URL', 'https://api.resend.com'),
  from: env('ALERTS_FROM', 'AuditYourHome <alerts@updates.audityourhome.com>'),
  replyTo: env('ALERTS_REPLY_TO', 'dave@clickshift.ca'),
  admins: env('ADMIN_NOTIFY', 'dave@clickshift.ca').split(',').map((s) => s.trim()).filter(Boolean),
  siteUrl: env('SITE_URL', 'https://audityourhome.com').replace(/\/$/, ''),
  mailingAddress: env('MAILING_ADDRESS', accounts.mailingAddress),
  sender: 'AuditYourHome, operated by Click Shift Marketing',
  contactEmail: 'dave@clickshift.ca',
  dailyCap: Number(env('DAILY_CAP', '90')),
  dryRun: env('DRY_RUN') === '1' || env('DRY_RUN') === 'true',
  today: env('TODAY'), // tests only
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!cfg.url || !cfg.key) {
  log('Accounts are not configured yet (SUPABASE_URL / SUPABASE_SECRET_KEY). Nothing to do.');
  process.exit(0);
}
if (!cfg.resendKey && !cfg.dryRun) {
  log('RESEND_API_KEY is missing: running housekeeping only, no emails.');
}

const db = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const must = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };

let budget = 0;
let sent = 0;

async function sendEmail({ to, subject, html, text, headers = {}, idem }) {
  if (cfg.dryRun) {
    log(`[dry run] to ${to}: ${subject}`);
    sent++;
    return 'dry-run';
  }
  if (!cfg.resendKey) return null;
  if (budget <= 0) throw Object.assign(new Error('daily email budget used up'), { budget: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${cfg.resendUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.resendKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'audityourhome-alerts/1.0',
        ...(idem ? { 'Idempotency-Key': idem.slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: cfg.from, to: [to], reply_to: cfg.replyTo, subject, html, text, headers }),
    });
    if (res.ok) {
      budget--;
      sent++;
      const j = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, 150)); // stay well under 10 requests a second
      return j.id ?? 'sent';
    }
    if (res.status === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
    const body = await res.text().catch(() => '');
    if (res.status === 429 || /quota|limit/i.test(body)) throw Object.assign(new Error(`Resend limit: ${body.slice(0, 200)}`), { budget: true });
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  return null;
}

async function logSent(user_id, kind, ref, provider_id) {
  if (cfg.dryRun) return;
  const { error } = await db.from('alert_log').insert({ user_id, kind, ref, provider_id });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
}

async function alreadySent(kind, refs) {
  if (!refs.length) return new Set();
  const rows = await must(db.from('alert_log').select('user_id,ref').eq('kind', kind).in('ref', [...new Set(refs)]));
  return new Set(rows.map((r) => `${r.user_id}|${r.ref}`));
}

/** Everyone subscribed to a given alert, with email, name, home and unsubscribe token. */
async function subscribers(column) {
  const prefs = await must(db.from('alert_prefs').select('*').eq(column, true).is('unsubscribed_at', null));
  if (!prefs.length) return [];
  const ids = prefs.map((p) => p.user_id);
  const profiles = await must(db.from('profiles').select('id,email,full_name').in('id', ids));
  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
  return prefs.filter((p) => byId[p.user_id]?.email).map((p) => ({ ...p, email: byId[p.user_id].email, name: byId[p.user_id].full_name }));
}

// ---------------------------------------------------------------------------

async function adminNotices() {
  const reqs = await must(db.from('match_requests').select('*').is('notified_at', null).order('created_at'));
  if (!reqs.length) return;
  const cities = readJson('src/data/local/index.json').cities;
  const cityNames = Object.fromEntries(cities.map((c) => [c.slug, c.name]));
  const mail = adminNoticeEmail(cfg, reqs, cityNames);
  for (const to of cfg.admins) {
    const id = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, idem: `admin:${reqs.map((r) => r.id).join(',')}:${to}`.slice(0, 256) });
    if (id === null) return;
    await logSent(null, 'admin', `${to}:${reqs[0].id}:${reqs.length}`, id);
  }
  if (!cfg.dryRun) await must(db.from('match_requests').update({ notified_at: new Date().toISOString() }).in('id', reqs.map((r) => r.id)));
  log(`admin notice: ${reqs.length} request(s) to ${cfg.admins.length} admin(s)`);
}

async function matchedNotices() {
  const reqs = await must(db.from('match_requests').select('*').eq('status', 'matched'));
  const todo = reqs.filter((r) => r.status_notified !== 'matched' && r.matched_company);
  for (const r of todo) {
    const mail = matchedEmail(cfg, r);
    const id = await sendEmail({ to: r.contact_email, subject: mail.subject, html: mail.html, text: mail.text, idem: `matched:${r.id}` });
    if (id === null) return;
    await logSent(r.user_id, 'matched', r.id, id);
    if (!cfg.dryRun) await must(db.from('match_requests').update({ status_notified: 'matched' }).eq('id', r.id));
  }
  if (todo.length) log(`matched notices: ${todo.length}`);
}

async function syncSiteUpdates() {
  const items = readJson('src/data/program-updates.json').items;
  const existing = new Set((await must(db.from('program_updates').select('slug').not('slug', 'is', null))).map((r) => r.slug));
  const fresh = items.filter((u) => !existing.has(u.slug));
  if (!fresh.length) return;
  const rows = fresh.map((u) => ({
    slug: u.slug, provinces: u.provinces, title: u.title, summary: u.summary,
    url: /^https:\/\//.test(u.url) ? u.url : `${cfg.siteUrl}${u.url}`,
    published_at: `${u.date}T12:00:00-04:00`, status: 'queued', source: 'site',
  }));
  if (!cfg.dryRun) await must(db.from('program_updates').insert(rows));
  log(`program updates: added ${rows.length} from the site`);
}

async function updateEmails() {
  const queued = await must(db.from('program_updates').select('*').eq('status', 'queued').lte('published_at', new Date().toISOString()).order('published_at'));
  if (!queued.length) return;
  if (!cfg.mailingAddress) { log('program updates waiting: set MAILING_ADDRESS (CASL) before they can be sent'); return; }
  const subs = await subscribers('program_updates');
  const refs = queued.map((u) => u.slug || u.id);
  const done = await alreadySent('update', refs);
  for (const u of queued) {
    const ref = u.slug || u.id;
    const targets = subs.filter((s) => updateMatches(u, s) && s.alerts_since && Date.parse(s.alerts_since) <= Date.parse(u.published_at) && !done.has(`${s.user_id}|${ref}`));
    for (const s of targets) {
      const mail = updateEmail(cfg, u, s, s.unsub_token);
      const id = await sendEmail({ to: s.email, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers, idem: `update:${ref}:${s.user_id}` });
      if (id === null) return;
      await logSent(s.user_id, 'update', ref, id);
    }
    if (!cfg.dryRun) await must(db.from('program_updates').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', u.id));
    log(`update "${u.title}": ${targets.length} email(s)`);
  }
}

async function reminderEmails() {
  const today = cfg.today || todayET();
  const until = new Date(Date.parse(`${today}T12:00:00Z`) + 31 * 86400000).toISOString().slice(0, 10);
  const subs = await subscribers('deadline_reminders');
  if (!subs.length) return;
  const ids = subs.map((s) => s.user_id);
  const rems = await must(db.from('reminders').select('*').in('user_id', ids).eq('done', false).gte('due_on', today).lte('due_on', until));
  const due = rems.map((r) => ({ ...r, days: daysBetween(today, String(r.due_on).slice(0, 10)) }))
    .map((r) => ({ ...r, bucket: reminderBucket(r.days) }))
    .filter((r) => r.bucket !== null);
  const done = await alreadySent('reminder', due.map((r) => `${r.id}:${r.bucket}`));
  const byUser = {};
  for (const r of due) if (!done.has(`${r.user_id}|${r.id}:${r.bucket}`)) (byUser[r.user_id] ??= []).push(r);
  for (const s of subs) {
    const items = (byUser[s.user_id] ?? []).sort((a, b) => a.days - b.days);
    if (!items.length) continue;
    const mail = remindersEmail(cfg, s.name, items, s.unsub_token);
    const id = await sendEmail({ to: s.email, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers, idem: `reminder:${s.user_id}:${items.map((r) => `${r.id}:${r.bucket}`).join(',')}`.slice(0, 256) });
    if (id === null) return;
    for (const r of items) await logSent(s.user_id, 'reminder', `${r.id}:${r.bucket}`, id);
    log(`reminders: ${items.length} for one person`);
  }
}

async function seasonalEmails() {
  const today = cfg.today || todayET();
  const [y, m, d] = today.split('-').map(Number);
  if (d > 7) return; // first week of the month only
  if (!cfg.mailingAddress) { log('seasonal checks waiting: set MAILING_ADDRESS (CASL)'); return; }
  const ref = `${y}-${String(m).padStart(2, '0')}`;
  const subs = await subscribers('seasonal_checks');
  if (!subs.length) return;
  const done = await alreadySent('seasonal', [ref]);
  const todo = subs.filter((s) => !done.has(`${s.user_id}|${ref}`));
  if (!todo.length) return;
  const ids = todo.map((s) => s.user_id);
  const [homes, audits] = await Promise.all([
    must(db.from('homes').select('user_id,heating,cooling,water_supply,updated_at').in('user_id', ids).order('updated_at', { ascending: false })),
    must(db.from('audits').select('user_id,kind,done_on').in('user_id', ids)),
  ]);
  const items = readJson('src/data/seasonal-checks.json').items;
  for (const s of todo) {
    const home = homes.find((h) => h.user_id === s.user_id) ?? null;
    const checks = checksFor(items, m, home, audits.filter((a) => a.user_id === s.user_id), new Date(`${today}T12:00:00`));
    if (!checks.length) { await logSent(s.user_id, 'seasonal', ref, 'none'); continue; }
    const mail = seasonalEmail(cfg, s.name, m, checks, s.unsub_token);
    const id = await sendEmail({ to: s.email, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers, idem: `seasonal:${ref}:${s.user_id}` });
    if (id === null) return;
    await logSent(s.user_id, 'seasonal', ref, id);
  }
  log(`seasonal checks: ${todo.length} person(s) for ${ref}`);
}

async function housekeeping() {
  if (cfg.dryRun) return;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  await must(db.from('pending_actions').delete().is('claimed_at', null).lt('created_at', weekAgo));
  await must(db.from('pending_actions').delete().not('claimed_at', 'is', null).lt('claimed_at', monthAgo));
}

async function main() {
  const since = new Date(Date.now() - 86400000).toISOString();
  const recent = await must(db.from('alert_log').select('id').gte('sent_at', since));
  budget = Math.max(0, cfg.dailyCap - recent.length);
  log(`start: ${budget} emails left in today's budget${cfg.dryRun ? ' (dry run)' : ''}`);
  const steps = [adminNotices, matchedNotices, syncSiteUpdates, updateEmails, reminderEmails, seasonalEmails, housekeeping];
  let failed = 0;
  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      if (e.budget) { log(`stopped ${step.name}: ${e.message}`); continue; }
      failed++;
      console.error(`${step.name} failed:`, e.message);
    }
  }
  log(`done: ${sent} email(s) sent`);
  if (failed) process.exit(1);
}

await main();
