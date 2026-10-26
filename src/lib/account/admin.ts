/**
 * Admin console: match requests, program updates and admin list.
 * Every action is checked again in the database (admin-only functions and RLS).
 */
import { sb, rpc, friendlyError, signOut } from './client';
import { h, mount, field, select, input, textarea, chip, toast, busy } from './dom';
import {
  PROVINCES, provinceName, serviceLabel, TIMELINES, BUILDINGS, REQUEST_STATUS, auditLabel, homeLabel, formatPostal, fmtDate,
} from './catalog';

type Row = Record<string, any>;
type Provider = { n: string; p: string };
type Boot = { enabled: boolean; providers: Record<string, Provider[]>; provinceProviders: Record<string, Provider[]>; cityNames: Record<string, string> };

let B: Boot;
let root: HTMLElement;
let filter = 'open';
let data: { requests: Row[]; admin: Record<string, Row>; homes: Record<string, Row>; audits: Record<string, Row[]>; updates: Row[]; stats: Row; admins: Row[] };

export async function initAdmin(el: HTMLElement, boot: Boot) {
  root = el;
  B = boot;
  if (!B.enabled) {
    mount(root, h('div', { class: 'card card-pad' }, h('h1', null, 'Admin console'), h('p', null, 'Accounts are not switched on yet.')));
    return;
  }
  const { data: s } = await sb().auth.getSession();
  if (!s.session) {
    mount(root, h('div', { class: 'card card-pad' },
      h('h1', null, 'Admin console'),
      h('p', null, 'Sign in with your admin email first.'),
      h('a', { class: 'btn btn-primary', href: '/account/?next=overview' }, 'Sign in at My Home'),
    ));
    return;
  }
  try {
    await load();
  } catch (e) {
    const msg = friendlyError(e);
    mount(root, h('div', { class: 'card card-pad' },
      h('h1', null, 'Admin console'),
      h('p', null, /admins only/i.test(msg) ? 'This account isn’t an admin. Ask Dave to add your email.' : msg),
      h('a', { class: 'btn btn-ghost', href: '/account/' }, 'Back to My Home'),
    ));
    return;
  }
  render();
}

async function load() {
  const stats = await rpc<Row>('admin_stats');
  const q = <T>(p: PromiseLike<{ data: T | null; error: unknown }>) => Promise.resolve(p).then((r) => { if (r.error) throw r.error; return r.data as T; });
  const [requests, adminRows, updates, admins] = await Promise.all([
    q<Row[]>(sb().from('match_requests').select('*').order('created_at', { ascending: false }).limit(300)),
    q<Row[]>(sb().from('match_admin').select('*')),
    q<Row[]>(sb().from('program_updates').select('*').order('created_at', { ascending: false }).limit(50)),
    rpc<Row[]>('admin_list_admins'),
  ]);
  const uids = [...new Set(requests.map((r) => r.user_id))];
  const [homes, audits] = uids.length
    ? await Promise.all([
      q<Row[]>(sb().from('homes').select('*').in('user_id', uids)),
      q<Row[]>(sb().from('audits').select('*').in('user_id', uids).order('done_on', { ascending: false, nullsFirst: false })),
    ])
    : [[], []];
  const homeBy: Record<string, Row> = {};
  for (const x of homes) homeBy[x.id] = x;
  const auditsBy: Record<string, Row[]> = {};
  for (const a of audits) (auditsBy[a.user_id] ??= []).push(a);
  data = {
    requests,
    admin: Object.fromEntries(adminRows.map((a) => [a.request_id, a])),
    homes: homeBy,
    audits: auditsBy,
    updates,
    stats,
    admins,
  };
  // homes keyed by user too, for requests saved before the home existed
  for (const x of homes) data.homes[`user:${x.user_id}`] ??= x;
}

