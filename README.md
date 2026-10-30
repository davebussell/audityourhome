# AuditYourHome: audityourhome.ca (Canada) and audityourhome.com (United States)

Directory + planning engine for home energy audits: one Astro 5 codebase, fully static,
data-driven from JSON files, published as two sites. `src/pages/ca/` is the Canadian site
(audityourhome.ca) and `src/pages/us/` the US site (audityourhome.com); each is served from the
root of its own domain, so every link in the source is written in root form (`/tests/radon/`),
never with a country prefix. Visitors from Canada who land on the US site are sent to the Canadian
twin of the page by Netlify rules (unless they chose the US site); the Canadian site never
redirects by country. audityourhouse.com redirects to the US site.

## Quick start

```bash
npm install
npm run dev        # http://localhost:4321/ca/... and /us/... (the dev server keeps the prefixes)
npm run build      # dist/ (unified) → dist-ca/ and dist-us/, one per site
npx http-server dist-ca   # or dist-us: preview a built site
```

`npm run build` runs `astro build`, then `tools/glossary/link.mjs` (glossary links) and
`tools/country/postbuild.mjs`, which splits `dist/` into `dist-ca/` and `dist-us/` with each
site's hreflang links, sitemap, robots.txt, 404.html and Netlify `_redirects`. Deploy
`dist-us/` to the audityourhome Netlify site (audityourhome.com) and `dist-ca/` to
audityourhome-ca (audityourhome.ca); CLAUDE.md has the procedure (`netlify.toml` is the US
site's config, `netlify.ca.toml` the Canadian one).

## Where everything lives

```
src/config/site.ts        Brand, contact email, form endpoint, data-review date
src/data/
  programs.json           Rebate programs — status, amounts, audit requirements, official URLs
  providers.json          Directory listings (13 real Ontario service orgs, public-source data)
  regions.json            12 Ontario areas with FSA prefixes (drives directory + planner matching)
  archetypes.json         Era knowledge base (pre-1946 … 2011+) — powers the planner's diagnosis
  issues.json             Symptom library (10 issues) — powers /issues/ pages + planner deep-dives
  savings.json            Savings factors per measure (% of heating spend, costs, notes)
  rates.json              Ontario rate + usage benchmarks for the bills estimator
src/pages/
  index.astro             Home (hero prefills the planner via GET params)
  plan/index.astro        ★ Home Energy Planner — 6-step wizard, runs fully client-side
  find/…                  Directory index + per-city pages (generated from regions.json)
  providers/[slug].astro  Provider profiles (generated from providers.json)
  programs/…              Program tracker + per-program pages (generated from programs.json)
  issues/…                Issue library (generated from issues.json)
  cost / how-it-works / for-professionals / about / privacy / 404
```

Adding a provider, program, city, or issue = adding a JSON entry. Pages, sitemap entries, and
planner matching pick it up on the next build. No code changes needed.

## Routine maintenance (the moat)

The site's core promise is **dated, verified program data**. The routine:

1. Re-check each program's `officialUrl` (monthly, and whenever news breaks).
2. Update `lastVerified` per program, and `dataReviewDate` in `site.ts`.
3. If a program closes: set `status: "closed"`, rewrite `headline` past-tense — closed programs
   stay listed on purpose (trust signal + SEO for "is X still available").

Same idea for `providers.json` (`checkedOn`) and `rates.json` (`asOf`).

## Lead capture

`site.ts → formEndpoint` is empty, so all forms fall back to a mailto CTA (never a dead end).
To switch on real forms: create a Formspree/Basin form (or a Netlify Forms action) and paste
the endpoint URL there. Forms already submit `context` (which page/provider/program generated
the lead) and `region`. **Before meaningful lead volume: replace /privacy/ with a
PIPEDA-reviewed policy** (the current page says so itself).

## The planner (src/pages/plan/index.astro)

All logic is client-side; the build embeds a JSON payload of the data files. Flow:
postal → era → type/size → heating → symptoms → goals → bills (optional) → results.

- Postal code: FSA → province (first letter) → region match against `regions.json` prefixes.
  Non-ON provinces get honest province notes (in `PROVINCE_NOTES`); US ZIPs get a waitlist card.
- Sequence builder: starts from the era archetype's priorities, re-scored by heating fuel,
  symptoms, and goals (see `buildSequence`).
- Savings: `savings.json` measures matched by category + era + heating; dollar ranges appear
  only when the user enters bills (heating share assumptions in `rates.json`).
- Results are shareable/prefillable via URL params (`?age=…&heat=…&done=1`).
- Nothing is stored or transmitted — keep that promise if you touch this page.

## Roadmap (phase 2+), in rough order of leverage

1. **Real form endpoint + lead routing** (above) — the revenue switch.
2. **Provider verification program**: email flow → `verifiedByUs: true` badge tier. The
   for-professionals page already sells it.
3. **Online booking**: start with one willing provider (Windfall? Energuy?) via Cal.com embed
   on their profile — category first in Canada.
4. **Address intelligence layer** (the big vision): swap the planner's "year built" question
   for an address lookup. Data reality: MPAC year-built isn't open data. The free path is
   StatCan census construction-era by dissemination area + NRCan's open EnerGuide ratings
   dataset (both joinable by geography) → "homes like yours in your area". Paid path: MLS/
   assessment APIs. Needs a small backend or build-time data bake; the planner's engine
   (archetype → diagnosis → sequence) is already the consumer of whatever the lookup returns.
5. **French** (Quebec + franco-Ontario): i18n routing, Rénoclimat/LogisVert content.
6. **Provincial expansion**: Manitoba ($400 evaluation rebate) and Atlantic Canada first —
   programs.json + regions.json entries plus provider recruitment.
7. **US launch**: ordinance cities (Portland/Austin/Berkeley/Minneapolis) + HOMES states,
   per the market analysis. Same data model; add a `country` field to regions.
8. **Analytics**: privacy-respecting (Plausible/Fathom) — /privacy/ commits to disclosing it.

## Data honesty rules (please keep)

- Every program fact carries a verification date; closed programs stay visible.
- Provider listings cite public sources; corrections on request; no pay-to-rank.
- Savings shown as ranges with published assumptions; the audit is always framed as the
  precise answer. No fabricated reviews, ever — the review system, when built, must be real.

## Housekeeping

- Domain check (Aug 23, 2026): audityourhome.com did not resolve to a live site (TLS
  "unrecognized name"), so it appears unconfigured — register/point it if not already done.
- OG image: pages use `summary` cards without an image; add `/public/og.png` (1200×630) and a
  `og:image` tag in `Base.astro` when brand assets exist.
- Fonts load from Google Fonts; self-host later if you want zero third-party requests.
