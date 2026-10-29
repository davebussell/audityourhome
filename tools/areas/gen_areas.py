#!/usr/bin/env python3
"""Generate the /areas/ pages.

    python3 tools/areas/gen_areas.py

Reads  tools/areas/areas.json                 hand-curated area definitions
       tools/areas/research/*.json            census, places, climate, providers, health units, wood (all sourced)
       tools/local-pages/out/cities.json      covered cities (through gen_pages), for links and nearby figures
       tools/local-pages/research/radon.json  2012 and 2024 radon survey figures
       src/data/programs.json                 provincial and federal programs (read at generation time)
Writes src/data/areas/index.json and src/data/areas/<slug>.json (hub + 6 service pages each).

Research files are rebuilt with /home/claude/work/scripts/area_research.py (fetches and caches every source).
"""
import html
import json
import os
import re
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.dont_write_bytecode = True  # keep __pycache__ out of tools/local-pages
sys.path.insert(0, os.path.join(REPO, 'tools', 'local-pages'))
import gen_pages as GP  # noqa: E402  (province texts, program lookup, formatting helpers)

R = lambda n: json.load(open(os.path.join(HERE, 'research', f'{n}.json'), encoding='utf-8'))
CFG = json.load(open(os.path.join(HERE, 'areas.json'), encoding='utf-8'))['areas']
CENSUS = R('census')['geo']
PLACES = R('places')['places']
CLIMATE = R('climate')['areas']
PROV_DATA = R('providers')
HU = R('health_units')
WOOD = R('wood')
TOWNS = R('towns')['towns']
RADON = json.load(open(os.path.join(REPO, 'tools', 'local-pages', 'research', 'radon.json'), encoding='utf-8'))
CITY = {c['slug']: c for c in GP.CITIES}

CHECKED = 'October 8, 2026'
CHECKED_ISO = '2026-10-08'
esc, p, ul, n, deg, join_and = GP.esc, GP.p, GP.ul, GP.n, GP.deg, GP.join_and
MINUS = '−'


def link(href, text):
    """Internal link, or external link with rel=noopener and the ↗ marker the style guide asks for."""
    if href.startswith('http'):
        return f'<a href="{esc(href, quote=True)}" rel="noopener">{text} ↗</a>'
    return f'<a href="{esc(href, quote=True)}">{text}</a>'


def pc(part, whole):
    return round(100 * part / whole) if whole else None


def plural(k, one, many=None):
    return one if k == 1 else (many or one + 's')


def strip(t):
    return re.sub(r'<[^>]+>', '', t)