function render() {
  const s = data.stats;
  const req = s.requests ?? {};
  mount(root,
    h('div', { class: 'acct-bar' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Admin'), h('h1', null, 'Admin console')),
      h('div', { class: 'acct-bar-actions' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '/account/' }, 'My Home'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', on: { click: async () => { await signOut(); location.href = '/account/'; } } }, 'Sign out'),
      ),
    ),
    h('div', { class: 'adm-stats' },
      stat(req.new ?? 0, 'new requests'),
      stat(req.reviewing ?? 0, 'being matched'),
      stat(req.matched ?? 0, 'matched'),
      stat(s.accounts, `accounts (${s.accounts_7d} this week)`),
      stat(s.program_updates, 'want program alerts'),
      stat(s.seasonal_checks, 'want monthly checks'),
      stat(s.unconfirmed_7d, 'unconfirmed requests, 7 days'),
      stat(s.emails_24h, 'alert emails, 24 h'),
    ),
    requestsSection(),
    updatesSection(),
    adminsSection(),
  );
}

const stat = (n: number, label: string) => h('div', { class: 'card adm-stat' }, h('b', null, String(n ?? 0)), h('span', null, label));

function requestsSection() {
  const groups: Record<string, (r: Row) => boolean> = {
    open: (r) => r.status === 'new' || r.status === 'reviewing',
    matched: (r) => r.status === 'matched',
    closed: (r) => r.status === 'closed' || r.status === 'cancelled',
    all: () => true,
  };
  const list = data.requests.filter(groups[filter]);
  const btn = (key: string, label: string) => h('button', {
    type: 'button', class: `btn btn-sm ${filter === key ? 'btn-primary' : 'btn-ghost'}`,
    on: { click: () => { filter = key; render(); document.getElementById('adm-req')?.scrollIntoView(); } },
  }, `${label} (${data.requests.filter(groups[key]).length})`);
  return h('section', { class: 'acct-sec', id: 'adm-req' },
    h('h2', null, 'Match requests'),
    h('p', { class: 'small sec-intro' }, 'Confirmed requests only (the homeowner entered the emailed code or clicked the link). Each request goes to one company. When you mark one matched, the homeowner gets an email with the company and your note.'),
    h('div', { class: 'adm-filters' }, btn('open', 'Open'), btn('matched', 'Matched'), btn('closed', 'Closed'), btn('all', 'All')),
    list.length ? h('div', { class: 'req-list' }, list.map(requestCard)) : h('p', { class: 'empty' }, 'Nothing here.'),
  );
}

function providersFor(r: Row): Provider[] {
  return (r.city_slug && B.providers[r.city_slug]) || (r.province && B.provinceProviders[r.province]) || [];
}

function requestCard(r: Row) {
  const st = REQUEST_STATUS[r.status] ?? { label: r.status, tone: 'neutral' };
  const home = (r.home_id && data.homes[r.home_id]) || data.homes[`user:${r.user_id}`] || null;
  const audits = data.audits[r.user_id] ?? [];
  const adm = data.admin[r.id] ?? {};
  const where = [formatPostal(r.postal_code), (r.city_slug && B.cityNames[r.city_slug]) || provinceName(r.province)].filter(Boolean).join(' · ');
  const listId = `prov-${r.id}`;
  const provs = providersFor(r);
  const company = input('matched_company', r.matched_company, { list: listId, maxlength: 160, placeholder: 'Company name' });
  company.addEventListener('change', () => {
    const p = provs.find((x) => x.n === (company as HTMLInputElement).value);
    const contact = card.querySelector<HTMLInputElement>('input[name=matched_contact]');
    if (p && contact && !contact.value) contact.value = p.p;
  });
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save');
  const form = h('form', {
    class: 'adm-form',
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        const f = new FormData(e.target as HTMLFormElement);
        const v = (k: string) => String(f.get(k) ?? '').trim();
        if (v('status') === 'matched' && !v('matched_company')) { toast('Add the company you matched them with.', 'err'); return; }
        busy(saveBtn, true, 'Saving…');
        try {
          await rpc('admin_update_match', { p_id: r.id, p: {
            status: v('status'), matched_company: v('matched_company'), matched_contact: v('matched_contact'),
            homeowner_note: v('homeowner_note'), admin_notes: v('admin_notes'), lead_fee: v('lead_fee'), billed: f.get('billed') ? 'true' : 'false',
          } });
          toast('Saved.');
          await load();
          render();
        } catch (ex) {
          toast(friendlyError(ex), 'err');
          busy(saveBtn, false);
        }
      },
    },
  },
    h('datalist', { id: listId }, provs.map((p) => h('option', { value: p.n }, p.p))),
    h('div', { class: 'grid-3' },
      field('Status', select('status', Object.entries(REQUEST_STATUS).map(([value, x]) => ({ value, label: x.label })), r.status)),
      field('Matched company', company, provs.length ? `${provs.length} listed for this area: start typing.` : undefined),
      field('Their contact', input('matched_contact', r.matched_contact, { maxlength: 200, placeholder: 'Phone or email' })),
    ),
    field('Note to the homeowner (they see this)', textarea('homeowner_note', r.homeowner_note, { maxlength: 1000, placeholder: 'e.g. Energy Co will call you this week to book.' })),
    h('div', { class: 'grid-3' },
      field('Private notes', textarea('admin_notes', adm.admin_notes, { maxlength: 4000, rows: 2 })),
      field('Lead fee ($)', input('lead_fee', adm.lead_fee ?? '', { inputmode: 'decimal', maxlength: 9 })),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Billing'), h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'billed', value: '1', checked: Boolean(adm.billed) }), ' Billed')),
    ),
    saveBtn,
  );

  const card = h('details', { class: 'card adm-req' },
    h('summary', null,
      h('div', null,
        h('div', { class: 'who' }, `${serviceLabel(r.service)} · ${r.contact_name || r.contact_email}`),
        h('div', { class: 'sub' }, [where, `${fmtDate(r.created_at)}`, r.source === 'account' ? 'from My Home' : r.source === 'planner' ? 'from the planner' : 'from the lead form'].filter(Boolean).join(' · ')),
      ),
      chip(st.label, st.tone),
    ),
    h('div', { class: 'adm-body' },
      h('dl', { class: 'adm-kv' },
        h('dt', null, 'Email'), h('dd', null, h('a', { href: `mailto:${r.contact_email}` }, r.contact_email)),
        h('dt', null, 'Phone'), h('dd', null, r.contact_phone ? h('a', { href: `tel:${String(r.contact_phone).replace(/[^0-9+]/g, '')}` }, r.contact_phone) : '—'),
        h('dt', null, 'Prefers'), h('dd', null, r.contact_pref === 'phone' ? 'Phone' : 'Email'),
        h('dt', null, 'Building'), h('dd', null, BUILDINGS.find((b) => b.value === r.building)?.label ?? r.building),
        h('dt', null, 'When'), h('dd', null, TIMELINES.find((t) => t.value === r.timeline)?.label ?? '—'),
        h('dt', null, 'Their words'), h('dd', null, r.details || '—'),
        h('dt', null, 'Home'), h('dd', null, home ? [
          home.city_name, homeLabel('era', home.era), homeLabel('home_type', home.home_type), homeLabel('size_band', home.size_band),
          homeLabel('heating', home.heating), home.water_supply === 'well' ? 'private well' : null, homeLabel('windows', home.windows),
        ].filter(Boolean).join(' · ') : 'Not added yet'),
        h('dt', null, 'Records'), h('dd', null, audits.length ? audits.slice(0, 4).map((a) => `${auditLabel(a.kind)}${a.done_on ? ` (${fmtDate(a.done_on)})` : ''}${a.rating_gj ? `: ${a.rating_gj} GJ/yr` : ''}${a.radon_bq ? `: ${a.radon_bq} Bq/m³` : ''}`).join('; ') : 'None'),
        h('dt', null, 'Consent'), h('dd', { class: 'small' }, `${fmtDate(r.consented_at)}: “${r.consent_text}”`),
      ),
      form,
    ),
  );
  return card;
}

