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
  before the page is replaced. The project's form notification ("Email dave@clickshift.ca on new submission from any form", checked
  2026-11-12) covers the new `building-audit-request` form too.
- **Never mention** WillScot (WSC), Transcat (TRNS) or McGrath RentCorp (MGRC) on any of his sites.

## Auto-replies and partner routing (added 2026-11-12, Dave's decision)
- `netlify/functions/submission-created.mjs` runs on every VERIFIED Netlify Forms submission (spam never reaches it). Logic in
  `netlify/autoreply/core.mjs` (pure, testable: `plan(payload)` returns the emails to send); partners in `netlify/autoreply/partners.mjs`.
- It emails the person straight away from the site's contact@ address (`replyTo` per site in `SITES`: contact@audityourhome.ca,
  contact@audityourhome.com; the building site still uses Dave's), in French for French requests: what
  happens next, matching the form's promise (one company sees it, usually within one business day). Forms: `audit-request`,
  `heat-pump-quote`, `us-question`, `building-audit-request`. Wording follows the request's service (`serviceOf()`: the `service`
  field, else the `context`), so a radon or lead-paint request isn't told about an EnerGuide visit.
- **Routing (Dave, 2026-11-12): only to partners who have agreed.** A request is forwarded to one partner only when that partner has
  `agreed: true` and matches the site, form, service and postal prefix or region. Otherwise the reply says we'll match them by hand and
  the morning lead digest (scheduled task "Morning lead digest", 7:40 daily) shows it to Dave. Energy Werx, Energie3R and Greener Homes
  (Surrey) are listed with `agreed: false`: each got its first request by hand on 2026-11-12, free, with no agreement yet.
- **Sending:** Resend (account "clickshift", GitHub login). `SITES` in core.mjs has `live` per domain: audityourhome.ca is live (domain
  added in Resend 2026-11-12, DNS at GoDaddy: TXT `resend._domainkey`, CNAME `send` and `rsend` → `*.forge.rmta.net`; the root has had
  Google MX and SPF since 2026-11-21 for contact@, which Resend's `send` subdomain doesn't touch). audityourhome.com and audityourbuilding.com stay `live: false` until Dave upgrades Resend (the free plan allows
  3 domains: guiltfreetakeout.com, bethepuck.com, audityourhome.ca) and their domains are verified. The function needs
  `RESEND_API_KEY` in the Netlify project; without it it logs "skipped" and sends nothing. Dave creates and pastes keys; never handle one.
- Test without sending: stub `globalThis.fetch` and call `handler({ body: JSON.stringify({ payload }) })`, or call `plan()` directly.

## The quiet sky (2026-11-11; replaced the 2026-11-04 "sky look" after feedback that it looked kitschy)
On 2026-11-04 Dave asked for "the floating in the clouds and flying to a better place kind of feeling": drifting clouds, a sun, a paper
plane, the audit steps as a flight path, a lift-off when a plan was ready and a cloud edge on every footer. On 2026-11-11 he passed on
feedback that it looked kitschy and chose "Quiet sky" for all three sites: keep a soft blue-to-white wash at the top of each page, drop
every picture and every animation. Don't bring back clouds, planes, lift-off, flight wording ("Cleared for take-off") or looping motion.
- **Files:** `src/styles/sky.css` (the wash, plus `main.flush + footer…`), `src/components/Sky.astro` (one empty `aria-hidden` div, first
  child of `<body>` in `Base.astro` and `BuildingBase.astro`). `sky-art.css` and `tools/sky/make-sky-art.mjs` were deleted.
- **The wash:** a gradient `--sky-1` → `--sky-2` (at 150px) → `--sky-3` → `--paper`, with two soft white radial lights on top (`.sky::before`),
  440px tall on pages and 680px with `sky="hero"` (360/540px on phones). The building site uses the same wash, cooler, with a faint
  drawing grid (28px, 5% blue) that fades out by 90% of the band. Tokens: `global.css` `:root` (`#D9EAF6 / #E6F1FA / #EFF6FC`) and
  `building.css` under `html[data-site='building']` (`#DCE6F0 / #E6EDF4 / #EDF2F7`).
- **Why that pale:** hero labels (`.eyebrow`, mono, `--heat-deep` `#B84713`) sit straight on the wash with no tag behind them, and need 4.5:1.
  Measured on 2026-11-11 with `scratchpad/qa/sky/contrast-collect.mjs` + `contrast-analyse.py` (text hidden, pixels behind each text run):
  every hero label passes, tightest 4.54:1 (US planner, phone). Darken the wash and that breaks first. Below AA and unchanged since before
  the sky: white text on the orange buttons (3.7:1), the `--warn` chips (3.4:1) and the red "Your" in the building logo (a logo).
- **Journey bar** (`src/components/JourneyBar.astro`): a plain stepper. A thin four-part line (done stages in `--pine`, the current one in
  `--heat`, aria-hidden) over four numbered cards, which are the real links. `ticks` marks earlier stages done (the planner results);
  on phones the cards go two by two and only the current one keeps its description.
