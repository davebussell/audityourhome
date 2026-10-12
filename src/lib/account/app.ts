/**
 * My Home: sign-in, home profile, records, upgrade plan, reminders, alerts,
 * matching and account settings. Renders into #acct-app on /account/.
 */
import { sb, startSignIn, verifyCode, claim, storedClaim, friendlyError, signOut, rpc, type ClaimResult } from './client';
import { h, mount, field, select, input, textarea, chip, toast, formData, busy } from './dom';
import {
  PROVINCES, provinceName, provinceFromPostal, cleanPostal, formatPostal, SERVICES, serviceLabel, TIMELINES, BUILDINGS,
  REQUEST_STATUS, AUDIT_KINDS, auditLabel, NEED_STATUS, NEED_CATEGORIES, REMINDER_KINDS, HOME_OPTIONS, homeLabel,
  ALERT_TYPES, alertConsentText, MATCH_CONSENT, money, fmtDate, daysUntil, type AlertKey,
} from './catalog';
import { checksFor } from './seasonal';
import { demoData } from './demo';

type City = { slug: string; name: string; prov: string };
type SiteUpdate = { slug: string; date: string; provinces: string[]; title: string; summary: string; url: string };
type Row = Record<string, any>;

interface State {
  demo: boolean;
  uid: string;
  email: string;
  profile: Row;
  homes: Row[];
  homeId: string | null;
  audits: Row[];
  needs: Row[];
  reminders: Row[];
  prefs: Row;
  requests: Row[];
  updates: Row[];
}

let S: State;
let CITIES: City[] = [];
let SITE_UPDATES: SiteUpdate[] = [];
let root: HTMLElement;
let readonly = false;

const SECTIONS = [
  ['overview', 'Overview'],
  ['home', 'My home'],
  ['records', 'Audits and tests'],
  ['plan', 'Upgrade plan'],
  ['reminders', 'Reminders'],
  ['alerts', 'Alerts'],
  ['match', 'Get matched'],
  ['account', 'Account'],
] as const;

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

export async function initAccountApp(el: HTMLElement, opts: { enabled: boolean; cities: City[]; updates: SiteUpdate[] }) {
  root = el;
  CITIES = opts.cities;
  SITE_UPDATES = opts.updates;
  if (!opts.enabled) {
    renderSignedOut({ disabled: true });
    return;
  }
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const linkError = hash.get('error_description') || params.get('error_description');
  let session = null;
  try {
    const { data } = await sb().auth.getSession();
    session = data.session;
  } catch (e) {
    console.warn(e);
  }
  if (!session) {
    renderSignedOut({ notice: linkError ? 'That sign-in link has expired or was already used. Enter your email and we’ll send a new code.' : '' });
    cleanUrl(false);
    return;
  }
  await afterSignIn(params.get('claim') || storedClaim()?.key || null);
}