function updatesSection() {
  const provBoxes = h('div', { class: 'prov-chips' }, PROVINCES.map((p) => h('label', { class: 'pchip' }, h('input', { type: 'checkbox', name: 'prov', value: p.value }), h('span', null, p.value))));
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Queue for sending');
  const form = h('form', {
    class: 'card card-pad',
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        const f = e.target as HTMLFormElement;
        const fd = new FormData(f);
        const v = (k: string) => String(fd.get(k) ?? '').trim();
        const provinces = [...f.querySelectorAll<HTMLInputElement>('input[name=prov]:checked')].map((i) => i.value);
        if (!v('title') || !v('summary')) { toast('Add a title and a summary.', 'err'); return; }
        if (v('url') && !/^https:\/\//.test(v('url'))) { toast('Links must start with https://', 'err'); return; }
        if (!confirm(`Email this to everyone with program alerts in ${provinces.length ? provinces.join(', ') : 'all provinces'}?`)) return;
        busy(btn, true, 'Queuing…');
        try {
          await rpc('admin_post_update', { p: { title: v('title'), summary: v('summary'), url: v('url') || null, provinces, status: 'queued' } });
          toast('Queued. It goes out with the next hourly run.');
          await load();
          render();
          document.getElementById('adm-upd')?.scrollIntoView();
        } catch (ex) {
          toast(friendlyError(ex), 'err');
          busy(btn, false);
        }
      },
    },
  },
    field('Title', input('title', '', { maxlength: 160, placeholder: 'e.g. Ontario: new heat pump rebate amounts from January 1' })),
    field('Summary (2 or 3 sentences, plain facts)', textarea('summary', '', { maxlength: 1200, rows: 3 })),
    field('Link (official page or our program page)', input('url', '', { type: 'url', placeholder: 'https://audityourhome.com/ca/programs/…' })),
    h('fieldset', null, h('legend', null, 'Provinces (leave all unticked for all of Canada)'), provBoxes),
    btn,
  );
  return h('section', { class: 'acct-sec', id: 'adm-upd' },
    h('h2', null, 'Send a program update'),
    h('p', { class: 'small sec-intro' }, 'Goes to people who turned on rebate and program alerts for those provinces, with the next hourly run. Changes we add to the site’s program-changes page are sent automatically, so use this for anything extra.'),
    form,
    data.updates.length ? h('ul', { class: 'rec-list', style: 'margin-top:14px' }, data.updates.map((u) => h('li', { class: 'card rec' },
      h('div', { class: 'rec-head' }, h('h3', null, u.title), chip(u.status, u.status === 'sent' ? 'active' : u.status === 'queued' ? 'limited' : 'neutral')),
      h('p', { class: 'small' }, `${(u.provinces ?? []).join(', ') || 'All of Canada'} · ${u.source === 'site' ? 'from the site' : 'posted here'} · ${fmtDate(u.published_at)}${u.sent_at ? ` · sent ${fmtDate(u.sent_at)}` : ''}`),
      u.status === 'queued' ? h('button', { type: 'button', class: 'linkish danger', on: { click: async () => {
        try { await rpc('admin_set_update_status', { p_id: u.id, p_status: 'cancelled' }); toast('Cancelled.'); await load(); render(); } catch (ex) { toast(friendlyError(ex), 'err'); }
      } } }, 'Cancel') : null,
    ))) : null,
  );
}

