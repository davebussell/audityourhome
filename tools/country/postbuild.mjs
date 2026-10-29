// After `astro build` and tools/glossary/link.mjs: split dist/ into the two published sites.
//
//   dist/ca/**  →  dist-ca/   audityourhome.com   (AuditYourHome, Canada)
//   dist/us/**  →  dist-us/   audityourhouse.com  (AuditYourHouse, United States)
//
// Each site gets the shared assets (everything in dist/ outside ca/ and us/), its pages at the root,
// cross-domain hreflang links between twin pages, its own sitemap.xml (+ sitemap-index.xml), robots.txt,
// 404.html and the Netlify _redirects file (old /ca/ and /us/ addresses, the "other site" geo endpoint).
// Links in the source are already written in root form, so no HTML rewriting happens here.
// Usage: node tools/country/postbuild.mjs [distDir]
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'dist');
const COUNTRIES = ['ca', 'us'];
const SITES = {
  ca: { url: 'https://audityourhome.com', name: 'AuditYourHome', locale: 'en-CA', netlify: 'audityourhome', out: join(ROOT, 'dist-ca') },
  us: { url: 'https://audityourhouse.com', name: 'AuditYourHouse', locale: 'en-US', netlify: 'audityourhouse', out: join(ROOT, 'dist-us') },
};
const other = (c) => (c === 'ca' ? 'us' : 'ca');

// A Netlify build knows which site it is building (SITE_NAME); netlify.toml / netlify.us.toml say which
// one they are for (AYH_SITE). Refuse to build the wrong site's config into a site.
if (process.env.AYH_SITE && process.env.SITE_NAME) {
  const want = SITES[process.env.AYH_SITE]?.netlify;
  if (want && want !== process.env.SITE_NAME) {
    console.error(`postbuild: AYH_SITE=${process.env.AYH_SITE} expects the Netlify site "${want}" but this build is for "${process.env.SITE_NAME}". Use the other netlify toml.`);
    process.exit(1);
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '_astro' || name === 'og') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === 'index.html') out.push(p);
  }
  return out;
}
const noindex = (html) => /<meta name="robots" content="noindex/.test(html);

