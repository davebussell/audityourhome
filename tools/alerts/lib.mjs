// Pure helpers for the alert sender: who gets what, and the email templates.
// Kept free of I/O so tools/alerts/lib.test.mjs can test them directly.

export const PROVINCE_NAMES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island',
  QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};

export const SERVICE_LABELS = {
  'energy-audit': 'home energy audit (EnerGuide evaluation)', insulation: 'insulation or air sealing',
  'heat-pump': 'heat pump, furnace or air conditioning', 'windows-doors': 'windows and doors', 'water-heater': 'water heater',
  ventilation: 'ventilation or humidity', radon: 'radon test or mitigation', 'mould-air': 'mould or indoor air quality',
  'wood-stove': 'wood stove (WETT) inspection', 'well-water': 'well water testing or treatment',
  'asbestos-lead': 'asbestos, vermiculite or lead paint testing', other: 'request',
};

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Today's date in Eastern time as YYYY-MM-DD (alerts are dated for Canadian readers). */
export function todayET(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(`${toISO}T12:00:00Z`) - Date.parse(`${fromISO}T12:00:00Z`)) / 86400000);
}

/** Which reminder email is due: the smallest of 30/7/1 days that the date has reached, or null. */
export function reminderBucket(days) {
  if (days < 0 || days > 30) return null;
  if (days <= 1) return 1;
  if (days <= 7) return 7;
  return 30;
}

export function updateMatches(update, prefs) {
  const up = update.provinces ?? [];
  if (!up.length) return true;
  return (prefs.provinces ?? []).some((p) => up.includes(p));
}

/** Same rules as src/lib/account/seasonal.ts. */
export function checkApplies(c, home, audits = [], today = new Date()) {
  const w = c.when;
  if (!w) return true;
  const known = (v) => (v && v !== 'unsure' ? v : null);
  if (w.noAudit) {
    const cutoff = new Date(today);
    cutoff.setFullYear(cutoff.getFullYear() - (w.years ?? 5));
    if (audits.some((a) => a.kind === w.noAudit && (!a.done_on || new Date(`${String(a.done_on).slice(0, 10)}T12:00:00`) >= cutoff))) return false;
  }
  const tests = [];
  if (w.heating) { const v = known(home?.heating); tests.push(v === null || w.heating.includes(v)); }
  if (w.cooling) { const v = known(home?.cooling); tests.push(v === null || w.cooling.includes(v)); }
  if (w.water_supply) { const v = known(home?.water_supply); tests.push(v !== null && w.water_supply.includes(v)); }
  return tests.length === 0 || tests.some(Boolean);
}

