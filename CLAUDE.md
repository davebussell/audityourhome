# audityourhome.com + audityourhouse.com — rules for Claude

Portfolio-wide rules and the registry of every site live in `davebussell/portfolio-hq` — read its CLAUDE.md too, then `README.md` here.

## Every chat
1. **First:** attach this repo (`list_repos`, then `add_repo` with push access) and clone it. Work in that clone. Do not start from the
   laptop folder (`OneDrive\Desktop\audityourhome`, stale since Oct 12), a zip or the live site.
2. **Push at milestones**, not only at the end: a chat's workspace can disappear (it already did once for this site).
3. **Last:** commit, push to `main`, deploy (below, with Dave's OK in the chat), then confirm the live URLs. "Done" means pushed **and** live.
   Never deploy anything that is not pushed first: on 2026-10-26 GitHub was two weeks and 300 files behind the live site because
   deploys had been uploaded from chat workspaces without a push.

## Two sites, one codebase (since 2026-10-29)
- **audityourhome.com** = Canada only (AuditYourHome), built from `src/pages/ca/`. **audityourhouse.com** = United States (AuditYourHouse),
  built from `src/pages/us/`. Both are served from the root of their own domain: `audityourhome.com/cities/toronto/`,
  `audityourhouse.com/cities/phoenix/`. Dave chose this on 2026-10-29 (both at root, a second Netlify site, the AuditYourHouse brand).
- A page's country comes from its build path (`countryOf(Astro.url.pathname)`, `src/lib/country.ts`); its published address is
  `publicPath()` of that (the prefix dropped). **Every link in the source is root form** (`/tests/radon/`), never `/ca/...` or `/us/...`;
  cross-site links are absolute (`COUNTRIES[c].origin`, e.g. the switcher, footer, planner hand-offs) and carry `?site=<code>`.
- Brand per site: `SITES` / `siteFor(country)` in `src/config/site.ts` (name, domain, url, tagline, description). `SITE` is still the
  Canadian config and the operator's details. Logo wordmark, og:site_name, canonical, JSON-LD (`absolutize()` in `src/lib/schema.ts`
  turns root-form paths into the page's own origin), titles and the footer all follow it.
- `npm run build` = `astro build` → `tools/glossary/link.mjs` → `tools/country/postbuild.mjs`, which splits `dist/` into **`dist-ca/`**
  and **`dist-us/`** (shared assets + that country's pages at the root), writes cross-domain hreflang between twin pages, each site's
  `sitemap.xml` (+ `sitemap-index.xml`), `robots.txt`, `404.html` and `_redirects`. It fails if a page is built outside `src/pages/ca`
  or `src/pages/us`, so no global pages: about, privacy, 404 and account live under each country tree.
- Redirects (`dist-*/_redirects`): on audityourhome.com `/us/*` → `https://audityourhouse.com/*` and `/ca/*` → `/*` (the pages lived under
  `/ca/` from Oct 12 to Oct 29); on audityourhouse.com `/ca/*` → `https://audityourhome.com/*` and `/us/*` → `/*`. Nothing redirects by
  visitor country any more (it would hide the home pages from Googlebot): `OtherSite.astro` shows a "You're on the Canadian/US site" bar
  instead, fed by the `/geo.json` rewrite (`public/geo/*.json`, rules in postbuild) and silenced by the `ayh_site` cookie.
- The dev server keeps the prefixes (`/ca/...`, `/us/...`), so root-form links don't resolve in `npm run dev`; check built output
  (`npx http-server dist-ca`).

## State (2026-10-29)
- `main` = the split into two sites (this section). Live: audityourhome.com deploy `<record after deploy>`; audityourhouse.com
  deploy `<record after deploy>` (Netlify site `audityourhouse`, created 2026-10-29).
- Earlier: live deploy `6ae0a1236ceaccd2859a083d` (2026-10-27) = `main` at `045017b` (regional rewrite); before that
  `6ad7e24cad90198c04485fa1` (2026-10-20), whose source was recovered from Netlify's "Download source code" on 2026-10-26.
- Stack: Astro 5, data in `src/data/*.json`, generators in `tools/`, Supabase (accounts and alerts, Canada only, not enabled) in `supabase/`.

## Netlify
- Project `audityourhome` (`ac0a6bef-3d1a-4b0c-9234-5da336851fcd`) serves audityourhome.com from `dist-ca/` (`netlify.toml`).
- Project `audityourhouse` (id: `<record after creation>`) serves audityourhouse.com from `dist-us/` (`netlify.us.toml`).
- **Neither is linked to this repo**: deploys are uploads, so a push changes nothing live. Never create another Netlify site.
- Both tomls: `npm run build`, Node 22, `FORMS=netlify` (renders the forms as Netlify Forms) and `AYH_SITE=ca|us`, which postbuild checks
  against Netlify's `SITE_NAME` so the wrong toml can't publish one site's pages to the other.
- Netlify Forms: Canada `audit-request`, `heat-pump-quote`; US `us-question`, `heat-pump-quote`. Notifications go to dave@clickshift.ca
  (set per site in the Netlify UI: Forms → notifications).
- GitHub Pages is no longer the host (`.github/workflows/deploy.yml` removed 2026-10-29). `.github/workflows/alerts.yml` still runs hourly
  and does nothing until its Supabase and Resend secrets are set. `PUSH-TO-GITHUB.bat` was the old laptop publishing loop (Pages era).

## How to deploy (needs Dave's OK in the chat)
Build locally first (`npm ci && FORMS=netlify npm run build`, then `npm run -s test:calc`, `node tools/us/test-plan.mjs`) so a broken
build never reaches Netlify. Then, for each site, from source only:
```
rm -rf /tmp/ayh-deploy && mkdir /tmp/ayh-deploy && git archive HEAD | tar -x -C /tmp/ayh-deploy          # Canada: netlify.toml as is
rm -rf /tmp/ayh-deploy-us && mkdir /tmp/ayh-deploy-us && git archive HEAD | tar -x -C /tmp/ayh-deploy-us \
  && cp /tmp/ayh-deploy-us/netlify.us.toml /tmp/ayh-deploy-us/netlify.toml                                  # US: swap in the US toml
```
Call the Netlify MCP `netlify-deploy-services-updater` (`deploy-site`, the site id) and run the command it returns from inside that
directory. Netlify builds it with its `netlify.toml`. Never paste its proxy token anywhere. Afterwards, on each site: the pages you changed
at 375px and 1280px, the home page, an old address redirecting (`/ca/plan/` → `/plan/` on audityourhome.com, `/us/plan/` on
audityourhome.com → `https://audityourhouse.com/plan/`), `/geo.json` answering, `get-forms-for-project` still listing the forms, then
record both deploy IDs here.

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

## Standards
- Check every change at 375px and at 1280px+ before saying done.
- Keep the SEO basics (title, description, canonical, Open Graph, sitemap, `robots.txt`) intact.