WORDS = {2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven',
         12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen', 16: 'sixteen'}


def words(k):
    return WORDS.get(k, str(k))


# ------------------------------------------------------------------ sources
SRC = {
    'census-pop': ('Statistics Canada — 2021 Census population and dwelling counts (table 98-10-0002-01)',
                   'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000201'),
    'census-housing': ('Statistics Canada — 2021 Census, households by period of construction and dwelling type (table 98-10-0233-01)',
                       'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810023301'),
    'popctr': ('Statistics Canada — 2021 Census population centres (table 98-10-0011-01)',
               'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810001101'),
    'occupied-def': ('Statistics Canada — Census dictionary: private dwelling occupied by usual residents',
                     'https://www12.statcan.gc.ca/census-recensement/2021/ref/dict/az/Definition-eng.cfm?ID=dwelling-logements006'),
    'cgndb': ('NRCan — Canadian Geographical Names Database (official place names)', 'https://geogratis.gc.ca/services/geoname/en/geonames'),
    'lio': ('Land Information Ontario — municipal boundaries (lower and single tier)',
            'https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/services/LIO_OPEN_DATA/LIO_Open03/MapServer/14'),
    'eccc': ('Environment and Climate Change Canada — Canadian Climate Normals 1981–2010', 'https://climate.weather.gc.ca/climate_normals/index_e.html'),
    'nbc': ('National Research Council — National Building Code of Canada 2020, Appendix C, Table C-2 (climatic design data)',
            'https://nrc-publications.canada.ca/eng/view/object/?id=515340b5-f4e0-4798-be69-692e4ec423e8'),
    'nbc-f280': ('National Research Council — National Building Code of Canada 2020, Article 9.33.5.1 and Table 1.3.1.2 (CSA F280-12)',
                 'https://doi.org/10.4224/w324-hv93'),
    'nrcan-so': ('NRCan — Service organizations for existing homes (list checked October 8, 2026)',
                 'https://natural-resources.canada.ca/energy-efficiency/home-energy-efficiency/find-service-organizations-existing-homes'),
    'geonames': ('GeoNames — Canadian postal codes (forward sortation area names)', 'https://download.geonames.org/export/zip/CA.zip'),
    'heating': GP.SRC['heating'],
    'radon2012': GP.SRC['radon2012'],
    'radon2024': GP.SRC['radon2024'],
    'hc-radon': GP.SRC['hc-radon'],
    'hc-measure': ('Health Canada — Guide for radon measurements in residential dwellings (homes)',
                   'https://www.canada.ca/en/health-canada/services/publications/health-risks-safety/guide-radon-measurements-residential-dwellings.html'),
    'hc-testing': ('Health Canada — Testing your home for radon',
                   'https://www.canada.ca/en/health-canada/services/health-risks-safety/radiation/radon/testing-your-home.html'),
    'hc-reduction': ('Health Canada — Radon reduction guide for Canadians (February 2023)',
                     'https://www.canada.ca/en/health-canada/services/environmental-workplace-health/reports-publications/radiation/radon-reduction-guide-canadians-health-canada.html'),
    'cnrpp': GP.SRC['cnrpp'],
    'radon-kit-price': GP.SRC['radon-kit-price'],
    'lending': ('Take Action on Radon — radon monitor lending programs (updated April 17, 2026)', 'https://takeactiononradon.ca/resources/lending-programs/'),
    'hc-mould': GP.SRC['hc-mould'],
    'hc-mould-home': ('Health Canada — Reduce humidity, moisture and mould in your home',
                      'https://www.canada.ca/en/health-canada/services/air-quality/indoor-air-contaminants/reduce-humidity-moisture-mould.html'),
    'cmhc-mould': ('CMHC — How to clean mould in your home',
                   'https://assets.cmhc-schl.gc.ca/sf/project/cmhc/pdfs/content/en/how-to-clean-mould-in-your-home.pdf?rev=27ff0795-0292-4d26-b1fc-128b9e9ed7e0'),
    'cmhc-kit': ('CMHC — Mould information kit',
                 'https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/industry-innovation-and-leadership/industry-expertise/indigenous-housing/develop-manage-indigenous-housing/maintenance-solutions/mould-in-housing/pdfs/mould-info-kit-en-acc.pdf'),
    'aihalap': GP.SRC['aihalap'],
    'pho-wells': ('Public Health Ontario — Well water testing', 'https://www.publichealthontario.ca/en/Laboratory-Services/Well-Water-Testing'),
    'pho-contact': ('Public Health Ontario — Well water testing: who to contact',
                    'https://www.publichealthontario.ca/en/Laboratory-Services/Well-Water-Testing/Water-Contact'),
    'on-wells': ('Government of Ontario — Testing and treating private water wells', 'https://www.ontario.ca/page/testing-and-treating-private-water-wells'),
    'cbc-wells': ('CBC News — Ontario auditor general on private well testing (2025)',
                  'https://www.cbc.ca/news/canada/london/less-than-30-of-ontario-s-drinking-water-from-private-wells-was-tested-last-year-auditor-general-finds-1.7498383'),
    'hlbc-wells': ('HealthLinkBC — Well water testing', 'https://www.healthlinkbc.ca/healthlinkbc-files/well-water-testing'),
    'bc-disinfect': ('Government of B.C. — Water well disinfection: using the simple chlorination method',
                     'https://www2.gov.bc.ca/assets/gov/environment/air-land-water/water/water-wells/bc_gov_5402_water_well_disinfection_webbrochure.pdf'),
    'nh-water': ('Northern Health — Drinking water: frequently asked questions',
                 'https://www.northernhealth.ca/services/environmental-health/drinking-water/frequently-asked-questions-faqs'),
    'ih-water': ('Interior Health — Drinking water (private drinking water safety)',
                 'https://www.interiorhealth.ca/health-and-wellness/environmental-health-and-hazards/drinking-water'),
    'ih-radon': ('Interior Health — Radon gas', 'https://www.interiorhealth.ca/health-and-wellness/environmental-and-seasonal-health/radon-gas'),
    'cala': GP.SRC['cala'],
    'bc-rebate': ('Better Homes BC — Home Renovation Rebate program requirements',
                  'https://betterhomesbc.ca/learn-about-programs/home-renovation-rebate-program/'),
}
for k, (lab, href) in ((k, (v['label'], v['href'])) for k, v in WOOD['sources'].items()):
    SRC['wood-' + k] = (lab, href)


class Sources(GP.Sources):
    def add(self, key_or_label, href=None):
        if href is None and key_or_label in SRC:
            lab, href = SRC[key_or_label]
            return super().add(lab, href)
        return super().add(key_or_label, href)


# ------------------------------------------------------------------ services on area pages
SERVICES = [
    dict(slug='home-energy-audit', name='Home energy audits', short='Home energy audit', cat='energy', photo='home-energy-audit',
         guide='/articles/what-is-a-home-energy-audit/', guideLabel='What a home energy audit involves', hub='/services/home-energy-audit/',
         blurb='EnerGuide home energy assessments by NRCan-registered energy advisors: blower door, full inspection, rating and upgrade list.'),
    dict(slug='heat-loss-calculation', name='Heat loss calculations', short='Heat loss calculation', cat='energy', photo='heat-loss-calculation',
         guide='/tests/heat-loss-calc/', guideLabel='The CSA F280 heat-loss calculation', hub='/services/heat-loss-calculation/',
         blurb='Room-by-room CSA F280-12 calculations at the local design temperature, for sizing a heat pump or furnace.'),
    dict(slug='radon-testing', name='Radon testing and long-term monitoring', short='Radon testing', cat='health', photo='radon-testing',
         guide='/tests/radon/', guideLabel='The radon testing guide', hub='/services/radon-testing/',
         blurb='Long-term radon tests of at least 91 days in the heating season, monitors, and mitigation by C-NRPP professionals.'),
    dict(slug='mold-testing', name='Mould and indoor air quality testing', short='Mould and air quality testing', cat='health', photo='mold-testing',
         guide='/tests/mold-iaq/', guideLabel='The mould and indoor air quality guide', hub='/services/mold-testing/',
         blurb='Mould inspection and air quality sampling, the size rules for safe cleanup, and when to hire a remediation contractor.'),
    dict(slug='well-water-testing', name='Well water testing', short='Well water testing', cat='health', photo='well-water-testing',
         guide='/tests/well-water/', guideLabel='The well water guide', hub='/services/well-water-testing/',
         blurb='Bacteria testing (E. coli and total coliforms) for private wells, where to get bottles locally, and chemistry tests.'),
    dict(slug='wood-burning-inspection', name='Wood-burning appliance inspections (WETT)', short='Wood stove and chimney inspection', cat='health',
         photo=None, guide='/tests/wood-burning-inspection/', guideLabel='The wood-burning inspection guide', hub=None,
         blurb='WETT-certified inspections of wood stoves, inserts, chimneys and flue pipes, and the yearly chimney inspection rule.'),
]
SV = {s['slug']: s for s in SERVICES}

PROV_NAME = {'ON': 'Ontario', 'BC': 'British Columbia'}
PROV_SHORT = {'ON': 'Ontario', 'BC': 'B.C.'}
PROV_SLUG = {'ON': 'ontario', 'BC': 'bc'}
TYPE_LABEL = {'Town': 'Town', 'Township': 'Township', 'City': 'City', 'Municipality': 'Municipality', 'Village': 'Village'}
PERIODS = ['1920 or before', '1921 to 1945', '1946 to 1960', '1961 to 1970', '1971 to 1980', '1981 to 1990',
           '1991 to 1995', '1996 to 2000', '2001 to 2005', '2006 to 2010', '2011 to 2015', '2016 to 2021']
SINGLE_TIER_LABEL = {'3528052': 'Norfolk County', '3528018': 'Haldimand County', '3529005': 'County of Brant',
                     '3521024': 'Town of Caledon', '3524015': 'Town of Halton Hills'}


def norm_mun(label):
    s = (label or '').upper()
    s = re.sub(r'^(TOWN|TOWNSHIP|CITY|MUNICIPALITY|VILLAGE|DISTRICT) OF ', '', s)
    return s.strip()


# ------------------------------------------------------------------ area data assembly
def stats(csds, cd_totals=None):
    rows = [CENSUS[c] for c in csds]
    pop_rows = [CENSUS[c] for c in cd_totals] if cd_totals else rows
    pop = sum(r['pop2021'] for r in pop_rows)
    pop16 = sum(r['pop2016'] for r in pop_rows)
    dw = sum(r['dwellings'] for r in pop_rows)
    occ = sum(r['occupiedDwellings'] for r in pop_rows)
    land = sum(r['landKm2'] for r in pop_rows)
    by = {pp: int(round(sum(r['housing']['housesByPeriod'][pp] for r in rows))) for pp in PERIODS}
    houses = sum(by.values())
    pre61 = sum(by[x] for x in PERIODS[:3])
    y6190 = sum(by[x] for x in PERIODS[3:6])
    y9100 = sum(by[x] for x in PERIODS[6:8])
    since01 = sum(by[x] for x in PERIODS[8:])
    single = int(round(sum(r['housing']['singleDetached'] or 0 for r in rows)))
    hh = int(round(sum(r['housing']['households'] or 0 for r in rows)))
    acc, median = 0, None
    for x in PERIODS:
        acc += by[x]
        if acc >= houses / 2:
            median = x
            break
    return {
        'pop': pop, 'popChangePct': round(100 * (pop - pop16) / pop16, 1) if pop16 else None, 'dwellings': dw, 'occupied': occ,
        'notOccupiedPct': pc(dw - occ, dw), 'landKm2': round(land), 'houses': houses, 'households': hh,
        'pre1961Pct': pc(pre61, houses), 'pre1991Pct': pc(pre61 + y6190, houses), 'since2001Pct': pc(since01, houses),
        'singleDetachedPct': pc(single, hh),
        'era': {'pre1961': 100 * pre61 / houses, 'y1961to1990': 100 * y6190 / houses, 'y1991to2000': 100 * y9100 / houses,
                'since2001': 100 * since01 / houses},
        'medianPeriod': median.replace(' to ', '–').replace('or before', 'or earlier'),
    }


def place_names(pl):
    """Split StatCan's combined population-centre names into community names."""
    out = []
    for part in re.split(r'\s+-\s+', pl['name']):
        part = part.strip()
        if part == 'Borden CFB-BFC':
            part = 'CFB Borden'
        out.append(part)
    return out


def municipality_groups(a, csds, section=None):
    groups = []
    for c in csds:
        r = CENSUS[c]
        name = r['name']
        if a['prov'] == 'ON':
            label = SINGLE_TIER_LABEL.get(c) or f"{TYPE_LABEL.get(r['type'], r['type'])} of {name}"
        else:
            label = name
        key = SINGLE_TIER_LABEL.get(c, name).upper() if c in SINGLE_TIER_LABEL else name.upper()
        comms = set()
        for t in TOWNS:
            if t['province'] != a['prov'] or t.get('withinCoveredCity'):
                continue
            if t['type'] == 'county':
                continue
            if norm_mun(t['municipality']) in (name.upper(), norm_mun(key)) or (c in SINGLE_TIER_LABEL and t['municipality'] == SINGLE_TIER_LABEL[c]):
                comms.add(t['place'])
        for pl in PLACES:
            if pl['area'] != a['slug'] or (pl.get('section') or None) != section:
                continue
            m = norm_mun(pl.get('municipality'))
            if m in (name.upper(), norm_mun(key)) or (pl.get('municipality') or '').upper() == key:
                comms.update(place_names(pl))
        for mp in a.get('manualPlaces', []):
            if norm_mun(mp['municipality']) == name.upper():
                comms.add(mp['name'])
        comms = sorted((x for x in comms if x.upper() != name.upper() and x.upper() != norm_mun(key)), key=str.lower)
        groups.append({'csd': c, 'name': name, 'label': label, 'type': r['type'], 'pop': r['pop2021'], 'dwellings': r['dwellings'],
                       'occupied': r['occupiedDwellings'], 'communities': comms})
    groups.sort(key=lambda g: -g['pop'])
    return groups


def covered_city_groups(a):
    out = []
    for cc in a.get('coveredCities', []):
        c = CITY[cc['slug']]
        hamlets = sorted({t['place'] for t in TOWNS if t.get('withinCoveredCity') == cc['slug']}, key=str.lower)
        out.append({'slug': cc['slug'], 'name': c['name'], 'why': cc['why'], 'communities': hamlets, 'pop': c['population']})
    return out


def all_community_names(area, aliases=True):
    names = list(area['section'].get('aliases', [])) if (aliases and area.get('section')) else []
    for g in area['municipalities'] + (area['section']['municipalities'] if area.get('section') else []):
        names.append(g['name'])
        names += g['communities']
    return names


def station_label(s):
    keep = {'WPCC', 'MOE', 'WWTP', 'STP', 'CS', 'RCS', 'CDA'}
    words_ = s.split()
    if words_ and words_[-1] == 'A':
        words_ = words_[:-1] + ['Airport']
    out = []
    for w in words_:
        out.append(w if w in keep or w == 'Airport' else w.capitalize() if w.isalpha() else w.title())
    return ' '.join(out)


def radon_figs(a):
    """(2012 region figure(s), 2024 figure) for an area."""
    r12 = []
    spec = a['radon2012']
    if 'city' in spec:
        c = RADON['cities'][spec['city']]
        r12.append({'region': c['healthRegion'], 'tested': c['homesTested'], 'pct': c['pctAbove200']})
    for code in ([spec['hu']] if 'hu' in spec else spec.get('hus', [])):
        h = HU['hu2007'][code]
        r12.append({'region': h['region'], 'tested': h['tested'], 'pct': h['pct']})
    nw = next((e for e in RADON['newerData'] if e['scope'] == a['radon2024']), None)
    return r12, nw


def region_name(r):
    reg = r['region']
    return f"the {reg}" if reg.endswith(('Unit', 'Area')) else f"the {reg} region"


def radon_region_sentence(r):
    if r['pct'] == 0:
        return (f"none of the {r['tested']} homes tested in {region_name(r)} were above the guideline, "
                "a small sample that doesn't rule radon out")
    return f"{GP.pct(r['pct'], 1)} of {r['tested']} homes tested in {region_name(r)} were above the guideline"


NEWER = {  # wording for the 2024 Cross-Canada survey figures used here (radon.json "newerData")
    'province: ON': ('12.4% (1 in 8) of homes at or above the guideline', 'Ontario as a whole', '12.4%'),
    'city/metro area: Kitchener-Cambridge, ON (Kitchener-Cambridge-Waterloo CMA)':
        ('10.2% (1 in 10) of houses at or above the guideline', 'the Kitchener–Cambridge–Waterloo metro area', '10.2%'),
    'city/metro area: Guelph, ON (Guelph CMA)': ('13.5% (1 in 7) of houses at or above the guideline', 'the Guelph metro area', '13.5%'),
    'city/metro area: Kelowna, BC (Kelowna CMA)': ('28.5% (1 in 3) of houses at or above the guideline', 'the Kelowna metro area', '28.5%'),
    'province sub-region: BC Interior (northern and interior BC plus the eastern Fraser Valley from Chilliwack onwards)':
        ('about 1 in 3 homes at or above the guideline', "the survey's B.C. Interior region (northern and interior B.C.)", 'About 1 in 3'),
}


def radon_newer_sentence(nw):
    fig, scope, _ = NEWER[nw['scope']]
    return f"the larger 2024 Cross-Canada survey reports {fig} for {scope}"


def nbc_line(rows):
    return join_and([f"{deg(r['jan25'])} for {r['location']}" for r in rows])


def build_area(a):
    prov = a['prov']
    area = {k: a[k] for k in ('slug', 'name', 'inName', 'prov', 'kind', 'scope', 'leadRegion', 'photo')}
    area.update({'provName': PROV_NAME[prov], 'provSlug': PROV_SLUG[prov], 'titleNames': a['titleNames'],
                 'titleName': a.get('titleName', a['inName'])})
    st = stats(a['csds'], a.get('cdTotals'))
    area['stats'] = st
    area['municipalities'] = municipality_groups(a, a['csds'])
    if a.get('section'):
        s = a['section']
        area['section'] = {'key': s['key'], 'name': s['name'], 'aliases': s.get('aliases', []), 'stats': stats(s['csds']),
                           'municipalities': municipality_groups(a, s['csds'], s['key'])}
    else:
        area['section'] = None
    if a.get('nearbyMunicipalities'):
        nm = a['nearbyMunicipalities']
        grp = []
        for c in nm['csds']:
            r = CENSUS[c]
            comms = sorted({t['place'] for t in TOWNS if norm_mun(t['municipality']) == r['name'].upper()}, key=str.lower)
            grp.append({'csd': c, 'name': r['name'], 'label': f"{TYPE_LABEL.get(r['type'], r['type'])} of {r['name']}",
                        'pop': r['pop2021'], 'communities': comms})
        area['nearbyGroup'] = {'label': nm['label'], 'municipalities': grp, 'healthUnit': nm['healthUnit']}
    else:
        area['nearbyGroup'] = None
    area['coveredCities'] = covered_city_groups(a)
    area['nearbyCities'] = [{'slug': s, 'name': CITY[s]['name']} for s in a['nearbyCities']]
    area['sitePages'] = a['sitePages']
    area['articles'] = a['articles']
    area['climate'] = CLIMATE[a['slug']]
    area['cdTotals'] = a.get('cdTotals')
    area['communityCount'] = len(set(all_community_names(area, aliases=False)))
    e0, nb0 = area['climate']['eccc'][0], area['climate']['nbc'][0]
    area['portrait'] = {'hdd': e0['hdd18'], 'designHeat': nb0['jan25'], 'station': station_label(e0['station']), 'stationKm': e0['km'],
                        'source': (f"Environment and Climate Change Canada 1981–2010 climate normals ({station_label(e0['station'])}) and the National Building "
                                   f"Code 2020 January design temperature for {nb0['location']}")}
    return area


# ------------------------------------------------------------------ shared text pieces
def communities_sentence(area, k=5):
    return join_and(area['titleNames'][:k])


def climate_sentence(area, which=0):
    e = area['climate']['eccc'][which]
    where = e['point']['label'] if not e['point']['label'].startswith('centre') else 'the middle of the area'
    if which == 0:
        return (f"Environment and Climate Change Canada's 1981–2010 climate normal at {station_label(e['station'])} ({e['km']} km from "
                f"{where}) is {n(e['hdd18'])} heating degree-days a year, with a January mean of {deg(e['janMean'])}.")
    return (f"At {station_label(e['station'])}, {e['km']} km from {where}, the normal is {n(e['hdd18'])} heating degree-days, "
            f"with a January mean of {deg(e['janMean'])}.")


def climate_short(area):
    e = area['climate']['eccc'][0]
    return n(e['hdd18'])


def design_range(area):
    rows = area['climate']['nbc']
    lo = min(rows, key=lambda r: r['jan25'])
    hi = max(rows, key=lambda r: r['jan25'])
    return lo, hi


def housing_sentence(area, label=None):
    st = area['stats']
    lab = label or (f"the {words(len(area['municipalities']))} municipalities listed here" if area.get('cdTotals') else area['inName'])
    return (f"Of the {n(st['houses'])} houses in {lab} (single-detached, semi-detached, row houses, duplexes and mobile homes), "
            f"{st['pre1961Pct']}% were built before 1961 and {st['pre1991Pct']}% before 1991, according to the 2021 Census.")


def seasonal_sentence(area):
    st = area['stats']
    if st['notOccupiedPct'] is None or st['notOccupiedPct'] < 8:
        return None
    where = (f"the {join_and([CENSUS[c]['name'] for c in area['cdTotals']])} regional districts" if area.get('cdTotals') else area['inName'])
    return (f"On census day (May 11, 2021), {st['notOccupiedPct']}% of the {n(st['dwellings'])} private dwellings in {where} "
            "were not anyone's permanent home.")


def heating_sentence(area):
    if area['prov'] == 'ON':
        h = next(c for c in GP.CITIES if c['slug'] == 'chatham-kent')['heating']
        assert h['isProvince'] and h['geo'] == 'Ontario'
        return (f"Province-wide, {round(h['gas']['v'])}% of Ontario households heat mainly with natural gas, {round(h['electricity']['v'])}% "
                f"with electricity, {round(h['propane']['v'])}% with propane and {round(h['oil']['v'])}% each with oil and wood "
                "(Statistics Canada, 2023); there's no published breakdown for this area alone.")
    if area['slug'] == 'okanagan':
        h = CITY['kelowna']['heating']
        return (f"In the Kelowna metro area, {round(h['forcedAir']['v'])}% of households heat mainly with a forced-air furnace and natural gas is "
                f"the main heating energy for {round(h['gas']['v'])}% (Statistics Canada, 2023).")
    return None


def list_items(xs):
    return ul(xs)


def communities_html(area, with_pop=True):
    """Compact 'communities we cover' block (also used by the coverage check)."""
    lines = []
    for g in area['municipalities']:
        head = f"<strong>{esc(g['label'])}</strong>" + (f" ({n(g['pop'])} people)" if with_pop else '')
        lines.append(head + (': ' + esc(', '.join(g['communities'])) if g['communities'] else ''))
    return lines


# ------------------------------------------------------------------ providers block
def providers_block(a, area, key='main'):
    d = PROV_DATA['areas'][a['slug']].get(key)
    if not d:
        return None
    towns = list(d['towns'].keys())
    fsas = [f for t in d['towns'].values() for f in t['fsas']]
    items = [{'name': o['name'], 'phone': o['phone'], 'towns': o['towns'], 'allTowns': len(o['towns']) == len(towns),
              'profile': f"/providers/{o['profile']}/" if o['profile'] else None, 'hrs': o['hrs'], 'gcc': o['gcc']} for o in d['orgs']]
    lab = area['section']['name'] if key == area.get('section', {}) and area.get('section') else None
    return {'key': key, 'towns': towns, 'fsas': fsas, 'items': items, 'count': len(items),
            'heading': (f"NRCan-registered energy advisors for {area['section']['name']}" if key not in ('main', 'nearby')
                        else f"NRCan-registered service organizations serving {area['inName']}"),
            'note': (f"NRCan's list of service organizations (checked {CHECKED}) shows {len(items)} {plural(len(items), 'organization')} "
                     f"registered for postal codes in {join_and(towns)} ({', '.join(fsas)}). Registration means an organization lists those postal areas, "
                     "not that it has an advisor in town: confirm they travel to your community, and ask about wait times and travel fees.")}


def programs(a, need_audit=None):
    c = {'prov': a['prov'], 'slug': a['slug']}
    return GP.programs_for(c, need_audit=need_audit)


# ------------------------------------------------------------------ page builders
def page_base(a, area, svc):
    s = SV[svc]
    return {'service': svc, 'area': a['slug'], 'h1': f"{s['name']} in {area['inName']}",
            'kicker': f"{area['provName']} · {'Energy' if s['cat'] == 'energy' else 'Home health'} · area guide"}


def title_names(area, k=4):
    return ', '.join(area['titleNames'][:k])


def gen_hea(a, area, src):
    pg = page_base(a, area, 'home-energy-audit')
    prov = a['prov']
    st = area['stats']
    pv = providers_block(a, area)
    k = pv['count']
    ev_text, ev_short = GP.eval_price({'prov': prov, 'provName': area['provName']}, src)
    ev_text = ev_text.replace(' Several B.C. municipalities subsidize evaluations for their residents (see local programs below).', '')
    hrs = sum(1 for x in pv['items'] if x['hrs'])
    src.add('nrcan-so')
    src.add('geonames')
    src.add('census-housing')
    src.add('census-pop')
    src.add('eccc')
    pg['title'] = f"Home energy audits and EnerGuide evaluations in {area['titleName']}: {title_names(area)}"
    pg['description'] = (f"Book a home energy assessment (EnerGuide evaluation) in {area['inName']}: {k} NRCan-registered organizations list "
                         f"{join_and(pv['towns'][:3])} postal codes, {st['pre1991Pct']}% of local houses predate 1991, plus {PROV_SHORT[prov]} rebates.")
    pg['lede'] = (f"{k} NRCan-registered service organizations list postal codes in {join_and(pv['towns'])}, and {st['pre1991Pct']}% of the "
                  f"{n(st['houses'])} houses in {area['inName']} were built before 1991. Here's what an EnerGuide evaluation costs, what it tends to find "
                  f"in local houses, and which {area['provName']} rebates it unlocks, from {communities_sentence(area)} to the smallest hamlet.")
    more = len(pv['towns']) - 2
    pg['glance'] = [{'k': 'Registered organizations', 'v': str(k),
                     'sub': (f"for {', '.join(pv['towns'][:2])} and {more} more" if more > 0 else f"for {join_and(pv['towns'])}")},
                    {'k': 'Typical cost', 'v': ev_short},
                    {'k': 'Heating degree-days', 'v': climate_short(area), 'sub': station_label(area['climate']['eccc'][0]['station'])},
                    {'k': 'Houses built before 1991', 'v': f"{st['pre1991Pct']}%", 'sub': '2021 Census'}]
    secs = []
    why = [p(housing_sentence(area), f"The typical house here dates from {st['medianPeriod']}. An EnerGuide evaluation is how you find out what that means for yours: "
             "the blower door measures air leakage, the advisor inspects the attic, walls, basement, windows and heating system, and the report ranks upgrades by what they'd save.")]
    why.append(p(climate_sentence(area), 'The more heating a climate needs, the more each fix is worth, which is why the ranked list in the report matters.'))
    ss = seasonal_sentence(area)
    if ss:
        src.add('occupied-def')
        why.append(p(ss, "If you're evaluating a cottage or a house you're about to buy, tell the advisor how and when it's heated; the report models the house as a year-round home."))
    hs = heating_sentence(area)
    if hs:
        src.add('heating')
        why.append(p(hs, 'The heating system on the report shapes the recommendations: a furnace with ducts invites a ducted heat pump, electric baseboards a ductless one.'))
    secs.append({'h2': f"What an evaluation finds in {area['inName']}", 'html': ''.join(why)})
    cost = [p(ev_text)]
    if prov == 'ON':
        cost.append(p(GP.hrs_sentence(hrs).strip(), 'Check the HRSP-approved tag in the list below.'))
    cost.append(p("Most providers quote the initial (pre-upgrade) and follow-up (post-upgrade) visits separately, and organizations based in a city may add a travel fee "
                  "for rural addresses. Rebate programs that pay on measured improvement need both visits, so ask for the combined price, travel included."))
    secs.append({'h2': f"What it costs in {area['inName']}", 'html': ''.join(cost)})
    steps = ul(["<strong>Initial evaluation, about 2–3 hours.</strong> The advisor measures and inspects the house and runs the blower door test.",
                "<strong>Report and EnerGuide rating.</strong> You get the home's energy rating and a list of recommended upgrades with estimated savings.",
                "<strong>Do the work.</strong> Most rebate programs only count upgrades done after the initial evaluation.",
                "<strong>Follow-up evaluation.</strong> A second visit measures the improvement, which is what most rebates pay on."])
    secs.append({'h2': 'How a home energy assessment works', 'html': steps + p('Read more: ' + a_guide('home-energy-audit') + '.')})
    pg['sections'] = secs
    pg['providers'] = pv
    if area.get('section'):
        pg['providersSection'] = providers_block(a, area, area['section']['key'])
    pg['programs'] = {'heading': f"Rebates an evaluation unlocks in {area['inName']}", 'items': programs(a, need_audit=True)}
    big = pv['towns'][0]
    faq = [
        {'q': f"How much does a home energy audit cost in {area['inName']}?", 'a': strip(ev_text) + ' Ask whether a travel fee applies to your address.'},
        {'q': f"Which companies do EnerGuide evaluations in {big}?",
         'a': (f"NRCan's list (checked {CHECKED}) shows {k} organizations registered for postal codes in {join_and(pv['towns'])}; "
               f"{sum(1 for x in pv['items'] if x['allTowns'])} of them list all {len(pv['towns'])}. Confirm they travel to your community before you book.")},
        {'q': 'How long does an EnerGuide evaluation take?', 'a': 'The initial visit usually takes two to three hours, including the blower door test. The follow-up visit after upgrades is shorter.'},
        {'q': f"Is a home energy audit worth it for an older house in {area['inName']}?",
         'a': (f"{st['pre1991Pct']}% of local houses were built before 1991 (2021 Census), and the area averages about {climate_short(area)} heating degree-days a year. "
               "Older houses in a cold climate are where a ranked upgrade list pays off most, and most rebates need the evaluation first.")},
    ]
    progs = programs(a, need_audit=True)
    if progs:
        faq.append({'q': f"Which rebates need an EnerGuide evaluation in {area['provName']}?",
                    'a': 'Currently: ' + '; '.join(f"{x['name']} ({x['summary']})" for x in progs[:3]) + '. Check the program page for current terms before you book.'})
    pg['faq'] = faq
    return pg


def a_guide(svc):
    s = SV[svc]
    return link(s['guide'], s['guideLabel'])


def gen_heat_loss(a, area, src):
    pg = page_base(a, area, 'heat-loss-calculation')
    rows = area['climate']['nbc']
    lo, hi = design_range(area)
    pv = providers_block(a, area)
    k = pv['count']
    src.add('nbc')
    src.add('nbc-f280')
    src.add('eccc')
    src.add('nrcan-so')
    pg['title'] = f"CSA F280-12 heat loss calculations in {area['titleName']}: {title_names(area)}"
    pg['description'] = (f"Room-by-room CSA F280-12 heat loss calculations for {area['inName']} homes, sized to design temperatures of "
                         f"{deg(hi['jan25'])} to {deg(lo['jan25'])}: why it matters for heat pumps, what it costs and who does it locally.")
    rng = (f"from {deg(hi['jan25'])} at {hi['location']} to {deg(lo['jan25'])} at {lo['location']}" if lo['jan25'] != hi['jan25']
           else f"{deg(lo['jan25'])} at {join_and([r['location'] for r in rows])}")
    pg['lede'] = (f"A heat loss calculation is how a heat pump or furnace gets sized, and its key input is the design temperature. In {area['inName']}, "
                  f"the National Building Code's 2.5% January design temperatures run {rng}"
                  + (f", so a calculation for a house near {lo['location']} starts from a colder number than one near {hi['location']}." if lo['jan25'] != hi['jan25']
                     else '.') + f" Here's what that means for {communities_sentence(area, 3)} and the rest of the area.")
    pg['glance'] = [{'k': 'Design temperature', 'v': f"{deg(hi['jan25'])} to {deg(lo['jan25'])}" if lo['jan25'] != hi['jan25'] else deg(lo['jan25']),
                     'sub': 'NBC 2020, January 2.5%'},
                    {'k': 'Heating degree-days', 'v': climate_short(area), 'sub': station_label(area['climate']['eccc'][0]['station'])},
                    {'k': 'Standard', 'v': 'CSA F280-12'},
                    {'k': 'Registered organizations', 'v': str(k), 'sub': 'many offer F280 reports'}]
    tbl = ('<table class="stack"><thead><tr><th>Location in the code’s table</th><th>January 2.5% design temperature</th><th>Heating degree-days</th></tr></thead><tbody>'
           + ''.join(f"<tr><td data-label=\"Location\">{esc(r['location'])}</td><td data-label=\"January 2.5% design temperature\">{deg(r['jan25'])}</td>"
                     f"<td data-label=\"Heating degree-days\">{n(int(r['hdd']))}</td></tr>" for r in rows)
           + '</tbody></table>')
    body = [p("The National Building Code of Canada 2020 says the 2.5% January design temperature is the value ordinarily used to design heating systems. "
              f"Its climate table lists these {area['provName']} locations in or next to {area['inName']}:"), tbl]
    if a.get('nbcNote'):
        body.append(p(esc(a['nbcNote'])))
    if area.get('section'):
        srows = area['climate']['nbcSection']
        body.append(p(f"In the {area['section']['name']}, the table gives {nbc_line(srows)}."))
    body.append(p(climate_sentence(area) + (' ' + climate_sentence(area, 1) if len(area['climate']['eccc']) > 1 else '')))
    secs = [{'h2': f"Design temperatures across {area['inName']}", 'html': ''.join(body)}]
    mild = hi['jan25'] > -18
    cold = lo['jan25'] <= -28
    if cold:
        hp = (f"At {deg(lo['jan25'])}, even cold-climate heat pumps lose capacity just when you need heat most. The room-by-room number tells you how much the heat pump "
              "can cover and how much backup heat to plan for, instead of guessing from square footage.")
    elif mild:
        hp = (f"With design days around {deg(hi['jan25'])}, a cold-climate heat pump sized to the calculation can carry most or all of a typical house's heating, "
              "which makes right-sizing, rather than oversizing, the main job.")
    else:
        hp = (f"At {deg(hi['jan25'])} to {deg(lo['jan25'])}, a cold-climate heat pump sized to the calculation can carry most of the season, and the number "
              "shows how much backup heat the coldest days need.")
    f280 = [p("The code requires the heating capacity for a house to be worked out with CSA F280, using the code's own design temperatures, and its list of referenced "
              "documents names the 2012 edition, CSA F280-12. The calculation works out how much heat each room loses on the design day, from the house's actual walls, "
              "windows, ceiling insulation and air leakage."), p(hp)]
    if a['prov'] == 'BC':
        src.add('bc-rebate')
        f280.append(p("In B.C., the provincial Home Renovation Rebate's heat pump requirements call for a CSA F280 heat load calculation, so ask for the report with your quote."))
    secs.append({'h2': 'What CSA F280-12 asks for', 'html': ''.join(f280)})
    src.add('census-housing')
    secs.append({'h2': 'What the calculation needs from your house', 'html': (
        p(housing_sentence(area), "In an older or renovated house, the walls, windows and air leakage rarely match the original plans, so ask the designer to measure "
                                  "rather than assume. Have this ready:")
        + ul(["Room dimensions and ceiling heights, or a floor plan.",
              "Window and door sizes and types, room by room.",
              "Insulation levels in the attic, walls, basement and any floor over an unheated space.",
              "A blower door result from an EnerGuide evaluation, if you've had one.",
              "Where the ducts, radiators or baseboards run, so the heat can be delivered room by room."]))})
    secs.append({'h2': 'What it costs', 'html': p("There's no standard published price for a standalone F280 calculation, so ask two or three providers for a written quote "
                                                  "that names the deliverable: the room-by-room F280 report, not just an equipment size. Many energy advisors bundle it with an "
                                                  "EnerGuide evaluation, which also gives the calculation measured air-leakage data instead of an assumption. Ask whether a rural "
                                                  "travel fee applies.", a_guide('heat-loss-calculation') + ' explains the method and typical cost bands.')})
    pg['sections'] = secs
    pg['providers'] = pv
    pg['programs'] = {'heading': f"Heat pump programs in {area['inName']}", 'items': programs(a)}
    pg['faq'] = [
        {'q': f"What design temperature is used for heat pump sizing in {area['titleNames'][0]}?",
         'a': (f"The National Building Code 2020's climate table gives " + nbc_line(rows) + ". Provincial codes can use their own climate tables, "
               "so ask which value the calculation uses.")},
        {'q': 'What is CSA F280-12?', 'a': ("The 2012 edition of CSA F280, Determining the required capacity of residential space heating and cooling appliances. "
                                             "The National Building Code 2020 requires heating capacity for a house to be determined with it.")},
        {'q': 'How much does a heat loss calculation cost?', 'a': ('There is no standard published price. Ask two or three providers for a written quote for the F280 report, '
                                                                   'and ask whether it costs less bundled with an EnerGuide evaluation and whether a travel fee applies.')},
        {'q': f"Who does F280 calculations in {area['inName']}?",
         'a': (f"Many of the {k} NRCan-registered organizations that list {join_and(pv['towns'][:3])} postal codes offer them, as do HVAC designers. "
               "Ask for the F280 report itself, not just an equipment size.")},
    ]
    return pg


RADON_MITIGATION = GP.RADON_MITIGATION
RADON_AFTER = GP.RADON_AFTER


def gen_radon(a, area, src):
    pg = page_base(a, area, 'radon-testing')
    r12, nw = radon_figs(a)
    pt = GP.PT[a['prov']]
    for k_ in ('radon2012', 'hc-radon', 'hc-measure', 'hc-testing', 'hc-reduction', 'cnrpp'):
        src.add(k_)
    if nw:
        src.add('radon2024')
    main = r12[0]
    pg['title'] = f"Radon testing and long-term monitoring in {area['titleName']}: {title_names(area, 3)}"
    pg['description'] = (f"Radon in {area['inName']}: {radon_region_sentence(main).split(', a small')[0]} in Health Canada's survey. "
                         "How to run a 91-day long-term test, where to borrow a monitor, and mitigation by C-NRPP professionals.")
    lede = (f"Radon is invisible, has no smell, and is the second-leading cause of lung cancer in Canada. In Health Canada's national survey, {radon_region_sentence(main)}")
    lede += f"; {radon_newer_sentence(nw)}." if nw else '.'
    lede += f" Only a long-term test tells you about your own house, in {communities_sentence(area, 3)} or anywhere else in {area['inName']}."
    pg['lede'] = lede
    g1 = {'k': '2012 survey (health region)', 'v': GP.pct(main['pct'], 1), 'sub': f"{main['tested']} homes"}
    g2 = ({'k': '2024 survey', 'v': NEWER[nw['scope']][2], 'sub': NEWER[nw['scope']][1].replace("the survey's ", '')} if nw
          else {'k': 'Test length', 'v': '91+ days', 'sub': 'in the heating season'})
    pg['glance'] = [g1, g2, {'k': 'Guideline', 'v': '200 Bq/m³'}, {'k': 'Mitigation', 'v': '$2,000–$3,000', 'sub': 'Health Canada'}]
    secs = []
    body = [p('In Health Canada’s 2012 survey, ' + '; '.join(radon_region_sentence(r) for r in r12) + '.' +
              (' The survey used the health regions of the time; today the area is served by ' + HU['units'][a['healthUnit']]['short'] + '.'
               if a['prov'] == 'ON' and HU['units'][a['healthUnit']]['name'] != r12[0]['region'] else ''))]
    if nw:
        body.append(p(radon_newer_sentence(nw)[0].upper() + radon_newer_sentence(nw)[1:] + '.',
                      'The two surveys aren\'t directly comparable: the 2024 study pooled about 69,000 volunteer tests, more of them in basements, which partly explains its higher numbers. '
                      'Neither can tell you about a single house, because neighbouring homes can differ widely.'))
    hu = HU['units'][a['healthUnit']]
    if hu.get('radon'):
        src.add(f"{hu['name']} — radon", hu['radon']['url'])
        body.append(p(esc(hu['radon']['text'])))
    secs.append({'h2': f"Radon in {area['inName']}", 'html': ''.join(body)})
    mon = [p("Health Canada's measurement guide asks for a long-term test with at least 91 days in the heating season, when closed windows and the stack effect "
             "make readings higher, so the result is a conservative estimate of the yearly average. It recommends testing for 3 to 12 months."),
           ul(["<strong>Alpha track detectors</strong> record radon's alpha particles on a plastic film; you mail them to a lab when the test ends.",
               "<strong>Electret ion chambers</strong> lose charge as radon ionizes the air inside; a lab reads the voltage drop.",
               "<strong>Digital (electronic) monitors</strong> read continuously and show results on a screen or an app. For a long-term test, Health Canada says to use one "
               "that has passed C-NRPP performance testing, and it still has to run at least three months."]),
           p("Place the detector on the lowest level where someone spends more than four hours a day, at least 30 cm above the floor and 30 cm from walls, and at least "
             "1 m from vents, windows and doors; avoid kitchens, laundry rooms and bathrooms. A digital monitor left running after mitigation lets you watch for changes "
             "between the long-term tests below.")]
    secs.append({'h2': 'Long-term monitoring: how to test properly', 'html': ''.join(mon)})
    kits = []
    if a.get('radonLending'):
        src.add('lending')
        kits.append(f"<strong>Borrow a monitor.</strong> Take Action on Radon lists {join_and(a['radonLending'])} among the libraries that lend radon monitors; "
                    "a borrowed digital monitor is good for screening, and a long-term test needs at least three months.")
    if a['prov'] == 'ON' and a.get('radonLending'):
        src.add('radon-kit-price')
        kits.append("There's no provincial free-kit program in Ontario; long-term kits, about $30–$80 including the lab fee (Windsor-Essex County Health Unit), "
                    "are sold online and at hardware stores.")
    else:
        kits.append(esc(GP.strip(pt['radonKits'][0])))
    src.add(f"{area['provName']} — radon test kits and lending", pt['radonKits'][1])
    kits.append(f"For a professional measurement or mitigation, search the {a_ext(GP.SRC['cnrpp'][1], 'C-NRPP directory')} by postal code; it lists certified "
                f"measurement and mitigation professionals, and you can confirm they cover {area['titleNames'][0]} and the rest of {area['inName']}.")
    secs.append({'h2': f"Kits, lending libraries and professionals", 'html': ul(kits)})
    mit = [p(RADON_MITIGATION), p('After a system goes in:'), ul(RADON_AFTER)]
    rules = [pt['radonCode'][0]]
    src.add(f"{area['provName']} — radon in the building code", pt['radonCode'][1])
    if pt.get('radonHelp'):
        rules.append(pt['radonHelp'][0])
        hs = pt['radonHelp'][1]
        for lab, url in (hs if isinstance(hs, list) else [(f"{area['provName']} — radon mitigation help", hs)]):
            src.add(lab, url)
    mit.append(p(' '.join(rules)))
    secs.append({'h2': 'If your level is high: mitigation', 'html': ''.join(mit) + p('Read more: ' + a_guide('radon-testing') + '.')})
    pg['sections'] = secs
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f"Is radon a problem in {area['inName']}?", 'a': ('In Health Canada’s 2012 survey, ' + '; '.join(radon_region_sentence(r) for r in r12) + '. '
                                                              + (radon_newer_sentence(nw)[0].upper() + radon_newer_sentence(nw)[1:] + '. ' if nw else '')
                                                              + 'Any home can have high radon, so Health Canada recommends testing every home.')},
        {'q': 'How long should a radon test take?', 'a': 'At least three months, with at least 91 days in the heating season. Health Canada recommends 3 to 12 months; short tests can’t give your long-term average.'},
        {'q': f"Where can I get a radon monitor or kit in {area['titleNames'][0]}?",
         'a': ((f"Take Action on Radon lists {join_and(a['radonLending'])} among the libraries that lend monitors. " if a.get('radonLending') else '')
               + (GP.strip(pt['radonKits'][0]) + ' ' if not (a['prov'] == 'ON' and a.get('radonLending')) else '')
               + 'Long-term kits are also sold online and at hardware stores.')},
        {'q': 'What does radon mitigation cost?', 'a': 'Health Canada puts a sub-slab depressurization system at about $2,000 to $3,000 including material and labour, plus about $50 to $75 a year to run the fan.'},
        {'q': 'Should I keep monitoring after mitigation?', 'a': ('Yes. Health Canada recommends a long-term test the following heating season, another within two years of activation, '
                                                                 'and one every five years after that. A digital monitor running in between shows if anything changes.')},
    ]
    return pg