function cleanUrl(keepNext = true) {
  const url = new URL(location.href);
  const next = url.searchParams.get('next');
  url.search = '';
  if (keepNext && next && /^[a-z-]+$/.test(next)) url.hash = next;
  else if (/access_token|error=/.test(url.hash)) url.hash = '';
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

async function afterSignIn(claimKey: string | null) {
  mount(root, h('p', { class: 'acct-loading' }, 'Loading your home…'));
  let claimed: ClaimResult | null = null;
  try {
    claimed = await claim(claimKey);
  } catch (e) {
    console.warn('claim failed', e);
  }
  try {
    await load();
  } catch (e) {
    mount(root, h('div', { class: 'card card-pad' },
      h('h2', null, 'We couldn’t load your account'),
      h('p', null, friendlyError(e)),
      h('button', { class: 'btn btn-ghost', on: { click: async () => { await signOut(); location.reload(); } } }, 'Sign out and try again'),
    ));
    return;
  }
  cleanUrl(true);
  render();
  if (claimed) {
    const bits: string[] = [];
    if (claimed.match) bits.push('your request was sent; we’ll match you within one business day');
    if (claimed.plan) bits.push('your plan is saved');
    if (claimed.alerts) bits.push('your alerts are on');
    if (bits.length) banner(`You’re signed in: ${bits.join(', ')}.`);
  }
  const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  target?.scrollIntoView({ block: 'start' });
}

async function load() {
  const { data: u } = await sb().auth.getUser();
  if (!u.user) throw new Error('Please sign in again.');
  const uid = u.user.id;
  const q = <T>(p: PromiseLike<{ data: T | null; error: unknown }>) =>
    Promise.resolve(p).then((r) => { if (r.error) throw r.error; return r.data; });
  const [profile, homes, audits, needs, reminders, prefs, requests, updates] = await Promise.all([
    q(sb().from('profiles').select('*').eq('id', uid).maybeSingle()),
    q(sb().from('homes').select('*').eq('user_id', uid).order('created_at')),
    q(sb().from('audits').select('*').eq('user_id', uid).order('done_on', { ascending: false, nullsFirst: false })),
    q(sb().from('needs').select('*').eq('user_id', uid).order('priority', { ascending: true, nullsFirst: false })),
    q(sb().from('reminders').select('*').eq('user_id', uid).order('due_on')),
    q(sb().from('alert_prefs').select('*').eq('user_id', uid).maybeSingle()),
    q(sb().from('match_requests').select('*').eq('user_id', uid).order('created_at', { ascending: false })),
    q(sb().from('program_updates').select('id,slug,provinces,title,summary,url,published_at').in('status', ['queued', 'sent']).order('published_at', { ascending: false }).limit(30)),
  ]);
  const homesArr = (homes as Row[]) ?? [];
  S = {
    demo: false,
    uid,
    email: u.user.email ?? '',
    profile: (profile as Row) ?? { email: u.user.email },
    homes: homesArr,
    homeId: S?.homeId && homesArr.some((x) => x.id === S.homeId) ? S.homeId : homesArr[homesArr.length - 1]?.id ?? null,
    audits: (audits as Row[]) ?? [],
    needs: (needs as Row[]) ?? [],
    reminders: (reminders as Row[]) ?? [],
    prefs: (prefs as Row) ?? {},
    requests: (requests as Row[]) ?? [],
    updates: (updates as Row[]) ?? [],
  };
}

async function reload(section?: string) {
  try {
    await load();
    render();
    if (section) document.getElementById(section)?.scrollIntoView({ block: 'start' });
  } catch (e) {
    toast(friendlyError(e), 'err');
  }
}

function banner(text: string) {
  const b = h('div', { class: 'acct-banner', role: 'status' }, h('span', null, text), h('button', { type: 'button', class: 'x', 'aria-label': 'Dismiss', on: { click: () => b.remove() } }, '×'));
  root.prepend(b);
}

// ---------------------------------------------------------------------------
// signed out
// ---------------------------------------------------------------------------

function renderSignedOut(o: { disabled?: boolean; notice?: string }) {
  readonly = true;
  S = { ...(demoData() as unknown as State), uid: 'demo', email: 'you@example.com', homeId: 'demo-home' };
  S.updates = [];
  let email = '';
  const card = h('div', { class: 'card card-pad signin', id: 'signin' });

  const stepEmail = () => {
    const emailIn = h('input', { type: 'email', name: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com', value: email });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit', disabled: o.disabled }, 'Email me a sign-in code');
    const err = h('p', { class: 'form-err', role: 'alert' });
    const form = h('form', {
      novalidate: true,
      on: {
        submit: async (e: Event) => {
          e.preventDefault();
          email = emailIn.value.trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; return; }
          err.textContent = '';
          busy(btn, true, 'Sending…');
          try {
            await startSignIn(email, [], '');
            stepCode();
          } catch (ex) {
            err.textContent = friendlyError(ex);
          } finally {
            busy(btn, false);
          }
        },
      },
    },
      field('Email', emailIn),
      btn,
      err,
    );
    mount(card,
      h('h2', null, 'Sign in or create your free account'),
      h('p', { class: 'small' }, 'No password. We email you a 6-digit code and a link; use either one.'),
      o.notice ? h('p', { class: 'form-note' }, o.notice) : null,
      o.disabled ? h('p', { class: 'form-note' }, 'Accounts open soon. Below is an example of what My Home looks like.') : null,
      form,
      h('p', { class: 'meta' }, 'New here? Signing in creates your account. Nothing is shared with anyone unless you ask to be matched.'),
    );
  };

  const stepCode = () => {
    const codeIn = h('input', { type: 'text', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9 ]*', maxlength: 12, placeholder: '123456', class: 'code-in' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Sign in');
    const err = h('p', { class: 'form-err', role: 'alert' });
    const resend = h('button', { type: 'button', class: 'linkish', disabled: true }, 'Send a new code (60)');
    let left = 60;
    const t = window.setInterval(() => {
      left -= 1;
      resend.textContent = left > 0 ? `Send a new code (${left})` : 'Send a new code';
      if (left <= 0) { resend.disabled = false; window.clearInterval(t); }
    }, 1000);
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      try { await startSignIn(email, [], ''); toast('New code sent.'); left = 60; stepCode(); } catch (ex) { err.textContent = friendlyError(ex); resend.disabled = false; }
    });
    const form = h('form', {
      novalidate: true,
      on: {
        submit: async (e: Event) => {
          e.preventDefault();
          const code = codeIn.value.replace(/\D/g, '');
          if (code.length < 6) { err.textContent = 'Enter the code from the email.'; return; }
          busy(btn, true, 'Checking…');
          try {
            await verifyCode(email, code);
            window.clearInterval(t);
            readonly = false;
            await afterSignIn(storedClaim()?.key ?? null);
          } catch (ex) {
            err.textContent = friendlyError(ex);
            busy(btn, false);
          }
        },
      },
    },
      field('Code', codeIn, 'Check your inbox (and junk folder). The code expires in one hour.'),
      btn,
      err,
    );
    mount(card,
      h('h2', null, 'Check your email'),
      h('p', { class: 'small' }, 'We sent a sign-in code and link to ', h('strong', null, email), '. Enter the code here, or tap the link in the email on any device.'),
      form,
      h('p', { class: 'small' }, resend, ' · ', h('button', { type: 'button', class: 'linkish', on: { click: () => { window.clearInterval(t); stepEmail(); } } }, 'Use a different email')),
    );
    codeIn.focus();
  };

  stepEmail();

  mount(root,
    h('div', { class: 'acct-hero' },
      h('p', { class: 'eyebrow' }, 'My Home · free'),
      h('h1', null, 'Your home, in one place'),
      h('p', { class: 'lede' }, 'Keep your audit results and test records, track your upgrade plan and deadlines, get rebate alerts for your province, and ask to be matched with an advisor or contractor when you’re ready.'),
    ),
    h('div', { class: 'acct-top' },
      card,
      h('div', { class: 'card card-pad perks' },
        h('h2', null, 'What you get'),
        h('ul', { class: 'perk-list' },
          h('li', null, h('strong', null, 'Your home and its records in one place. '), 'EnerGuide results, radon and water tests, inspection reports and file numbers.'),
          h('li', null, h('strong', null, 'An upgrade plan you can track. '), 'Save the planner’s sequence, add quotes and mark what’s done.'),
          h('li', null, h('strong', null, 'Free alerts, only if you want them. '), 'Rebate changes in your province, your own deadlines and a short monthly checklist.'),
          h('li', null, h('strong', null, 'Matching on request. '), 'Ask for an energy advisor or contractor and we introduce you to one company, never a list.'),
        ),
        h('p', { class: 'meta' }, 'Free. Data stored in Canada. Delete your account any time.'),
      ),
    ),
    h('div', { class: 'preview-head' },
      h('p', { class: 'eyebrow' }, 'Example'),
      h('h2', null, 'Here’s what My Home looks like'),
      h('p', { class: 'small' }, 'This is a made-up house in Ottawa. Sign in to start your own.'),
    ),
    h('div', { class: 'acct-preview', inert: true }, dashboard()),
  );
}

// ---------------------------------------------------------------------------
// signed in
// ---------------------------------------------------------------------------

