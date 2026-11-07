# audityourhome.ca + audityourhome.com + audityourbuilding.com — rules for Claude

Portfolio-wide rules and the registry of every site live in `davebussell/portfolio-hq` — read its CLAUDE.md too, then `README.md` here.

## Every chat
1. **First:** attach this repo (`list_repos`, then `add_repo` with push access) and clone it. Work in that clone. Do not start from the
   laptop folder (`OneDrive\Desktop\audityourhome`, stale since Oct 12), a zip or the live site.
2. **Push at milestones**, not only at the end: a chat's workspace can disappear (it already did once for this site).
3. **Last:** commit, push to `main`, deploy (below, with Dave's OK in the chat), then confirm the live URLs. "Done" means pushed **and** live.
   Never deploy anything that is not pushed first: on 2026-10-26 GitHub was two weeks and 300 files behind the live site because
   deploys had been uploaded from chat workspaces without a push.

## Two sites, one codebase (since 2026-10-30)
- **audityourhome.ca** = Canada, built from `src/pages/ca/`. **audityourhome.com** = United States, built from `src/pages/us/`. Both are
  AuditYourHome and both are served from the root of their own domain: `audityourhome.ca/cities/toronto/`,
  `audityourhome.com/cities/phoenix/`. Dave decided this on 2026-10-30 (he had chosen audityourhouse.com for the US the day before;
  that domain now redirects to audityourhome.com).
- A page's country comes from its build path (`countryOf(Astro.url.pathname)`, `src/lib/country.ts`); its published address is
  `publicPath()` of that (the prefix dropped). **Every link in the source is root form** (`/tests/radon/`), never `/ca/...` or `/us/...`.
  Cross-site links go through the other site's `/switch/` page (`switchUrl()` in `src/lib/country.ts`; `public/switch/index.html`),
  which sets the `ayh_site` cookie there and continues to the page. The header's country control (since 2026-11-02, Dave's ask) is a small
  flag for the current site that opens a menu with the other country (`CountrySwitch.astro`, SVG flags in `Flag.astro`; not emoji, which
  Windows shows as letters); it's in the desktop row and next to Menu on phones.
- Per-site config: `SITES` / `siteFor(country)` in `src/config/site.ts` (domain, url, tagline, description). `SITE` is the Canadian config
  and the operator's details. Canonical, og:url, hreflang, JSON-LD (`absolutize()` in `src/lib/schema.ts`) and the footer follow it.
- `npm run build` = `astro build` → `tools/glossary/link.mjs` (ca and us pages only) → `tools/country/postbuild.mjs`, which splits `dist/`
  into **`dist-ca/`**, **`dist-us/`** and (since 2026-11-04) **`dist-bu/`** (shared assets + that site's pages at the root), writes
  cross-domain hreflang between twin pages, each site's `sitemap.xml` (+ `sitemap-index.xml`), `robots.txt`, `404.html` and `_redirects`.
  It fails if an Astro page is built outside `src/pages/ca`, `src/pages/us` or `src/pages/bu`, so no global pages: about, privacy,
  credits, 404 and account live under each site's tree.
- **Country routing** (`dist-us/_redirects`, all generated): visitors from Canada who request a page the Canadian site also has get a 302
  to `https://audityourhome.ca<same path>` — unless the `ayh_site` cookie is set (a `200!` rule per page comes first; Netlify takes the
  first match). Pages only the US site has don't redirect. The old Canadian addresses on audityourhome.com (the site was Canadian at the
  root until 2026-10-12, then under `/ca/`) 301 to audityourhome.ca: `/ca/*`, whole Canadian-only sections (`/provinces/*`, `/services/*`,
  `/calculators/*`…) and one rule per Canadian-only page in shared sections (cities, glossary, programs, find, heat-pumps, issues, tests).
  `audityourhouse.com` (a domain alias of the US Netlify site) 301s to audityourhome.com. **The Canadian site never redirects by
  country**: Googlebot crawls from the US and would never see it; `OtherSite.astro` shows a "You're on the Canadian site" bar to US
  visitors instead (and to Canadians on US-only pages), fed by the `/geo.json` rewrite (`public/geo/*.json`).