def a_ext(href, text):
    return link(href, text)


def gen_mould(a, area, src):
    pg = page_base(a, area, 'mold-testing')
    st = area['stats']
    for k_ in ('hc-mould', 'hc-mould-home', 'cmhc-mould', 'cmhc-kit', 'aihalap', 'census-housing', 'eccc'):
        src.add(k_)
    pg['title'] = f"Mould and indoor air quality (IAQ) testing in {area['titleName']}: {title_names(area, 3)}"
    pg['description'] = (f"Mould inspection and indoor air quality testing in {area['inName']}, where {st['pre1991Pct']}% of houses were built before 1991: "
                         "when mold sampling helps, the cleanup size rules from CMHC and Health Canada, and when to hire a remediation contractor.")
    pg['lede'] = (f"{st['pre1991Pct']}% of the {n(st['houses'])} houses in {area['inName']} were built before 1991, and winters here bring about "
                  f"{climate_short(area)} heating degree-days a year: cold corners and older basements are where mould usually starts. Here's how to inspect for it "
                  f"in {communities_sentence(area, 4)}, when air sampling helps, and when cleanup is a job for a contractor.")
    pg['glance'] = [{'k': 'Houses built before 1991', 'v': f"{st['pre1991Pct']}%", 'sub': '2021 Census'},
                    {'k': 'Heating degree-days', 'v': climate_short(area)},
                    {'k': 'Clean it yourself', 'v': 'Up to 3 patches', 'sub': 'each under 1 m²'},
                    {'k': 'Hire a contractor', 'v': 'Over 3 m²', 'sub': 'or if it keeps coming back'}]
    body = [p(climate_sentence(area), "On cold days, exterior corners, closets on outside walls and window frames get cold enough for condensation, which is where mould "
                                      "often starts."),
            p(housing_sentence(area), "Older basements without a moisture barrier, and houses air-sealed without adding ventilation, are common trouble spots.")]
    ss = seasonal_sentence(area)
    if ss:
        src.add('occupied-def')
        body.append(p(ss, "A house or cottage that sits closed up for long stretches is worth a sniff test and a look in the basement each time you open it."))
    secs = [{'h2': f"Why mould shows up in {area['inName']} homes", 'html': ''.join(body)}]
    insp = [p("Start by looking and smelling: stains, discoloured patches, peeling paint and a musty odour, especially in basements, bathrooms, window frames and closets "
              "on outside walls. Health Canada says measuring mould concentrations or identifying species is usually unnecessary: if you can see or smell it, fix the moisture and clean up."),
            p("Air or surface sampling helps when you smell mustiness but can't find the source, after a leak or flood to check the cleanup worked, or before buying a house with "
              "signs of past water damage. Ask which lab analyzes the samples and look for one accredited under AIHA's EMLAP program.")]
    secs.append({'h2': 'Mould inspection: when sampling helps', 'html': ''.join(insp)})
    sizes = ('<table class="stack"><thead><tr><th>Size</th><th>What counts</th><th>Who should clean it</th></tr></thead><tbody>'
             '<tr><td data-label="Size">Small</td><td data-label="What counts">One to three patches, each smaller than 1 m²</td>'
             '<td data-label="Who should clean it">A healthy homeowner, with water and unscented dish detergent (CMHC)</td></tr>'
             '<tr><td data-label="Size">Medium</td><td data-label="What counts">More than three patches, or patches between 1 and 3 m² (32 square feet)</td>'
             '<td data-label="Who should clean it">Trained help; homeowners only with training and precautions</td></tr>'
             '<tr><td data-label="Size">Large</td><td data-label="What counts">A patch larger than 3 m², or many patches through the house</td>'
             '<td data-label="Who should clean it">A qualified mould remediation contractor (CMHC)</td></tr></tbody></table>')
    rem = [p("CMHC and Health Canada sort mould by size, and the size decides who should clean it up:"), sizes,
           ul(["Fix the moisture source first: a leak, poor drainage, or condensation from high humidity. Health Canada recommends 30–50% relative humidity.",
               "For a small cleanup, wear safety glasses or goggles, an N95 mask if possible and household rubber gloves. People at risk from mould shouldn't clean it and should stay away.",
               "Health Canada suggests professional help for extensive mould, especially growth that keeps coming back after cleaning."])]
    secs.append({'h2': 'Cleanup and remediation: the size rules', 'html': ''.join(rem)})
    secs.append({'h2': 'Choosing a tester or contractor', 'html': p("Ask any tester which lab analyzes their samples and what the report will recommend; a good report "
                                                                    "points to the moisture source. For remediation, get two or three written quotes that describe containment, "
                                                                    "what will be removed and how the area is cleaned. No province has a mandatory mould standard for homes, and "
                                                                    "Health Canada sets no numerical limit.") + p('Read more: ' + a_guide('mold-testing') + '.')})
    pg['sections'] = secs
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f"Do I need mould testing in {area['inName']} if I can see mould?", 'a': 'Usually not. Visible mould needs cleanup and a fix for the moisture source. Sampling helps most when you suspect mould you can’t see.'},
        {'q': 'How much mould can I clean myself?', 'a': 'CMHC says a healthy homeowner can clean one to three patches, each under 1 m², with water and unscented dish detergent. Larger areas need trained help or a remediation contractor.'},
        {'q': 'When should I hire a mould remediation contractor?', 'a': 'For a single patch over 3 m², many patches through the house, or mould that keeps coming back after cleaning (CMHC, Health Canada).'},
        {'q': 'Is there a legal mould limit for homes in Canada?', 'a': 'No. Health Canada sets no numerical limit; its guidance is to control moisture and clean up mould.'},
    ]
    return pg