function render() {
  readonly = false;
  mount(root,
    h('div', { class: 'acct-bar' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'My Home'),
        h('h1', { class: 'acct-hello' }, S.profile.full_name ? `Hi, ${String(S.profile.full_name).split(' ')[0]}` : 'Your home, in one place'),
        h('p', { class: 'small' }, 'Signed in as ', h('strong', null, S.email)),
      ),
      h('div', { class: 'acct-bar-actions' },
        S.profile.is_admin ? h('a', { class: 'btn btn-ghost btn-sm', href: '/account/admin/' }, 'Admin console') : null,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', on: { click: async () => { await signOut(); location.href = '/account/'; } } }, 'Sign out'),
      ),
    ),
    dashboard(),
  );
}

function dashboard() {
  return h('div', { class: 'acct-grid' },
    h('nav', { class: 'acct-nav', 'aria-label': 'My Home sections' },
      h('ul', null, SECTIONS.map(([id, label]) => h('li', null, h('a', { href: `#${id}` }, label)))),
    ),
    h('div', { class: 'acct-main' },
      secOverview(),
      secHome(),
      secRecords(),
      secPlan(),
      secReminders(),
      secAlerts(),
      secMatch(),
      readonly ? null : secAccount(),
    ),
  );
}

function section(id: string, title: string, intro: string | Node | null, ...body: (Node | null | false)[]) {
  return h('section', { class: 'acct-sec', id, 'aria-labelledby': `${id}-h` },
    h('h2', { id: `${id}-h` }, title),
    intro ? (typeof intro === 'string' ? h('p', { class: 'small sec-intro' }, intro) : intro) : null,
    ...body,
  );
}

const currentHome = () => S.homes.find((x) => x.id === S.homeId) ?? S.homes[0] ?? null;

function homeSummary(home: Row | null) {
  if (!home) return '';
  return [
    home.city_name || provinceName(home.province) || formatPostal(home.postal_code),
    homeLabel('era', home.era) && `built ${homeLabel('era', home.era).toLowerCase()}`,
    homeLabel('home_type', home.home_type).toLowerCase(),
    homeLabel('heating', home.heating).toLowerCase(),
  ].filter(Boolean).join(' · ');
}

function plannerLink(home: Row | null) {
  if (!home) return '/plan/';
  if (home.planner_query && String(home.planner_query).startsWith('?')) return `/plan/${home.planner_query}`;
  const p = new URLSearchParams();
  const map: Record<string, string> = { postal_code: 'postal', era: 'age', home_type: 'htype', size_band: 'size', heating: 'heat', heating_age: 'hage', water_heater: 'wh', cooling: 'ac', windows: 'win', prev_audit: 'prev', water_supply: 'water' };
  for (const [k, q] of Object.entries(map)) if (home[k]) p.set(q, String(home[k]));
  if (home.secondary?.length) p.set('sec', home.secondary.join(','));
  return `/plan/?${p.toString()}`;
}

// ----- overview --------------------------------------------------------------

function secOverview() {
  const home = currentHome();
  const needs = S.needs.filter((n) => !home || n.home_id === home.id || !n.home_id);
  const active = needs.filter((n) => n.status !== 'skip');
  const done = active.filter((n) => n.status === 'done').length;
  const next = S.reminders.filter((r) => !r.done && daysUntil(r.due_on) >= 0).sort((a, b) => a.due_on.localeCompare(b.due_on))[0];
  const req = S.requests[0];
  const alertsOn = ALERT_TYPES.filter((a) => S.prefs?.[a.key]).length;
  const month = new Date().getMonth() + 1;
  const checks = checksFor(month, home, S.audits).slice(0, 3);
  const pct = active.length ? Math.round((done / active.length) * 100) : 0;

  return section('overview', 'Overview', null,
    h('div', { class: 'ov-grid' },
      h('a', { class: 'card ov', href: '#home' },
        h('span', { class: 'ov-k' }, 'Your home'),
        h('span', { class: 'ov-v' }, home ? homeSummary(home) || 'Add the details' : 'Add your home'),
        h('span', { class: 'ov-s' }, home ? 'Edit details →' : 'Takes a minute →'),
      ),
      h('a', { class: 'card ov', href: '#plan' },
        h('span', { class: 'ov-k' }, 'Upgrade plan'),
        h('span', { class: 'ov-v' }, active.length ? `${done} of ${active.length} done` : 'No upgrades yet'),
        active.length ? h('span', { class: 'bar', role: 'img', 'aria-label': `${pct}% done` }, h('span', { style: `width:${pct}%` })) : h('span', { class: 'ov-s' }, 'Save one from the planner →'),
      ),
      h('a', { class: 'card ov', href: '#reminders' },
        h('span', { class: 'ov-k' }, 'Next deadline'),
        h('span', { class: 'ov-v' }, next ? next.title : 'Nothing coming up'),
        h('span', { class: 'ov-s' }, next ? `${fmtDate(next.due_on)} · ${dueText(next.due_on)}` : 'Add a reminder →'),
      ),
      h('a', { class: 'card ov', href: '#match' },
        h('span', { class: 'ov-k' }, 'Matching'),
        h('span', { class: 'ov-v' }, req ? serviceLabel(req.service) : 'Need an advisor or contractor?'),
        req ? chip(REQUEST_STATUS[req.status]?.label ?? req.status, REQUEST_STATUS[req.status]?.tone ?? 'neutral') : h('span', { class: 'ov-s' }, 'Ask to be matched →'),
      ),
      h('a', { class: 'card ov', href: '#records' },
        h('span', { class: 'ov-k' }, 'Audits and tests'),
        h('span', { class: 'ov-v' }, S.audits.length ? `${S.audits.length} on file` : 'None yet'),
        h('span', { class: 'ov-s' }, S.audits.length ? `Latest: ${auditLabel(S.audits[0].kind).replace(/ \(.*\)$/, '')} →` : 'Add an EnerGuide or test result →'),
      ),
      h('a', { class: 'card ov', href: '#alerts' },
        h('span', { class: 'ov-k' }, 'Alerts'),
        h('span', { class: 'ov-v' }, alertsOn ? `${alertsOn} of 3 on` : 'Off'),
        h('span', { class: 'ov-s' }, alertsOn ? 'Change →' : 'Turn on free alerts →'),
      ),
    ),
    checks.length ? h('div', { class: 'card card-pad month' },
      h('h3', null, `Checks for ${new Date().toLocaleDateString('en-CA', { month: 'long' })}`),
      h('ul', { class: 'checks' }, checks.map((c) => h('li', null,
        h('strong', null, c.title), ' ', h('span', { class: 'small' }, c.body), ' ',
        c.link ? h('a', { href: c.link }, 'How →') : null,
      ))),
      h('p', { class: 'meta' }, 'Sources: ', [...new Set(checks.map((c) => c.source.name))].join(', ')),
    ) : null,
  );
}

