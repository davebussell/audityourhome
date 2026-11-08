/**
 * The French city pages (/fr/villes/<ville>/): the 11 Québec cities of src/data/fr/villes.json (numbers extracted
 * by tools/fr/build-villes.mjs from the research behind the English city pages), with the French sentences
 * composed here, the hand-translated municipal programs (src/data/fr/municipal.json) and climate notes
 * (src/data/fr/villes-notes.json).
 */
import villesJson from '../../data/fr/villes.json';
import municipalJson from '../../data/fr/municipal.json';
import notesJson from '../../data/fr/villes-notes.json';
import type { CityFacts } from '../local';

export interface Share { v: number; caution: boolean }
export interface RadonNewer { kind: 'metro' | 'city'; name: string; pct: number | null; oneIn: number | null; between: number | null; readings: number | null }
export interface Ville {
  slug: string;
  fr: string;
  name: string;
  population: number;
  lat: number;
  lon: number;
  fsas: string[];
  facts: CityFacts;
  heating: { geo: string; isProvince: boolean; shares: Record<string, Share> } | null;
  radon: { region: string; tested: number; pct: number; newer: RadonNewer[] } | null;
  utilities: { electricity: string | null; gas: string | null };
  wells: string | null;
  municipal: { name: string; url: string; status: string; type: string }[];
  providers: { name: string; phone: string | null; coverage: number }[];
  nearby: { slug: string; name: string; km: number; qc: boolean; fr: string }[];
  programs: { href: string; status: string; kind: string }[];
}

export const VILLES = villesJson.villes as Ville[];
/** "September 28, 2026": when the city data was checked */
export const VILLES_CHECKED_ISO = villesJson.checkedISO as string;
export const villeBySlug = (fr: string) => VILLES.find((v) => v.fr === fr);

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** "2026-09-28" → "28 septembre 2026" */
export function dateFr(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}
export const VILLES_CHECKED = dateFr(VILLES_CHECKED_ISO);

/** 4354 → "4 354" (narrow no-break space, as fr-CA formats it) */
export const n = (v: number) => v.toLocaleString('fr-CA');
/** −24.3 → "−24,3 °C" */
export const deg = (v: number) => `${v.toFixed(1).replace('.', ',').replace('-', '−')} °C`;
const pct = (v: number) => `${Math.round(v)} %`;

/** The heating-season band, like gen_pages.py's */
export function saison(hdd: number): string {
  if (hdd < 3000) return 'des hivers doux selon les normes canadiennes';
  if (hdd < 4000) return 'une saison de chauffage modérée';
  if (hdd < 5000) return 'une longue saison de chauffage';
  if (hdd < 6000) return 'des hivers froids où le chauffage domine';
  if (hdd < 7000) return 'des hivers très froids';
  return 'un froid extrême et une très longue saison de chauffage';
}
export function saisonConseil(hdd: number): string {
  if (hdd < 3000) return 'Les factures de chauffage sont modestes : le contrôle de l’humidité et le confort comptent autant que les pertes de chaleur.';
  if (hdd < 4000) return 'Une saison de chauffage modérée et des étés chauds : les correctifs doivent réduire le chauffage et garder la maison fraîche.';
  if (hdd < 5000) return 'Une longue saison de chauffage : l’étanchéité à l’air et l’isolation se rentabilisent bien, et chaque fuite coûte de l’argent pendant des mois.';
  if (hdd < 6000) return 'Des hivers froids : le chauffage est le plus gros poste d’énergie, alors on bouche les fuites et on isole d’abord.';
  if (hdd < 7000) return 'Des hivers très froids : le chauffage domine, et une thermopompe doit être homologuée pour climat froid, avec un chauffage d’appoint.';
  return 'Un froid extrême : l’enveloppe passe en premier, et la fiabilité du chauffage est une question de sécurité.';
}

export function climatPhrase(v: Ville): string {
  const f = v.facts;
  return `${v.name} compte environ ${n(f.hdd)} degrés-jours de chauffage par année, une mesure de ce que son climat demande en chauffage, et sa température de calcul d’hiver, la journée froide pour laquelle on dimensionne les systèmes de chauffage, est de ${deg(f.designHeat)}. Ces chiffres viennent des données climatiques de la station ${v.facts.station} dans HOT2000, le logiciel de Ressources naturelles Canada (RNCan) utilisé par les conseillers en efficacité énergétique. ${saisonConseil(f.hdd)}`;
}

export function logementPhrase(v: Ville): string {
  const f = v.facts;
  const parts = [`Des ${n(f.houses)} maisons de ${v.name} (unifamiliales détachées, jumelées, en rangée et duplex), ${pct(f.housesPre1961 ?? 0)} ont été construites avant 1961 et ${pct(f.housesPre1991 ?? 0)} avant 1991, selon le Recensement de 2021.`];
  parts.push(`La maison typique date de ${f.medianPeriod.replace(' or earlier', ' ou avant').replace(' or later', ' ou après')}.`);
  if (f.singleDetachedPct != null) parts.push(`Les maisons unifamiliales détachées représentent ${pct(f.singleDetachedPct)} des logements${f.singleDetachedPct < 15 ? ' : les plex et les appartements dominent' : ''}.`);
  return parts.join(' ');
}

