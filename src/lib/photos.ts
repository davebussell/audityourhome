/**
 * Site photography registry.
 *
 * Every photo is an editorial-style illustration generated for AuditYourHome
 * (Higgsfield, GPT Image 2.5, Sept 29, 2026). None shows a specific home,
 * person or listed provider — the footer says so site-wide.
 *
 * `hud` is the small instrument-style label drawn on the photo's corner
 * (see Photo.astro). Keep each one a real, checkable measurement convention.
 */
import type { ImageMetadata } from 'astro';

import homeHero from '../assets/photos/home-hero.jpg';
import homeHeroThermal from '../assets/photos/home-hero-thermal.jpg';
import homeEnergyAudit from '../assets/photos/home-energy-audit.jpg';
import blowerDoor from '../assets/photos/blower-door-test.jpg';
import thermalImaging from '../assets/photos/thermal-imaging.jpg';
import heatLoss from '../assets/photos/heat-loss-calculation.jpg';
import ductLeakage from '../assets/photos/duct-leakage-testing.jpg';
import combustion from '../assets/photos/combustion-safety-test.jpg';
import ventilation from '../assets/photos/ventilation-assessment.jpg';
import attic from '../assets/photos/attic-insulation-inspection.jpg';
import bills from '../assets/photos/energy-bill-analysis.jpg';
import radon from '../assets/photos/radon-testing.jpg';
import co from '../assets/photos/carbon-monoxide-testing.jpg';
import mold from '../assets/photos/mold-testing.jpg';
import asbestos from '../assets/photos/asbestos-testing.jpg';
import lead from '../assets/photos/lead-paint-testing.jpg';
import well from '../assets/photos/well-water-testing.jpg';
import commercial from '../assets/photos/commercial-energy-audit.jpg';
import rOntario from '../assets/photos/region-ontario.jpg';
import rQuebec from '../assets/photos/region-quebec.jpg';
import rPrairies from '../assets/photos/region-prairies.jpg';
import rBC from '../assets/photos/region-bc.jpg';
import rAlberta from '../assets/photos/region-alberta.jpg';
import rAtlantic from '../assets/photos/region-atlantic.jpg';
import rNorth from '../assets/photos/region-north.jpg';

export interface SitePhoto {
  src: ImageMetadata;
  alt: string;
  /** Instrument-style corner label */
  hud?: string;
}