def gen_wells(a, area, src):
    pg = page_base(a, area, 'well-water-testing')
    prov = a['prov']
    hu = HU['units'][a['healthUnit']]
    w = hu.get('wells')
    pt = GP.PT[prov]
    pg['title'] = (f"Well water testing in {area['titleName']}: free bacteria (E. coli and coliform) tests in {title_names(area, 3)}" if prov == 'ON'
                   else f"Well water testing in {area['titleName']}: E. coli and coliform tests in {title_names(area, 3)}")
    if prov == 'ON':
        src.add(f"{hu['name']} — private well water testing", w['url'])
        src.add('pho-wells')
        src.add('on-wells')
        src.add('cbc-wells')
        where = w.get('whereByArea', {}).get(a['slug']) or w['where']
        pg['description'] = (f"Private well testing in {area['inName']}: free bacteria tests for E. coli and total coliforms through {hu['short']}, "
                             "where to pick up bottles and drop off samples, how often to test, and chemistry such as nitrate.")
        nplaces = len(w.get('places') or [])
        pg['lede'] = (f"Homes on private wells in {area['inName']}, from {communities_sentence(area, 3)} to the smallest hamlets, can test for bacteria "
                      f"(E. coli and total coliforms) for free through {hu['short']}"
                      + (f", with bottle pick-up and drop-off in {join_and(w['places'][:6])}" if nplaces and a['healthUnit'] != 'grand-erie' else '')
                      + ". Here's how the local program works, how often to test, and what the free test doesn't cover.")
        if a['healthUnit'] == 'peel':
            src.add('pho-contact')
        pg['glance'] = [{'k': 'Bacteria test', 'v': 'Free', 'sub': 'Public Health Ontario'},
                        {'k': 'Run by', 'v': hu['name'].replace(' and Paramedic Services', '')},
                        ({'k': 'How often', 'v': '3 times a year', 'sub': 'spring, summer, fall'}
                         if re.search(r'three times|each spring, summer and fall', w.get('frequency') or '')
                         else {'k': 'How often', 'v': 'Seasonally', 'sub': 'spring, summer, fall, winter'} if 'seasonally' in (w.get('frequency') or '')
                         else {'k': 'How often', 'v': 'Regularly', 'sub': 'no set schedule'}),
                        {'k': 'Chemistry', 'v': 'Private lab', 'sub': 'nitrate, metals, more'}]
        body = [p(esc(w['free']), esc(where))]
        if w.get('extra'):
            body.append(p(esc(w['extra'])))
        if w.get('frequency'):
            body.append(p(esc(w['frequency'])))
        secs = [{'h2': f"Free testing through {hu['short']}", 'html': ''.join(body)}]
        secs.append({'h2': 'What the free test covers, and what it doesn’t', 'html': p(
            "Public Health Ontario's lab tests only for indicator bacteria: total coliforms and E. coli. Samples have to reach the lab within a day or two, so collect "
            "them early in the week and check the drop-off cut-off times.", esc(w['chemistry']))})
        secs.append({'h2': 'Reading the results, and what to do next', 'html': (
            p("Ontario's guide to testing and treating private wells reads the counts (per 100 mL) like this:")
            + ul(["<strong>E. coli above 0</strong>: unsafe to drink, with evidence of animal or human waste getting into the well. Stop drinking the water and call "
                  "the health unit right away.",
                  "<strong>Total coliforms above 5, no E. coli</strong>: significant evidence of bacterial contamination, usually surface water getting in. The water may "
                  "be unsafe to drink: call the health unit, inspect and repair the well, shock-chlorinate it if needed and retest.",
                  "<strong>Total coliforms of 5 or fewer, no E. coli</strong>: some evidence of bacteria, which may not be significant at these low levels. Keep testing "
                  "to track the pattern."])
            + p("Boiling water at a rolling boil for at least one minute kills harmful organisms but doesn't remove dissolved contaminants. To disinfect, the province says "
                "to shock-chlorinate the well and the entire household plumbing system. Between tests, check that the well cap and the sealant around the casing aren't "
                "cracked or damaged, and keep the ground sloping away from the well: Ontario's Wells Regulation requires owners to maintain a well so surface water "
                "can't get in."))})
        secs.append({'h2': 'Why testing is worth the trip', 'html': p(
            "Ontario's auditor general estimated in 2025 that about 1.3 million Ontarians rely on private wells, and that fewer than a third of well owners had tested "
            "in the previous 12 months (as reported by CBC). Well water can change with the seasons, after heavy rain or snowmelt, and after work on the well, which is "
            "why the health units ask for several tests a year.")})
        if area.get('nearbyGroup') and area['nearbyGroup'].get('healthUnit'):
            h2 = HU['units'][area['nearbyGroup']['healthUnit']]
            src.add(f"{h2['name']} — well water testing", h2['wells']['url'])
            secs.append({'h2': f"{area['nearbyGroup']['label']}: {h2['name']}", 'html': p(esc(h2['wells']['free']), esc(h2['wells']['where']),
                                                                                       esc(h2['wells']['frequency']), esc(h2['wells']['chemistry']))})
        faq = [
            {'q': f"Is well water testing free in {area['inName']}?", 'a': f"Yes for bacteria. {strip(w['free'])} {strip(w['chemistry'])}"},
            {'q': f"Where do I get a well water bottle in {area['titleNames'][0]}?", 'a': strip(where)},
            {'q': 'How often should I test my well?', 'a': strip(w.get('frequency') or "Regularly; local health units commonly recommend spring, summer and fall.")},
            {'q': 'Does the free test check for nitrate?', 'a': strip(w['chemistry'])},
            {'q': 'What if my well water test shows E. coli?', 'a': ('Ontario says any E. coli means the water is unsafe to drink. Stop drinking it, use bottled water, '
                                                                    'and call your public health unit right away; it will advise on repairs, shock chlorination and retesting.')},
        ]
    else:
        src.add('hlbc-wells')
        src.add('cala')
        src.add('bc-disinfect')
        north = a['healthUnit'] == 'bc-north'
        src.add('nh-water' if north else 'ih-water')
        pg['description'] = (f"Private well water testing in {area['inName']}: bacteria (E. coli and total coliforms) and chemistry through a qualified lab, how often "
                             f"B.C. recommends testing, what {hu['short']} says, and what to do if a test comes back positive.")
        pg['lede'] = (f"There's no free provincial well-testing program in B.C., so well owners in {area['inName']}, from {communities_sentence(area, 3)} to rural "
                      "acreages, use a qualified lab. "
                      + ("Northern Health tests permitted water systems, not individual homes. " if north
                         else "Interior Health says the homeowner is responsible for making sure a private supply is safe. ")
                      + "Here's what to test for, how often, how to choose a lab, and what to do if bacteria show up.")
        pg['glance'] = [{'k': 'Bacteria test', 'v': 'Paid, private lab'}, {'k': 'Find a lab', 'v': 'CALA directory'},
                        {'k': 'Bacteria', 'v': 'At least yearly'}, {'k': 'Chemistry', 'v': 'New well, then yearly'}]
        secs = [{'h2': f"Testing a well in {area['inName']}", 'html': p(esc(GP.strip(pt['wells'][0])))},
                {'h2': 'What to test for', 'html': ul(["Bacteria (total coliforms and E. coli): at least once a year, and right away if the water's clarity, colour or taste changes.",
                                                       "Chemistry when the well is new and every year after: HealthLinkBC names nitrates, fluoride and metals such as arsenic, lead, copper and manganese as the most common concerns in B.C. groundwater."])},
                {'h2': 'Choosing a lab', 'html': p("Search the CALA directory for an accredited lab near you; the lab supplies sterile bottles and instructions, and charges for the analysis. "
                                                   "Read the instructions carefully and follow them exactly, and keep every result for future reference.")}]
        if north:
            secs.append({'h2': 'What Northern Health does, and doesn’t do', 'html': p(
                "Northern Health looks after water testing for permitted water systems but doesn't test individual homes, and it doesn't recommend specific labs: any "
                "accredited lab in B.C. will do. It says private supplies should be tested for bacteria at least once a year, that chemical results show whether anything "
                "exceeds health standards or aesthetic objectives, and that a local environmental health officer can help you interpret results or find a certified lab.",
                "It also notes that contaminants can get into a well through cracks in the casing, poorly fitted lids or other structural faults, and that a well close to "
                "sources of pollution can pick up bacteria, nitrates or other chemicals.")})
        else:
            secs.append({'h2': 'What Interior Health says about private water', 'html': p(
                "Interior Health says private systems have minimal regulatory oversight and that the homeowner is responsible for making sure the water is safe for drinking, "
                "cooking and household sanitation; for a rental, it becomes a legal requirement for the landlord. It says surface water and well water should be tested, "
                "that surface water and many groundwater sources should be disinfected, and it links to the Provincial Health Services Authority's list of labs approved for "
                "drinking water microbiology testing.",
                "If your water comes from the lake or a stream, watch for algae blooms: Interior Health says boiling will not remove algal toxins, and to use another source "
                "for drinking, and for pets and livestock, during a bloom.")})
        secs.append({'h2': 'If the results show bacteria', 'html': (
            p("HealthLinkBC says water with E. coli is not safe to drink: treat it before drinking, preparing food or brushing teeth (boiling is a short-term option), "
              "then find and fix the source, with long-term treatment if the source can't be corrected. Total coliforms without E. coli can mean the well needs better "
              "sanitation or physical upgrades, or that surface water may be getting in. Re-test after floods, drought or similar events, and don't rely on a neighbour's "
              "result: a safe test next door doesn't mean your water is safe.")
            + p("Before disinfecting, the province's guide to simple chlorination asks you to check the wellhead:")
            + ul(["Sewage sources near the well, such as manure or compost piles or a septic field.",
                  "Ground that slopes toward the well or lets water pond around it.",
                  "A missing, cracked or damaged well cap, or one that lets water or vermin in.",
                  "Casing that sticks up less than 30 cm (1 ft) above the ground or pump-house floor, or a gap or cracks in the seal around it."])
            + p("Fix those first, or the well stays vulnerable. A registered well driller or pump installer has to do any surface-seal repair or casing extension, and the "
                "guide warns that chlorine vapour is dangerous in confined spaces such as pump houses, well pits and crawl spaces.")
            + p('Read more: ' + a_guide('well-water-testing') + '.'))})
        faq = [
            {'q': f"Is well water testing free in {area['inName']}?", 'a': 'No. B.C. has no free provincial program; a qualified lab charges for the analysis and supplies the bottles.'},
            {'q': 'How often should I test my well?', 'a': 'HealthLinkBC recommends bacteria testing at least once a year, and chemistry when the well is new and every year after.'},
            {'q': 'What chemicals should I test for?', 'a': 'HealthLinkBC names nitrates, fluoride and metals such as arsenic, lead, copper and manganese as the most common chemicals of concern in B.C. groundwater.'},
            {'q': 'Where do I find a lab?', 'a': 'Search the CALA directory of accredited laboratories; the lab provides the bottles and instructions.'},
            {'q': 'What if my well water test shows E. coli?', 'a': ('HealthLinkBC says the water is not safe to drink. Treat it before drinking, cooking or brushing teeth '
                                                                    '(boiling works short term), find and fix the source, and disinfect the well once the wellhead is sound.')},
        ]
        src.add(f"{area['provName']} — private well testing", pt['wells'][1])
    secs.append({'h2': 'What to test for', 'html': ul(["Bacteria (total coliforms and E. coli), several times a year and after flooding, heavy rain or work on the well.",
                                                       "Nitrate, especially near farmland or septic systems: the province flags nitrate above 10 ppm as a health risk for infants, "
                                                       "and reverse osmosis or distillation treats it.",
                                                       "Naturally occurring minerals such as arsenic, uranium and radium, which the province lists as long-term health risks; "
                                                       "a private accredited lab tests for them."]) +
                 p('Read more: ' + a_guide('well-water-testing') + '.')}) if prov == 'ON' else None
    pg['sections'] = [s for s in secs if s]
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = faq
    return pg


