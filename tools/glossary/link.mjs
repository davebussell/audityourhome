// After the build: link the first use of each glossary term on every /ca/ and /us/ page to its glossary
// entry, add the short definitions the tooltips need, and check the glossary pages' internal links.
// Usage: node tools/glossary/link.mjs [distDir]
//
// Rules: only text inside <main>; never inside links, buttons, form controls, forms, headings, nav,
// header, footer, summary, code, svg, script/style, [data-no-gloss], .no-gloss, .sr-only, .eyebrow,
// .chip, .crumbs, .btn, name labels (.name, .pname, .rb-name, .ap-name) or aria-hidden elements. One link per term per page (its first use); the longest
// phrase wins; a glossary page never links its own term. Skips noindex pages, redirect stubs and the
// glossary indexes. Safe to run twice (pages that already carry gl-data are left alone).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatchers, findMatches, termFor, shortFor, hrefFor, slugFor, questionFor } from '../../src/lib/glossary-patterns.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'dist');
const { entries } = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'glossary.json'), 'utf8'));
const bySlug = new Map(entries.map((e) => [e.slug, e]));

const EXCL_TAGS = new Set([
  'a', 'button', 'label', 'select', 'option', 'optgroup', 'textarea', 'input', 'code', 'pre', 'kbd', 'samp', 'svg', 'math',
  'nav', 'header', 'footer', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'form', 'legend', 'iframe', 'object',
  'video', 'audio', 'canvas', 'dialog',
]);
const RAW_TAGS = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template', 'xmp']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const EXCL_CLASS = /(?:^|\s)(?:no-gloss|sr-only|eyebrow|chip|crumbs|btn|gl|name|pname|rb-name|ap-name|ctry-name)(?:\s|$)/;

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '\u2013', mdash: '\u2014',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', hellip: '\u2026', deg: '\u00b0',
  times: '\u00d7', middot: '\u00b7', sup2: '\u00b2', sup3: '\u00b3', minus: '\u2212', rarr: '\u2192',
  larr: '\u2190', bull: '\u2022', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', frac12: '\u00bd',
  frac14: '\u00bc', frac34: '\u00be', eacute: '\u00e9', egrave: '\u00e8', agrave: '\u00e0', ccedil: '\u00e7',
  ocirc: '\u00f4', ecirc: '\u00ea', icirc: '\u00ee', shy: '\u00ad', thinsp: '\u2009', ensp: '\u2002', emsp: '\u2003',
};

/** Decode entities in a raw text run; map[i] = raw offset of decoded code unit i (null = identity). */
function decode(raw) {
  if (raw.indexOf('&') < 0) return { text: raw, map: null };
  let text = '';
  const map = [];
  for (let i = 0; i < raw.length; ) {
    if (raw.charCodeAt(i) === 38) {
      const m = /^&(#[0-9]{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/.exec(raw.slice(i, i + 40));
      if (m) {
        const ent = m[1];
        let ch;
        if (ent[0] === '#') {
          const cp = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
          try { ch = String.fromCodePoint(cp); } catch { ch = '\ufffd'; }
        } else ch = NAMED[ent] ?? NAMED[ent.toLowerCase()] ?? '\ufffd';
        for (let k = 0; k < ch.length; k++) { text += ch[k]; map.push(i); }
        i += m[0].length;
        continue;
      }
    }
    text += raw[i];
    map.push(i);
    i++;
  }
  return { text, map };
}

/** Index just past the '>' that closes the tag starting at i (quotes respected). */
function tagEnd(html, i) {
  let q = 0;
  for (let k = i + 1; k < html.length; k++) {
    const ch = html.charCodeAt(k);
    if (q) { if (ch === q) q = 0; }
    else if (ch === 34 || ch === 39) q = ch;
    else if (ch === 62) return k + 1;
  }
  return html.length;
}

function excludedTag(name, tag) {
  if (EXCL_TAGS.has(name)) return true;
  if (/\sdata-no-gloss(?:[\s=>]|$)/.test(tag)) return true;
  if (/\saria-hidden=["']?true/.test(tag)) return true;
  const cls = /\sclass=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/.exec(tag);
  return !!cls && EXCL_CLASS.test(cls[1] ?? cls[2] ?? cls[3] ?? '');
}

/** Link terms inside <main> of one page. Returns { html, linked: [slugs] }. */
export function linkHtml(html, country, matchers, skipSlug = null) {
  const mStart = html.indexOf('<main');
  if (mStart < 0) return { html, linked: [] };
  const mOpen = tagEnd(html, mStart);
  const mEnd = html.lastIndexOf('</main>');
  if (mEnd < mOpen) return { html, linked: [] };
  const used = new Set();
  const linked = [];
  const out = [];
  let copied = 0;
  const stack = [];
  let excl = 0;
  let i = mOpen;
  while (i < mEnd) {
    const lt = html.indexOf('<', i);
    const stop = lt < 0 || lt > mEnd ? mEnd : lt;
    if (stop > i) {
      if (excl === 0) {
        const raw = html.slice(i, stop);
        if (/[A-Za-z0-9]/.test(raw)) {
          const { text, map } = decode(raw);
          const hits = findMatches(text, matchers, used, skipSlug);
          if (hits.length) {
            let s = '';
            let pos = 0;
            for (const h of hits) {
              const rs = map ? map[h.start] : h.start;
              const re = map ? (h.end < map.length ? map[h.end] : raw.length) : h.end;
              const e = bySlug.get(h.slug);
              s += raw.slice(pos, rs) + `<a class="gl" href="${hrefFor(e, country)}" data-gl="${h.slug}">` + raw.slice(rs, re) + '</a>';
              pos = re;
              linked.push(h.slug);
            }
            s += raw.slice(pos);
            out.push(html.slice(copied, i), s);
            copied = stop;
          }
        }
      }
      i = stop;
      continue;
    }
    // at '<'
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4);
      i = e < 0 ? mEnd : e + 3;
      continue;
    }
    const next = html[i + 1];
    if (next === '/') {
      const gt = tagEnd(html, i);
      const name = html.slice(i + 2, gt - 1).trim().split(/[\s/>]/)[0].toLowerCase();
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) {
          while (stack.length > k) if (stack.pop().excl) excl--;
          break;
        }
      }
      i = gt;
      continue;
    }
    if (!next || !/[a-zA-Z]/.test(next)) {
      // '<!doctype', '<?', or a stray '<': step over it
      i = next === '!' || next === '?' ? tagEnd(html, i) : i + 1;
      continue;
    }
    const gt = tagEnd(html, i);
    const tag = html.slice(i, gt);
    const name = /^<([a-zA-Z][\w:.-]*)/.exec(tag)[1].toLowerCase();
    i = gt;
    if (RAW_TAGS.has(name) && !/\/\s*>$/.test(tag)) {
      const re = new RegExp(`</${name}\\s*>`, 'gi');
      re.lastIndex = i;
      const m = re.exec(html);
      i = m ? m.index + m[0].length : mEnd;
      continue;
    }
    if (VOID_TAGS.has(name) || /\/\s*>$/.test(tag)) continue;
    const ex = excludedTag(name, tag);
    stack.push({ name, excl: ex });
    if (ex) excl++;
  }
  if (!linked.length) return { html, linked };
  out.push(html.slice(copied));
  return { html: out.join(''), linked };
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === 'index.html') out.push(p);
  }
  return out;
}