export const PHOTOS = {
  'home-hero': {
    src: homeHero,
    alt: 'A 1950s brick bungalow on a snowy suburban street at dusk, lamplight in the front window',
    hud: 'Visible light',
  },
  'home-hero-thermal': {
    src: homeHeroThermal,
    alt: 'The same bungalow as an infrared camera sees it: heat glowing around the door, window frames, eaves and the rim joist above the foundation',
    hud: 'Infrared',
  },
  'home-energy-audit': {
    src: homeEnergyAudit,
    alt: 'An energy advisor’s kit on a front-hall bench: infrared camera, pressure gauge with tubing, tape measure, headlamp and a floor sketch',
    hud: 'EnerGuide evaluation',
  },
  'blower-door-test': {
    src: blowerDoor,
    alt: 'A red blower-door panel with a large fan fitted into the front doorway of a brick bungalow, a pressure gauge on a stool inside',
    hud: 'Depressurized to 50 Pa',
  },
  'thermal-imaging': {
    src: thermalImaging,
    alt: 'Hands holding an infrared camera aimed at a ceiling corner beside a frosty window; the screen shows a cold streak',
    hud: 'Infrared scan',
  },
  'heat-loss-calculation': {
    src: heatLoss,
    alt: 'A kitchen table with a house floor plan, a laser measure, a tape measure and a laptop showing the plan',
    hud: 'Room by room · CSA F280',
  },
  'duct-leakage-testing': {
    src: ductLeakage,
    alt: 'A duct-testing fan on a basement floor connected by flexible duct to a furnace, a pressure gauge hanging from a joist',
    hud: 'Duct leakage at 25 Pa',
  },
  'combustion-safety-test': {
    src: combustion,
    alt: 'A gloved hand inserting a combustion analyzer probe into a furnace flue pipe in a basement',
    hud: 'Flue gas · CO ppm',
  },
  'ventilation-assessment': {
    src: ventilation,
    alt: 'A heat recovery ventilator on a basement wall with four insulated ducts running up between the joists',
    hud: 'HRV airflow · L/s',
  },
  'attic-insulation-inspection': {
    src: attic,
    alt: 'Loose-fill insulation between attic joists, a yellow ruler showing its depth and frost on the roofing nails above',
    hud: 'Depth check · R-value',
  },
  'energy-bill-analysis': {
    src: bills,
    alt: 'Utility bills and a phone showing a monthly energy-use chart on a kitchen table',
    hud: '12 months of bills',
  },
  'radon-testing': {
    src: radon,
    alt: 'A small digital radon monitor on a bookshelf in a finished basement family room',
    hud: '3+ months · Bq/m³',
  },
  'carbon-monoxide-testing': {
    src: co,
    alt: 'A carbon monoxide alarm on an upstairs hallway wall outside the bedrooms at night',
    hud: 'CO alarm · ppm',
  },
  'mold-testing': {
    src: mold,
    alt: 'A moisture meter pressed into water-stained basement drywall, an air-sampling pump on a tripod nearby',
    hud: 'Moisture · % WME',
  },
  'asbestos-testing': {
    src: asbestos,
    alt: 'A gloved hand holding a sealed sample bag above vermiculite insulation between attic joists',
    hud: 'Lab sample · don’t disturb',
  },
  'lead-paint-testing': {
    src: lead,
    alt: 'A gloved hand swabbing layers of cracked old paint on a wooden window sill',
    hud: 'Swab test · pre-1990 paint',
  },
  'well-water-testing': {
    src: well,
    alt: 'Filling a water-sample bottle at a farmhouse kitchen tap with the aerator removed, snowy fields and a barn outside',
    hud: 'Bacteria · E. coli + coliforms',
  },
  'commercial-energy-audit': {
    src: commercial,
    alt: 'An auditor walking between rooftop heating and cooling units on a snowy commercial roof',
    hud: 'ASHRAE Level 1–2',
  },
  'region-ontario': {
    src: rOntario,
    alt: 'A Victorian red-brick semi-detached house with a front porch in autumn',
    hud: 'Ontario',
  },
  'region-quebec': {
    src: rQuebec,
    alt: 'A brick Montréal plex with exterior spiral staircases in winter',
    hud: 'Quebec',
  },
  'region-prairies': {
    src: rPrairies,
    alt: 'A stucco bungalow on a frosty Prairie street, a pickup truck plugged in for its block heater',
    hud: 'The Prairies',
  },
  'region-bc': {
    src: rBC,
    alt: 'A two-storey Vancouver Special house on a rainy street above a mossy retaining wall',
    hud: 'British Columbia',
  },
  'region-alberta': {
    src: rAlberta,
    alt: 'A two-storey Calgary house with a double garage under a chinook sky, mountains on the horizon',
    hud: 'Alberta',
  },
  'region-atlantic': {
    src: rAtlantic,
    alt: 'Colourful wooden row houses on a steep street above a foggy Atlantic harbour',
    hud: 'Atlantic Canada',
  },
  'region-north': {
    src: rNorth,
    alt: 'A house raised on steel piles in a northern town, a snowmobile parked outside in ice fog',
    hud: 'The North',
  },
} satisfies Record<string, SitePhoto>;

export type PhotoKey = keyof typeof PHOTOS;

export function photo(key: string): SitePhoto | undefined {
  return (PHOTOS as Record<string, SitePhoto>)[key];
}

/** /tests/<slug>/ page → photo */
export const TEST_PHOTO: Record<string, PhotoKey> = {
  'blower-door': 'blower-door-test',
  'thermal-imaging': 'thermal-imaging',
  'heat-loss-calc': 'heat-loss-calculation',
  'duct-leakage': 'duct-leakage-testing',
  'combustion-safety': 'combustion-safety-test',
  'ventilation-assessment': 'ventilation-assessment',
  'attic-inspection': 'attic-insulation-inspection',
  'bill-analysis': 'energy-bill-analysis',
  radon: 'radon-testing',
  'carbon-monoxide': 'carbon-monoxide-testing',
  'mold-iaq': 'mold-testing',
  'asbestos-vermiculite': 'asbestos-testing',
  'lead-paint': 'lead-paint-testing',
  'well-water': 'well-water-testing',
};

/** Province/territory code → regional house-style photo */
export const PROV_PHOTO: Record<string, PhotoKey> = {
  ON: 'region-ontario',
  QC: 'region-quebec',
  BC: 'region-bc',
  AB: 'region-alberta',
  SK: 'region-prairies',
  MB: 'region-prairies',
  NS: 'region-atlantic',
  NB: 'region-atlantic',
  PE: 'region-atlantic',
  NL: 'region-atlantic',
  YT: 'region-north',
  NT: 'region-north',
  NU: 'region-north',
};

/** Province page slug → regional photo */
export const PROV_SLUG_PHOTO: Record<string, PhotoKey> = {
  ontario: 'region-ontario',
  quebec: 'region-quebec',
  bc: 'region-bc',
  alberta: 'region-alberta',
  saskatchewan: 'region-prairies',
  manitoba: 'region-prairies',
  'nova-scotia': 'region-atlantic',
  'new-brunswick': 'region-atlantic',
  pei: 'region-atlantic',
  'newfoundland-labrador': 'region-atlantic',
  north: 'region-north',
};

/** Social-card image (public/og/<key>.jpg, 1200×630) for a photo key */
export function ogFor(key: string | undefined): string | undefined {
  return key && key in PHOTOS ? `/og/${key}.jpg` : undefined;
}