def gen_wood(a, area, src):
    pg = page_base(a, area, 'wood-burning-inspection')
    prov = a['prov']
    for k_ in ('wood-wett', 'wood-nfc', 'wood-b365', 'wood-b415', 'eccc'):
        src.add(k_)
    if prov == 'ON':
        src.add('wood-ofc')
    st = area['stats']
    pg['title'] = f"WETT-certified wood stove and chimney inspections in {area['titleName']}: {title_names(area, 3)}"
    rule = ("Ontario's Fire Code requires every chimney, flue and flue pipe to be inspected at least once every 12 months" if prov == 'ON'
            else "The National Fire Code requires every chimney, flue and flue pipe to be inspected at least once every 12 months")
    pg['description'] = (f"Wood-burning appliance (WETT) inspections in {area['inName']}: what an inspection checks, how to find a WETT-certified inspector, "
                         f"certified stoves, and the {'Ontario' if prov == 'ON' else 'National'} Fire Code rule for a chimney inspection every 12 months.")
    pg['lede'] = (f"{rule}, when an appliance is added and after any chimney fire. In {area['inName']}, with about {climate_short(area)} heating degree-days a year, "
                  f"a wood stove or insert can run for much of the year. Here's what an inspection covers and how to book a WETT-certified inspector in "
                  f"{communities_sentence(area, 4)} or anywhere else in the area.")
    pg['glance'] = [{'k': 'Chimney inspection', 'v': 'Every 12 months', 'sub': 'Ontario Fire Code' if prov == 'ON' else 'National Fire Code'},
                    {'k': 'Clean now if', 'v': 'Creosote > 3 mm', 'sub': 'NFC note'},
                    {'k': 'Heating degree-days', 'v': climate_short(area)},
                    {'k': 'Find an inspector', 'v': 'WETT directory'}]
    why = [p(climate_sentence(area), housing_sentence(area))]
    ss = seasonal_sentence(area)
    if ss:
        src.add('occupied-def')
        why.append(p(ss, "If you're buying a cottage or a house with a wood stove, ask your insurer what inspection it needs before the deal closes."))
    why.append(p("WETT Inc., the non-profit that trains and registers wood-energy professionals across Canada, says hiring a WETT-certified professional ensures wood-burning "
                 "appliances are inspected, installed and maintained to current safety codes and standards, and helps homeowners meet insurance or regulatory requirements."))
    secs = [{'h2': f"Why inspections matter in {area['inName']}", 'html': ''.join(why)}]
    checks = ul([
        "<strong>The chimney, flue and flue pipe</strong>: structural problems such as a missing liner or inadequate supports, and decay such as cracking, crumbling mortar, "
        "corrosion or separated sections (National Fire Code notes).",
        "<strong>Creosote and soot</strong>: deposits more than 3 mm thick mean the chimney needs cleaning right away and should be inspected more often.",
        "<strong>Clearances</strong>: the required space between the appliance, flue pipe or chimney and anything combustible, which must be kept clear.",
        "<strong>The installation</strong>: CSA B365 is the installation code for solid-fuel appliances, covering installation, alteration and maintenance.",
        "<strong>The appliance itself</strong>: whether it's certified to CSA B415.1 or the US EPA standard, which you can usually tell from its label or plate."])
    secs.append({'h2': 'What a wood-burning inspection checks', 'html': p("An inspection looks at what the fire and installation codes regulate:") + checks})
    find = [p(f"Search the {link('https://www.wettinc.ca/', 'WETT directory')} for certified professionals near {area['titleNames'][0]} and the rest of {area['inName']}, "
              "and ask your home insurer what it needs to see when you add a stove or buy a house that has one. WETT doesn't publish inspection prices, so get "
              "two or three written quotes and ask what each inspection includes.")]
    if prov == 'BC':
        src.add('wood-bcRegs')
        src.add('wood-bcCwsrp')
        src.add('wood-bcLocal')
        find.append(p("B.C.'s Solid Fuel Burning Domestic Appliance Regulation sets standards for wood stoves and other wood-burning appliances sold in the province, and the "
                      "Community Wood Smoke Reduction Program offers incentives to replace old wood stoves with cleaner heating (gas and propane exchanges ended January 1, 2023).",
                      esc(WOOD['facts']['bcLocal'][a['slug']])))
    secs.append({'h2': 'Finding a WETT-certified inspector', 'html': ''.join(find)})
    secs.append({'h2': 'Keeping it safe between inspections', 'html': ul([
        "Burn dry wood: the US EPA says wood burns best below 20% moisture; check it with a moisture meter.",
        "Dense smoke at the top of the chimney is a warning sign of poor operation, a wrongly sized chimney or unsuitable fuel (National Fire Code note).",
        "Keep combustible things out of the clearance space around the stove and flue pipe.",
        "Have the chimney inspected after any chimney fire, and when you add or replace an appliance."]) + p(link('/tests/wood-burning-inspection/', 'Read the full wood-burning inspection guide') + '.')})
    src.add('wood-epaPractice')
    pg['sections'] = secs
    pg['providers'] = None
    pg['programs'] = None
    pg['faq'] = [
        {'q': f"How often should a wood stove chimney be inspected in {area['inName']}?",
         'a': (rule + ', when an appliance is added and after any chimney fire, and cleaned as often as needed to keep combustible deposits from building up.')},
        {'q': 'What is a WETT inspection?', 'a': ('An inspection of a wood-burning appliance and its chimney or venting by a professional certified through the WETT program, '
                                                  'which WETT Inc. says helps homeowners meet insurance or regulatory requirements.')},
        {'q': f"How do I find a WETT-certified inspector near {area['titleNames'][0]}?", 'a': 'Search the WETT directory on wettinc.ca, then confirm the inspector covers your address and ask what the inspection includes.'},
        {'q': 'How much does a WETT inspection cost?', 'a': 'WETT doesn’t publish prices and we found no reliable published range, so ask two or three inspectors for written quotes.'},
        {'q': 'What is a certified wood stove?', 'a': ('One tested to CSA B415.1 or certified by the US EPA for emissions. The EPA’s 2020 limit for new room heaters is 2.0 grams of '
                                                      'particles per hour (crib wood) or 2.5 g/h (cord wood).')},
    ]
    src.add('wood-epaCert')
    return pg


