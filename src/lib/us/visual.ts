/**
 * Data behind the US site's visual components: which regional house picture a metro gets, the degree-day bars, the era
 * of its typical home and the tile-grid map of the states. Every number comes from the same records the metro pages use
 * (climate.json: NOAA 1991–2020 normals and Census ACS), so a card and its page can never disagree.
 */
import { placeClimate } from '../climate';
import { METROS } from './data';
import type { Metro } from './data';
import { glance } from './metro-view';
import { isRegionKey } from './photos';
import type { RegionKey } from './photos';

/** The regional picture for a metro: its climate profile's key (the nine profiles and the nine pictures share keys). */
export function regionKeyFor(slug: string): RegionKey | null {
  const k = placeClimate('us', slug)?.profile.key;
  return k && isRegionKey(k) ? k : null;
}

/** Region name of the metro's climate profile, e.g. "Desert Southwest and inland valleys". */
export const regionNameFor = (slug: string): string | null => placeClimate('us', slug)?.profile.regionName ?? null;
/** Short climate name of the profile, e.g. "Hot and dry". */
export const climateLabelFor = (slug: string): string | null => placeClimate('us', slug)?.profile.label ?? null;

/**
 * A card thumbnail's window onto its regional picture, as the card's CSS needs it: zoom, transform origin (x %, y %) and
 * the object-position y (%) of the 2:1 cover crop it starts from.
 */
type Crop = readonly [zoom: number, originX: number, originY: number, positionY: number];

/**
 * Four hand-picked windows per picture: the whole house, then three close views of different parts of it. A metro takes
 * the one at its position in its climate profile, so the seven hot-humid cards (or the five mixed-humid ones) don't all
 * show the same frame and neighbouring cards always differ.
 */
const CROPS: Record<RegionKey, readonly Crop[]> = {
  'very-cold': [[1, 50, 50, 78], [1.45, 50, 50, 98], [1.4, 100, 50, 30], [1.4, 0, 50, 70]],
  cold: [[1, 50, 50, 50], [1.45, 76, 56, 100], [1.45, 50, 9, 0], [1.4, 0, 50, 90]],
  'cold-dry': [[1, 50, 50, 90], [1.45, 0, 50, 70], [1.4, 78, 50, 98], [1.35, 100, 50, 70]],
  'mixed-humid': [[1, 50, 50, 50], [1.45, 76, 50, 98], [1.4, 0, 50, 50], [1.4, 100, 50, 70]],
  'mixed-humid-warm': [[1, 50, 50, 70], [1.45, 0, 74, 100], [1.4, 100, 50, 10], [1.4, 8, 50, 42]],
  'hot-humid': [[1, 50, 50, 70], [1.45, 0, 50, 70], [1.4, 68, 50, 98], [1.4, 100, 50, 82]],
  'hot-dry': [[1, 50, 50, 82], [1.45, 0, 61, 100], [1.4, 78, 50, 98], [1.35, 100, 50, 50]],
  'mild-coastal': [[1, 50, 50, 50], [1.45, 18, 50, 70], [1.4, 100, 50, 50], [1.4, 0, 50, 70]],
  marine: [[1, 50, 50, 50], [1.45, 0, 50, 82], [1.4, 100, 50, 18], [1.4, 68, 50, 30]],
};

/** The `style` attribute value (CSS custom properties) that frames a metro card's thumbnail. */
export function cropStyle(slug: string): string {
  const region = regionKeyFor(slug);
  if (!region) return '';
  const places = placeClimate('us', slug)?.profile.places ?? [];
  const crops = CROPS[region];
  const [z, ox, oy, p] = crops[Math.max(0, places.indexOf(slug)) % crops.length];
  return `--z:${z};--o:${ox}% ${oy}%;--p:${p}%`;
}

/** Largest annual heating or cooling degree-day total among the 26 metros: every bar shares this scale. */
export const DEGREE_MAX = Math.max(1, ...METROS.map((m) => Math.max(glance(m).hdd ?? 0, glance(m).cdd ?? 0)));

export interface Degrees {
  hdd: number | null;
  cdd: number | null;
  /** bar widths, 0–100 */
  hddPct: number;
  cddPct: number;
  /** plain-words reading of the balance between the two */
  lean: 'heating' | 'cooling' | 'both';
}
export function degreesFor(m: Metro): Degrees {
  const g = glance(m);
  const hdd = g.hdd ?? null;
  const cdd = g.cdd ?? null;
  const pct = (v: number | null) => (v == null ? 0 : Math.max(2, Math.round((v / DEGREE_MAX) * 100)));
  const h = hdd ?? 0;
  const c = cdd ?? 0;
  const lean = h > c * 2 ? 'heating' : c > h * 2 ? 'cooling' : 'both';
  return { hdd, cdd, hddPct: pct(hdd), cddPct: pct(cdd), lean };
}

/** Era buckets for a metro's typical home, using the same palette as the Canadian era bars (EraBar, HousingPortrait). */
export interface Era {
  key: 'pre1961' | 'y1961' | 'y1991' | 'y2001';
  label: string;
  short: string;
  color: string;
}
export const ERAS: Era[] = [
  { key: 'pre1961', label: 'Built before 1961', short: 'Before 1961', color: '#F4A53F' },
  { key: 'y1961', label: 'Built 1961 to 1990', short: '1961–1990', color: '#E8622A' },
  { key: 'y1991', label: 'Built 1991 to 2000', short: '1991–2000', color: '#C04A86' },
  { key: 'y2001', label: 'Built 2001 or later', short: '2001 or later', color: '#7A63E0' },
];
export function eraOf(year: number | null | undefined, note?: string | null): Era | null {
  if (typeof year === 'number') return year < 1961 ? ERAS[0] : year <= 1990 ? ERAS[1] : year <= 2000 ? ERAS[2] : ERAS[3];
  return note ? ERAS[0] : null; // the Census puts the median in "built 1939 or earlier"
}

/** Everything a signature panel or card needs for one metro. */
export function signatureFor(m: Metro) {
  const g = glance(m);
  const yb = typeof g.yearBuilt === 'number' ? g.yearBuilt : null;
  return {
    photo: regionKeyFor(m.slug),
    region: regionNameFor(m.slug),
    climate: climateLabelFor(m.slug),
    degrees: degreesFor(m),
    year: yb,
    yearNote: g.yearBuiltNote,
    era: eraOf(yb, g.yearBuiltNote),
    zone: g.zone,
    radonZone: g.radonZone,
    owner: g.owner,
  };
}

// ---------------------------------------------------------------- state tile-grid map
/**
 * A tile map of the 50 states and DC: one equal square each, placed roughly where the state is, so small
 * eastern states stay as easy to tap as Texas. [column, row], zero-based, 11 columns by 8 rows.
 */
export const TILE_POS: Record<string, [number, number]> = {
  AK: [0, 0], ME: [10, 0],
  WI: [5, 1], VT: [9, 1], NH: [10, 1],
  WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], MI: [6, 2], NY: [9, 2], MA: [10, 2],
  OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3], RI: [10, 3],
  CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
  AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5], DC: [8, 5],
  OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
  HI: [0, 7], TX: [3, 7], FL: [8, 7],
};
