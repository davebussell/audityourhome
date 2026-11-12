// Auto-reply and routing for AuditYourHome's three sites. Pure functions: no network, so they can be tested.
// netlify/functions/submission-created.mjs calls plan() and sends what it returns through Resend.

import { PARTNERS } from './partners.mjs';

export const SITES = {
  'audityourhome.ca': {
    key: 'ca', live: true, brand: 'AuditYourHome', url: 'https://audityourhome.ca',
    from: 'AuditYourHome <hello@audityourhome.ca>',
  },
  // Not live until their domains are verified in Resend (needs the paid plan): plan() returns nothing for them.
  'audityourhome.com': {
    key: 'us', live: false, brand: 'AuditYourHome', url: 'https://audityourhome.com',
    from: 'AuditYourHome <hello@audityourhome.com>',
  },
  'audityourbuilding.com': {
    key: 'bu', live: false, brand: 'AuditYourBuilding', url: 'https://audityourbuilding.com',
    from: 'AuditYourBuilding <hello@audityourbuilding.com>',
  },
};

export const REPLY_TO = 'dave@clickshift.ca';
export const SIGNOFF = 'Dave Bussell';
const FORMS = ['audit-request', 'heat-pump-quote', 'us-question', 'building-audit-request'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const firstName = (name) => clean(name, 80).split(/\s+/)[0] || '';
// What each service's company is called (mirrors `who` in SERVICES, src/lib/account/catalog.ts).
const WHO = {
  'energy-audit': 'registered energy advisor',
  insulation: 'insulation or air-sealing contractor',
  'heat-pump': 'heating and cooling contractor',
  'windows-doors': 'window and door installer',
  'water-heater': 'plumbing or water heater contractor',
  ventilation: 'ventilation contractor',
  radon: 'C-NRPP certified radon professional',
  'mould-air': 'indoor air quality investigator',
  'wood-stove': 'WETT-certified inspector',
  'well-water': 'water treatment specialist',
  'asbestos-lead': 'hazardous materials testing firm',
};
const CONTEXT_SERVICE = [
  [/energy-audit|energuide|provider-/, 'energy-audit'],
  [/lead-paint|asbestos|vermiculite/, 'asbestos-lead'],
  [/radon/, 'radon'],
  [/mou?ld|air-quality|iaq/, 'mould-air'],
  [/heat-pump|furnace|air-condition/, 'heat-pump'],
  [/insulation|air-seal/, 'insulation'],
  [/window|door/, 'windows-doors'],
  [/water-heater/, 'water-heater'],
  [/ventilation|hrv|erv/, 'ventilation'],
  [/wood|wett|stove/, 'wood-stove'],
  [/well-water|well/, 'well-water'],
];
/** The service a request is about: the form's `service` field, else read from its `context` (e.g. svc-lead-paint-testing-peterborough). */
export function serviceOf(form, data) {
  if (form === 'heat-pump-quote') return 'heat-pump';
  if (form === 'building-audit-request') return 'building';
  const s = clean(data.service);
  if (WHO[s] || s === 'other') return s;
  const c = clean(data.context).toLowerCase();
  for (const [re, v] of CONTEXT_SERVICE) if (re.test(c)) return v;
  return c && !c.startsWith('fr-') ? 'other' : 'energy-audit';
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function siteFor(siteUrl) {
  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./, '');
    return SITES[host] ?? null;
  } catch {
    return null;
  }
}

export function isFrench(data) {
  return clean(data.context).startsWith('fr-') || /^Demande d/i.test(clean(data.subject)) || clean(data.langue) === 'fr';
}

/** The one agreed partner for this request, or null. */
export function matchPartner(siteKey, form, data, partners = PARTNERS) {
  const postal = clean(data.postal || data.zip, 12).toUpperCase().replace(/\s+/g, '');
  const region = clean(data.region || data.area || data.province, 40).toLowerCase();
  return (
    partners.find(
      (p) =>
        p.agreed &&
        EMAIL.test(p.email || '') &&
        p.site === siteKey &&
        (p.forms || []).includes(form) &&
        (!(p.services || []).length || p.services.includes(serviceOf(form, data))) &&
        (((p.postal || []).length && postal && p.postal.some((x) => postal.startsWith(String(x).toUpperCase()))) ||
          ((p.regions || []).length && region && p.regions.map((r) => String(r).toLowerCase()).includes(region))),
    ) ?? null
  );
}

function render(paragraphs, brand, url) {
  const text = paragraphs.join('\n\n');
  const html =
    `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1d2a24;max-width:560px">` +
    paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('') +
    `<p style="margin:18px 0 0;font-size:13px;color:#5b6b63"><a href="${url}" style="color:#5b6b63">${esc(brand)}</a></p></div>`;
  return { text, html };
}