export function checksFor(items, month, home, audits, today) {
  return items.filter((c) => c.months.includes(month) && checkApplies(c, home, audits, today));
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const abs = (site, url) => (!url ? '' : /^https?:\/\//.test(url) ? url : `${site}${url.startsWith('/') ? '' : '/'}${url}`);

/**
 * Wrap a message in the shared layout. `why` explains why they got it (CASL),
 * `token` adds the one-click unsubscribe link (omit for admin notices).
 */
export function layout(cfg, { title, intro, blocks = [], cta, why, token }) {
  const site = cfg.siteUrl;
  const unsub = token ? `${site}/account/unsubscribe/?t=${token}` : null;
  const manage = `${site}/account/#alerts`;
  const ident = `${cfg.sender} · ${cfg.mailingAddress || 'Wakefield, Quebec'} · ${cfg.contactEmail} · ${site.replace(/^https?:\/\//, '')}`;
  const html = `<!doctype html><html><body style="margin:0;background:#FAF8F4;font-family:Arial,Helvetica,sans-serif;color:#1A2430">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
  <p style="font-weight:800;font-size:18px;margin:0 0 18px"><span style="color:#1A2430">Audit</span><span style="color:#EF3340">Your</span><span style="color:#1A2430">Home</span></p>
  <div style="background:#fff;border:1px solid #E7E1D5;border-radius:12px;padding:22px 22px 18px">
    <h1 style="font-size:20px;line-height:1.3;margin:0 0 10px">${esc(title)}</h1>
    ${intro ? `<p style="font-size:15px;line-height:1.55;margin:0 0 14px">${esc(intro)}</p>` : ''}
    ${blocks.map((b) => `<div style="border-top:1px solid #E7E1D5;padding:12px 0 2px">
      ${b.kicker ? `<p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#2E5F7F;margin:0 0 4px">${esc(b.kicker)}</p>` : ''}
      <p style="font-weight:700;font-size:15.5px;margin:0 0 4px">${b.url ? `<a href="${esc(abs(site, b.url))}" style="color:#B84713">${esc(b.title)}</a>` : esc(b.title)}</p>
      ${b.body ? `<p style="font-size:14.5px;line-height:1.5;margin:0 0 6px;color:#3B4856">${esc(b.body)}</p>` : ''}
      ${b.foot ? `<p style="font-size:12.5px;color:#8494A1;margin:0 0 6px">${esc(b.foot)}</p>` : ''}
    </div>`).join('')}
    ${cta ? `<p style="margin:16px 0 4px"><a href="${esc(abs(site, cta.url))}" style="display:inline-block;background:#E05C1F;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px">${esc(cta.label)}</a></p>` : ''}
  </div>
  <p style="font-size:12px;line-height:1.6;color:#5C6B78;margin:16px 4px 0">
    ${why ? `${esc(why)}<br>` : ''}
    ${token ? `<a href="${esc(manage)}" style="color:#5C6B78">Manage alerts</a> · <a href="${esc(unsub)}" style="color:#5C6B78">Unsubscribe from all alerts</a><br>` : ''}
    ${esc(ident)}
  </p>
</div></body></html>`;
  const text = [
    title, '', intro ?? '',
    ...blocks.flatMap((b) => ['', `${b.kicker ? `${b.kicker}: ` : ''}${b.title}`, b.body ?? '', b.url ? abs(site, b.url) : '', b.foot ?? ''].filter((x, i) => i === 0 || x !== '')),
    cta ? `\n${cta.label}: ${abs(site, cta.url)}` : '',
    '', '--', why ?? '',
    token ? `Manage alerts: ${manage}\nUnsubscribe from all alerts: ${unsub}` : '',
    ident,
  ].filter((x) => x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const headers = unsub ? { 'List-Unsubscribe': `<${unsub}>` } : {};
  return { html, text, headers };
}

const hi = (name) => (name ? `Hi ${String(name).split(' ')[0]},` : 'Hi,');

export function adminNoticeEmail(cfg, requests, cityNames = {}) {
  const n = requests.length;
  const subject = n === 1
    ? `New match request: ${SERVICE_LABELS[requests[0].service] ?? requests[0].service}${requests[0].postal_code ? ` (${requests[0].postal_code})` : ''}`
    : `${n} new match requests`;
  const body = layout(cfg, {
    title: subject,
    intro: 'Confirmed by the homeowner (they entered the emailed code or clicked the link). Match each one with one company.',
    blocks: requests.map((r) => ({
      kicker: [SERVICE_LABELS[r.service] ?? r.service, r.timeline].filter(Boolean).join(' · '),
      title: `${r.contact_name || 'No name'} · ${r.contact_email}${r.contact_phone ? ` · ${r.contact_phone}` : ''}`,
      body: r.details || '',
      foot: [r.postal_code, cityNames[r.city_slug] || PROVINCE_NAMES[r.province], r.building, `prefers ${r.contact_pref}`].filter(Boolean).join(' · '),
    })),
    cta: { label: 'Open the admin console', url: '/account/admin/' },
    why: 'You get these because you are an AuditYourHome admin.',
  });
  return { subject, ...body };
}

export function matchedEmail(cfg, r) {
  const service = SERVICE_LABELS[r.service] ?? 'request';
  const subject = `You’re matched: ${r.matched_company}`;
  return {
    subject,
    ...layout(cfg, {
      title: `We’ve matched your ${service} request`,
      intro: `${hi(r.contact_name)} we’ve introduced you to ${r.matched_company}. They’ll get in touch by ${r.contact_pref === 'phone' ? 'phone' : 'email'}.`,
      blocks: [
        { kicker: 'Your match', title: r.matched_company, body: r.matched_contact ? `Contact: ${r.matched_contact}` : '' },
        ...(r.homeowner_note ? [{ kicker: 'Note from AuditYourHome', title: r.homeowner_note }] : []),
      ],
      cta: { label: 'See it in My Home', url: '/account/#match' },
      why: 'You’re getting this because you asked AuditYourHome to match you with a company.',
    }),
  };
}

export function updateEmail(cfg, update, prefs, token) {
  const provs = (update.provinces ?? []).map((p) => PROVINCE_NAMES[p] ?? p);
  return {
    subject: update.title,
    ...layout(cfg, {
      title: update.title,
      intro: update.summary,
      cta: update.url ? { label: 'Read the details', url: update.url } : { label: 'All program changes', url: '/updates/' },
      why: `You’re getting this because you turned on rebate and program alerts${(prefs.provinces ?? []).length ? ` for ${(prefs.provinces ?? []).map((p) => PROVINCE_NAMES[p] ?? p).join(', ')}` : ''}${provs.length ? '' : ' (this change applies across Canada)'}.`,
      token,
    }),
  };
}

export function remindersEmail(cfg, name, items, token) {
  const first = items[0];
  const when = (d) => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
  const subject = items.length === 1 ? `Reminder: ${first.title} (${when(first.days)})` : `${items.length} deadlines coming up`;
  return {
    subject,
    ...layout(cfg, {
      title: items.length === 1 ? `${first.title}: ${when(first.days)}` : 'Your deadlines coming up',
      intro: `${hi(name)} here’s what you asked us to remind you about.`,
      blocks: items.map((r) => ({ kicker: `${r.due_on} · ${when(r.days)}`, title: r.title, body: r.notes || '' })),
      cta: { label: 'Open My Home', url: '/account/#reminders' },
      why: 'You’re getting this because you turned on deadline reminders and added these dates in My Home.',
      token,
    }),
  };
}

export function seasonalEmail(cfg, name, monthIndex, checks, token) {
  const month = MONTHS[monthIndex - 1];
  return {
    subject: `Your ${month} home checklist`,
    ...layout(cfg, {
      title: `Your ${month} home checklist`,
      intro: `${hi(name)} a few quick checks for this month, picked for your house.`,
      blocks: checks.map((c) => ({ title: c.title, body: c.body, url: c.link, foot: `Source: ${c.source.name}` })),
      cta: { label: 'Open My Home', url: '/account/#overview' },
      why: 'You’re getting this because you turned on seasonal home checks.',
      token,
    }),
  };
}