function adminsSection() {
  const emailIn = input('email', '', { type: 'email', placeholder: 'name@example.com' });
  const btn = h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Add admin');
  return h('section', { class: 'acct-sec', id: 'adm-admins' },
    h('h2', null, 'Admins'),
    h('p', { class: 'small sec-intro' }, 'Admins can see every match request and, for people who asked to be matched, their home details. Add someone by email; if they haven’t signed up yet, they become an admin when they do.'),
    h('ul', { class: 'rec-list' }, data.admins.map((a) => h('li', { class: 'card rec' },
      h('div', { class: 'rec-head' },
        h('h3', null, a.email),
        h('span', { class: 'meta' }, a.signed_up ? 'signed up' : 'invited'),
      ),
      h('button', { type: 'button', class: 'linkish danger', on: { click: async () => {
        if (!confirm(`Remove ${a.email} as an admin?`)) return;
        try { await rpc('admin_set_admin', { p_email: a.email, p_admin: false }); await load(); render(); } catch (ex) { toast(friendlyError(ex), 'err'); }
      } } }, 'Remove'),
    ))),
    h('form', {
      class: 'su-row', style: 'margin-top:12px',
      on: { submit: async (e: Event) => {
        e.preventDefault();
        const email = (emailIn as HTMLInputElement).value.trim();
        busy(btn, true, 'Adding…');
        try { const r = await rpc<string>('admin_set_admin', { p_email: email, p_admin: true }); toast(r === 'invited' ? 'Invited: they become an admin when they sign up.' : 'Added.'); await load(); render(); } catch (ex) { toast(friendlyError(ex), 'err'); busy(btn, false); }
      } },
    }, field('Email', emailIn), btn),
  );
}
