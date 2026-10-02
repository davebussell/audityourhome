#!/usr/bin/env python3
"""Assemble per-city local data for the /services/ city pages.

Inputs (all checked 2026-09-25 to 2026-09-28):
  data/CA.txt                 GeoNames postal-code (FSA) places
  data/hot2000g.json          NRCan HOT2000 Climate Map (403 weather locations: HDD, design temps)
  data/housing_raw.json       StatCan table 98-10-0233-01 (2021 Census), filtered to our 70 CSDs
  data/98100002.csv           StatCan table 98-10-0002-01 (2021 population)
  /tmp/nrcan-so.json          NRCan list of service organizations for existing homes (checked 2026-09-25)
  research/*.json             radon, health_rules, well_water, commercial, utilities, municipal
Output: out/cities.json
"""
import csv, json, math, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cities_master import CITIES, PROVINCES

BASE = os.path.dirname(os.path.abspath(__file__))  # raw inputs expected in ./data (not committed)
R = lambda n: json.load(open(f'{BASE}/research/{n}.json'))
radon, health, wells, commercial, utilities, municipal = (R(n) for n in (
    'radon', 'health_rules', 'well_water', 'commercial', 'utilities', 'municipal'))

# ------------------------------------------------------------------ FSAs
geo = [l.rstrip('\n').split('\t') for l in open(f'{BASE}/data/CA.txt', encoding='utf-8')]
SPECIAL = re.compile(r'^Government|^Quebec Provincial Government|^Queen\'s Park|PO Boxes|Business Reply|Enclave|Bentall Centre|Pacific Centre|Tour de la Bourse|'
                     r'Place Bonaventure|Place Desjardins|Underground city|Toronto Dominion Centre|Commerce Court', re.I)
FSA = {}
for r in geo:
    code, place, prov, lat, lon = r[1], r[2], r[4], r[9], r[10]
    if len(code) != 3 or code[1] == '0' or SPECIAL.search(place):
        continue
    FSA.setdefault(code, {'place': place, 'prov': prov, 'lat': float(lat), 'lon': float(lon)})

EXPLICIT = {
    'hamilton': 'L8E,L8G,L8H,L8J,L8K,L8L,L8M,L8N,L8P,L8R,L8S,L8T,L8V,L8W,L9A,L9B,L9C,L8B,L9G,L9H,L9K',
}


def resolve_fsas(slug, prov, spec):
    spec = EXPLICIT.get(slug, spec)
    out = []
    for part in spec.split(','):
        part = part.strip()
        if part.startswith('name:') or part.startswith('start:'):
            key = part.split(':', 1)[1]
            out += [c for c, v in FSA.items() if v['prov'] == prov and v['place'].startswith(key)]
        elif part.endswith('*'):
            out += [c for c, v in FSA.items() if v['prov'] == prov and c.startswith(part[:-1])]
        elif part in FSA:
            out.append(part)
        else:
            print('WARN missing FSA', slug, part)
    return sorted(set(out))


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(d))


# ------------------------------------------------------------------ climate
stations = [f for f in json.load(open(f'{BASE}/data/hot2000g.json'))['features']]


# Inland cities whose nearest HOT2000 location is a lakeshore/island station get the closest comparable inland one.
STATION_OVERRIDE = {'kitchener': 'MOUNT FOREST', 'waterloo': 'MOUNT FOREST', 'guelph': 'MOUNT FOREST',
                    'cambridge': 'TORONTO INTL', 'milton': 'TORONTO INTL', 'brantford': 'LONDON',
                    'kingston': 'TRENTON', 'nanaimo': 'COMOX', 'surrey': 'PITT MEADOWS'}


def nearest_station(lat, lon, slug=None):
    if slug in STATION_OVERRIDE:
        best = next(f for f in stations if f['attributes']['Name'].strip() == STATION_OVERRIDE[slug])
    else:
        best = min(stations, key=lambda f: hav((lat, lon), (f['geometry']['y'], f['geometry']['x'])))
    a = best['attributes']
    return {
        'station': a['Name'].strip().title().replace("'S", "'s").replace('Intl', 'International'),
        'stationProv': a['Prov'],
        'km': round(hav((lat, lon), (best['geometry']['y'], best['geometry']['x']))),
        'hdd': a['HDD_Below_18C'], 'designHeat': a['DHDBT'], 'designCool': a['DCDBT'],
    }