function homeownerMessage(site, form, data, partner) {
  const fr = isFrench(data);
  const hi = firstName(data.name);
  const where = clean(data.postal || data.zip, 12).toUpperCase();
  if (fr) {
    const ea = serviceOf(form, data) === 'energy-audit';
    const aOrg = ea ? 'un organisme de conseillers en efficacité énergétique' : 'une entreprise qualifiée';
    const oneOrg = ea ? 'un seul organisme de conseillers en efficacité énergétique' : 'une seule entreprise qualifiée';
    const p = [
      hi ? `Bonjour ${hi},` : 'Bonjour,',
      "Merci pour votre demande sur AuditYourHome.ca. Nous l'avons bien reçue.",
      partner
        ? `Nous l'avons transmise à ${partner.name}, ${aOrg} qui dessert votre secteur. C'est la seule entreprise qui la voit. Ils vous contacteront pour prendre rendez-vous, habituellement en un jour ouvrable.`
        : `Prochaine étape : nous la transmettons à ${oneOrg} qui dessert votre secteur (c'est la seule entreprise qui la voit), habituellement en un jour ouvrable. Nous vous écrirons pour vous dire de qui il s'agit.`,
      `En attendant, votre plan gratuit : ${site.url}/fr/planificateur/`,
      "Si quelque chose change, répondez simplement à ce courriel.",
      `${SIGNOFF}\nAuditYourHome.ca`,
    ];
    return { subject: 'Nous avons bien reçu votre demande', ...render(p, site.brand, site.url) };
  }

  const opener = hi ? `Hi ${hi},` : 'Hi,';
  if (form === 'us-question') {
    const p = [
      opener,
      `Thanks for your question through ${site.brand}. We read every one ourselves and will reply within one business day.`,
      `In the meantime, your free plan is here: ${site.url}/plan/`,
      `${SIGNOFF}\n${site.brand}`,
    ];
    return { subject: 'We got your question', ...render(p, site.brand, site.url) };
  }

  const svc = serviceOf(form, data);
  const company = svc === 'building' ? 'commercial energy auditing firm' : WHO[svc] || 'company that does this kind of work';
  const fsa = where.replace(/\s+/g, '').slice(0, 3);
  const area = fsa ? ` near ${fsa}` : ' in your area';
  const p = [
    opener,
    `Thanks for your request through ${site.brand}. It reached us, and here's what happens next.`,
    partner
      ? `We've passed it to ${partner.name}, a ${company} who serves your area${fsa ? ` (${fsa})` : ''}. They're the only company that sees it. They'll contact you to book, usually within one business day.`
      : `We pass it to one ${company}${area}. That's the only company that sees it. We do this by hand, usually within one business day, and we'll email you to say who it is.`,
    svc === 'energy-audit'
      ? `The visit: the advisor walks through the house, runs a blower-door test and leaves you with an EnerGuide report: your home's rating and the upgrades worth doing, which is what most rebates ask for.`
      : '',
    form !== 'building-audit-request' ? `While you wait, your free plan is here: ${site.url}/plan/` : '',
    'If anything changes, just reply to this email.',
    `${SIGNOFF}\n${site.brand}`,
  ].filter(Boolean);
  return { subject: 'We got your request', ...render(p, site.brand, site.url) };
}

function partnerMessage(site, form, data, partner) {
  const rows = [
    ['Name', data.name],
    ['Email', data.email],
    ['Phone', data.phone],
    ['Postal / ZIP code', data.postal || data.zip],
    ['Area', data.region || data.area || data.province || data.city],
    ['Building', data.building || data.home || data.building_type],
    ['Service', data.service || data.project || data.need],
    ['Timeline', data.timeline],
    ['Heating now', data.heating],
    ['Ducts', data.ducts],
    ['Organization', data.organization],
    ['Floor area', data.floor_area],
    ['What they wrote', data.message],
  ].filter(([, v]) => clean(v));
  const p = [
    `Hello ${partner.name} team,`,
    `A new request from ${site.brand} (${site.url}). The homeowner agreed on our form that we share it with one company serving their area, and that's you. Please contact them directly, ideally within one business day.`,
    rows.map(([k, v]) => `${k}: ${clean(v, 1000)}`).join('\n'),
    `Reply to this email once you've reached them, or if you can't take it, so we can pass it to someone else.`,
    `${SIGNOFF}\n${site.brand}`,
  ];
  const where = clean(data.postal || data.zip, 12).toUpperCase();
  return { subject: `New ${site.brand} request${where ? ` in ${where}` : ''}: ${clean(data.name, 60) || 'homeowner'}`, ...render(p, site.brand, site.url) };
}

/**
 * What to send for one verified Netlify Forms submission (the `payload` of the submission-created event).
 * Returns [] when this site isn't live, the form isn't one we answer, or there's no usable email.
 */
export function plan(payload, partners = PARTNERS) {
  const site = siteFor(payload?.site_url);
  const form = payload?.form_name;
  const data = payload?.data ?? {};
  const email = clean(data.email || payload?.email, 200);
  if (!site || !site.live || !FORMS.includes(form) || !EMAIL.test(email)) return [];
  if (clean(data['bot-field'])) return [];

  const partner = form === 'us-question' ? null : matchPartner(site.key, form, data, partners);
  const out = [{ kind: 'homeowner', from: site.from, to: email, reply_to: REPLY_TO, ...homeownerMessage(site, form, data, partner) }];
  if (partner) {
    out.push({ kind: 'partner', from: site.from, to: partner.email, reply_to: REPLY_TO, cc: REPLY_TO, partner: partner.id, ...partnerMessage(site, form, data, partner) });
  }
  return out;
}