GENERATORS = {'home-energy-audit': gen_hea, 'heat-loss-calculation': gen_heat_loss, 'radon-testing': gen_radon,
              'mold-testing': gen_mould, 'well-water-testing': gen_wells, 'wood-burning-inspection': gen_wood}


# ------------------------------------------------------------------ hub
def hub(a, area, src):
    st = area['stats']
    prov = a['prov']
    nmun = len(area['municipalities'])
    for k_ in ('census-pop', 'census-housing', 'popctr', 'cgndb', 'eccc', 'nbc', 'radon2012', 'nrcan-so'):
        src.add(k_)
    if prov == 'ON':
        src.add('lio')
    lo, hi = design_range(area)
    r12, nw = radon_figs(a)
    if nw:
        src.add('radon2024')
    pv = providers_block(a, area)
    hu = HU['units'][a['healthUnit']]
    mun_word = 'municipalities' if prov == 'BC' else 'towns and townships'
    if a.get('cdTotals'):
        intro = (f"The {join_and([CENSUS[c]['name'] for c in a['cdTotals']])} regional districts are home to {n(st['pop'])} people (2021 Census), "
                 f"{n(sum(g['pop'] for g in area['municipalities']))} of them in the {words(nmun)} municipalities listed here")
    elif a['slug'] in ('norfolk-county', 'haldimand-county', 'county-of-brant', 'caledon', 'halton-hills'):
        intro = f"{area['inName'][0].upper() + area['inName'][1:]} is home to {n(st['pop'])} people (2021 Census)"
    else:
        intro = f"The {words(nmun)} {mun_word} on this page are home to {n(st['pop'])} people (2021 Census)"
    h = {
        'h1': f"Home energy audits, radon and well water testing in {area['inName']}",
        'title': f"{area['name'][0].upper() + area['name'][1:]} home energy audits, radon, well water and WETT inspections: {title_names(area, 3)}",
        'description': (f"Area guide for {area['inName']}: EnerGuide home energy audits, CSA F280-12 heat loss calculations, radon, mould, well water "
                        f"and WETT inspections across {area['communityCount']} communities, with local health-unit, climate and housing data."),
        'lede': (f"{intro}, and {st['pre1961Pct']}% of their houses were built before 1961. This guide covers {area['communityCount']} communities, from "
                 f"{communities_sentence(area)} to the smallest hamlets, with the local numbers that shape an energy audit or a home health test."),
    }
    cards = []
    if seasonal_sentence(area) or area.get('section'):
        src.add('occupied-def')
    cards.append({'eyebrow': 'People and homes', 'text': (f"{n(st['pop'])} people and {n(st['dwellings'])} private dwellings in 2021"
                                                          + (f", up {st['popChangePct']}% in population since 2016" if st['popChangePct'] and st['popChangePct'] > 0 else '')
                                                          + '. ' + (seasonal_sentence(area) or ''))})
    cards.append({'eyebrow': 'Housing', 'text': housing_sentence(area) + f" The typical house dates from {st['medianPeriod']}."})
    cards.append({'eyebrow': 'Climate', 'text': climate_sentence(area) + (' ' + climate_sentence(area, 1) if len(area['climate']['eccc']) > 1 else '')
                  + f" The building code's 2.5% January design temperatures for the area run from {deg(hi['jan25'])} to {deg(lo['jan25'])}."
                  if lo['jan25'] != hi['jan25'] else climate_sentence(area) + f" The building code's 2.5% January design temperature is {deg(lo['jan25'])}."})
    cards.append({'eyebrow': 'Radon', 'text': 'In Health Canada’s 2012 survey, ' + '; '.join(radon_region_sentence(r) for r in r12) + '.'
                  + (' ' + radon_newer_sentence(nw)[0].upper() + radon_newer_sentence(nw)[1:] + '.' if nw else '')})
    if prov == 'ON':
        w = hu['wells']
        cards.append({'eyebrow': 'Wells', 'text': f"{w['free']} {(w.get('whereByArea', {}).get(a['slug']) or w['where'])}"})
        src.add(f"{hu['name']} — private well water testing", w['url'])
    cards.append({'eyebrow': 'Energy advisors', 'text': (f"NRCan's list (checked {CHECKED}) shows {pv['count']} service organizations registered for postal codes in "
                                                         f"{join_and(pv['towns'])}. Confirm they travel to your community.")})
    hs = heating_sentence(area)
    if hs:
        src.add('heating')
        cards.append({'eyebrow': 'Heating', 'text': hs})
    h['cards'] = cards
    h['facts'] = [{'k': 'Population (2021)', 'v': n(st['pop'])}, {'k': 'Communities listed', 'v': str(area['communityCount'])},
                  {'k': 'Houses built before 1961', 'v': f"{st['pre1961Pct']}%"},
                  {'k': 'Heating degree-days', 'v': climate_short(area), 'sub': station_label(area['climate']['eccc'][0]['station'])}]
    h['services'] = []
    for s in SERVICES:
        metric = {
            'home-energy-audit': f"{pv['count']} registered organizations",
            'heat-loss-calculation': f"Design temp {deg(hi['jan25'])} to {deg(lo['jan25'])}" if lo['jan25'] != hi['jan25'] else f"Design temp {deg(lo['jan25'])}",
            'radon-testing': f"{GP.pct(r12[0]['pct'], 1)} above guideline (2012)",
            'mold-testing': f"{st['pre1991Pct']}% built before 1991",
            'well-water-testing': 'Free bacteria tests' if prov == 'ON' else 'Private lab tests',
            'wood-burning-inspection': 'Chimney inspection every 12 months',
        }[s['slug']]
        h['services'].append({'slug': s['slug'], 'name': s['name'], 'cat': s['cat'], 'metric': metric, 'photo': s['photo'] or a['photo']})
    h['programs'] = programs(a)
    return h