- **Footer:** a straight edge with the normal gap. `flushFooter` on a page that ends in a full-width dark band (the .ca home's
  service-organization band, the building home's request band) removes the gap.
- **Motion:** none at rest. Small hover and focus transitions only (0.12–0.4s: borders, shadows, a 2px card lift, a slight photo zoom);
  the photo "REC" dot and the housing-portrait glow are static.
  The glossary popover fade and the planner's validation nudge are the only keyframes left. Check: `document.getAnimations().length === 0`
  on a loaded page (`scratchpad/qa/sky/anims.mjs`).
- **Gotcha, CSS order:** the bundler emits shared CSS chunks alphabetically by chunk name, not in import order, so two equal-specificity
  rules in `global.css`, `sky.css` and `building.css` can swap. The building site's overrides therefore use `html[data-site='building'] …`
  (higher specificity) and its tokens are set on `html[data-site='building']`, not `:root`. Scoped component styles (`[data-astro-cid]`,
  specificity 0,2,0) beat a plain class in `sky.css` too.

## Top picks: heat pumps (2026-11-12, Phase 0 and Phase 1 of the plan)
On 2026-11-12 Dave asked for "our top three recommendations based on a full analysis" in every product category, instead of pages of
data: the best quality or highest performing option, the best self-install option and the best economical/return on investment option, per
region, on both home sites and later the building site. The plan is the Claude Doc "Top picks and site flow: improvement plan"
(claude.ai/artifact/MxfwsnxcMpRZ4SPQwL64Vy). Dave approved all eight of its decisions the same day ("Love the plan and agree with the
recommendations"): slot names **Best performance / Best do-it-yourself / Best value** (the middle one renamed only where do-it-yourself makes
no sense); do-it-yourself picks are shown even when they lose a rebate, with the warning; picks per **climate profile** (the 16 in
`src/data/climate/{ca,us}.json`), with rebates and prices per province or metro; **warranty terms stand in for reliability** until brokered
quotes give installer feedback; gear (radon and air monitors) gets first-hand tests; **two sellers per gear pick**; installed prices are
**ranges** from published sources plus brokered quotes, never a single price; **heat pumps first**. Roadmap after this: gear and the other
upgrades, then the flow between pages, then the building site.
- **Data:** `tools/picks/build_heatpumps.py` builds `src/data/picks/heatpumps.json` from `src/data/heatpumps/estar.json` (ENERGY STAR rows,
  built by `tools/heatpumps/build_estar.py`; the cloud proxy blocks data.energystar.gov, so refresh it where the site is reachable and never
  route around the block), `brands.json` (where each brand sells, warranty per country, price tier, lines) and the climate profiles.
  Hand-kept inputs live in `tools/picks/heatpumps-overrides.json`: `checked` (the review date printed on every card), slot wording, the
  gates text, value tiers, the do-it-yourself rule, manual runner-ups (`us/room/diy`: Midea's window heat pump), installed-price ranges with
  sources (`costs`: FurnacePrices.ca for Canada, EnergySage for the US), `exclude`, `locks` (pin a pick) and zone notes. `npm run picks` =
  build + check. Re-run it after a new ENERGY STAR pull or a brands.json change, read the diff of heatpumps.json, then bump `checked`.
- **Method** (also printed on `/heat-pumps/how-we-pick/`, from the same JSON, so the page can't drift): three situations (`ducted` 22,000–48,000
  BTU/h, `ductless` one head of 11,000–24,000, `room` 6,000–12,500); gates: brand confirmed on sale in that country, warranty terms read for
  that country, A2L refrigerant (R-454B or R-32), variable-speed, ENERGY STAR cold-climate in cold and mixed zones, NRCan-rebate-like in Canada's cold zones, and in
  very cold and extreme zones at least 80% / 85% of rated heat kept at 5°F (−15°C). Each metric is scaled 0–1 across the systems that passed
  and weighted by the zone's kind (`WEIGHTS`: cold kinds lean on COP and heat kept at 5°F, hot ones on SEER2/EER2). Performance = top score
  (runner-up from another brand); value = top score among budget and mid-tier brands; do-it-yourself = the best MrCool DIY series that
  passes the cold gate, marked "plan it as a supplement" (`supplementOnly`) below the zone's minimum heat kept. 144 picks across 16 zones.
- **Build gate:** `tools/picks/check.mjs` runs first in `npm run build` and fails it when a performance or value pick is missing, a brand
  isn't on sale there or has no warranty terms, a pick uses an older refrigerant, a Canadian cold-zone pick no longer meets NRCan's
  thresholds, a picked pairing has left the ENERGY STAR data, or `checked` is more than 180 days old (warning at 90).
- **Not eligible yet** (no warranty terms read for that country): Canada LG, Samsung, Panasonic, York, Nordyne brands, Midea, TCL, Innova;
  US Panasonic, Hitachi, TCL, AUX, Cooper & Hunter, DuraSTAR, Innova. Reading their warranty pages into `brands.json` lets them compete.
  Other known gaps: no per-model installed prices (ranges by system type only), and every rating stops at 5°F (−15°C).
- **Pages:** `/heat-pumps/picks/` (zone finder + every zone), `/heat-pumps/picks/<zone>/` (7 Canadian, 9 US: the three picks per situation,
  "Why each pick won" with the specs table, the price line, a checklist and the quote form), `/heat-pumps/how-we-pick/`. Routes in
  `src/pages/{ca,us}/heat-pumps/picks/` and `how-we-pick.astro`; markup in `src/components/picks/` (`TopPicks`, `ZonePage`, `ZoneFinder`,
  `PicksIndexPage`, `HowWePickPage`), words and lookups in `src/lib/picks.ts`, styles in `src/styles/picks.css`. The title and h1 name
  the region the way people search ("Best heat pumps for Southern Ontario and southern Quebec", `zoneWhere()`); the zone's label is the eyebrow.
- **Where the picks show:** the hub's `#top-picks` (finder + zone list); every Canadian province page `#picks` (BC, Ontario and Quebec span
  two zones and get one block per zone, headed by the profile's region name); every US metro page `#picks` (hot kinds open on
  "House with ducts"); `/fr/thermopompes/` `#choix` in French (two Quebec zones, "Demander un conseiller" goes to the French form); the CA
  planner's rebates path (a button beside "Match me with one heat pump contractor") and the full plan's older-central-AC card; the US planner's rebates path and
  its climate section. "Get quotes for this" fills the quote form's `brands` field with the pick's name and model (no personal data).
- **Zone finder:** `ZoneFinder.astro` maps the first three characters of a postal code (`FSA_ZONE_RULES`: by letter, then two- and
  three-character prefixes; rural BC `V0` asks the reader to choose) or a ZIP3 (`zip3Zones()`: the metro's zone, or the nearest metro within
  200 miles) to a zone and goes to its page. Nothing typed is sent or stored; only the zone key is kept (`localStorage` `ayh_zone_ca|us`).
- **Analytics (GA4, keys only):** `pick_view` (a block first scrolls into view), `pick_situation` (tab), `pick_quote`, `pick_maker`,
  `pick_open` ("Why we picked it"), with `market`, `zone`, `situation`, `slot`, `brand`; `zone_set` (`market`, `zone`) from the finder.
  Never send a postal code, ZIP or anything a visitor typed.
- **Gotchas:** the global `section { padding: 64px 0 }` hits `section.tp`, so `.tp` sets `padding: 0`. French cards need no-break spaces
  before `°C` and `%` (` `) and French joining words in multi-brand names (`pickName(p, 'fr')`: "Comfort-Aire et Century"); line names
  stay the maker's. BC has two "Home Renovation Rebate" offers, so rebate names are de-duplicated (`uniqueNames()`), and income-qualified
  or free-upgrade programs are left out of the card line (they stay on the province and metro pages).

## Gear picks (2026-11-12, Phase 2 of the plan, first two categories)
The `/products/<category>/` pages are moving from three loosely labelled picks to the plan's three slots. For gear the middle slot is
**Easiest to live with** (do-it-yourself makes no sense for a monitor). Done so far: **radon monitors and kits** and **air quality monitors**,
on both sites. Still on the old list (`src/data/products.json`, `src/data/us/products.json`) and next in line: air purifiers, CO alarms,
dehumidifiers and hygrometers, water testing. Research notes for those (specs, prices, sellers, sources) were gathered on 2026-11-12;
dehumidifiers still need ENERGY STAR integrated energy factors per model (the product finder's PDF exports,
`energystar.gov/productfinder/product/certified-dehumidifiers/details/<id>/export/pdf`, can be read with WebFetch), and water testing
should build on the per-province well testing data already in `src/data/calc/health.json` (free bacteria tests in ON, AB, PE, NL, YT).
- **Data:** `src/data/picks/gear.json`, by hand: `checked`, slot wording, and per category `decidedBy`, `gates` (a list, or `{ ca, us }`),
  `sources` (each may carry `markets: ['us']`), and per country three picks with `name`, `model`, `why`, `facts`, `watch`, `price` (what the
  named seller listed on `checked`), `sellers` (Amazon as a search query through `src/lib/affiliate.ts`, or an https URL), and `onlySeller`
  when only one store sells it (IKEA). Two sellers per pick is Dave's rule; `tools/picks/check.mjs` fails the build on a missing slot, fact,
  gate, source or second seller without a reason, and warns on a missing price. Same 90/180-day review clock as the heat pump picks.
- **Markup:** `src/components/picks/GearPicks.astro` (cards reuse the `.tp-card` styles; slot `easy` takes the navy accent) with a "How we
  picked" box: what decides the slot, the gates, and the sources. It says plainly that we haven't run our own side-by-side tests yet; Dave
  chose first-hand tests of radon and air monitors this winter, and their results belong there once they exist. The category pages render
  it when `gear.json` has the category and keep the old list otherwise; the `/products/` indexes list the new picks' names in slot order.
- **The radon gate:** C-NRPP's approved list of consumer monitors (https://c-nrpp.ca/consumer-erm-report/) is the only independent list in
  North America, so it gates both sites. Airthings' Corentium Home 2 (June 2025) is not on it yet; the original Corentium Home is. US
  long-term kit: Kansas State University's National Radon Program Services ($30 with the lab). Canada: C-NRPP-listed alpha-track kits.
- **Analytics:** `gear_seller` (`market`, `category`, `slot`, `seller`) when someone follows a seller button. Keys only.

## Buying guides (2026-11-12; Dave: "similar buyers guides" to FurnacePrices.ca's, with "an SEO and content authority edge")
Dave sent FurnacePrices.ca's footer (best-of reviews for furnaces, central AC, heat pumps, ductless and boilers; buyer guides for furnaces,
AC, heat pumps, boilers, HRV/ERV, air filtration, water heaters, smart thermostats, duct cleaning and commercial HVAC) and asked for the
same kind of guides with an edge. Their pages, read that day: the "best heat pumps" page has no date or named author, a brand grade "we
created" with no weights, and a mostly-BC rebate section with a rebate that expired in December 2023; the buying guide is national, with
no province or city prices and unsourced cost tables. They have a named founder with press mentions, about 15 brand reviews, calculators
and a site publishing since 2013, so we don't expect to beat them on head terms soon. **The edge every guide must carry:**
1. **Local numbers.** A national guide plus local pages whose figures are computed from that place's climate, prices and rebates.
2. **Proof on the page.** Exact certified models, a source and a date for every kind of number, the method, a named editor
   (David Bussell, `/about/#editor`), an updated date, Article + FAQ markup.
