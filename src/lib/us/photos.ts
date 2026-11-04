/**
 * The nine regional house pictures on the US site, one for each climate profile in src/data/climate/us.json (the
 * profile keys and these keys are the same, so a metro finds its picture through placeClimate('us', slug).profile.key).
 *
 * Each was generated with Canva's AI image generator on November 4, 2026 from a plain-language prompt: a typical home of
 * the region, eye-level three-quarter view of the front, in the season and weather the region is known for, with no
 * people, vehicles, signs, logos or house numbers. They are illustrations, never photographs of a real home, and every
 * place that shows one says so. `canva` is the media id of the full 1536 × 1024 original in Dave's Canva account
 * (https://www.canva.com/M/<id>); the files in src/assets/photos are 1200 × 800 renderings of those originals.
 *
 * They are kept apart from PHOTOS (src/lib/photos.ts) because that registry is credited on both sites; these are
 * credited on the US credits page only, so the Canadian site's credits and pages never change when one is added.
 */
import type { ImageMetadata } from 'astro';

import veryCold from '../../assets/photos/us-very-cold.jpg';
import cold from '../../assets/photos/us-cold.jpg';
import coldDry from '../../assets/photos/us-cold-dry.jpg';
import mixedHumid from '../../assets/photos/us-mixed-humid.jpg';
import mixedHumidWarm from '../../assets/photos/us-mixed-humid-warm.jpg';
import hotHumid from '../../assets/photos/us-hot-humid.jpg';
import hotDry from '../../assets/photos/us-hot-dry.jpg';
import mildCoastal from '../../assets/photos/us-mild-coastal.jpg';
import marine from '../../assets/photos/us-marine.jpg';

export type RegionKey =
  | 'very-cold'
  | 'cold'
  | 'cold-dry'
  | 'mixed-humid'
  | 'mixed-humid-warm'
  | 'hot-humid'
  | 'hot-dry'
  | 'mild-coastal'
  | 'marine';

/** Coldest climate first, the same order as the climate profiles. */
export const REGION_KEYS: RegionKey[] = [
  'very-cold',
  'cold',
  'cold-dry',
  'mixed-humid',
  'mixed-humid-warm',
  'hot-humid',
  'hot-dry',
  'mild-coastal',
  'marine',
];

export interface RegionPhoto {
  src: ImageMetadata;
  /** What the picture shows, for screen readers and the credits page (starts lower-case, no final full stop) */
  alt: string;
  /** Media id of the full-size original in Canva */
  canva: string;
}

export const REGION_PHOTOS: Record<RegionKey, RegionPhoto> = {
  'very-cold': {
    src: veryCold,
    alt: 'A two-storey clapboard house with snow on the roof, icicles along the eaves, lit windows and a smoking chimney on a snowy street in low golden light, typical of the Upper Midwest',
    canva: 'MAHZ-XVd-hM',
  },
  cold: {
    src: cold,
    alt: 'A green wood-frame house with a deep brick-and-timber front porch, lit windows and fallen leaves across the lawn at dusk in late autumn, typical of the Northeast and Great Lakes',
    canva: 'MAHZ-SnxUAQ',
  },
  'cold-dry': {
    src: coldDry,
    alt: 'A 1950s brick ranch house with a broad picture window and a light dusting of snow on a dry lawn, snow-capped mountains behind it under a deep blue sky, typical of the Colorado Front Range',
    canva: 'MAHZ-TuE5Ec',
  },
  'mixed-humid': {
    src: mixedHumid,
    alt: 'A red-brick Georgian-style house with black shutters, a white columned portico and a brick path among autumn trees, typical of the Mid-Atlantic',
    canva: 'MAHZ-adoB50',
  },
  'mixed-humid-warm': {
    src: mixedHumidWarm,
    alt: 'A two-storey house with cream siding and a brick base, a covered front porch, a flowering dogwood and tall pines in spring, typical of the Southeast',
    canva: 'MAHZ-VKE2Go',
  },
  'hot-humid': {
    src: hotHumid,
    alt: 'A single-storey yellow stucco house with a screened porch and a low hipped roof, palm trees and tall thunderheads behind it, typical of Florida, Texas and the Gulf Coast',
    canva: 'MAHZ-Ya3jgM',
  },
  'hot-dry': {
    src: hotDry,
    alt: 'A stucco ranch house with a clay-tile roof and a two-car garage, a tall saguaro cactus and gravel desert landscaping under a blue sky, typical of the Desert Southwest',
    canva: 'MAHZ-a1Nc_c',
  },
  'mild-coastal': {
    src: mildCoastal,
    alt: 'A whitewashed Spanish-style house with a clay-tile roof and arched porch, a bougainvillea in bloom and succulents in the garden, the ocean beyond, typical of coastal California',
    canva: 'MAHZ-Rg28To',
  },
  marine: {
    src: marine,
    alt: 'A craftsman house with a mossy roof, shingle siding and a deep porch among tall conifers, ferns and rhododendrons beside a rain-wet street, typical of the Pacific Northwest',
    canva: 'MAHZ-RkaITk',
  },
};

export const isRegionKey = (k: string): k is RegionKey => (REGION_KEYS as string[]).includes(k);