- The dev server keeps the prefixes (`/ca/...`, `/us/...`, `/bu/...`), so root-form links don't resolve in `npm run dev`; check built
  output (`npx http-server dist-ca`, or `python3 -m http.server 4400 --directory dist-ca`).

## Third site: audityourbuilding.com (since 2026-11-04)
Dave bought audityourbuilding.com on 2026-11-04 and asked to move everything about **commercial buildings and multi-unit (apartment,
condo, strata) buildings** off the two residential sites onto it. The residential sites are for houses, duplexes, triplexes and single
condo units; the building site is for owners and managers of commercial, institutional, industrial and 4+ unit residential buildings
(Canada only, for now). **Do not put commercial or apartment-building content back on the residential sites**; add it to the building site.
- **Pages:** `src/pages/bu/`, published at the root of audityourbuilding.com (`/audit-levels/`, `/commercial-energy-audit/toronto/`).
  Home, 70 city pages plus a hub (`/commercial-energy-audit/`), audit levels (the three ASHRAE levels), apartments and condos, reporting
  rules, incentives, three articles, how it works, the request form, about, privacy, credits, thanks, 404. As on the other sites, every
  link in the source is root form; links to a residential site are full URLs (`BUILDING.homeCa.url`).
- **It is not a "country".** `Country = 'ca' | 'us'` in `src/lib/country.ts` is unchanged. The building site has its own config
  (`src/config/building.ts`: `BUILDING`, `buildingUrl(path)` for links from the residential sites, `buildingPath()`, `isBuildingPage()`),
  lib (`src/lib/building.ts`), layout (`src/layouts/BuildingBase.astro`), components (`src/components/building/`) and styles
  (`src/styles/building.css` over `global.css`: blueprint blue `--heat: #1F5FA8`, cool paper, cyanotype `--bp`, crop-mark `.sheet`).
  It has no `/geo.json` "other site" bar and no country routing.
- **Data:** `src/data/building/{commercial,cities,articles}.json`. `tools/building/extract.mjs` moved it out of the residential data on
  2026-11-04 and the files were edited by hand afterwards, so **do not re-run the script** (it refuses without a flag). The Toronto
  article is an Astro page (`src/pages/bu/articles/energy-audit-services-toronto.astro`).
- **Form:** Netlify form `building-audit-request` (`RequestForm.astro`, `/request/`), which emails dave@clickshift.ca like the others.
  Consent text and `about`/`how-it-works` say participating firms "may pay us a referral fee" and replies come "within one business
  day"; both are mirrored from the residential sites, so change them if commercial works differently.