# ------------------------------------------------------------------ population
POP = {}
with open(f'{BASE}/data/98100002.csv', encoding='utf-8-sig') as f:
    rd = csv.reader(f)
    next(rd)
    for x in rd:
        if len(x) > 4 and x[2].startswith('2021A0005'):
            try:
                POP[x[2]] = int(x[4])
            except ValueError:
                pass

# ------------------------------------------------------------------ housing
HR = json.load(open(f'{BASE}/data/housing_raw.json'))
HOUSE_TYPES = ['Single-detached house', 'Semi-detached house', 'Row house', 'Other single-attached house',
               'Apartment or flat in a duplex', 'Movable dwelling']
# 98-10-0233 splits the 1990s into two five-year periods (there is no '1991 to 2000' row).
PERIODS = ['1920 or before', '1921 to 1945', '1946 to 1960', '1961 to 1970', '1971 to 1980', '1981 to 1990',
           '1991 to 1995', '1996 to 2000', '2001 to 2005', '2006 to 2010', '2011 to 2015', '2016 to 2021']
SINCE_2001 = [p for p in PERIODS if p[:2] == '20']


def num(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def housing(slug):
    d = HR[slug]
    g = lambda per, st, k='total': num(d.get(f'{per} || {st}', {}).get(k))
    total = g('Total - Period of construction', 'Total - Structural type of dwelling')
    owners = g('Total - Period of construction', 'Total - Structural type of dwelling', 'owner')
    single = g('Total - Period of construction', 'Single-detached house')
    houses_by = {p: sum(g(p, t) for t in HOUSE_TYPES) for p in PERIODS}
    all_by = {p: g(p, 'Total - Structural type of dwelling') for p in PERIODS}
    houses = sum(houses_by.values())
    # cross-check: the period rows must add up to the table's own all-periods total for these dwelling types
    houses_direct = sum(g('Total - Period of construction', t) for t in HOUSE_TYPES)
    assert abs(houses - houses_direct) <= max(60, houses_direct * 0.01), (slug, houses, houses_direct)
    pct = lambda part, whole: round(100 * part / whole, 1) if whole else None
    pre61 = lambda by: sum(by[p] for p in PERIODS[:3])
    pre91 = lambda by: sum(by[p] for p in PERIODS[:6])
    # median construction period for houses
    acc, median = 0, None
    for p in PERIODS:
        acc += houses_by[p]
        if houses and acc >= houses / 2:
            median = p
            break
    return {
        'households': total, 'ownerPct': pct(owners, total), 'singleDetachedPct': pct(single, total),
        'housesPct': pct(houses, total), 'houses': houses,
        'housesPre1961Pct': pct(pre61(houses_by), houses), 'housesPre1991Pct': pct(pre91(houses_by), houses),
        'housesPre1921Pct': pct(houses_by['1920 or before'], houses),
        'houses1961to1990Pct': pct(pre91(houses_by) - pre61(houses_by), houses),
        'housesSince2001Pct': pct(sum(houses_by[p] for p in SINCE_2001), houses),
        'houses1991to2000Pct': pct(houses_by['1991 to 1995'] + houses_by['1996 to 2000'], houses),
        'allPre1961Pct': pct(pre61(all_by), total), 'allPre1991Pct': pct(pre91(all_by), total),
        'medianHousePeriod': median,
        'housesByPeriod': houses_by,
    }


# ------------------------------------------------------------------ providers (NRCan)
SO = json.load(open('/tmp/nrcan-so.json'))
FSA_RE = re.compile(r'(?<![A-Z0-9])([A-Z]\d[A-Z])(?![A-Z0-9])')
PROV_CODE = {'PEI': 'PE'}
# Ontario orgs with an AuditYourHome profile, and the seven HRS-approved organizations
PROFILE_PREFIX = {
    'AmeriSpec of Canada': 'amerispec-canada', 'Canada Energy Audit': 'canada-energy-audits',
    'Energuy Holdings': 'the-energuy', 'Windfall Ecology Centre': 'windfall-ecology-centre',
    'Reep Green Solutions': 'reep-green-solutions', 'Peterborough Green Up': 'greenup',
    'Environment Network': 'environment-network', 'Nadeau Energy Solutions': 'nadeau-home-inspections',
    'All Season Inspection': 'all-season-inspection', 'Green Canada Home Advisors': 'green-canada-home-advisors',
    'EnerSolution': 'enersolution',
}
HRS_PREFIX = ['AmeriSpec of Canada', 'Canada Energy Audit', 'Energuy Holdings', 'Energy Werx Corp', 'Greenbrain',
              'A1 NRGwise Consulting', 'The Home Inspectors Group']
TOLLFREE = {'800', '833', '844', '855', '866', '877', '888'}


def fmt_phone(s):
    opt = re.search(r'\(opt\s*(\d)\)', s or '')
    if opt:
        return (fmt_phone(re.sub(r'\(opt\s*\d\)', '', s)) or '') + f' (option {opt.group(1)})'
    s = (s or '').split(',')[0].split(' / ')[0].split(' or ')[0].split('/')[0]
    m = re.search(r'ext\.?\s*(\d+)', s, re.I)
    ext = m.group(1) if m else None
    if m:
        s = s[:m.start()]
    d = re.sub(r'\D', '', s)
    if len(d) == 11 and d[0] == '1':
        d = d[1:]
    if len(d) != 10:
        return None
    out = f'{d[:3]}-{d[3:6]}-{d[6:]}'
    if d[:3] in TOLLFREE:
        out = '1-' + out
    return out + (f' ext. {ext}' if ext else '')


def base_name(n):
    n = re.sub(r'\s*\([^)]*\)+\s*$', '', n).strip()
    n = re.sub(r'\s*\([^)]*$', '', n).strip()
    return n


def display_name(n):
    b = base_name(n)
    b = re.sub(r',?\s+(Inc\.?|Ltd\.?|Ltée|Corp\.?|Corporation|Limited)$', '', b).strip()
    fix = {'Energuy Holdings': 'The Energuy', 'A1 NRGwise Consulting': 'NRGwise (A1 NRGwise Consulting)',
           'Peterborough Green Up': 'GreenUP', 'Canada Energy Audit': 'Canada Energy Audits',
           'Energy Werx Corp': 'Energy Werx', 'AmeriSpec of Canada': 'AmeriSpec'}
    for k, v in fix.items():
        if b.startswith(k):
            return v
    return b


def providers_for(fsas, prov):
    fs = set(fsas)
    orgs = {}
    for r in SO:
        codes = set(FSA_RE.findall(r['postal'].upper()))
        hit = codes & fs
        if not hit:
            continue
        name = display_name(r['name'])
        o = orgs.setdefault(name, {'name': name, 'fsas': set(), 'phones': [], 'nrcanNames': set()})
        o['fsas'] |= hit
        o['nrcanNames'].add(r['name'])
        ph = fmt_phone(r['phone'])
        if ph and ph not in o['phones']:
            o['phones'].append(ph)
    out = []
    for o in orgs.values():
        raw = ' '.join(o['nrcanNames'])
        slug = next((s for k, s in PROFILE_PREFIX.items() if k.lower() in raw.lower()), None)
        hrs = prov == 'ON' and any(k.lower() in raw.lower() for k in HRS_PREFIX)
        gcc = 'Green Communities Canada' in raw
        out.append({'name': o['name'], 'phone': o['phones'][0] if o['phones'] else None,
                    'coverage': round(100 * len(o['fsas']) / len(fs)), 'profile': slug, 'hrs': hrs, 'gcc': gcc})
    out.sort(key=lambda x: (-x['coverage'], x['name'].lower()))
    return out


# ------------------------------------------------------------------ Ontario region + site links
ON_REGION = {'toronto': 'toronto', 'mississauga': 'mississauga', 'brampton': 'brampton', 'hamilton': 'hamilton',
             'ottawa': 'ottawa', 'london': 'london', 'markham': 'york-region', 'vaughan': 'york-region',
             'richmond-hill': 'york-region', 'kitchener': 'kitchener-waterloo', 'waterloo': 'kitchener-waterloo',
             'cambridge': 'kitchener-waterloo', 'barrie': 'barrie-simcoe', 'peterborough': 'peterborough',
             'kingston': 'kingston', 'st-catharines': 'niagara'}
PROV_SLUG = {'ON': 'ontario', 'QC': 'quebec', 'BC': 'bc', 'AB': 'alberta', 'SK': 'saskatchewan',
             'MB': 'manitoba', 'NS': 'nova-scotia', 'NB': 'new-brunswick', 'PE': 'pei',
             'NL': 'newfoundland-labrador', 'YT': 'north', 'NT': 'north'}

# StatCan Households and the Environment Survey 2023 (table 38-10-0286-01): geography used for each city
HEAT = json.load(open(f'{BASE}/data/heating_2023.json'))
HEAT_GEO = {}
for s_, g_ in [('toronto mississauga brampton markham vaughan richmond-hill oakville milton ajax pickering', 'Toronto, Ontario'),
               ('montreal laval longueuil terrebonne', 'Montréal, Quebec'), ('calgary', 'Calgary, Alberta'),
               ('ottawa', 'Ottawa-Gatineau (Ontario part)'), ('gatineau', 'Ottawa-Gatineau (Quebec part)'),
               ('edmonton sherwood-park', 'Edmonton, Alberta'), ('winnipeg', 'Winnipeg, Manitoba'),
               ('vancouver surrey burnaby richmond-bc coquitlam delta langley', 'Vancouver, British Columbia'),
               ('hamilton burlington', 'Hamilton, Ontario'), ('quebec-city levis', 'Québec, Quebec'),
               ('halifax', 'Halifax, Nova Scotia'), ('london', 'London, Ontario'), ('saskatoon', 'Saskatoon, Saskatchewan'),
               ('regina', 'Regina, Saskatchewan'), ('kitchener waterloo cambridge', 'Kitchener-Cambridge-Waterloo, Ontario'),
               ('windsor', 'Windsor, Ontario'), ('oshawa whitby clarington', 'Oshawa, Ontario'),
               ('sherbrooke', 'Sherbrooke, Quebec'), ('sudbury', 'Greater Sudbury, Ontario'),
               ('abbotsford', 'Abbotsford-Mission, British Columbia'), ('barrie', 'Barrie, Ontario'),
               ('saguenay', 'Saguenay, Quebec'), ('kelowna', 'Kelowna, British Columbia'), ('guelph', 'Guelph, Ontario'),
               ('trois-rivieres', 'Trois-Rivières, Quebec'), ('st-catharines', 'St. Catharines-Niagara, Ontario'),
               ('kingston', 'Kingston, Ontario'), ('saanich victoria', 'Victoria, British Columbia'),
               ("st-johns", "St. John's, Newfoundland and Labrador"), ('thunder-bay', 'Thunder Bay, Ontario'),
               ('brantford', 'Brantford, Ontario'), ('chatham-kent', 'Ontario'), ('red-deer', 'Red Deer, Alberta'),
               ('lethbridge', 'Lethbridge, Alberta'), ('nanaimo', 'Nanaimo, British Columbia'),
               ('kamloops', 'Kamloops, British Columbia'), ('saint-jean-sur-richelieu', 'Quebec'),
               ('peterborough', 'Peterborough, Ontario'), ('moncton', 'Moncton, New Brunswick'),
               ('saint-john', 'Saint John, New Brunswick'), ('fredericton', 'Fredericton, New Brunswick'),
               ('charlottetown', 'Prince Edward Island')]:
    for x in s_.split():
        HEAT_GEO[x] = g_
HEAT_KEYS = {'forcedAir': 'Forced air furnace', 'baseboard': 'Electric baseboard heaters', 'heatPump': 'Heat pump',
             'boiler': 'Boiler with hot water or steam radiators', 'stove': 'Heating stove',
             'gas': 'Natural gas', 'electricity': 'Electricity', 'oil': 'Oil', 'wood': 'Wood or wood pellets',
             'propane': 'Propane'}


def heating(slug):
    g = HEAT_GEO.get(slug)
    if not g:
        return None
    d = HEAT[g]
    out = {'geo': g.replace(', Ontario', '').replace(', Quebec', '').replace(', Alberta', '').replace(', British Columbia', '')
           .replace(', Manitoba', '').replace(', Saskatchewan', '').replace(', Nova Scotia', '').replace(', New Brunswick', '')
           .replace(', Newfoundland and Labrador', '')}
    out['isProvince'] = ',' not in g and '(' not in g
    for k, name in HEAT_KEYS.items():
        v = d.get(name)
        out[k] = None if (not v or v[0] is None or v[1] == 'F') else {'v': v[0], 'caution': v[1] == 'E'}
    return out

# ------------------------------------------------------------------ radon newer data
NEWER = defaultdict(list)
for e in radon.get('newerData', []):
    for s in e.get('slugs') or []:
        NEWER[s].append({k: e.get(k) for k in ('scope', 'figure', 'source', 'note')})
PROV_NEWER = {}
for e in radon.get('newerData', []):
    sc = e.get('scope', '')
    if sc.startswith('province:'):
        PROV_NEWER[sc.split(':', 1)[1].strip()] = {k: e.get(k) for k in ('scope', 'figure', 'source')}

# ------------------------------------------------------------------ assemble
cities = []
for slug, name, prov, dguid, label, spec in CITIES:
    fsas = resolve_fsas(slug, prov, spec)
    lat = sum(FSA[c]['lat'] for c in fsas) / len(fsas)
    lon = sum(FSA[c]['lon'] for c in fsas) / len(fsas)
    rc = radon['cities'].get(slug, {})
    cities.append({
        'slug': slug, 'name': name, 'label': label, 'prov': prov, 'provName': PROVINCES[prov],
        'provSlug': PROV_SLUG[prov], 'population': POP.get(dguid), 'dguid': dguid,
        'fsas': fsas, 'lat': round(lat, 4), 'lon': round(lon, 4),
        'climate': dict(nearest_station(lat, lon, slug), override=slug in STATION_OVERRIDE),
        'housing': housing(slug),
        'radon': {'region': rc.get('healthRegion'), 'tested': rc.get('homesTested'), 'pct': rc.get('pctAbove200'),
                  'pct600': rc.get('pctAbove600'), 'note': rc.get('note'), 'newer': NEWER.get(slug, [])},
        'utilities': utilities['cities'].get(slug),
        'wells': wells['cities'].get(slug),
        'commercialRules': commercial['rules']['cities'].get(slug, []),
        'commercialIncentives': commercial['cityIncentives'].get(slug, []),
        'commercialIncentiveNote': commercial.get('cityIncentiveNotes', {}).get(slug),
        'municipal': municipal['cities'].get(slug, []),
        'providers': providers_for(fsas, prov),
        'onRegion': ON_REGION.get(slug),
        'heating': heating(slug),
    })

for c in cities:
    others = sorted((x for x in cities if x['slug'] != c['slug']),
                    key=lambda x: hav((c['lat'], c['lon']), (x['lat'], x['lon'])))
    c['nearby'] = [{'slug': x['slug'], 'name': x['name'], 'km': round(hav((c['lat'], c['lon']), (x['lat'], x['lon'])))}
                   for x in others[:6]]

provinces = {}
for code in PROVINCES:
    provinces[code] = {
        'name': PROVINCES[code], 'slug': PROV_SLUG[code],
        'radon': radon['provinces'].get(code), 'radonNewer': PROV_NEWER.get(code),
        'health': health['provinces'].get(code),
        'wells': wells['provinces'].get(code),
        'commercialRules': commercial['rules']['provinces'].get(code, []),
        'evaluationPrices': municipal['evaluationPrices'].get(code, []),
    }

out = {'checked': '2026-09-28', 'cities': cities, 'provinces': provinces,
       'national': {'radon': radon.get('general'), 'radonSurvey': radon.get('survey'),
                    'health': health.get('national'), 'commercialFederal': commercial['rules'].get('federal')},
       'incentives': commercial['incentives'], 'utilities': utilities['utilities']}
json.dump(out, open(f'{BASE}/out/cities.json', 'w'), ensure_ascii=False, indent=1)
print('cities', len(cities))
for c in cities:
    h = c['housing']
    print(f"{c['slug']:26} fsas={len(c['fsas']):3} prov={len(c['providers']):2} st={c['climate']['station'][:18]:18} "
          f"{c['climate']['km']:4}km hdd={c['climate']['hdd']} dt={c['climate']['designHeat']:6} "
          f"pre61={h['housesPre1961Pct']} pre91={h['housesPre1991Pct']} radon={c['radon']['pct']} wells={(c['wells'] or {}).get('wells')}")
