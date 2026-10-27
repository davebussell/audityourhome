# audityourhome.com — rules for Claude

Portfolio-wide rules and the registry of every site live in `davebussell/portfolio-hq` — read its CLAUDE.md too, then `README.md` here.

## Every chat
1. **First:** attach this repo (`list_repos`, then `add_repo` with push access) and clone it. Work in that clone. Do not start from the
   laptop folder (`OneDrive\Desktop\audityourhome`, stale since Oct 12), a zip or the live site.
2. **Push at milestones**, not only at the end: a chat's workspace can disappear (it already did once for this site).
3. **Last:** commit, push to `main`, deploy (below, with Dave's OK in the chat), then confirm the live URL. "Done" means pushed **and** live.
   Never deploy anything that is not pushed first: on 2026-10-26 GitHub was two weeks and 300 files behind the live site because
   deploys had been uploaded from chat workspaces without a push.

## State (2026-10-27)
- Live deploy `6ae0a1236ceaccd2859a083d` (2026-10-27) = `main` at `045017b` (regional rewrite). Earlier: `6ad7e24cad90198c04485fa1`.

## State (2026-10-26)
- `main` holds the source of the live deploy `6ad7e24cad90198c04485fa1` (2026-10-20 21:51 UTC), taken from Netlify's "Download source
  code" for that deploy and committed on 2026-10-26. Before that, `main` was the 2026-10-12 GitHub Pages version.
- Stack: Astro 5, data in `src/data/*.json`, generators in `tools/`, Supabase (accounts and alerts) in `supabase/`. Country split under
  `/ca/` and `/us/`; `tools/country/postbuild.mjs` writes `dist/_redirects` (country auto-select and the 301s from the old addresses).

## Netlify
- Project `audityourhome` (`ac0a6bef-3d1a-4b0c-9234-5da336851fcd`) serves audityourhome.com. **Not linked to this repo**: deploys are
  uploads, so a push changes nothing live.
- `netlify.toml`: `npm run build`, publish `dist`, Node 22, `FORMS=netlify` (renders the forms as Netlify Forms).
- Netlify Forms: `audit-request`, `us-question`, `heat-pump-quote`. Notifications go to dave@clickshift.ca.
- GitHub Pages is no longer the host. `.github/workflows/deploy.yml` now runs only by hand (it used to publish every push to Pages).
  `.github/workflows/alerts.yml` still runs hourly and does nothing until its Supabase and Resend secrets are set.
- `PUSH-TO-GITHUB.bat` was the old laptop publishing loop (Pages era). Do not use it to publish: it does not deploy to Netlify.

## How to deploy (needs Dave's OK in the chat)
```
rm -rf /tmp/ayh-deploy && mkdir /tmp/ayh-deploy && git archive HEAD | tar -x -C /tmp/ayh-deploy    # source only
```
Build locally first (`npm ci && npm run build`) so a broken build never reaches Netlify, then call the Netlify MCP
`netlify-deploy-services-updater` (`deploy-site`, this site id) and run the command it returns from inside `/tmp/ayh-deploy`. Netlify builds
it with `netlify.toml`. Never paste its proxy token anywhere. Never create a new Netlify site. Afterwards: the page you changed at 375px
and 1280px, `/` redirects to `/ca/` or `/us/`, `get-forms-for-project` still lists the three forms, then record the deploy ID here.

## Systems added 2026-10-26 (regional rewrite)
- **Glossary:** `src/data/glossary.json` (199 sourced terms, ca 169 / us 168) is the source of truth; `tools/glossary/import.mjs --check`
  validates it. `tools/glossary/link.mjs` (run by `npm run build`) links the first visible use of each term on every /ca/ and /us/
  page; `public/gl.js` shows the tooltip/tap popover and links browser-rendered results (`GlossaryRuntime.astro`). Province-only
  terms (HRSP) link only on that province's pages. Patterns are shared with gl.js via `src/lib/glossary-patterns.mjs`.
- **Climate profiles:** `src/data/climate/{us,ca}.json` (9 US / 7 CA profiles + every metro, city and province) via
  `src/lib/climate.ts`; `RegionalNeeds.astro` renders them (full on city/metro guides, service/compact/heatpump variants elsewhere).
  `tools/local-pages/gen_pages.py` reads the CA file for climate-aware service text.
- **Reading guides:** `src/data/reading-guides.json` + `ReadingGuide.astro` (`#reading` on every test page and in both planners).
- **Journey:** `JourneyBar.astro` + `src/lib/journey.ts` (Your free plan → Book the audit → The audit visit and report → Upgrades and rebates).
- **Planners:** CA logic in `src/pages/ca/plan/index.astro` + `src/lib/ca/plan-helpers.ts` (answers in the # hash, no analytics);
  US cooling model in `src/lib/us/plan-cooling.ts` from `src/data/us/cooling-model.json` (`node tools/us/test-plan.mjs`).
- US common problems: `src/data/us/issues.json` → `/us/issues/<slug>/`. US text cleanup of research-note wording: `src/lib/us/clean.ts`.

## Standards
- Check every change at 375px and at 1280px+ before saying done.
- Keep the SEO basics (title, description, canonical, Open Graph, sitemap, `robots.txt`) intact.