- **What the residential sites keep:** a pointer (`src/components/BuildingPointer.astro`: city pages, the services hub, the professionals
  page), a link in the header menu and the Canadian footer, and a one-line note in the request forms (`LeadForm.astro`). The forms no
  longer offer "multi-unit" or "commercial" (`LeadForm`, `QuoteForm`, `LeadFormUS`, `BUILDINGS` in `src/lib/account/catalog.ts`; the
  database check still accepts the old values for legacy rows). Factual program notes that mention multi-unit buildings (Alberta CEIP,
  Victoria's Strata Energy Advisor Program, heat-pump multi-unit bonuses, CO-alarm rules) were left on purpose.
- **Old addresses:** `/services/commercial-energy-audit/*` and the three building articles (with and without the old `/ca/` prefix) 301 to
  the building site from both residential domains (`MOVED_TO_BU` in `tools/country/postbuild.mjs`, placed ahead of the `/ca/*`
  wildcards so there is never a two-hop chain). `dist-bu/_redirects` only turns `/bu/*` into `/*`.
- **Counts that can't drift:** the commercial service no longer counts, so "15 services" comes from `SERVICE_COUNT` (and `CITY_COUNT`) in
  `src/lib/local-counts.ts`, read from the generated index. `tools/local-pages/gen_pages.py` has `SKIP_SERVICES = {'commercial-energy-audit'}`
  so regenerating the city pages can't bring the commercial service back.
- **Photos:** two pictures belong to the building site (`BUILDING_PHOTO_KEYS` in `src/lib/photos.ts`); the shared credits page leaves them
  out and `src/pages/bu/credits.astro` lists them. Postbuild keeps assets that only building pages use (`buildingOnly`) out of `dist-ca`
  and `dist-us`.
- **Analytics:** it reuses the portfolio GA tag (`G-QK0ETT28BD`, `content_group` "building") and the Clarity project. The tag is in the
  page source, so after the first deploy count the `gtag/js?id=G-QK0ETT28BD` includes in the live HTML: if there are two, the project
  also has the portfolio's Netlify snippet injection ("ga4-portfolio") and every view would count twice; tell Dave to remove the snippet
  (Project configuration → Build & deploy → Post processing). Dave still needs a Search Console property for audityourbuilding.com
  (submit `/sitemap.xml`) and a GA split if he wants one.
- **Netlify:** its own project, **`audityourbuilding`** (`a8074ca1-136b-45bc-934c-b3e2c9470c68`, created 2026-10-29, same team as the
  others), serving `dist-bu/` from `netlify.bu.toml` (`AYH_SITE=bu`, which postbuild checks against `SITE_NAME`; the project is named
  exactly that). The domain, DNS, www redirect and certificate were already working on 2026-11-04 because the project was serving a
  "Launching soon" page (deploy `6aeb3cb6f3fadba36951c0d6`, a Netlify form `notify` with one signup in it). Our first deploy replaces
  that page, so it needs Dave's OK in the chat; the old deploy stays in Netlify's history and can be re-published there. The `notify` form
  has one signup (a visitor's email, which we have not read): Dave should look at it, and export it if he wants to write to that person,
  before the page is replaced. A new form (`building-audit-request`) needs its email notification set in the Netlify UI like the other
  projects (Forms → Settings → notifications to dave@clickshift.ca).
- **Never mention** WillScot (WSC), Transcat (TRNS) or McGrath RentCorp (MGRC) on any of his sites.

## The sky look (2026-11-04; Dave: "more fun and uplifting … the floating in the clouds and flying to a better place kind of feeling")
All three sites share one look: a band of sky behind the top of every page with slowly drifting clouds, a paper plane, the audit steps
drawn as a flight path, a lift-off moment when a plan is ready, and a cloud edge on top of every footer. The home sites are a summer sky;
the building site is the same sky as a pale blueprint (grid and line-art clouds). None of it needs JavaScript.
- **Files:** `src/styles/sky.css` (hand-written: band, cloud layers, plane, footer edge, lift-off), `src/styles/sky-art.css`
  (**generated**: the cloud tiles, the plane and the edge mask as data: URIs in CSS variables; change `tools/sky/make-sky-art.mjs` and run
  `node tools/sky/make-sky-art.mjs`, never edit the CSS), `src/components/Sky.astro` (the markup, first child of `<body>` in `Base.astro` and
  `BuildingBase.astro`, `aria-hidden`) and `src/components/JourneyBar.astro` (the flight path: an SVG route behind four numbered stops; the
  plane flies from the previous stop to the current one).
- **Props:** `sky="hero"` (taller band, with the plane crossing it) on the three home pages, `'page'` elsewhere. `flushFooter` on a page that
  ends in a full-width dark band (the .ca home's service-organization band, the building home's request band): no gap and no cloud edge
  before the footer (`main.flush + footer…` in `sky.css`).
- **Lift-off:** give `class="liftoff-host"` to the element that appears when a result is ready (`.results-head` in both planners, the
  `[data-sent="yes"]` block on the three thanks pages). Its `::before` (plane and trail) and `::after` (puff) are CSS animations that start
  the moment the element stops being `hidden`; the "Cleared for take-off" chip is a `<p class="liftoff-chip">` inside it.
- **Palette:** tokens in `global.css` `:root` (`--sky-1/2/3`, `--wash`, `--sun`; paper `#F5FAFE`, navy `#10304D`; `--heat` orange unchanged);
  the building site's own in `building.css` under `html[data-site='building']`. Hero labels (`.hero`, `.page-hero`, `.results-head` `.eyebrow`)
  are white tags in `--heat-deep`, because plain orange on the blue is only 2.3:1; keep `--faint` and small orange text off the sky (breadcrumbs
  and "stage N of 4" use `--muted`). The building site's cloud outlines are pale (`#9BBBDA`) and its `--muted` darker (`#46586E`) on purpose:
  muted text keeps 5:1 on the top of the sky and 3.7:1 where a line crosses it. Measured with
  `scratchpad/qa/sky/contrast-collect.mjs` + `contrast-analyse.py` (text hidden, pixels behind each text run), not from the tokens alone. Not changed, and below AA already before the sky: white text on the orange buttons (3.7:1) and the `--warn` chips.
- **Reduced motion:** everything that moves is a CSS animation, so the global `prefers-reduced-motion` rule in `global.css`
  (`animation: none !important`) stops all of it, and every animated element's own style is its resting state (plane parked by the sun,
  lift-off hidden, journey plane at its stop). Check: `document.getAnimations().length === 0` under Playwright's `reducedMotion: 'reduce'`.
- **Gotcha, CSS order:** the bundler emits shared CSS chunks alphabetically by chunk name, not in import order, so two equal-specificity
  rules in `global.css`, `sky.css` and `building.css` can swap. The building site's overrides therefore use `html[data-site='building'] …`
  (higher specificity) and its tokens are set on `html[data-site='building']`, not `:root`. Scoped component styles (`[data-astro-cid]`,
  specificity 0,2,0) beat a plain class in `sky.css` too.
- **Weight:** about 5.7 KB gzipped of CSS (2.4 KB of it the generated art) in the shared stylesheet, which is cached across pages; no images,
  no extra requests, no JavaScript.

## The November 6 review (Dave mailed himself a four-part review of both home sites: "Audit Your Home . ca fixes")
Dave chose four of its five buckets: **A** quick factual and consent fixes (`9aa20fe`), **B** planner logic (prerequisite-first next
step, municipality gating, eligibility statuses, utility gate, usage inputs), **C** a shorter "rebates first" planner path, **D** a French
site for the Québec-facing pages; **E** (provider terms, a transaction router, funnel analytics, a smaller navigation) is parked. Every
claim in the thread was checked against the official page before anything changed: **LogisVert's cold-climate rate is still $120 per
1,000 BTU/h** (the thread's $140 was a measure Hydro-Québec removed on August 25, 2025), so that number stayed; Rénoclimat's October 1,
2026 optional-evaluation rules and Mass Save's January 1, 2027 cut are real.
- **Québec (A):** the planner's evaluation step is province-aware (`PROVINCE_BOOKING[].optional` in `src/lib/find.ts`); the 11 Québec
  city pages, the audit-cost article and the Learn table drop the $150 assigned-evaluation path; rural Outaouais codes (J0X, J0V) model as
  Gatineau (`QC_RURAL` / `QC_AREA` in the CA planner), with every rural Québec FSA mapped to the nearest covered city.
- **Consent (A):** one rule on every surface: a request goes to one participating company, never more. "Request quotes" is "Match me with
  one contractor" (CA) and "Help me find an installer" (US). The CA privacy page has the affiliate section; product pages disclose above
  the first merchant link. US rebate records can carry a "Changing" note (Mass Save's 2027 drop, Austin Energy's loan date confirmed by
  the lender, California HOMES not open yet).
- **Prerequisite first (B):** neither planner tells everyone to "book the audit". CA: a province program carries `auditRequired`
  (`programs.json`, overridable per entry in `provinces.json`); step 1 names the programs that need the evaluation, or says it's optional
  and the quotes can start; city-only programs (Toronto HELP) show only on an exact city match, never for a rural code modelled on that
  city. US: `rebatePrereqs()` in `src/lib/us/plan-payload.ts` reads "assessment first / program contractor / pre-approval" from each
  record's text into `pre`, shown as chips; step 1 says which rebate pays on the assessment's findings.
- **Utility gate (B, US):** step 1 asks "Who sends your electric bill?" in every metro where a utility runs programs (`utilitiesFor`,
  `ask`), with "Another utility" and "Not sure". A rebate tied to a utility that isn't the homeowner's stays only through its gas side
  (the utility sells gas here and the home burns gas: `applies()` / `gasCustomer()` in `plan-client.ts`); with "Not sure" it carries an
  "if your utility" chip; what was left out is named once so a mis-tap is easy to spot. Programs are tied to utilities by name mentions in
  their `runBy`/name (`tiedTo`), so a sponsor must be named in the record: Boston's Mass Save records say "(Eversource and National Grid in
  the Boston area)" so municipal-light-plant customers aren't shown Mass Save for an all-electric home.
- **Honest totals (B, CA):** "Rebates in this plan" splits set amounts from amounts sized from a typical home, flags the product and
  R-value conditions on each item, and keeps the announced federal heat pump rebate ($2,000, not open) apart from the programs open now.
- **Usage over dollars (B):** both planners take a year of usage (kWh, m³ or litres; therms or gallons) under "Better: enter a year of
  usage" and calibrate from it (`calibrate(..., { mode: 'usage' })`); the dollar sliders stay as the fallback. No gas question is shown
  to a home with no gas appliance.

## State (2026-11-04)
- Built and tested but **not live yet** (the laptop was unreachable for the push): the three-site build, the building site, the removal
  from the residential sites, the planner fix for a blocked Next on step 2 (`e601ec6`), the site-switch open-redirect fix and two other
  bugs found by the end-to-end pass (`61a9abb`), and the US pictures and charts (`802bd77`). Until they are deployed, the live
  planner still blocks Next on step 2 until the visitor picks a build era, and `/switch/?to=` still accepts off-site paths.
- Ship order: push, deploy the building site over the placeholder (no DNS step: the domain, www and certificate already work), check
  it, then deploy .ca, then .com (their redirects would otherwise send visitors to a page that isn't there yet).

## State (2026-11-02)
- `main` = the two-site split (this section) + the footer features from clickshift.ca/proudtowork.ca (where we work, connect with
  LinkedIn and Instagram, photo & data credits at `/credits/`, live year, tagline).
- Live (2026-11-02, both from `c5196cb`, the flag country picker): **audityourhome.ca** deploy `6ae8b7c977ecd4eba7a2689f`,
  **audityourhome.com** deploy `6ae8b8dae2c9c07a05aac009` (631 redirect rules). Before that the same day, from `f9798f6`: .ca
  `6ae80d6a9f265c6f51f5b979` (Dave added the domain in Netlify and pointed GoDaddy DNS, Let's Encrypt cert issued), .com
  `6ae8a04e6b391c0b0d1a766b`. Checked live from Dave's browser in Canada: CA on .com lands on the same page on .ca and US on .ca on the same page on .com
  (via `/switch/`); without the choice cookie, `/` and `/tests/radon/` on .com redirect to .ca, `/cities/phoenix/` (US-only) doesn't,
  `/provinces/ontario/` and `/ca/plan/` 301 to .ca. Both projects email dave@clickshift.ca on any form submission.
- Not done yet: `audityourhouse.com` (+ `www`) still points at GoDaddy parking; add it as a domain alias of the audityourhome project and
  point its DNS at Netlify (A `@` 75.2.60.5, CNAME `www` audityourhome.netlify.app) for the redirect rules to apply. Search Console
  property for audityourhome.ca (submit `/sitemap.xml`) is Dave's to add.
- Pushing: this cloud task can't push (proxy 403) and the laptop's Linux VM has no GitHub login; on 2026-11-01 the push went from Dave's
  laptop through Git GUI (Tools → a one-off command `git push origin two-sites:main` with his Windows GitHub login, removed afterwards).
- Earlier: live deploy `6ae0a1236ceaccd2859a083d` (2026-10-27) = `main` at `045017b` (regional rewrite, both countries under `/ca/` and
  `/us/` on audityourhome.com); before that `6ad7e24cad90198c04485fa1` (2026-10-20), whose source was recovered from Netlify's
  "Download source code" on 2026-10-26.
- Stack: Astro 5, data in `src/data/*.json`, generators in `tools/`, Supabase (accounts and alerts, Canada only, not enabled) in `supabase/`.

## Netlify
- Project `audityourhome` (`ac0a6bef-3d1a-4b0c-9234-5da336851fcd`) serves **audityourhome.com (US)** from `dist-us/` (`netlify.toml`),
  with `audityourhouse.com` + `www` as domain aliases (redirected by `_redirects`).
- Project `audityourhome-ca` (`dc8d8fbd-a528-48ac-b03a-584577f7c33b`, created 2026-10-29 as "audityourhouse", renamed 2026-10-30, forms
  enabled) serves **audityourhome.ca (Canada)** from `dist-ca/` (`netlify.ca.toml`).
- Project `audityourbuilding` (`a8074ca1-136b-45bc-934c-b3e2c9470c68`, created 2026-10-29) serves **audityourbuilding.com** from `dist-bu/`
  (`netlify.bu.toml`); see "Third site" above. It was already live with a "Launching soon" page before our site existed.
- **None is linked to this repo**: deploys are uploads, so a push changes nothing live. Never create another Netlify site for the two
  residential domains; the building site's project is the only other one.
- All three tomls: `npm run build`, Node 22, `FORMS=netlify` (renders the forms as Netlify Forms) and `AYH_SITE=ca|us|bu`, which postbuild
  checks against Netlify's `SITE_NAME` so the wrong toml can't publish one site's pages to another.
- Netlify Forms: Canada `audit-request`, `heat-pump-quote`; US `us-question`, `heat-pump-quote`; buildings `building-audit-request`.
  Notifications go to dave@clickshift.ca (set per site in the Netlify UI: Forms → notifications).
- GitHub Pages is no longer the host (`.github/workflows/deploy.yml` removed 2026-10-29). `.github/workflows/alerts.yml` still runs hourly
  and does nothing until its Supabase and Resend secrets are set. `PUSH-TO-GITHUB.bat` was the old laptop publishing loop (Pages era).

## How to deploy (needs Dave's OK in the chat)
Build locally first (`npm ci && FORMS=netlify npm run build`, then `npm run -s test:calc`, `node tools/us/test-plan.mjs`) so a broken
build never reaches Netlify. Then, for each site, from source only:
```
rm -rf /tmp/ayh-deploy && mkdir /tmp/ayh-deploy && git archive HEAD | tar -x -C /tmp/ayh-deploy          # US: netlify.toml as is
rm -rf /tmp/ayh-deploy-ca && mkdir /tmp/ayh-deploy-ca && git archive HEAD | tar -x -C /tmp/ayh-deploy-ca \
  && cp /tmp/ayh-deploy-ca/netlify.ca.toml /tmp/ayh-deploy-ca/netlify.toml                                  # Canada: swap in the CA toml
rm -rf /tmp/ayh-deploy-bu && mkdir /tmp/ayh-deploy-bu && git archive HEAD | tar -x -C /tmp/ayh-deploy-bu \
  && cp /tmp/ayh-deploy-bu/netlify.bu.toml /tmp/ayh-deploy-bu/netlify.toml                                  # Buildings: swap in the BU toml
```
Call the Netlify MCP `netlify-deploy-services-updater` (`deploy-site`, the site id) and run the command it returns from inside that
directory. Netlify builds it with its `netlify.toml`. Never paste its proxy token anywhere. **Order: the building site first** (the
residential redirects send visitors there), then the Canadian site (its domain must answer before the US site starts redirecting
Canadians there), then the US site. Afterwards, on each site: the pages you changed at 375px and 1280px, the home page, an old address
redirecting (`/ca/plan/` → `/plan/` on audityourhome.ca; `/ca/plan/` and `/provinces/ontario/` on audityourhome.com → audityourhome.ca;
`/services/commercial-energy-audit/toronto/` on either → audityourbuilding.com/commercial-energy-audit/toronto/), `/geo.json` answering
(residential sites), `/switch/?to=%2Fplan%2F` landing on the planner, `get-forms-for-project` still listing the forms (on the building
site: `building-audit-request`), then record every deploy ID here.

## Systems added 2026-10-26 (regional rewrite)
- **Glossary:** `src/data/glossary.json` (199 sourced terms, ca 169 / us 168) is the source of truth; `tools/glossary/import.mjs --check`
  validates it. `tools/glossary/link.mjs` (run by `npm run build`) links the first visible use of each term on every /ca/ and /us/ (build-path)
  page; `public/gl.js` shows the tooltip/tap popover and links browser-rendered results (`GlossaryRuntime.astro`). Province-only
  terms (HRSP) link only on that province's pages. Patterns are shared with gl.js via `src/lib/glossary-patterns.mjs`.
- **Climate profiles:** `src/data/climate/{us,ca}.json` (9 US / 7 CA profiles + every metro, city and province) via
  `src/lib/climate.ts`; `RegionalNeeds.astro` renders them (full on city/metro guides, service/compact/heatpump variants elsewhere).
  `tools/local-pages/gen_pages.py` reads the CA file for climate-aware service text.
- **Reading guides:** `src/data/reading-guides.json` + `ReadingGuide.astro` (`#reading` on every test page and in both planners).
- **Journey:** `JourneyBar.astro` + `src/lib/journey.ts` (Your free plan → Book the audit → The audit visit and report → Upgrades and rebates).
- **Planners:** CA logic in `src/pages/ca/plan/index.astro` + `src/lib/ca/plan-helpers.ts` (answers in the # hash, no analytics);
  US cooling model in `src/lib/us/plan-cooling.ts` from `src/data/us/cooling-model.json` (`node tools/us/test-plan.mjs`).
- US common problems: `src/data/us/issues.json` → `/issues/<slug>/` on the US site. US text cleanup of research-note wording: `src/lib/us/clean.ts`.

## US visuals (2026-11-04, Dave: "make the American side as visual as the Canadian one", then "Use Canva")
- **Regional house pictures:** nine AI-generated images, one per US climate profile (the keys are the profile keys in
  `src/data/climate/us.json`), made with Canva's image generator on 2026-11-04. Files `src/assets/photos/us-<profile>.jpg` (1200×800),
  registry `src/lib/us/photos.ts` (`REGION_KEYS`, `REGION_PHOTOS` with alt text and the Canva media id of the 1536×1024 original),
  component `src/components/us/RegionPhoto.astro` (same viewfinder frame as `Photo.astro`; one `region`, or a `regions` mosaic).
  They are deliberately **not** in `PHOTOS` (`src/lib/photos.ts`): that registry is credited on both sites, so keeping them apart leaves the
  Canadian pages and credits byte-identical. They are credited on the US `/credits/` page only (`CreditsPage.astro`). Every place that
  shows one labels it an illustration; never describe one as a real home.
- **Where they appear:** the home page's "Nine climates" grid, the metro page and city-index heroes, the `MetroCard` thumbnails (four
  hand-picked crops per picture, `CROPS` in `src/lib/us/visual.ts`; a metro takes the crop at its position in its profile so neighbours
  differ) and each metro page's social card (`getImage`, 1200×630).
- **Other US-only components:** `DegreeBars` (NOAA heating and cooling degree days, one shared scale), `MetroSignature` + `HomeGlyph` ("How
  <metro> is built": Census median year built in era colours, same palette as the Canadian era bars), `StateTileMap` (50 states + DC tile grid
  on the programs, states and home pages, status colours from `lib/us/programs.ts`). Data for all of them: `src/lib/us/visual.ts`.
- **The originals:** the cloud sandbox cannot download from `export-download.canva.com` (proxy policy denial, do not route around it), so the
  1200×800 files were stitched from 2×2 tile read-backs of the Canva design `DAHZ-VRJf4E` ("AuditYourHome US photos (export staging)" in
  Dave's Canva; pages 2–10 are the nine full 1536×1024 originals). For full size, export that design as JPG from Canva. The drawn-SVG
  scene engine that came first was removed once the Canva pictures replaced it.

## Standards
- Check every change at 375px and at 1280px+ before saying done.
- Keep the SEO basics (title, description, canonical, Open Graph, sitemap, `robots.txt`) intact.