function dueText(d: string) {
  const n = daysUntil(d);
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} ago`;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

// ----- home -----------------------------------------------------------------

function secHome() {
  const home = currentHome();
  const v = (k: string) => (home ? home[k] : null);
  const postal = input('postal_code', formatPostal(v('postal_code')), { autocomplete: 'postal-code', maxlength: 7, placeholder: 'K1A 0B1' });
  const prov = select('province', PROVINCES, v('province'), 'Choose…');
  const city = h('select', { name: 'city_slug' });
  const fillCities = () => {
    const p = (prov as HTMLSelectElement).value;
    const list = CITIES.filter((c) => !p || c.prov === p);
    mount(city, h('option', { value: '' }, list.length ? 'Nearest city (optional)' : 'No cities listed'), list.map((c) => h('option', { value: c.slug, selected: c.slug === v('city_slug') }, c.name)));
  };
  fillCities();
  prov.addEventListener('change', fillCities);
  postal.addEventListener('change', () => {
    const p = provinceFromPostal((postal as HTMLInputElement).value);
    if (p && (prov as HTMLSelectElement).value !== p) { (prov as HTMLSelectElement).value = p; fillCities(); }
  });
  const sel = (k: keyof typeof HOME_OPTIONS) => select(k, HOME_OPTIONS[k], v(k), 'Choose…');
  const sec = (val: string, label: string) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'secondary', value: val, checked: (v('secondary') ?? []).includes(val) }), ' ', label);
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, home ? 'Save home' : 'Add my home');

  const form = h('form', {
    class: 'card card-pad',
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        if (readonly) return;
        const f = formData(e.target as HTMLFormElement);
        const citySlug = String(f.city_slug || '');
        const row: Row = {
          label: String(f.label || '').trim() || null,
          postal_code: cleanPostal(String(f.postal_code || '')) || null,
          province: String(f.province || '') || provinceFromPostal(String(f.postal_code || '')) || null,
          city_slug: citySlug || null,
          city_name: CITIES.find((c) => c.slug === citySlug)?.name ?? null,
          notes: String(f.notes || '').trim() || null,
          secondary: Array.isArray(f.secondary) ? f.secondary : f.secondary ? [f.secondary] : [],
        };
        for (const k of Object.keys(HOME_OPTIONS)) row[k] = String(f[k] || '') || null;
        busy(saveBtn, true, 'Saving…');
        const { error } = home
          ? await sb().from('homes').update(row).eq('id', home.id)
          : await sb().from('homes').insert(row);
        busy(saveBtn, false);
        if (error) { toast(friendlyError(error), 'err'); return; }
        toast('Home saved.');
        await reload('home');
      },
    },
  },
    S.homes.length > 1 ? field('Which home', h('select', {
      on: { change: (e: Event) => { S.homeId = (e.target as HTMLSelectElement).value; render(); document.getElementById('home')?.scrollIntoView(); } },
    }, S.homes.map((x) => h('option', { value: x.id, selected: x.id === S.homeId }, x.label || x.city_name || formatPostal(x.postal_code) || 'Home')))) : null,
    h('div', { class: 'grid-3' },
      field('Name for this home', input('label', v('label'), { placeholder: 'Our house', maxlength: 80 })),
      field('Postal code', postal),
      field('Province', prov),
    ),
    h('div', { class: 'grid-3' },
      field('Nearest city', city, 'Sets your climate and local prices.'),
      field('Built', sel('era')),
      field('Type', sel('home_type')),
    ),
    h('div', { class: 'grid-3' },
      field('Size (above the basement)', sel('size_band')),
      field('Main heating', sel('heating')),
      field('Heating system age', sel('heating_age')),
    ),
    h('div', { class: 'grid-3' },
      field('Water heater', sel('water_heater')),
      field('Cooling', sel('cooling')),
      field('Windows', sel('windows')),
    ),
    h('div', { class: 'grid-3' },
      field('Water supply', sel('water_supply')),
      field('Had an energy audit?', sel('prev_audit')),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Also heats with'), h('div', { class: 'checks-row' }, sec('woodstove', 'Wood stove'), sec('spaceheaters', 'Space heaters'), sec('solar', 'Lots of sun'))),
    ),
    field('Notes', textarea('notes', v('notes'), { maxlength: 2000, placeholder: 'Anything you want to remember: renovations, quirks, contractor names…' })),
    h('div', { class: 'row-actions' },
      saveBtn,
      home ? h('a', { class: 'btn btn-ghost', href: plannerLink(home) }, 'Open the planner with these answers') : h('a', { class: 'btn btn-ghost', href: '/plan/' }, 'Or start with the planner'),
      home && !readonly ? h('button', { type: 'button', class: 'linkish', on: { click: async () => {
        const label = prompt('Name for the new home (e.g. "Cottage")', 'Cottage');
        if (label === null) return;
        const { data, error } = await sb().from('homes').insert({ label: label.slice(0, 80) || null }).select('id').single();
        if (error) { toast(friendlyError(error), 'err'); return; }
        S.homeId = (data as Row).id;
        await reload('home');
      } } }, '+ Add another home') : null,
    ),
  );
  return section('home', 'My home', 'The basics of your house. They tailor your plan, your monthly checks and the programs we show you.', form);
}

// ----- records ----------------------------------------------------------------

function secRecords() {
  const home = currentHome();
  const list = S.audits.filter((a) => !home || !a.home_id || a.home_id === home.id);
  const kindSel = select('kind', AUDIT_KINDS, 'energuide-pre');
  const gj = input('rating_gj', '', { inputmode: 'decimal', placeholder: 'e.g. 145' });
  const bq = input('radon_bq', '', { inputmode: 'decimal', placeholder: 'e.g. 180' });
  const gjField = field('EnerGuide rating (GJ per year)', gj, 'On the first page of your EnerGuide label.');
  const bqField = field('Radon level (Bq/m³)', bq, 'Health Canada’s guideline is 200 Bq/m³.');
  const sync = () => {
    const k = AUDIT_KINDS.find((x) => x.value === (kindSel as HTMLSelectElement).value);
    gjField.hidden = k?.field !== 'rating_gj';
    bqField.hidden = k?.field !== 'radon_bq';
  };
  kindSel.addEventListener('change', sync);
  sync();
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add record');
  const addForm = h('form', {
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        if (readonly) return;
        const f = formData(e.target as HTMLFormElement);
        const num = (x: unknown) => { const n = parseFloat(String(x ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
        const row: Row = {
          home_id: home?.id ?? null,
          kind: f.kind,
          done_on: f.done_on || null,
          company: String(f.company || '').trim() || null,
          result: String(f.result || '').trim() || null,
          rating_gj: gjField.hidden ? null : num(f.rating_gj),
          radon_bq: bqField.hidden ? null : num(f.radon_bq),
          file_ref: String(f.file_ref || '').trim() || null,
          notes: String(f.notes || '').trim() || null,
        };
        busy(btn, true, 'Saving…');
        const { error } = await sb().from('audits').insert(row);
        busy(btn, false);
        if (error) { toast(friendlyError(error), 'err'); return; }
        toast('Record added.');
        await reload('records');
      },
    },
  },
    h('div', { class: 'grid-3' }, field('Type', kindSel), field('Date', h('input', { type: 'date', name: 'done_on' })), field('Company or advisor', input('company', '', { maxlength: 120 }))),
    h('div', { class: 'grid-3' }, gjField, bqField, field('Result in a few words', input('result', '', { maxlength: 200, placeholder: 'e.g. 4.2 ACH50, or no bacteria found' })), field('File or report number', input('file_ref', '', { maxlength: 60 }))),
    field('Notes', textarea('notes', '', { maxlength: 2000 })),
    btn,
  );

  const items = list.map((a) => {
    const insights: Node[] = [];
    if (a.kind === 'radon-test' && a.radon_bq !== null && a.radon_bq !== undefined) {
      if (Number(a.radon_bq) > 200) insights.push(h('p', { class: 'insight warn' }, `${a.radon_bq} Bq/m³ is above Health Canada’s 200 Bq/m³ guideline. Health Canada recommends fixing it within a year, sooner the higher it is. `, h('a', { href: '/tests/radon/' }, 'Radon mitigation →')));
      else insights.push(h('p', { class: 'insight ok' }, `Below Health Canada’s 200 Bq/m³ guideline. Retest after major renovations.`));
    }
    if (a.kind === 'energuide-pre' && !S.audits.some((x) => x.kind === 'energuide-post')) {
      insights.push(h('p', { class: 'insight' }, 'Most rebates pay out after a follow-up (post-retrofit) evaluation. ',
        readonly ? null : h('button', { type: 'button', class: 'linkish', on: { click: () => prefillReminder('Book the follow-up EnerGuide evaluation', 'post-evaluation') } }, 'Add a reminder for it')));
    }
    return h('li', { class: 'card rec' },
      h('div', { class: 'rec-head' },
        h('h3', null, auditLabel(a.kind)),
        h('span', { class: 'meta' }, a.done_on ? fmtDate(a.done_on) : 'No date'),
      ),
      h('p', { class: 'rec-body' },
        [a.company, a.rating_gj !== null && a.rating_gj !== undefined ? `${a.rating_gj} GJ/year` : null, a.radon_bq !== null && a.radon_bq !== undefined ? `${a.radon_bq} Bq/m³` : null, a.result, a.file_ref ? `File ${a.file_ref}` : null].filter(Boolean).join(' · ') || '—',
      ),
      a.notes ? h('p', { class: 'small' }, a.notes) : null,
      ...insights,
      readonly ? null : h('div', { class: 'rec-actions' }, h('button', { type: 'button', class: 'linkish danger', on: { click: async () => {
        if (!confirm('Delete this record?')) return;
        const { error } = await sb().from('audits').delete().eq('id', a.id);
        if (error) toast(friendlyError(error), 'err'); else { toast('Deleted.'); await reload('records'); }
      } } }, 'Delete')),
    );
  });

  return section('records', 'Audits and tests', 'Keep your EnerGuide results, test results and file numbers where you can find them. An older audit is still useful: it shows what an advisor found and what changed since.',
    list.length ? h('ul', { class: 'rec-list' }, items) : h('p', { class: 'empty' }, 'No records yet.'),
    readonly ? null : h('details', { class: 'card card-pad add' }, h('summary', null, 'Add a record'), addForm),
  );
}

// ----- plan -----------------------------------------------------------------

function secPlan() {
  const home = currentHome();
  const order = ['todo', 'quotes', 'booked', 'done', 'skip'];
  const list = S.needs.filter((n) => !home || !n.home_id || n.home_id === home.id)
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.priority ?? 99) - (b.priority ?? 99));
  const open = list.filter((n) => n.status !== 'done' && n.status !== 'skip');
  const lo = open.reduce((s, n) => s + (n.cost_low ?? 0), 0);
  const hi = open.reduce((s, n) => s + (n.cost_high ?? 0), 0);
  const sav = list.filter((n) => n.status !== 'skip').reduce((s, n) => s + Math.max(0, n.saving_year ?? 0), 0);

  const rows = list.map((n) => {
    const st = select('status', NEED_STATUS, n.status);
    st.setAttribute('aria-label', `Status of ${n.title}`);
    st.addEventListener('change', async () => {
      const status = (st as HTMLSelectElement).value;
      const { error } = await sb().from('needs').update({ status, done_on: status === 'done' ? new Date().toISOString().slice(0, 10) : null }).eq('id', n.id);
      if (error) toast(friendlyError(error), 'err'); else { toast('Updated.'); await reload(); }
    });
    return h('li', { class: `card need st-${n.status}` },
      h('div', { class: 'need-main' },
        h('h3', null, n.title),
        h('p', { class: 'need-nums' },
          n.cost_low || n.cost_high ? h('span', null, `Typical cost ${money(n.cost_low)}–${money(n.cost_high)}`) : null,
          n.saving_year && n.saving_year > 0 ? h('span', { class: 'save' }, `about ${money(n.saving_year)}/yr`) : null,
          n.rebate ? chip(n.rebate, 'active') : null,
          n.source === 'planner' ? chip('From the planner', 'neutral') : null,
        ),
        n.notes ? h('p', { class: 'small' }, n.notes) : null,
      ),
      h('div', { class: 'need-side' },
        st,
        readonly ? null : h('button', { type: 'button', class: 'linkish danger', on: { click: async () => {
          if (!confirm(`Remove “${n.title}” from your plan?`)) return;
          const { error } = await sb().from('needs').delete().eq('id', n.id);
          if (error) toast(friendlyError(error), 'err'); else await reload('plan');
        } } }, 'Remove'),
      ),
    );
  });

  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add to plan');
  const addForm = h('form', {
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        if (readonly) return;
        const f = formData(e.target as HTMLFormElement);
        const int = (x: unknown) => { const n = parseInt(String(x ?? '').replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : null; };
        const title = String(f.title || '').trim();
        if (!title) { toast('Give the upgrade a name.', 'err'); return; }
        busy(btn, true, 'Saving…');
        const { error } = await sb().from('needs').insert({
          home_id: home?.id ?? null, title, category: f.category || null, status: 'todo',
          cost_low: int(f.cost_low), cost_high: int(f.cost_high), notes: String(f.notes || '').trim() || null, source: 'manual',
          priority: Math.min(99, list.length + 1),
        });
        busy(btn, false);
        if (error) { toast(friendlyError(error), 'err'); return; }
        await reload('plan');
      },
    },
  },
    h('div', { class: 'grid-3' }, field('Upgrade', input('title', '', { maxlength: 140, placeholder: 'e.g. Insulate the rim joists' })), field('Category', select('category', NEED_CATEGORIES, 'other')), field('Quote or budget ($)', h('div', { class: 'pair' }, input('cost_low', '', { inputmode: 'numeric', placeholder: 'low', 'aria-label': 'Low' }), input('cost_high', '', { inputmode: 'numeric', placeholder: 'high', 'aria-label': 'High' })))),
    field('Notes', textarea('notes', '', { maxlength: 2000 })),
    btn,
  );

  return section('plan', 'Upgrade plan', h('p', { class: 'small sec-intro' }, 'Your upgrades in a sensible order. Save a plan from the ', h('a', { href: plannerLink(home) }, 'Home Energy Planner'), ' or add your own, then track quotes and what’s done.'),
    list.length ? h('div', { class: 'plan-sum' },
      h('span', null, h('strong', null, `${list.filter((n) => n.status === 'done').length}`), ' done'),
      open.length && (lo || hi) ? h('span', null, 'Still to do: ', h('strong', null, `${money(lo)}–${money(hi)}`)) : null,
      sav ? h('span', null, 'Estimated savings when finished: ', h('strong', null, `about ${money(sav * 0.8)}/yr`)) : null,
    ) : null,
    list.length ? h('ul', { class: 'need-list' }, rows) : h('p', { class: 'empty' }, 'No upgrades yet. ', h('a', { href: plannerLink(home) }, 'Run the planner'), ' and choose “Save this plan” at the end.'),
    sav ? h('p', { class: 'meta' }, 'Savings overlap (once the attic is done there is less heat left to save elsewhere), so the total is trimmed by 20%.') : null,
    readonly ? null : h('details', { class: 'card card-pad add' }, h('summary', null, 'Add an upgrade'), addForm),
  );
}

// ----- reminders ----------------------------------------------------------------

function prefillReminder(title: string, kind: string) {
  const d = document.querySelector<HTMLDetailsElement>('#reminders details.add');
  if (!d) return;
  d.open = true;
  const t = d.querySelector<HTMLInputElement>('input[name=title]');
  const k = d.querySelector<HTMLSelectElement>('select[name=kind]');
  if (t) t.value = title;
  if (k) k.value = kind;
  document.getElementById('reminders')?.scrollIntoView({ block: 'start' });
  d.querySelector<HTMLInputElement>('input[name=due_on]')?.focus();
}

function secReminders() {
  const list = [...S.reminders].sort((a, b) => Number(a.done) - Number(b.done) || a.due_on.localeCompare(b.due_on));
  const on = Boolean(S.prefs?.deadline_reminders);
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add reminder');
  const addForm = h('form', {
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        if (readonly) return;
        const f = formData(e.target as HTMLFormElement);
        if (!f.title || !f.due_on) { toast('Add a title and a date.', 'err'); return; }
        busy(btn, true, 'Saving…');
        const { error } = await sb().from('reminders').insert({ title: String(f.title).trim(), due_on: f.due_on, kind: f.kind || 'custom', notes: String(f.notes || '').trim() || null, home_id: currentHome()?.id ?? null });
        busy(btn, false);
        if (error) { toast(friendlyError(error), 'err'); return; }
        toast('Reminder added.');
        await reload('reminders');
      },
    },
  },
    h('div', { class: 'grid-3' }, field('What', input('title', '', { maxlength: 140, placeholder: 'e.g. Rebate claim due' })), field('Date', h('input', { type: 'date', name: 'due_on', required: true })), field('Type', select('kind', REMINDER_KINDS, 'custom'))),
    field('Notes', input('notes', '', { maxlength: 1000 })),
    btn,
  );
  return section('reminders', 'Reminders', on
    ? 'We’ll email you 30, 7 and 1 day before each date.'
    : h('p', { class: 'small sec-intro' }, 'Keep track of rebate and evaluation deadlines. ', h('a', { href: '#alerts' }, 'Turn on deadline emails'), ' and we’ll remind you 30, 7 and 1 day before.'),
    list.length ? h('ul', { class: 'rem-list' }, list.map((r) => {
      const n = daysUntil(r.due_on);
      return h('li', { class: `card rem ${r.done ? 'is-done' : n < 0 ? 'is-late' : n <= 7 ? 'is-soon' : ''}` },
        h('label', { class: 'rem-check' },
          h('input', { type: 'checkbox', checked: r.done, 'aria-label': `Mark “${r.title}” done`, on: { change: async (e: Event) => {
            const { error } = await sb().from('reminders').update({ done: (e.target as HTMLInputElement).checked }).eq('id', r.id);
            if (error) toast(friendlyError(error), 'err'); else await reload();
          } } }),
        ),
        h('div', { class: 'rem-main' },
          h('h3', null, r.title),
          h('p', { class: 'small' }, `${fmtDate(r.due_on)} · ${r.done ? 'done' : dueText(r.due_on)}`, r.notes ? ` · ${r.notes}` : ''),
        ),
        readonly ? null : h('button', { type: 'button', class: 'linkish danger', on: { click: async () => {
          const { error } = await sb().from('reminders').delete().eq('id', r.id);
          if (error) toast(friendlyError(error), 'err'); else await reload('reminders');
        } } }, 'Delete'),
      );
    })) : h('p', { class: 'empty' }, 'No reminders yet.'),
    readonly ? null : h('details', { class: 'card card-pad add' }, h('summary', null, 'Add a reminder'), addForm),
  );
}

// ----- alerts ---------------------------------------------------------------------

function myProvinces(): string[] {
  const set = new Set<string>([...(S.prefs?.provinces ?? []), ...S.homes.map((x) => x.province).filter(Boolean)]);
  return [...set];
}

function secAlerts() {
  const provs = myProvinces();
  const consent = h('p', { class: 'consent-text' });
  const boxes = ALERT_TYPES.map((a) => h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', name: 'alert', value: a.key, checked: Boolean(S.prefs?.[a.key]) }),
    h('span', { class: 'tg-text' }, h('strong', null, a.label), h('span', { class: 'small' }, a.hint)),
  ));
  const provBoxes = h('div', { class: 'prov-chips' }, PROVINCES.map((p) => h('label', { class: 'pchip' },
    h('input', { type: 'checkbox', name: 'prov', value: p.value, checked: provs.includes(p.value) }),
    h('span', null, p.value),
  )));
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save alert settings');
  const form = h('form', {
    class: 'card card-pad',
    on: {
      change: () => updateConsent(),
      submit: async (e: Event) => {
        e.preventDefault();
        if (readonly) return;
        const f = e.target as HTMLFormElement;
        const kinds = [...f.querySelectorAll<HTMLInputElement>('input[name=alert]:checked')].map((i) => i.value);
        const prov = [...f.querySelectorAll<HTMLInputElement>('input[name=prov]:checked')].map((i) => i.value);
        if (kinds.includes('program_updates') && !prov.length) { toast('Pick at least one province for program changes.', 'err'); return; }
        busy(btn, true, 'Saving…');
        try {
          await rpc('set_alert_prefs', {
            p_program_updates: kinds.includes('program_updates'),
            p_deadline_reminders: kinds.includes('deadline_reminders'),
            p_seasonal_checks: kinds.includes('seasonal_checks'),
            p_provinces: prov,
            p_consent_text: kinds.length ? alertConsentText(kinds) : null,
          });
          toast(kinds.length ? 'Alerts saved.' : 'All alerts are off.');
          await reload('alerts');
        } catch (ex) {
          toast(friendlyError(ex), 'err');
        } finally {
          busy(btn, false);
        }
      },
    },
  },
    h('fieldset', null, h('legend', null, 'Email me'), boxes),
    h('fieldset', null, h('legend', null, 'Provinces for program changes'), provBoxes),
    consent,
    btn,
    S.prefs?.consent_at ? h('p', { class: 'meta' }, `Consent recorded ${fmtDate(S.prefs.consent_at)}.${S.prefs.unsubscribed_at ? ` Unsubscribed ${fmtDate(S.prefs.unsubscribed_at)}.` : ''}`) : null,
  );
  function updateConsent() {
    const kinds = [...form.querySelectorAll<HTMLInputElement>('input[name=alert]:checked')].map((i) => i.value as AlertKey);
    consent.textContent = kinds.length ? `By saving, you agree: “${alertConsentText(kinds)}”` : 'All alerts are off. We only email you about requests you make.';
  }
  updateConsent();

  // Program changes feed: site updates + anything an admin posted
  const fromDb = S.updates.map((u) => ({ key: u.slug || u.id, date: String(u.published_at).slice(0, 10), provinces: u.provinces ?? [], title: u.title, summary: u.summary, url: u.url }));
  const fromSite = SITE_UPDATES.map((u) => ({ key: u.slug, date: u.date, provinces: u.provinces, title: u.title, summary: u.summary, url: u.url }));
  const seen = new Set<string>();
  const feed = [...fromDb, ...fromSite]
    .filter((u) => { if (seen.has(u.key)) return false; seen.add(u.key); return true; })
    .filter((u) => !provs.length || !u.provinces.length || u.provinces.some((p) => provs.includes(p)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return section('alerts', 'Alerts', 'Free, and off until you turn them on. Every email has a one-click unsubscribe link.',
    form,
    feed.length ? h('div', { class: 'feed' },
      h('h3', null, provs.length ? `Recent program changes for ${provs.map(provinceName).join(', ')}` : 'Recent program changes'),
      h('ul', null, feed.map((u) => h('li', null,
        h('span', { class: 'meta' }, fmtDate(u.date)), ' ',
        u.url ? h('a', { href: u.url }, u.title) : h('strong', null, u.title),
        h('p', { class: 'small' }, u.summary),
      ))),
      h('p', { class: 'small' }, h('a', { href: '/updates/' }, 'All program changes →')),
    ) : null,
  );
}

// ----- matching -------------------------------------------------------------------

function secMatch() {
  const home = currentHome();
  const svc = select('service', SERVICES, 'energy-audit');
  const hint = h('p', { class: 'hint' });
  const syncHint = () => {
    const s = SERVICES.find((x) => x.value === (svc as HTMLSelectElement).value);
    mount(hint, s ? `We’ll introduce you to ${s.who}. ` : '', s?.guide ? h('a', { href: s.guide }, 'What to expect →') : null);
  };
  svc.addEventListener('change', syncHint);
  syncHint();
  const phone = input('phone', S.profile.phone ?? '', { type: 'tel', autocomplete: 'tel', maxlength: 40 });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send my request');
  const err = h('p', { class: 'form-err', role: 'alert' });
  const form = h('form', {
    class: 'card card-pad',
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        if (readonly) return;
        const f = formData(e.target as HTMLFormElement);
        if (f.consent !== 'yes') { err.textContent = 'Please tick the box so we can share your request with one company.'; return; }
        if (f.contact_pref === 'phone' && !String(f.phone || '').trim()) { err.textContent = 'Add a phone number, or choose email.'; return; }
        err.textContent = '';
        busy(btn, true, 'Sending…');
        try {
          await rpc('create_match_request', { p: {
            service: f.service, timeline: f.timeline, building: f.building, details: String(f.details || '').trim(),
            contact_pref: f.contact_pref, phone: String(f.phone || '').trim(), name: S.profile.full_name || '',
            postal: home?.postal_code || '', province: home?.province || '', city_slug: home?.city_slug || '',
            consent: 'true', consent_text: MATCH_CONSENT,
          } });
          toast('Request sent.');
          await reload('match');
        } catch (ex) {
          err.textContent = friendlyError(ex);
        } finally {
          busy(btn, false);
        }
      },
    },
  },
    h('div', { class: 'grid-3' }, field('What do you need?', svc), field('When', select('timeline', TIMELINES, '1-3-months')), field('Building', select('building', BUILDINGS, home?.home_type === 'condo' ? 'condo-unit' : 'house'))),
    hint,
    field('Anything they should know?', textarea('details', '', { maxlength: 2000, placeholder: 'e.g. Drafty 1968 backsplit, want the HRSP rebates, home weekdays after 4' })),
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Best way to reach you'), h('div', { class: 'radio-row' },
        h('label', { class: 'radio-pill' }, h('input', { type: 'radio', name: 'contact_pref', value: 'email', checked: true }), h('span', null, 'Email')),
        h('label', { class: 'radio-pill' }, h('input', { type: 'radio', name: 'contact_pref', value: 'phone' }), h('span', null, 'Phone')),
      )),
      field('Phone (optional)', phone),
    ),
    h('label', { class: 'check consent' }, h('input', { type: 'checkbox', name: 'consent', value: 'yes' }), ' ', MATCH_CONSENT),
    home ? h('p', { class: 'meta' }, `We’ll include your home details (${homeSummary(home) || 'as saved'}) so they arrive prepared.`) : h('p', { class: 'meta' }, h('a', { href: '#home' }, 'Add your home'), ' first so the company knows what to expect.'),
    btn,
    err,
  );

  return section('match', 'Get matched', 'Tell us what you need. We review every request and introduce you to one company that serves your area: no lists, no bidding war.',
    S.requests.length ? h('ul', { class: 'req-list' }, S.requests.map((r) => {
      const st = REQUEST_STATUS[r.status] ?? { label: r.status, tone: 'neutral', hint: '' };
      return h('li', { class: 'card req' },
        h('div', { class: 'req-head' }, h('h3', null, serviceLabel(r.service)), chip(st.label, st.tone)),
        h('p', { class: 'small' }, `Sent ${fmtDate(r.created_at)} · ${st.hint}`),
        r.matched_company ? h('p', { class: 'req-match' }, h('strong', null, r.matched_company), r.matched_contact ? ` · ${r.matched_contact}` : '') : null,
        r.homeowner_note ? h('p', { class: 'req-note' }, r.homeowner_note) : null,
        r.details ? h('p', { class: 'small muted' }, `“${r.details}”`) : null,
        !readonly && (r.status === 'new' || r.status === 'reviewing') ? h('button', { type: 'button', class: 'linkish danger', on: { click: async () => {
          if (!confirm('Cancel this request?')) return;
          try { await rpc('cancel_match_request', { p_id: r.id }); toast('Request cancelled.'); await reload('match'); } catch (ex) { toast(friendlyError(ex), 'err'); }
        } } }, 'Cancel request') : null,
      );
    })) : null,
    form,
  );
}

// ----- account ----------------------------------------------------------------------

function secAccount() {
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save');
  const form = h('form', {
    class: 'card card-pad',
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        const f = formData(e.target as HTMLFormElement);
        busy(btn, true, 'Saving…');
        const { error } = await sb().from('profiles').update({ full_name: String(f.full_name || '').trim() || null, phone: String(f.phone || '').trim() || null }).eq('id', S.uid);
        busy(btn, false);
        if (error) toast(friendlyError(error), 'err'); else { toast('Saved.'); await reload('account'); }
      },
    },
  },
    h('div', { class: 'grid-3' },
      field('Name', input('full_name', S.profile.full_name, { autocomplete: 'name', maxlength: 120 })),
      field('Phone', input('phone', S.profile.phone, { type: 'tel', autocomplete: 'tel', maxlength: 40 })),
      field('Email', input('email', S.email, { disabled: true }), 'To change it, email us.'),
    ),
    btn,
  );
  const exportBtn = h('button', { class: 'btn btn-ghost', type: 'button', on: { click: () => {
    const { demo: _d, ...data } = S;
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'audityourhome-my-data.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  } } }, 'Download my data');
  const delBtn = h('button', { class: 'btn btn-danger', type: 'button', on: { click: async () => {
    const typed = prompt('This permanently deletes your account, your home details, records, plan, reminders and match requests. Type DELETE to confirm.');
    if (typed !== 'DELETE') return;
    busy(delBtn as HTMLButtonElement, true, 'Deleting…');
    try {
      await rpc('delete_my_account');
      await signOut().catch(() => undefined);
      mount(root, h('div', { class: 'card card-pad' }, h('h2', null, 'Your account is deleted'), h('p', null, 'Everything we held for it is gone. Thanks for trying AuditYourHome.'), h('a', { class: 'btn btn-ghost', href: '/' }, 'Back to the home page')));
    } catch (ex) {
      toast(friendlyError(ex), 'err');
      busy(delBtn as HTMLButtonElement, false);
    }
  } } }, 'Delete my account');
  return section('account', 'Account', null,
    form,
    h('div', { class: 'card card-pad acct-data' },
      h('h3', null, 'Your data'),
      h('p', { class: 'small' }, 'Stored in Canada. Only you can see it, unless you ask to be matched: then the people who arrange the match see your request and home details. ', h('a', { href: '/privacy/' }, 'Privacy details →')),
      h('div', { class: 'row-actions' }, exportBtn, delBtn),
    ),
  );
}