// ---------------------------------------------------------------- what the unified build holds
/** indexable page paths per country, in root form: { ca: Set('/', '/tests/', ...), us: Set(...) } */
const indexable = { ca: new Set(), us: new Set() };
for (const c of COUNTRIES) {
  for (const file of walk(join(DIST, c))) {
    const rel = file.slice(join(DIST, c).length).replace(/\\/g, '/').replace(/index\.html$/, '') || '/';
    if (!noindex(readFileSync(file, 'utf8'))) indexable[c].add(rel);
  }
}
const stray = walk(DIST).filter((f) => !COUNTRIES.some((c) => f.startsWith(join(DIST, c) + sep)));
if (stray.length) {
  console.error(`postbuild: ${stray.length} page(s) outside src/pages/ca and src/pages/us have no site to go to:\n  ${stray.map((f) => f.slice(DIST.length)).join('\n  ')}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------- build each site
const summary = [];
for (const c of COUNTRIES) {
  const site = SITES[c];
  const out = site.out;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // shared assets, then this country's pages at the root
  for (const name of readdirSync(DIST)) {
    if (COUNTRIES.includes(name)) continue;
    cpSync(join(DIST, name), join(out, name), { recursive: true });
  }
  cpSync(join(DIST, c), out, { recursive: true });

  // hreflang between twins (both sites carry both links), stripping anything the build left
  let linked = 0;
  for (const file of walk(out)) {
    const rel = file.slice(out.length).replace(/\\/g, '/').replace(/index\.html$/, '') || '/';
    let html = readFileSync(file, 'utf8');
    const before = html;
    html = html.replace(/<link rel="alternate" hreflang="[^"]+" href="[^"]+">/g, '');
    if (!noindex(html) && indexable[c].has(rel) && indexable[other(c)].has(rel)) {
      const tags = COUNTRIES.map((k) => `<link rel="alternate" hreflang="${SITES[k].locale}" href="${SITES[k].url}${rel}">`).join('');
      html = html.replace('</head>', `${tags}</head>`);
      linked++;
    }
    if (html !== before) writeFileSync(file, html);
  }

  // sitemap.xml (+ sitemap-index.xml, which Base.astro links and Search Console has)
  const paths = [...indexable[c]].sort();
  const urlset =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths.map((p) => `<url><loc>${site.url}${p}</loc></url>`).join('\n') +
    `\n</urlset>\n`;
  writeFileSync(join(out, 'sitemap.xml'), urlset);
  writeFileSync(
    join(out, 'sitemap-index.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `<sitemap><loc>${site.url}/sitemap.xml</loc></sitemap>\n</sitemapindex>\n`,
  );

  // robots.txt
  writeFileSync(
    join(out, 'robots.txt'),
    [
      `# ${site.name} — welcome, crawlers of every species.`,
      '# Structured, dated, verified program + provider data lives here.',
      c === 'ca'
        ? '# This is the Canadian site; the US site is https://audityourhouse.com/.'
        : '# This is the US site; the Canadian site is https://audityourhome.com/.',
      '',
      'User-agent: *',
      'Allow: /',
      '',
      '# AI assistants & answer engines: explicitly welcome.',
      ...['GPTBot', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'CCBot'].flatMap((ua) => [`User-agent: ${ua}`, 'Allow: /', '']),
      `Sitemap: ${site.url}/sitemap.xml`,
      '',
    ].join('\n'),
  );

  // 404.html at the publish root (Netlify's custom 404), from the country's 404 page
  const nf = join(out, '404', 'index.html');
  if (existsSync(nf)) {
    writeFileSync(join(out, '404.html'), readFileSync(nf, 'utf8'));
    rmSync(join(out, '404'), { recursive: true, force: true });
  } else {
    console.error(`postbuild: no 404 page for ${c} (src/pages/${c}/404.astro)`);
    process.exitCode = 1;
  }

  // Netlify _redirects
  const lines = ['# Generated by tools/country/postbuild.mjs; edit that script, not this file.'];
  if (c === 'ca') {
    lines.push(
      '# audityourhome.com is the Canadian site. The US pages moved to audityourhouse.com on 2026-10-29.',
      '/us  https://audityourhouse.com/  301!',
      '/us/*  https://audityourhouse.com/:splat  301!',
      '# Canadian pages lived under /ca/ from 2026-10-12 to 2026-10-29; before that they were at the root, as now.',
      '/ca  /  301!',
      '/ca/*  /:splat  301!',
      '# Older addresses',
      '/advisors  /for-professionals/  301!',
      '/advisors/*  /for-professionals/  301!',
      '/sitemap-0.xml  /sitemap.xml  301!',
      '/sitemap-root.xml  /sitemap.xml  301!',
    );
  } else {
    lines.push(
      '# audityourhouse.com is the US site (since 2026-10-29); its pages were audityourhome.com/us/... before.',
      '/ca  https://audityourhome.com/  301!',
      '/ca/*  https://audityourhome.com/:splat  301!',
      '/us  /  301!',
      '/us/*  /:splat  301!',
    );
  }
  lines.push(
    '# Visitor country for the "other site" bar (src/components/OtherSite.astro); the files are in public/geo/.',
    '/geo.json  /geo/us.json  200!  Country=us',
    '/geo.json  /geo/ca.json  200!  Country=ca',
    '/geo.json  /geo/other.json  200!',
  );
  writeFileSync(join(out, '_redirects'), lines.join('\n') + '\n');

  summary.push(`${c}: ${paths.length} indexable pages, ${linked} with hreflang → ${out.slice(ROOT.length + 1)}/`);
}

console.log(`postbuild: ${summary.join('; ')}`);
