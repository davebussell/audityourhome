// Partner companies that receive AuditYourHome requests automatically.
//
// A request is forwarded ONLY to a partner with `agreed: true`: a company that has said, in writing,
// that it wants requests from us (and on what terms). Everyone else is listed here so the morning
// lead digest and Dave can see who has been sent leads by hand; their `agreed` stays false until
// they say yes. One request goes to one company, never more (the consent on every form says so).
//
// Matching, first hit wins, in the order below:
//   site      'ca' | 'us' | 'bu'          which site the request came from
//   forms     form names it takes         audit-request, heat-pump-quote, us-question, building-audit-request
//   postal    postal-code prefixes (FSA or first letters), or US ZIP prefixes
//   services  only these services (energy-audit, radon, heat-pump…; see WHO in core.mjs); empty = any
//   regions   the form's `region` / `area` / `province` values (e.g. 'bc', 'quebec', 'other-ontario', 'ON')
//
// To add a partner once they agree: set `agreed: true`, fill `email`, `postal` and/or `regions`, add the
// date and the terms in `note`, commit, deploy. Nothing else changes.

export const PARTNERS = [
  {
    id: 'energy-werx',
    name: 'Energy Werx',
    email: 'info.corp@energywerx.ca',
    agreed: false,
    site: 'ca',
    forms: ['audit-request'],
    services: ['energy-audit'],
    regions: ['other-ontario', 'ottawa', 'kingston', 'peterborough', 'toronto', 'york-region', 'mississauga', 'hamilton', 'niagara', 'kitchener-waterloo', 'london', 'barrie-simcoe'],
    postal: [],
    note: 'First two requests sent by hand 2026-11-12 (Thunder Bay, Simcoe/Grey), offered free; no agreement yet.',
  },
  {
    id: 'energie3r',
    name: 'Energie3R',
    email: 'info@en3r.ca',
    agreed: false,
    site: 'ca',
    forms: ['audit-request'],
    services: ['energy-audit'],
    regions: ['quebec'],
    postal: ['H'],
    note: "Rénoclimat's listed organization for Montréal. First request sent by hand 2026-11-12; asked whether they do private assessments.",
  },
  {
    id: 'greener-homes-surrey',
    name: 'Greener Homes Inc. (Julia Pontual)',
    email: 'juliaenergyadvisor@gmail.com',
    agreed: false,
    site: 'ca',
    forms: ['audit-request'],
    services: ['energy-audit'],
    regions: [],
    postal: ['V3', 'V4'],
    note: 'Registered advisor in Surrey on Better Homes BC. First request sent by hand 2026-11-12, offered free; no agreement yet.',
  },
];