# ------------------------------------------------------------------ build
def related(a, area, svc):
    return [{'href': f"/areas/{a['slug']}/{s['slug']}/", 'label': s['name']} for s in SERVICES if s['slug'] != svc]


def snapshot(area):
    st = area['stats']
    lo, hi = design_range(area)
    return [{'k': 'Population (2021)', 'v': n(st['pop'])},
            {'k': 'Communities listed', 'v': str(area['communityCount'])},
            {'k': 'Heating degree-days', 'v': climate_short(area)},
            {'k': 'Design temperature', 'v': f"{deg(hi['jan25'])} to {deg(lo['jan25'])}" if lo['jan25'] != hi['jan25'] else deg(lo['jan25'])},
            {'k': 'Houses built before 1961', 'v': f"{st['pre1961Pct']}%"},
            {'k': 'Houses built before 1991', 'v': f"{st['pre1991Pct']}%"}]


def build():
    outdir = os.path.join(REPO, 'src', 'data', 'areas')
    os.makedirs(outdir, exist_ok=True)
    index = []
    for a in CFG:
        area = build_area(a)
        hub_src = Sources()
        area['hub'] = hub(a, area, hub_src)
        area['hub']['sources'] = hub_src.out()
        pages = OrderedDict()
        for s in SERVICES:
            src = Sources()
            pg = GENERATORS[s['slug']](a, area, src)
            for k_ in ('census-pop', 'popctr', 'cgndb'):
                src.add(k_)
            pg['snapshot'] = snapshot(area)
            pg['related'] = related(a, area, s['slug'])
            pg['sources'] = src.out()
            pages[s['slug']] = pg
        area['pages'] = pages
        area['services'] = [{k: s[k] for k in ('slug', 'name', 'short', 'cat', 'guide', 'guideLabel', 'hub', 'blurb')} | {'photo': s['photo'] or a['photo']}
                            for s in SERVICES]
        area['checked'] = CHECKED
        area['checkedISO'] = CHECKED_ISO
        json.dump(area, open(os.path.join(outdir, f"{a['slug']}.json"), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index.append({'slug': a['slug'], 'name': a['name'], 'inName': a['inName'], 'prov': a['prov'], 'provName': PROV_NAME[a['prov']],
                      'kind': a['kind'], 'pop': area['stats']['pop'], 'municipalities': len(area['municipalities']),
                      'communityCount': area['communityCount'], 'titleNames': a['titleNames'], 'photo': a['photo'],
                      'communities': sorted(set(all_community_names(area)), key=str.lower),
                      'coveredCities': [{'slug': c['slug'], 'name': c['name'], 'communities': c['communities']} for c in area['coveredCities']],
                      'nearby': ([{'name': g['name'], 'communities': g['communities']} for g in area['nearbyGroup']['municipalities']]
                                 if area.get('nearbyGroup') else [])})
    json.dump({'checked': CHECKED, 'checkedISO': CHECKED_ISO, 'areas': index,
               'services': [{k: s[k] for k in ('slug', 'name', 'short', 'cat', 'guide', 'guideLabel', 'blurb')} for s in SERVICES]},
              open(os.path.join(outdir, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('areas', len(index), 'service pages', len(index) * len(SERVICES))


if __name__ == '__main__':
    build()