const noindex = (html) => /<meta name="robots" content="noindex/.test(html);
const isStub = (html) => html.includes('data-ayh-moved');

function main() {
  const t0 = Date.now();
  const stats = { pages: 0, linkedPages: 0, links: 0, skipped: 0 };
  const termCount = new Map();
  const ownByPath = { ca: new Map(), us: new Map() };
  for (const e of entries) for (const c of e.countries) ownByPath[c].set(`/${c}/glossary/${slugFor(e, c)}/`, e.slug);

  for (const c of ['ca', 'us']) {
    const matchers = buildMatchers(entries, c);
    for (const file of walk(join(DIST, c))) {
      const rel = file.slice(DIST.length).replace(/\\/g, '/').replace(/index\.html$/, '');
      const html = readFileSync(file, 'utf8');
      if (noindex(html) || isStub(html) || rel === `/${c}/glossary/` || html.includes('id="gl-data"')) {
        stats.skipped++;
        continue;
      }
      stats.pages++;
      const { html: out, linked } = linkHtml(html, c, matchers, ownByPath[c].get(rel) ?? null);
      if (!linked.length) continue;
      stats.linkedPages++;
      stats.links += linked.length;
      const data = {};
      for (const s of linked) {
        termCount.set(s, (termCount.get(s) ?? 0) + 1);
        const e = bySlug.get(s);
        data[s] = { t: termFor(e, c), s: shortFor(e, c), h: hrefFor(e, c), q: questionFor(e, c) };
      }
      const inject =
        `<script type="application/json" id="gl-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` +
        (out.includes('src="/gl.js"') ? '' : '<script defer src="/gl.js"></script>');
      const at = out.lastIndexOf('</body>');
      writeFileSync(file, at < 0 ? out + inject : out.slice(0, at) + inject + out.slice(at));
    }
  }

  // every internal link on a glossary page must resolve in the build
  const broken = [];
  for (const c of ['ca', 'us']) {
    for (const file of walk(join(DIST, c, 'glossary'))) {
      const html = readFileSync(file, 'utf8');
      const m = html.indexOf('<main');
      const body = m < 0 ? html : html.slice(m, html.lastIndexOf('</main>'));
      for (const [, href] of body.matchAll(/href="(\/[^"#?]*)/g)) {
        const target = join(DIST, href, href.endsWith('/') ? 'index.html' : '');
        if (!existsSync(target)) broken.push(`${file.slice(DIST.length)} -> ${href}`);
      }
    }
  }

  const top = [...termCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s, n]) => `${s} ${n}`);
  console.log(
    `glossary: ${stats.links} links on ${stats.linkedPages} of ${stats.pages} pages (${stats.skipped} skipped) in ${((Date.now() - t0) / 1000).toFixed(1)}s; top: ${top.join(', ')}`,
  );
  if (broken.length) console.error(`glossary: ${broken.length} broken internal links on glossary pages:\n  ${[...new Set(broken)].slice(0, 30).join('\n  ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
