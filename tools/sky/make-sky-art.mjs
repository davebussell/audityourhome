// Draws the sky artwork (cloud tiles, the paper plane, the cloud-edge mask for footers) as SVG and writes it into
// src/styles/sky-art.css as CSS custom properties holding data: URIs, so the sky costs no extra requests and the
// two palettes (home sites, building site) share every rule in src/styles/sky.css.
//
//   node tools/sky/make-sky-art.mjs
//
// src/styles/sky-art.css is generated: change the drawing here and run this again, never edit the CSS by hand.
// Everything is flat shapes (circles and rounded bars): home sites get soft white clouds with a pale-blue underside,
// the building site gets the same clouds as thin blueprint line drawings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'styles', 'sky-art.css');

const r1 = (n) => Math.round(n * 10) / 10;
// Minimal encoding: single-quoted attributes inside a double-quoted url(), and only < > # escaped.
const enc = (svg) =>
  `url("data:image/svg+xml,${svg.replace(/\s+/g, ' ').replace(/> </g, '><').trim().replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23')}")`;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One cloud, w by h, as the shapes that make it up (circles and a rounded bar), optionally mirrored. */
function cloudShapes(w, h, flip = false) {
  const fx = (x) => (flip ? w - x : x);
  const bumps = [
    [0.2, 0.66, 0.3],
    [0.41, 0.46, 0.44],
    [0.64, 0.56, 0.36],
    [0.81, 0.72, 0.24],
  ];
  const shapes = bumps.map(([cx, cy, r]) => `<circle cx="${r1(fx(cx * w))}" cy="${r1(cy * h)}" r="${r1(r * h)}"/>`);
  shapes.push(`<rect x="${r1(0.04 * w)}" y="${r1(0.58 * h)}" width="${r1(0.92 * w)}" height="${r1(0.42 * h)}" rx="${r1(0.21 * h)}"/>`);
  return shapes.join('');
}

/**
 * A tile of scattered clouds. mode "soft": white with a pale underside. mode "line": blueprint outline.
 * Each cloud is [x, y, w, h, flip, opacity]; all sit fully inside the tile so the tile repeats without a seam.
 */
