// After `astro build`: hreflang links between country twins, one sitemap per country,
// redirect pages for every pre-/ca/ address (for hosts without server redirects), and the
// Netlify _redirects file (country auto-select for "/" and 301s for the old addresses).
// Usage: node tools/country/postbuild.mjs [distDir]
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://audityourhome.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'dist');
const LOCALE = { ca: 'en-CA', us: 'en-US' };
/** Old addresses whose new home isn't simply /ca/<same path> */
const OVERRIDES = { 'advisors/': '/ca/for-professionals/' };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '_astro' || name === 'og') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === 'index.html') out.push(p);
  }
  return out;
}

const files = walk(DIST);
const pages = new Map(); // path -> { file, html }
for (const file of files) {
  const rel = file.slice(DIST.length).replace(/\\/g, '/').replace(/index\.html$/, '');
  pages.set(rel || '/', { file, html: readFileSync(file, 'utf8') });
}
const noindex = (html) => /<meta name="robots" content="noindex/.test(html);
const isRedirectStub = (html) => html.includes('data-ayh-moved');

// ---------------------------------------------------------------- hreflang
function alternatesFor(path) {
  if (path === '/' || path === '/ca/' || path === '/us/') {
    const trio = [['en-CA', '/ca/'], ['en-US', '/us/'], ['x-default', '/']].filter(([, p]) => pages.has(p));
    return trio.length === 3 ? trio : [];
  }
  const m = path.match(/^\/(ca|us)\/(.*)$/);
  if (!m) return [];
  const [, c, rest] = m;
  const other = c === 'ca' ? 'us' : 'ca';
  const twin = `/${other}/${rest}`;
  const t = pages.get(twin);
  if (!t || noindex(t.html) || isRedirectStub(t.html)) return [];
  return [[LOCALE[c], path], [LOCALE[other], twin]].sort((a, b) => a[0].localeCompare(b[0]));
}

let linked = 0;
for (const [path, page] of pages) {
  if (noindex(page.html) || isRedirectStub(page.html)) continue;
  const alts = alternatesFor(path);
  let html = page.html.replace(/<link rel="alternate" hreflang="[^"]+" href="[^"]+">/g, '');
  if (alts.length) {
    const tags = alts.map(([lang, p]) => `<link rel="alternate" hreflang="${lang}" href="${SITE}${p}">`).join('');
    html = html.replace('</head>', `${tags}</head>`);
    linked++;
  }
  if (html !== page.html) {
    writeFileSync(page.file, html);
    page.html = html;
  }
}

// ---------------------------------------------------------------- sitemaps
const urlset = (paths) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  paths.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('\n') +
  `\n</urlset>\n`;
const indexable = [...pages].filter(([, pg]) => !noindex(pg.html) && !isRedirectStub(pg.html)).map(([p]) => p).sort();
const groups = {
  ca: indexable.filter((p) => p.startsWith('/ca/')),
  us: indexable.filter((p) => p.startsWith('/us/')),
  root: indexable.filter((p) => !p.startsWith('/ca/') && !p.startsWith('/us/')),
};
mkdirSync(join(DIST, 'ca'), { recursive: true });
writeFileSync(join(DIST, 'ca', 'sitemap.xml'), urlset(groups.ca));
if (groups.us.length) {
  mkdirSync(join(DIST, 'us'), { recursive: true });
  writeFileSync(join(DIST, 'us', 'sitemap.xml'), urlset(groups.us));
}
writeFileSync(join(DIST, 'sitemap-root.xml'), urlset(groups.root));
const maps = ['/sitemap-root.xml', '/ca/sitemap.xml', ...(groups.us.length ? ['/us/sitemap.xml'] : [])];
writeFileSync(
  join(DIST, 'sitemap-index.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    maps.map((m) => `<sitemap><loc>${SITE}${m}</loc></sitemap>`).join('\n') +
    `\n</sitemapindex>\n`,
);
// The old single sitemap address (submitted in Search Console) keeps resolving on any host.
writeFileSync(join(DIST, 'sitemap-0.xml'), urlset(groups.ca));

// ---------------------------------------------------------------- legacy addresses
const legacy = readFileSync(join(ROOT, 'tools', 'country', 'legacy-paths.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter(Boolean);
let stubs = 0;
const missing = [];
const sections = new Set();
for (const rel of legacy) {
  const here = join(DIST, rel, 'index.html');
  if (existsSync(here) && !isRedirectStub(readFileSync(here, 'utf8'))) continue; // still a real page at the root
  sections.add(rel.split('/')[0]);
  let to = OVERRIDES[rel] ?? `/ca/${rel}`;
  if (!pages.has(to)) { missing.push(`${rel} -> ${to}`); to = '/ca/'; }
  const html = `<!doctype html><html lang="en" data-ayh-moved><head><meta charset="utf-8"><title>Moved to ${to}</title>` +
    `<link rel="canonical" href="${SITE}${to}"><meta http-equiv="refresh" content="0; url=${to}">` +
    `<script>location.replace(${JSON.stringify(to)}+location.search+location.hash)</script></head>` +
    `<body><p>This page moved to <a href="${to}">${SITE}${to}</a>.</p></body></html>\n`;
  mkdirSync(join(DIST, rel), { recursive: true });
  writeFileSync(here, html);
  stubs++;
}

// ---------------------------------------------------------------- Netlify _redirects
const lines = [
  '# Generated by tools/country/postbuild.mjs; edit that script, not this file.',
  '# "/" goes to the remembered country (cookie set by the switcher), else by visitor country.',
  '/  /ca/  302!  Cookie=ayh_ca',
  '/  /us/  302!  Cookie=ayh_us',
  '/  /ca/  302!  Country=ca',
  '/  /us/  302!  Country=us',
  '',
  '# Canadian pages moved under /ca/ on October 12, 2026.',
  '/sitemap-0.xml  /sitemap-index.xml  301!',
];
for (const s of [...sections].sort()) {
  if (s === 'advisors') {
    lines.push('/advisors  /ca/for-professionals/  301!', '/advisors/*  /ca/for-professionals/  301!');
    continue;
  }
  lines.push(`/${s}  /ca/${s}/  301!`, `/${s}/*  /ca/${s}/:splat  301!`);
}
writeFileSync(join(DIST, '_redirects'), lines.join('\n') + '\n');

console.log(`postbuild: ${pages.size} pages, ${linked} with hreflang, sitemaps ca=${groups.ca.length} us=${groups.us.length} root=${groups.root.length}, ${stubs} legacy redirect pages, ${sections.size} redirected sections`);
if (missing.length) {
  console.error(`postbuild: ${missing.length} legacy addresses have no /ca/ page:\n  ${missing.slice(0, 20).join('\n  ')}`);
  process.exitCode = 1;
}