3. **Numbers only we publish**, computed from our own data (the first: heat pump vs gas furnace in every city).
4. **"Do you need it?" first**: the test that proves the need and the cheaper fix, before any product.
5. **Current rebates** from the program data, and (to do) French versions for Québec under `/fr/`.
Dave chose **heat pumps first** as the template. Next, in his list's order of value: furnaces (needs certified-model data; it's furnace
season), central AC, water heaters, smart thermostats, HRV/ERV, air filtration, boilers, duct cleaning (a "when to skip it" guide tied to the
duct leakage test pages). The commercial HVAC guide belongs on audityourbuilding.com.
- **The frame:** `src/components/guide/GuideShell.astro` + `src/styles/guide.css`. Props: `path`, `title`, `h1`, `eyebrow`, `crumbs`,
  `published`, `updated`, `asOf` (label + ISO date for each kind of number, printed as "What was checked when"), `toc`, `faqs`, `sources`,
  `methodHref`. Slots: `lede`, `short` ("The short version"), default (the sections), `method`. It prints the byline, the FAQ, the sources,
  "Who wrote it" and "How it's paid for" (Canada: one contractor's referral fee; US: no referral fees), and emits BreadcrumbList, Article
  (`articleSchema()` in `src/lib/schema.ts`, author = `EDITOR`) and FAQPage. Both about pages gained `#editor` ("Who edits this site").
- **Heat pump buying guide:** `/heat-pumps/buying-guide/` on both sites (`src/components/hp/BuyingGuidePage.astro`). Order: does it pay with
  what you heat with now → measure the house first → which type → our picks by zone (zone finder + best-performance pick per situation) →
  what the numbers mean (and the picks' gates) → sizing → cost to buy → cost to run → rebates → quote checklist → the local pages. The
  province pages (Canada) and metro pages (US) are its local versions; each now links up to the guide and the data page.
- **Heat pump vs gas furnace:** `/heat-pumps/vs-gas-furnace/` (`VsGasPage.astro`), the first "numbers only we publish" page: cost of heat
  from a cold-climate heat pump and a 95% furnace in all 70 Canadian cities and 26 US metros, the **gas price at which they tie**, a year
  of heat for a reference house (Canada), the gas account's fixed charges, and oil, propane and baseboards. Finding on 2026-11-12: the
  heat pump is cheaper to run than gas in 15 of 66 Canadian cities (all of Quebec, Nova Scotia and New Brunswick; within 10% in most of BC;
  gas wins in Ontario and the Prairies) and in 12 of 26 US metros. Say it straight: the pages do.
- **Where the numbers come from:** `src/lib/hp-run.ts` (`runRowsCA/US`, `runSummary`, wording helpers). Canada uses the calculators' city
  prices (`resolvePrices`, marginal "variable" prices, city overrides included), `systemEfficiency('ashpCold', hdd)` and the reference house
  (1966–1980 detached, 149 m²); the US uses `costsUS` (EIA state averages). Every sentence with a count or a range is built from these at
  build time, so a price update rewrites the pages. Don't hand-type a figure into a guide.
- **Known weak spot:** our Canadian installed prices cite FurnacePrices.ca (`src/data/picks/heatpumps.json` costs, and the planner's
  `model.json` costs). The guide adds the Dunsky/Canadian Climate Institute range as a second source; brokered quotes should replace both.
- **Gotchas:** the footer's live year is `id="year"`, so never use that id for a section (the yearly table is `#dollars`). `hp.css` keeps
  `.hp .dt th` on one line; wide tables use `.hp.guide table.g-num thead th` to wrap. Places that share prices and seasonal COP share one
  table line (30 Ontario cities would otherwise repeat). The heat pump menu on both sites now lists the buying guide, the picks and the
  data page.

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
- **Rebates first (C):** both planners open with "What would you like help with?": *Find rebates for work I'm planning* runs a
  four-step path through the same form (location → projects → heating → where the project stands: status, timing, income-qualified
  programs or not) and ends in a rebate check per project; *Figure out what my house needs* is the six-step plan. The paths share one
  `show()`/`validate()` with step ids `1,'p',3,'t'` vs `1..6` (`FLOWS`, `setIntent()`, `maxIdx` by position); the steps nav is rebuilt
  per path. Results carry `data-mode="rebates"`, which hides the `.full-only` sections, and "Build my full plan" switches paths with every
  answer kept. The state lives in the hash as `mode=rebates&proj=…&stage=&when=&inc=` (CA also `nwin`, `ndoor`). CA
  (`finishRebates()` in `src/pages/ca/plan/index.astro`): every open entry of `src/data/calc/rebates.json` for the project, sized
  with `rebateAmount()` from a typical home (set amounts vs "about $X for …"), its product and R-value conditions, prerequisites read at
  build time (`rebateFacts()`: `pre` audit/reserve/contractor, `doors`, `deadline`, `amountText`, `cond`), a tally that counts the best
  program per project, and "what to do first" (evaluation first / optional / pre-approval / envelope before heat pump / what to ask
  for on quotes / federal timing). An entry can say `doors: false` (Rénoclimat); the regexes treat "evaluation is optional" as not
  requiring one. US (`finishRebates()` in `src/lib/us/plan-client.ts`): the metro's open rebates whose `keys` cover the project, with
  `pre` chips, `chg` (the "Changing" note) and `who`, the utility gate, and the same first-steps logic with `firstStop()`.

## The French site (2026-11-07, bucket D of the November 6 review)
The Québec-facing pages of audityourhome.ca exist in French under **`/fr/`** (`src/pages/ca/fr/`, built into `dist-ca/fr/`; the US
site never has them: postbuild's wildcard rule 301s `/fr/*` on audityourhome.com to audityourhome.ca). Pages: `/fr/` (home),
`/fr/planificateur/` (the door to the planner, which is still English: the quick-start form posts `postal` and `age` to `/plan/`),
`/fr/programmes/` + `renoclimat`, `logisvert`, `remise-federale-thermopompe`, `/fr/quebec/`, `/fr/villes/` + the 11 Québec cities
(Québec City's French slug is `quebec`), `/fr/trouver-un-conseiller/`, `/fr/comment-ca-marche/`, `/fr/thermopompes/`,
`/fr/a-propos/`, `/fr/confidentialite/`, `/fr/merci/` (noindex). Everything else (tests, calculators, the other 59 cities, the Ontario
directory) is linked "en anglais"; say so rather than hiding it.
- **Layout:** `Base.astro` takes `lang="fr"` (French header `FrHeader.astro` and footer `FrFooter.astro`, `<html lang="fr-CA">`,
  `og:locale fr_CA`, no "other site" bar) and `altPath` (the same page in the other language, root form). With `altPath` the layout
  emits the `fr-CA`/`en-CA` hreflang pair; an English twin also shows the "Cette page existe en français →" bar (`.lang-bar`, global.css).
  Every English twin carries `altPath` (home, plan, programs hub, the three program pages via `FR_PATH`, provinces/quebec, cities hub and
  the QC city pages via `frPath`, find, how-it-works, heat-pumps/quebec, about, privacy, thanks); the English footer links `/fr/`.
- **Postbuild** (`tools/country/postbuild.mjs`) strips only the `en-*` hreflang links the build left and keeps `fr-CA`: a French page keeps
  its pair as emitted; an English twin ends up with `fr-CA` + `en-CA` + `en-US` when the US site has the page, `fr-CA` + `en-CA` otherwise.
  The glossary linker skips `/ca/fr/` (the glossary is English).
- **Data:** `src/data/fr/programmes.json` is the hand-translated French of the three program records in `programs.json` (keep them in
  step: a fact changed in one changes in the other); `src/data/fr/villes.json` is generated by `node tools/fr/build-villes.mjs` from the
  research behind the city pages (`tools/local-pages/out/cities.json` + `src/data/local/cities/*.json`): numbers only, the French
  sentences are composed in `src/lib/fr/villes.ts` (climate, housing, heating shares, radon 2012 + 2024, wells); `src/data/fr/municipal.json`
  (French summaries of the six municipal programs, keyed by URL) and `src/data/fr/villes-notes.json` (the climate notes and hazards,
  keyed by city slug) are hand-written. Re-run the generator after `gen_pages.py`.
- **Components with a French mode** (`lang="fr"`): `EraBar`, `HousingPortrait`, `ThermalCompare`; `Photo` takes a French `hud` string.
  `FrLeadForm.astro` posts to the same Netlify form `audit-request` (hidden `langue=fr`, which Netlify doesn't store; the French
  `subject` and the `fr-…` `context` mark the request) and lands on `/fr/merci/`.
- **Numbers in French:** `n()` formats with `fr-CA` (narrow no-break space), `deg()` gives `−24,3 °C`, percentages are `14 %`.
- **Federal heat pump rebate (checked 2026-11-07):** the program page (updated November 5, 2026) now says heat pumps installed on or
  after **November 1, 2026** by an HVAC contractor are claimed retroactively once the portal opens (early 2027), nothing is paid before
  then, one rebate per household, receipts within six months, the program runs to March 2034, and it publishes the after-tax income
  table (Québec: $41,228 for one person to $140,225 for five or more). `programs.json`, `rebates.json`, `provinces.json`, the CA planner's
  federal-timing text and the rebates article were updated; the French page has the same facts.

## The buying-guide set (2026-11-13; Dave: "Can you build the other guides. I will push everything after")
Eight more guides on the GuideShell frame, a hub, and the commercial one on the building site. **Not pushed or deployed when written.**
- **Where:** `/buying-guides/` (hub, `GuidesHub.astro`) and `/buying-guides/{furnaces,air-conditioners,water-heaters,smart-thermostats,hrv-erv,
  air-filtration,boilers,duct-cleaning}/` on both home sites (`src/components/guide/*Guide.astro`, thin routes in `src/pages/{ca,us}/buying-guides/`).
  The heat pump guide stays at `/heat-pumps/buying-guide/` and is listed first in `GUIDES` (`src/lib/guide-run.ts`). Building site:
  `/commercial-hvac/` (`src/pages/bu/commercial-hvac.astro`, NRCan's staged order: equipment is replaced last).
- **The numbers:** `src/lib/guide-run.ts`. `guideRows(market)` gives one row per Canadian city (70) or US metro (26): fuel prices per GJ,
  the reference house's heat demand (same model as the planner; 1966–1980 detached, 149 m² / 1,600 sq ft), hot water for three people,
  cooling kWh × SEER, the legal minimum SEER2, and the heating most homes there have (`sys`). Helpers: `yearAt/yearBy` (a year of heat),
  `tieCop` (the COP above which a heat pump beats gas), `coolCost`, `waterCost` (heat pump water heaters include the house heat they take),
  `setbackShare`, `ventilation` (code or ASHRAE 62.2 airflow, heat carried out, heat recovered, fan watts), `yearOfWatts`, `rebatesFor`
  (open `hpwh` and `thermostat` rebates from the calculators' data, amounts built from `kind/rate/cap/pct`), `spread/spreadWords/rangeWords/count`.
  `hubLines()` gives each guide's headline figure for the hub cards. Every sentence with a number is built from these; don't type one in.
- **Standards and guidance:** `src/data/guides/facts.json` (`checked`, a `sources` map, and the constants each guide quotes: AFUE levels and
  the US 95% rule's status, SEER2 minimums and ENERGY STAR levels, the MERV table, ventilation rates and HRV minimums, boiler rules, EPA's
  duct-cleaning figures, the 15- and 12-year horizons used for "worth paying extra"). `tools/picks/check.mjs` warns at 90 days and fails
  the build at 180, like the picks. Installed prices: Canada furnace and water heaters from FurnacePrices.ca (still the weak spot), Canada
  AC from HomeStars, US furnace/AC/boiler from the EIA's 2023 equipment-cost report (2022 dollars). **Where we hold no price source (heat
  pump water heaters, HRVs, US water heaters) the guide gives "what it is worth paying extra" instead of a price.**
- **Tables:** `PlaceTable.astro` takes `rows` and `cols` (functions of a row). It leads with the largest city per province (Canada) or the
  ten largest metros (US) and folds every other place into a `<details class="g-all">`, so phones get a short table and the page still
  carries all 70 or 26 local figures. `GuideList.astro` is the "More buying guides" block at the foot of each guide.
- **US spelling:** the guides are written once. `GuideShell` renders its slots to strings and, on the US site, runs `usSpellHtml`
  (`src/lib/us/spell.ts`: mold, liters, meters, color, odor, vapor…) over text nodes only; FAQ text goes through `usSpell`. Units still
  need a conditional in the guide (°C/°F, litres/gallons).
- **Findings on 2026-11-13 (the pages say them straight):** 95%→98% furnace saves $15–$80 a year in Canada, $0–$50 in the US; a SEER2 18
  air conditioner saves $5–$70 a year over the minimum in Canada, $35–$265 in the US; gas tankless is the cheapest water heater to run in
  every Canadian city with gas, and a heat pump water heater beats an electric tank everywhere; an HRV's recovered heat less its fan power
  runs from −$30 to +$40 a year where most homes heat with gas and $130–$1,200 where they heat with baseboards (it comes out ahead in 6 of
  26 US metros); a condensing boiler is worth a further $30–$180 a year in Canada when the return water is cool enough to condense.
- **Wiring:** Canada: a fourth "Buying guides" column in the Learn menu. US: a new top-level menu labelled **"Guides"** (not "Buying
  guides": six items must fit the bar from 1141px; the longer label overflowed up to about 1225px). Footer links on all three sites, a third
  card on the heat pump hub, guide buttons first under "Related" on the matching `/learn/` pages, a line on the air purifier and air
  quality monitor product pages, and a link from `/audit-levels/` on the building site.
- **Gotchas:** an Astro table row that mixes `<strong>` and template-literal expressions once emitted a stray `<strong>` after `</table>`
  (everything below went bold): build such tables from an array with `set:html` for the rich cell, as the furnace guide's first table does.
  One direct quote only (the EPA's duct-cleaning sentence); the rest of the guidance is paraphrased with the source at the foot.
- **Not done:** model picks for furnaces, air conditioners, boilers, thermostats and HRVs (needs certified-model lists; data.energystar.gov
  is blocked here); French versions under `/fr/`; per-province pages for each guide (the place tables carry the local numbers for now); a
  quote form on the furnace, AC and boiler guides (Dave's call: it changes what the referral partner receives).

## From another conversation: selling do-it-yourself heat pumps (2026-11-13, a plan only; nothing built in this repo yet)
Dave asked another chat for a plan to sell install-it-yourself heat pumps through audityourhome.ca. It is the Claude Doc "Selling DIY heat
pumps through AuditYourHome.ca: plan" (claude.ai/artifact/DKd9dRFvhy2SBwAeGVPtgM). Read it before touching the do-it-yourself picks.
- **Its recommendation:** referral first (Kanartic, made in Québec, and MRCOOL DIY through its Canadian distributor Acclimatic), framed as
  "you mount it, licensed trades finish it"; take orders on the site only after referrals prove demand (its gates: 300 outbound clicks or
  10 tracked sales in 60 days, then 10 sales a month and a workable dealer margin).
- **Its rule for copy: never publish "no professional needed" for Canada.** Québec requires a licensed electrical contractor, refrigerant
  work is certified-trade work everywhere, and BC's safety authority says retail availability doesn't mean a unit can be self-installed.
  A fully self-installed unit loses the main rebates; Kanartic says an RBQ-licensed commissioning visit keeps LogisVert (unconfirmed with
  Hydro-Québec), and LogisVert needs a unit bought from a Québec retailer.
- **Our copy now follows that rule (fixed 2026-11-15, Dave: "yes - fix and then push").** The wording lives in `src/lib/picks.ts`:
  `diyWho(market, lang)` is the line on every do-it-yourself card ("You buy the kit and mount it; an electrician wires it and a
  refrigeration technician starts it." in Canada; the US line keeps to the electrician and the circuit), `diyRules(market)` is the first
  watch-out on the zone pages and the body of the buying guide's "Can I install a heat pump myself?" answer (Québec: an electrical
  contractor even in a house you own, and a certificate for refrigerant; BC: an electrical permit for every heat pump, and retail sale
  doesn't mean self-install), and `DIY_RULES_SOURCES` (CMEQ, quebec.ca's halocarbon qualification page, Technical Safety BC) with
  `DIY_RULES_CHECKED` print under the Canadian zone pages and the guide ("Rules for installing one yourself" in "What was checked when").
  The slot's short label is "Pre-charged lines you mount yourself; licensed trades finish it". Nothing on the Canadian site says the
  warranty or the install "holds without a contractor" any more; keep it that way.
- **Its Phase 1 is work for this repo:** an "Install it yourself" section on the .ca site (the Best do-it-yourself picks with buy links and
  the affiliate disclosure, a per-province "what you do / what the electrician does / what the commissioning technician does", a
  DIY-against-rebate calculator, French versions for Québec, outbound click events in GA4, keys only).
- **Outreach on 2026-11-13 (from dave@clickshift.ca):** Acclimatic, Klimaire and Hydro-Québec's LogisVert desk by email, Kanartic through its
  contact form. No replies by the evening of the 13th. With Dave: a FlexOffers publisher account for Senville's Canadian programme, and
  the RBQ question (its form needs a phone number; the text is a Gmail draft).

## Thin content and affiliate links: the plan and the publishing gate (plan 2026-11-15; Dave approved all seven decisions on 2026-11-16)
Dave's location guide Pecker & Jay ran into thin-content and affiliate trouble and had to move domains; he asked for a plan to keep the
three audit sites clear of the same. It is the Claude Doc "Keeping the audit sites clear of thin-content and affiliate problems: plan"
(claude.ai/artifact/SwT317jHDMUAQhfKAfzQPr). Read it before adding any page-per-place set or any affiliate or referral link.
- **Nothing is wrong today (Search Console, read 2026-11-15):** no manual actions on any site; audityourhome.ca about 1,390 pages indexed
  and 1 "Crawled – currently not indexed"; audityourhome.com about 3,190 indexed and 4 (its 395 "duplicate" pages are the old `/ca/`
  addresses); audityourbuilding.com still processing. **The properties exist** (the "still Dave's: Search Console" lines further down are
  out of date): `sc-domain:audityourhome.ca`, and URL-prefix properties for `https://audityourhome.com/` and `https://audityourbuilding.com/`.
- **Where the exposure is:** not the affiliate links (46 links on 12 product pages, all `rel="nofollow sponsored noopener"`, disclosure
  above the first merchant link on every page) but the city grid: 1,330 of .ca's 1,957 indexable pages (15 services × 70 cities, 4
  calculators × 70) and 70 of the building site's 86. With place names and numbers blanked, a service-in-a-city page shares about 98% of
  its wording with its siblings; its local facts are real but short.
- **The measure:** "words only that page has" = words in sentences on no other place's page of the set and on none of that place's
  other pages (name blanked, numbers kept). `npm run gate` (= `node tools/thin/gate.mjs --sets`) prints it for every set. **The plan's
  first table overstated it** (its script left names like "St. Catharines" and "Strathcona County" unblanked, which pushed sentences
  every page shares under the 90% line); the gate blanks names properly and the plan doc was corrected on 2026-11-16. Medians now:
  calculators 350–1,506 words (energy costs 665), home energy audit 395, asbestos 298, radon 257, energy bill 237, CO 230, well water
  221, heat loss 205, thermal imaging 153, ventilation 148, duct leakage 146, mold 139, blower door 138, attic insulation 86, combustion
  safety 66, lead paint 55; 429 of 1,050 service-in-a-city pages under 150 before the fold.
- **What the searches say (.com property, Aug 24–Nov 13, where these pages lived until Nov 2):** 338 clicks in all; the energy-cost
  calculator's city pages brought 88 of them at an average position of 8; service-city pages 102; four service sets (duct leakage,
  ventilation, attic insulation, combustion safety) brought 5 between them. A place page earns its keep when the answer changes with the place.
- **Folded (decision 1):** the city pages for duct leakage testing, ventilation assessment, attic insulation inspection and combustion
  safety test (280 pages) carry `noindex` and are out of the sitemap; they stay up and linked, and the four national service pages stay
  indexed. The list is `folded` in `src/data/index-policy.json`; `src/pages/ca/services/[service]/[city].astro` reads it
  (`indexable={!folded}`) and postbuild's sitemap already lists indexable pages only. .ca: 1,677 indexable pages, city grids 62.6%.
- **The publishing gate (decisions 2 to 4):** `tools/thin/gate.mjs` runs last in `npm run build` over the three built sites. Rules and
  exceptions live in `src/data/index-policy.json` (change them only with Dave's OK): (1) 150 words of its own for every indexable page
  in a page-per-place set (`sets` of type `grid` or `place`), unless its kind is `folded` or has a `pending` exception with an end
  date; (2) a page type with 12 or more indexable pages that `sets` doesn't list is a breach, so **a new set ships noindex and is listed
  once it passes**; (3) an indexable page under 250 words needs a reason in `thinOk`; (4) affiliate links only on the page types in
  `affiliate.allowed` (`/products/*/` today), marked `rel="sponsored"`, with the disclosure above the first one; (5) the city grids'
  share of indexable pages may not pass `repeatShareMax` (.ca 63%, building site 82%); (6) folded pages really are noindex and nothing
  noindex is in a sitemap. A place whose name isn't found on its own page is reported: add how it is written to `alias`.
  **It warns until `enforceFrom` (2026-11-30) and fails the build from then on.** `THIN_GATE=warn npm run build` is the override for
  an urgent deploy, with Dave's OK. `--pages` lists every page that breaks a rule.
- **Open before 2026-11-30:** 25 pages would fail: 14 service-in-a-city pages just under the line in carbon monoxide testing, energy
  bill analysis and heat loss calculation (116 to 145 words), and 11 of the 15 `/areas/*/mold-testing/` pages (109 to 145). Strengthen
  them, or ask Dave for an exception. **Open before 2026-12-15 (decision 5):** the `pending` sets, lead paint, mold, blower door and
  thermal imaging city pages (184 short pages). The city records hold no local facts beyond what those pages already use (checked
  2026-11-16: climate station, design temperature, census construction eras, heating fuels, utilities, radon, wells), so new facts need
  new public data; the ranking plan below says which. If none is found for a set, fold it.
- **The area pages** (`/areas/<area>/<service>/`, 15 Ontario and BC areas × 6 services, 90 pages) are a third grid the plan's count
  left out. They hold more of their own (well water 854 words, home energy audit 657, radon 530) and they rank: 24 clicks and about
  16,500 impressions in the 12 weeks. Their local detail (the health unit, the towns with bottle pick-up) is the model for the city pages.
- **Standing rules (decisions 3 and 4):** no new page-per-city set; a new place page is provincial unless a fact on it changes by city;
  the per-province buying guides wait for search demand; **no affiliate or referral link on a place page** (city, province, metro,
  zone, area), so the do-it-yourself heat pump buy links go only in the "Install it yourself" section and its product pages, whose
  paths then get added to `affiliate.allowed` and whose hosts to `affiliate.links`.
- **Weekly Search Console check (decision 6):** the scheduled task "Audit sites: weekly Search Console check" reads the three
  properties in Dave's Chrome each Monday, adds a row to the "Weekly readings" table at the foot of the plan doc, and notifies him
  only when a trip wire in the plan's Monitoring section is crossed. **The gate in the new-site skill (decision 7)** was proposed to
  Dave as a skill update on 2026-11-16; it is his to save.
- **What ranks, and the plan to strengthen it:** the Claude Doc "What ranks today on the audit sites: plan to strengthen and
  fact-check it" (claude.ai/artifact/NLdkFr2wFwZPfwQchdMVR7), written 2026-11-16 from Search Console and a first accuracy pass.
- **Dave's answers on the ranking plan (2026-11-16):** start all four pieces of work (Ontario electricity prices; the well water
  pages, naming public bodies only: health units and provincial labs, no private labs; the 25 pages just under the gate's line; a title
  and description test on the Toronto, Montreal and Winnipeg energy cost calculators only). **Lead paint city pages stay indexed** on a
  standing exception (`accepted` in the policy, review 2027-02-15: the gate prints a note when a review date passes, never a failure).
  A monthly price check as a scheduled task: yes. Deploy all three sites once he has pushed (his OK covered the seven commits through
  `b04a269`; anything later needs its own OK).
- **Prices re-read on 2026-11-16** (`src/data/calc/prices.json`): Ontario electricity from the OEB's November 1, 2026 prices (time of
  use 9.1 / 14.6 / 18.9 c, average 11.854 c at the OEB's 64/18/18 weights) and the Ontario Electricity Rebate of 15.7% (net factor
  1 + 0.13 − 0.157 = 0.973): Toronto Hydro 0.188 → 0.195 all-in and 0.144 → 0.147 for one more kWh, Hydro Ottawa 0.178 → 0.184 and
  0.142 → 0.145; delivery and regulatory charges as read on October 8. Manitoba Hydro gas from its November 1 rates (5.88 c commodity,
  15.71 c delivery): 0.313 → 0.304 all-in, 0.236 → 0.227. Confirmed unchanged the same day: Nova Scotia Power's 19.128 c energy
  charge, Manitoba Hydro's 9.970 c, and that Hydro-Québec's 2025 comparison is still the latest edition.
- **How a later re-read is recorded:** the record gets `checked` (and `tariffDate` when `allInCurrentTariff` was rebuilt), its basis
  text is rewritten with the new components, and a line goes in the file's `updates` list (`date`, `label`, `provinces`, `what`). The
  global `asOf` moves only when every record has been re-read. Pages then say so by themselves: `pricesCheckedWords(rp)`
  (`src/lib/calc/data.ts`) prints "October 8, 2026 (electricity November 16, 2026)" on a city's calculators, the appliance calculator
  uses `rp.elecAsOf`, and `PRICE_UPDATES` adds the update lines to "What was checked when" on the Canadian guides, the heat pump guide
  and the heat pump vs gas page. The arithmetic for each record is spelled out in its basis text: redo it from there, never by eye.
- **Monthly price check:** the scheduled task "Audit sites: monthly energy price check" (the 2nd of each month, 8:24 Eastern, cloud
  only) clones the public repo, reads every electricity and gas record's sources and reports what changed. It changes nothing. Known
  dates: Alberta's Rate of Last Resort ends 2026-12-31; Enbridge's next quarterly reset and Nova Scotia Power's approved step are
  2027-01-01; Manitoba Hydro gas resets 2027-02-01; SaskPower plans an increase 2027-02-01.

## State (2026-11-12)
- **Live: everything through `82ade9f`**: the heat pump picks (Phase 0 and 1), the first two gear categories (radon monitors, air quality
  monitors), and the other session's auto-reply function (`submission-created`, live on .ca; switched off in code on .com and the building
  site). Deploys from `git archive 82ade9f`: **audityourhome.ca** `6af6338efdc2d32c7b5c4127` (21 redirect rules, 1 function),
  **audityourhome.com** `6af6342f05727cb2b188c221` (654 redirect rules, 1 function). audityourbuilding.com was not redeployed (its pages
  are unchanged); it is still `6af4ce7ed8661217efec6e73`. Dave chose "Deploy all" knowing the auto-reply would go live on .ca with it.
- The first push of the day was refused: another session had pushed `0c2a283` and `14a75e7` (auto-reply, Resend notes) to `main`. Our four
  commits were rebased on top (new hashes `9e106b2`, `ef04ff1`, `c02590d`, `82ade9f`) and pushed with `push-nov10.bat`. **Before bundling,
  check GitHub first**: the laptop's Linux shell can read the public repo (`git ls-remote origin refs/heads/main`, or a fetch into
  `refs/remotes/origin/main`), so a moved `main` shows up before Dave runs the push file.
- Checked live from the laptop's browser pane: .ca zone page (h1 and title "Best heat pumps for Southern Ontario and southern Quebec", one
  situation panel shown, 9 cards) at 375px and 1280px, the radon gear page at 1280px (seven seller links), every new and changed page
  answering 200 (picks index and zones, how we pick, BC and Ontario with two zone blocks, `/fr/thermopompes/` with two), `/ca/plan/` →
  `/plan/`, `/geo.json` → `ca`; .com hot-humid, very-cold and marine zone pages and the Miami and Phoenix pages direct; with the
  `ayh_site=us` cookie set through `/switch/` the picks index, how we pick, the hub and both gear pages (AQ page at 375px), and the privacy
  page's new `#requests` anchor; without it, shared pages redirect a Canadian visitor to .ca again (cookie cleared afterwards). Forms still
  listed on both projects. The auto-reply has had no submission yet, so its first log entry is still to read (Netlify → audityourhome-ca →
  Logs → Functions).

## State (2026-11-11)
- **Live: everything through `fa368d6`**, the quiet sky (see above). Same route as below: `_to_delete\ayh-nov11-quiet.bundle` fetched
  into the laptop's `two-sites` branch, Dave ran `push-nov10.bat` (pushed `d57bc3a` and `fa368d6`), then deployed in ship order from
  `git archive`: **audityourbuilding.com** `6af4ce7ed8661217efec6e73`, **audityourhome.ca** `6af4cedaa6c736a91a850d05`, **audityourhome.com**
  `6af4cf75f844a78e68e41f69` (redirect rules unchanged: 2, 21 and 643). Checked live from the laptop's browser pane at 375px and 1280px: the
  new wash with no animations and no old sky CSS on the three home pages, the building Toronto page, the .ca thanks page and .com Phoenix;
  .ca `/ca/plan/` → `/plan/`, `/geo.json` → `ca`, `/fr/` in `fr-CA`; the commercial address on both home sites and .com `/` and
  `/provinces/ontario/` still redirecting a Canadian visitor; every form still listed. The `ayh_site=us` cookie set to view the .com home
  from Canada was cleared afterwards.
- **Before that, from the morning deploys: everything through `4fead21`** (the US pictures, the planner and switch fixes, the
  three-site build and audityourbuilding.com, the sky look, and buckets A–D of the November 6 review including the French site). Pushed from Dave's laptop on 2026-11-11 (the cloud
  task can't push: the repo isn't in its sources; the commits came over as `_to_delete\ayh-nov10.bundle`, were fetched into the
  laptop's `two-sites` branch from the device shell, and Dave ran `_to_delete\push-nov10.bat` = `git push origin two-sites:main`;
  Computer use never reached the session, so it couldn't drive Git GUI). Then deployed in ship order, from `git archive`:
  **audityourbuilding.com** `6af4bbb129c81bd78b208fe0` (replaced the "Launching soon" deploy `6aeb3cb6f3fadba36951c0d6`; the old `notify`
  form and its one signup, from 2026-11-08, are still in Netlify Forms), **audityourhome.ca** `6af4bc6a7df88c1242ef9672` (1,946 pages, 21
  redirect rules), **audityourhome.com** `6af4bd55eaccbc9e59813cdf` (643 redirect rules).
- Checked live from the desktop app's browser pane on Dave's laptop (in Canada): the building site's home, Toronto page and request form at
  375px and 1280px, one GA include per page (so no Netlify snippet double-count); on .ca `/ca/plan/` → `/plan/`, `/geo.json` → `ca`,
  `/switch/?to=%2Fplan%2F` → the planner, `/services/commercial-energy-audit/toronto/` → the building site, the French pages (`lang="fr-CA"`,
  fr-CA/en-CA hreflang, 375px and 1280px) and the federal rebate page's November 1 rule; on .com `/provinces/ontario/`, `/fr/` and `/plan/` →
  .ca for a Canadian visitor, `/cities/phoenix/` stays, the commercial address → the building site, the US planner's two paths, Boston's
  sponsor note at 375px. The `ayh_site` cookie the check set in the pane was cleared afterwards.
- Forms: `building-audit-request` detected on the building site (0 submissions; the project's "any form" email notification covers it); .ca `audit-request` and `heat-pump-quote`; .com `us-question`, `heat-pump-quote` and the legacy `audit-request`. Netlify's field list for
  `audit-request` doesn't include the French form's `langue`, so don't count on it: French requests show as such in `subject`
  ("Demande d'évaluation en français (…)") and `context` (`fr-…`), which are registered.
- Still Dave's: Search Console for audityourhome.ca and audityourbuilding.com, the audityourhouse.com
  alias and DNS (see 2026-11-02), and bucket E of the November 6 review (parked).

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
  Notifications are set per site in the Netlify UI (Forms → notifications).
- **Email addresses (Dave, 2026-11-21):** each residential site shows and replies from its own **contact@** address,
  contact@audityourhome.ca and contact@audityourhome.com (`contactEmail` in `SITES`, `src/config/site.ts`; the footer, forms'
  email fallbacks, privacy, about and thanks pages and the Organization JSON-LD read it per site). Both are Google Groups in the
  Click Shift Workspace (Dave owner, team@clickshift.ca member); both domains have Google MX and SPF in GoDaddy since 2026-11-21.
  audityourbuilding.com has no inquiry yet, so it keeps Dave's address (`BUILDING.contactEmail`) until its first real request.
  The hello@ addresses are gone; don't bring them back.
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