function cloudTile(W, H, clouds, mode, tone) {
  let defs = '';
  let body = '';
  clouds.forEach(([x, y, w, h, flip, op], i) => {
    const shapes = cloudShapes(w, h, flip);
    if (mode === 'soft') {
      defs += `<linearGradient id="g${i}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${h}"><stop offset="0" stop-color="#fff"/><stop offset=".58" stop-color="#fff"/><stop offset="1" stop-color="${tone.under}"/></linearGradient>`;
      body += `<g transform="translate(${x} ${y})" opacity="${op}" fill="url(#g${i})">${shapes}</g>`;
    } else {
      // outline trick: every shape stroked, then every shape filled on top, so only the outer outline shows
      body += `<g transform="translate(${x} ${y})" opacity="${op}"><g fill="${tone.line}" stroke="${tone.line}" stroke-width="3.4" stroke-linejoin="round">${shapes}</g><g fill="${tone.fill}">${shapes}</g></g>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
}

/** A low bank of cloud along the bottom of a tile: a solid bar with round bumps on top, bumps kept inside the tile. */
function bankTile(W, H, mode, tone, seed) {
  const rnd = rng(seed);
  const strip = Math.round(H * 0.3);
  const back = [];
  const front = [];
  const lay = (list, rMin, rMax, rise, jitter) => {
    let x = 0;
    while (x < W - rMin * 2) {
      const r = rMin + rnd() * (rMax - rMin);
      const cx = Math.min(W - r, Math.max(r, x + r));
      list.push([cx, H - strip - rise + r * jitter * rnd(), r]);
      x += r * (1.1 + rnd() * 0.9);
    }
  };
  lay(back, 34, 66, 22, 0.35);
  lay(front, 30, 76, 0, 0.3);
  const circles = (list) => list.map(([cx, cy, r]) => `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"/>`).join('');
  const bar = (inset) => `<rect x="-12" y="${H - strip - inset}" width="${W + 24}" height="${strip + inset + 12}"/>`;
  let body;
  if (mode === 'soft') {
    body = `<g fill="${tone.back}">${circles(back)}${bar(20)}</g><g fill="#fff">${circles(front)}${bar(0)}</g>`;
  } else {
    body =
      `<g opacity=".8"><g fill="${tone.line}" stroke="${tone.line}" stroke-width="3.2" stroke-linejoin="round">${circles(back)}${bar(20)}</g><g fill="${tone.fill}">${circles(back)}${bar(20)}</g></g>` +
      `<g opacity=".9"><g fill="${tone.line}" stroke="${tone.line}" stroke-width="3.2" stroke-linejoin="round">${circles(front)}${bar(0)}</g><g fill="${tone.fill}">${circles(front)}${bar(0)}</g></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

/** The paper plane, nose up and to the right. */
const plane = (a, b) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="${a}" d="M30 3 2 13l11 5z"/><path fill="${b}" d="M30 3 13 18l6 11z"/></svg>`;

/** A cumulus skyline used as a mask: big round bumps with small ones between them. Only the alpha shape matters. */
function edgeMask(W, H, seed) {
  const rnd = rng(seed);
  const base = Math.round(H * 0.36);
  const dots = [];
  let x = 0;
  while (x < W - 50) {
    const r = 26 + rnd() * 26;
    const cx = Math.min(W - r, Math.max(r, x + r));
    dots.push([cx, H - base + r * 0.16 - rnd() * 6, r]);
    x += r * (1.0 + rnd() * 0.7);
  }
  // little ones in the dips between the big ones
  const big = dots.slice();
  for (let i = 0; i < big.length - 1; i++) {
    const [ax, , ar] = big[i];
    const [bx, , br] = big[i + 1];
    const mx = (ax + bx) / 2;
    const r = 12 + rnd() * 9;
    if (mx - r > 0 && mx + r < W) dots.push([mx, H - base + r * 0.5, r]);
  }
  const circles = dots.map(([cx, cy, r]) => `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g fill="#000">${circles}<rect x="-6" y="${H - base}" width="${W + 12}" height="${base + 6}"/></g></svg>`;
}

// ------------------------------------------------------------------ the tiles
const FAR = [
  [60, 60, 150, 62, false, 0.55],
  [330, 18, 110, 46, true, 0.5],
  [560, 52, 190, 76, false, 0.6],
  [860, 14, 120, 50, false, 0.5],
  [1080, 66, 160, 64, true, 0.55],
  [1290, 30, 90, 38, false, 0.45],
];
const MID = [
  [40, 70, 260, 104, false, 0.92],
  [380, 14, 190, 78, true, 0.86],
  [640, 64, 300, 118, false, 0.94],
  [1020, 20, 220, 90, true, 0.88],
];
const SOFT = { under: '#D9ECF9', back: '#E3F1FB' };
// pale on purpose: the outlines run behind headings and body text, and at this tone muted text keeps 3:1 over a line and ink text 8:1
const LINE = { line: '#9BBBDA', fill: '#F6FAFD' };

const art = {
  home: {
    far: enc(cloudTile(1400, 150, FAR, 'soft', SOFT)),
    mid: enc(cloudTile(1300, 200, MID, 'soft', SOFT)),
    near: enc(bankTile(1500, 250, 'soft', SOFT, 11)),
    plane: enc(plane('#E05C1F', '#B84713')),
  },
  building: {
    far: enc(cloudTile(1400, 150, FAR, 'line', LINE)),
    mid: enc(cloudTile(1300, 200, MID, 'line', LINE)),
    near: enc(bankTile(1500, 250, 'line', LINE, 11)),
    plane: enc(plane('#1F5FA8', '#164A87')),
  },
  edge: enc(edgeMask(560, 72, 5)),
};

const css = `/* GENERATED by tools/sky/make-sky-art.mjs: change the drawing there and run it again. Do not edit by hand.
   The sky artwork as data: URIs: three cloud layers (far, mid, near bank), the paper plane and the cloud-edge mask. */
:root {
  --sky-art-far: ${art.home.far};
  --sky-art-mid: ${art.home.mid};
  --sky-art-near: ${art.home.near};
  --sky-plane: ${art.home.plane};
  --sky-edge: ${art.edge};
}
/* the building site draws the same sky as a thin blueprint line drawing */
html[data-site='building'] {
  --sky-art-far: ${art.building.far};
  --sky-art-mid: ${art.building.mid};
  --sky-art-near: ${art.building.near};
  --sky-plane: ${art.building.plane};
}
`;
fs.writeFileSync(OUT, css);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(css.length / 1024).toFixed(1)} KB)`);