const SYSTEMES: [string, string][] = [
  ['baseboard', 'des plinthes électriques'],
  ['forcedAir', 'une fournaise à air pulsé'],
  ['heatPump', 'une thermopompe'],
  ['boiler', 'une chaudière et des radiateurs'],
  ['stove', 'un poêle'],
];
const ENERGIES: [string, string][] = [
  ['electricity', 'l’électricité'],
  ['gas', 'le gaz naturel'],
  ['oil', 'le mazout'],
  ['wood', 'le bois'],
  ['propane', 'le propane'],
];
const share = (s: Share) => `${s.caution ? 'environ ' : ''}${s.v} %`;
function joinEt(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}
function zoneChauffage(v: Ville): string {
  const h = v.heating!;
  if (h.isProvince) return 'Au Québec (Statistique Canada ne publie pas de chiffres pour la ville)';
  if (/Quebec part/.test(h.geo)) return 'Dans la partie québécoise de la région d’Ottawa–Gatineau';
  return `Dans la région de ${h.geo}`;
}
/** "Dans la région de Montréal, 54 % des ménages chauffent surtout avec des plinthes électriques… (Statistique Canada, 2023)." */
export function chauffagePhrase(v: Ville): string | null {
  const h = v.heating;
  if (!h) return null;
  const sys = SYSTEMES.filter(([k]) => h.shares[k]).sort((a, b) => h.shares[b[0]].v - h.shares[a[0]].v);
  const sysBits = sys.map(([k, lab], i) => (i === 0 ? `${share(h.shares[k])} des ménages chauffent surtout avec ${lab}` : `${share(h.shares[k])} avec ${lab}`));
  const en = ENERGIES.filter(([k]) => h.shares[k]).sort((a, b) => h.shares[b[0]].v - h.shares[a[0]].v).slice(0, 3);
  const enBits = en.map(([k, lab], i) => (i === 0 ? `${lab} est la principale énergie de chauffage de ${share(h.shares[k])} des ménages` : `${lab} de ${share(h.shares[k])}`));
  let s = '';
  if (sysBits.length) s = `${zoneChauffage(v)}, ${joinEt(sysBits)}`;
  if (enBits.length) {
    const tail = joinEt(enBits);
    s = s ? `${s}; ${tail}` : `${zoneChauffage(v)}, ${tail}`;
  }
  return s ? `${s} (Statistique Canada, 2023).` : null;
}

const REGION_FR: Record<string, string> = { Quebec: 'Québec' };
function regionSocio(region: string): string {
  // "Région de l'Outaouais" → "la région sociosanitaire de l’Outaouais"
  return region.replace(/^Région /, 'la région sociosanitaire ').replace(/'/g, '’').replace(' - ', ' – ');
}
export function radonPhrase(v: Ville): string | null {
  const r = v.radon;
  if (!r) return null;
  const first = r.pct === 0
    ? `Dans l’enquête de Santé Canada de 2012, aucune des ${r.tested} maisons testées dans ${regionSocio(r.region)} ne dépassait la ligne directrice de 200 Bq/m³, un petit échantillon.`
    : `L’enquête de Santé Canada de 2012 a trouvé ${String(r.pct).replace('.', ',')} % des ${r.tested} maisons testées dans ${regionSocio(r.region)} au-dessus de la ligne directrice de 200 Bq/m³.`;
  const city = r.newer.find((x) => x.kind === 'city' && x.pct != null);
  const metro = r.newer.find((x) => x.kind === 'metro' && x.pct != null);
  const fmtP = (p: number) => `${p.toFixed(1).replace('.', ',')} %`;
  const bits: string[] = [];
  if (city) bits.push(`${fmtP(city.pct!)}${city.oneIn ? ` (1 maison sur ${city.oneIn})` : ''} des maisons de ${city.name} à 200 Bq/m³ ou plus${city.readings ? ` (${n(city.readings)} mesures de longue durée)` : ''}${city.between != null ? `, et ${fmtP(city.between)} entre 100 et 200 Bq/m³` : ''}`);
  if (metro) bits.push(`${fmtP(metro.pct!)}${metro.oneIn ? ` (1 sur ${metro.oneIn})` : ''} dans la région métropolitaine de ${REGION_FR[metro.name] ?? metro.name}`);
  const second = bits.length ? ` L’enquête pancanadienne de 2024, beaucoup plus vaste, rapporte ${joinEt(bits)}.` : '';
  return first + second;
}

export function puitsPhrase(v: Ville): string {
  if (v.wells === 'rare') return 'Puits privés rares : la ville est desservie par le réseau municipal.';
  if (v.wells === 'some') return 'Des puits privés dans certains secteurs : l’eau d’un puits se teste par un laboratoire accrédité, les bactéries chaque saison et la chimie périodiquement.';
  return 'Beaucoup de puits privés : faites analyser l’eau au moins deux fois par année.';
}

export const STATUT_MUNI: Record<string, [string, string]> = {
  open: ['chip-active', 'Ouvert'],
  paused: ['chip-closed', 'Suspendu'],
  waitlist: ['chip-limited', 'Liste d’attente'],
  closed: ['chip-closed', 'Fermé'],
};
export interface MuniFr { nom: string; resume: string | null; url: string; status: string }
export function municipalFr(v: Ville): MuniFr[] {
  const tr = (municipalJson as { programmes: Record<string, { nom: string; resume: string }> }).programmes;
  return v.municipal.map((m) => ({ nom: tr[m.url]?.nom ?? m.name, resume: tr[m.url]?.resume ?? null, url: m.url, status: m.status }));
}

export interface NoteFr { profil: string; note: string; aleas: string[] }
export function noteFr(v: Ville): NoteFr | null {
  return (notesJson as { notes: Record<string, NoteFr> }).notes[v.slug] ?? null;
}

/** "3 organismes de services autorisés" */
export function organismesLabel(count: number): string {
  if (count === 0) return 'Demandez-nous';
  return `${count} organisme${count === 1 ? '' : 's'} de services autorisé${count === 1 ? '' : 's'}`;
}
