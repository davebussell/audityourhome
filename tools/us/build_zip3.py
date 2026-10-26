#!/usr/bin/env python3
"""Build src/data/us/zip3.json: ZIP code prefix (first three digits) -> state and metro.

The US Home Energy Planner (/us/plan/) reads this table in the browser, so a ZIP code never
leaves the visitor's device. Each prefix maps to:

  * the state that holds most of the prefix's population, and
  * the slug of one of the 26 metros in src/data/us/metros/ when that metro's Core Based
    Statistical Area (CBSA) holds most of the prefix's population; otherwise null.

For prefixes outside the 26 metros, it also records the nearest covered metro whose
metropolitan area includes part of the same state (the planner borrows that metro's climate
numbers) and the distance between the two population centers, in miles.

Sources (all official U.S. Census Bureau files, downloaded with curl using a generic
User-Agent and no email address or other identifier):

  1. 2020 ZCTA to County Relationship File (national)
  2. OMB July 2023 CBSA delineation file (list1_2023.xlsx)
  3. ACS 2020-2024 5-year table-based summary file, table B01003 (total population) by ZCTA
  4. 2020 Gazetteer file for ZCTAs (internal points, for distances)
  5. Census state FIPS code list (state.txt)

Method: each ZCTA's population is split across the counties it touches in proportion to the
land area of each part (the 2020 relationship file has no population by part), counties are
placed in CBSAs with the 2023 delineation, and everything is summed by ZIP3.

Usage (from the repository root):
    python3 -I tools/us/build_zip3.py [--cache DIR] [--out PATH]

--cache defaults to a new temporary directory; files already in the cache are reused.
Requires openpyxl (to read the delineation spreadsheet).
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import io
import json
import math
import os
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
METRO_DIR = os.path.join(ROOT, 'src', 'data', 'us', 'metros')
CLIMATE_JSON = os.path.join(ROOT, 'src', 'data', 'us', 'climate.json')
DEFAULT_OUT = os.path.join(ROOT, 'src', 'data', 'us', 'zip3.json')

USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64)'

SOURCES = {
    'rel': {
        'file': 'tab20_zcta520_county20_natl.txt',
        'href': 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt',
        'label': 'U.S. Census Bureau, 2020 ZCTA to County Relationship File (national): which counties each '
                 '2020 ZIP Code Tabulation Area (ZCTA) touches, with the land area of each part',
    },
    'cbsa': {
        'file': 'list1_2023.xlsx',
        'href': 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx',
        'label': 'U.S. Census Bureau, Core Based Statistical Areas (CBSAs), Metropolitan Divisions and Combined '
                 'Statistical Areas, July 2023 delineation file (List 1, OMB Bulletin 23-01)',
    },
    'pop': {
        'file': 'acsdt5y2024-b01003.dat',
        'href': 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b01003.dat',
        'label': 'U.S. Census Bureau, American Community Survey 2020-2024 5-year estimates, table-based summary '
                 'file, table B01003 (total population), ZCTA rows',
    },
    'gaz': {
        'file': '2020_Gaz_zcta_national.zip',
        'href': 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip',
        'label': 'U.S. Census Bureau, 2020 Gazetteer file for ZCTAs (internal point latitude and longitude), used '
                 'for distances to the nearest covered metro',
    },
    'states': {
        'file': 'state.txt',
        'href': 'https://www2.census.gov/geo/docs/reference/state.txt',
        'label': 'U.S. Census Bureau, state FIPS codes and USPS abbreviations (state.txt)',
    },
}

# The 50 states and DC (the planner's coverage); Puerto Rico and the island areas are left out.
EXCLUDED_STATE_FIPS = {'60', '66', '69', '72', '74', '78'}


def download(cache: str) -> dict[str, str]:
    paths = {}
    for key, src in SOURCES.items():
        path = os.path.join(cache, src['file'])
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            print(f'download {src["href"]}', file=sys.stderr)
            subprocess.run(
                ['curl', '-sS', '-f', '-L', '--retry', '3', '-A', USER_AGENT, '-o', path, src['href']],
                check=True,
            )
        paths[key] = path
    return paths


def read_states(path: str) -> dict[str, str]:
    """FIPS state code -> USPS abbreviation, 50 states and DC only."""
    out = {}
    with open(path, encoding='utf-8-sig') as f:
        header = f.readline().rstrip('\n').split('|')
        i_fips, i_usps = header.index('STATE'), header.index('STUSAB')
        for line in f:
            cols = line.rstrip('\n').split('|')
            if len(cols) <= max(i_fips, i_usps):
                continue
            if cols[i_fips] in EXCLUDED_STATE_FIPS:
                continue
            out[cols[i_fips]] = cols[i_usps]
    return out


def read_population(path: str) -> dict[str, int]:
    """ZCTA -> population (B01003_E001)."""
    out = {}
    with open(path, encoding='utf-8-sig') as f:
        header = f.readline().rstrip('\n').split('|')
        i_geo, i_est = header.index('GEO_ID'), header.index('B01003_E001')
        for line in f:
            cols = line.rstrip('\n').split('|')
            geo = cols[i_geo]
            if not geo.startswith('860Z200US'):
                continue
            try:
                out[geo[-5:]] = max(0, int(cols[i_est]))
            except ValueError:
                out[geo[-5:]] = 0
    return out


def read_gazetteer(path: str) -> dict[str, tuple[float, float]]:
    """ZCTA -> (lat, lon) internal point."""
    out = {}
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith('.txt'))
        text = z.read(name).decode('utf-8-sig')
    lines = text.splitlines()
    header = [h.strip() for h in lines[0].split('\t')]
    i_id, i_lat, i_lon = header.index('GEOID'), header.index('INTPTLAT'), header.index('INTPTLONG')
    for line in lines[1:]:
        cols = [c.strip() for c in line.split('\t')]
        if len(cols) <= max(i_id, i_lat, i_lon):
            continue
        out[cols[i_id]] = (float(cols[i_lat]), float(cols[i_lon]))
    return out


def read_relationship(path: str) -> dict[str, list[tuple[str, int, int]]]:
    """ZCTA -> [(county GEOID, land area of the part, water area of the part)]."""
    parts: dict[str, list[tuple[str, int, int]]] = defaultdict(list)
    with open(path, encoding='utf-8-sig') as f:
        header = f.readline().rstrip('\n').split('|')
        i_z = header.index('GEOID_ZCTA5_20')
        i_c = header.index('GEOID_COUNTY_20')
        i_land = header.index('AREALAND_PART')
        i_water = header.index('AREAWATER_PART')
        for line in f:
            cols = line.rstrip('\n').split('|')
            z = cols[i_z]
            if not z:  # county area outside every ZCTA
                continue
            parts[z].append((cols[i_c], int(cols[i_land] or 0), int(cols[i_water] or 0)))
    return parts


def read_cbsa(path: str) -> tuple[dict[str, str], dict[str, dict]]:
    """county GEOID -> CBSA code, and CBSA code -> {title, type}."""
    try:
        import openpyxl  # type: ignore
    except ImportError:  # pragma: no cover
        sys.exit('openpyxl is required: pip install openpyxl')
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = None
    for row in rows:
        if row and row[0] == 'CBSA Code':
            header = [str(c) if c is not None else '' for c in row]
            break
    if header is None:
        sys.exit('CBSA delineation: header row not found')
    i_code = header.index('CBSA Code')
    i_title = header.index('CBSA Title')
    i_type = header.index('Metropolitan/Micropolitan Statistical Area')
    i_st = header.index('FIPS State Code')
    i_co = header.index('FIPS County Code')
    county_cbsa: dict[str, str] = {}
    cbsas: dict[str, dict] = {}
    for row in rows:
        if not row or row[i_code] is None:
            continue
        code = str(row[i_code]).strip()
        if not (len(code) == 5 and code.isdigit()):
            continue  # notes and source lines at the foot of the sheet
        st = str(row[i_st]).strip().zfill(2)
        co = str(row[i_co]).strip().zfill(3)
        county_cbsa[st + co] = code
        cbsas[code] = {'title': str(row[i_title]).strip(), 'type': str(row[i_type]).strip()}
    return county_cbsa, cbsas


def norm_title(s: str) -> str:
    s = s.split('(')[0]
    for suffix in (' Metropolitan Statistical Area', ' Metropolitan Area', ' MSA'):
        if suffix in s:
            s = s.split(suffix)[0]
    return ' '.join(s.replace('–', '-').split()).strip().lower()


def read_metros() -> list[dict]:
    with open(CLIMATE_JSON, encoding='utf-8') as f:
        ranked = {r['slug']: r for r in json.load(f)['rankedMetros']}
    metros = []
    for path in sorted(glob.glob(os.path.join(METRO_DIR, '*.json'))):
        with open(path, encoding='utf-8') as f:
            rec = json.load(f)
        slug = rec['slug']
        metros.append({
            'slug': slug,
            'metroName': rec['metroName'],
            'msa': ranked.get(slug, {}).get('msa'),
            'states': rec.get('states', []),
        })
    return metros


def haversine_miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(h))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--cache', help='directory for the downloaded Census files (default: a new temp dir)')
    ap.add_argument('--out', default=DEFAULT_OUT, help='output JSON path')
    args = ap.parse_args()
    cache = args.cache or tempfile.mkdtemp(prefix='zip3-census-')
    os.makedirs(cache, exist_ok=True)

    paths = download(cache)
    states = read_states(paths['states'])
    pop = read_population(paths['pop'])
    gaz = read_gazetteer(paths['gaz'])
    rel = read_relationship(paths['rel'])
    county_cbsa, cbsas = read_cbsa(paths['cbsa'])

    # ---- the 26 covered metros -> CBSA codes, matched on the MSA title in each metro record
    by_title = {norm_title(v['title']): code for code, v in cbsas.items() if v['type'].startswith('Metropolitan')}
    metros = read_metros()
    metro_cbsa: dict[str, str] = {}
    for m in metros:
        code = by_title.get(norm_title(m['metroName'])) or (m['msa'] and by_title.get(norm_title(m['msa'])))
        if not code:
            sys.exit(f'no 2023 CBSA matches metro {m["slug"]!r} ({m["metroName"]})')
        metro_cbsa[m['slug']] = code
    if len(metro_cbsa) != 26 or len(set(metro_cbsa.values())) != 26:
        sys.exit(f'expected 26 distinct metros, matched {len(metro_cbsa)}')
    cbsa_metro = {code: slug for slug, code in metro_cbsa.items()}

    # ---- apportion each ZCTA's population to its counties by land area, then sum by ZIP3
    zip_state = defaultdict(lambda: defaultdict(float))
    zip_cbsa = defaultdict(lambda: defaultdict(float))
    zip_land = defaultdict(lambda: defaultdict(float))  # fallback weights for unpopulated prefixes
    zip_center = defaultdict(lambda: [0.0, 0.0, 0.0])  # sum lat*w, lon*w, w
    cbsa_center = defaultdict(lambda: [0.0, 0.0, 0.0])
    unmatched_ct = 0
    for z, plist in rel.items():
        total_land = sum(p[1] for p in plist)
        total_area = sum(p[1] + p[2] for p in plist)
        p_z = pop.get(z, 0)
        point = gaz.get(z)
        for county, land, water in plist:
            st_fips = county[:2]
            if st_fips not in states:
                continue
            if total_land > 0:
                share = land / total_land
            elif total_area > 0:
                share = (land + water) / total_area
            else:
                share = 1 / len(plist)
            w = p_z * share
            zip3 = z[:3]
            st = states[st_fips]
            cbsa = county_cbsa.get(county)
            if cbsa is None and st == 'CT':
                unmatched_ct += 1
            zip_state[zip3][st] += w
            zip_cbsa[zip3][cbsa] += w
            zip_land[zip3][(st, cbsa)] += land + water
            if point and w > 0:
                c = zip_center[zip3]
                c[0] += point[0] * w; c[1] += point[1] * w; c[2] += w
                if cbsa:
                    k = cbsa_center[cbsa]
                    k[0] += point[0] * w; k[1] += point[1] * w; k[2] += w

    def center(acc):
        return (acc[0] / acc[2], acc[1] / acc[2]) if acc[2] > 0 else None

    metro_center = {slug: center(cbsa_center[code]) for slug, code in metro_cbsa.items()}
    metro_states = {m['slug']: set(m['states']) for m in metros}

    table: dict[str, list] = {}
    in_metro = 0
    near_count = 0
    none_count = 0
    for zip3 in sorted(zip_state):
        st_w = zip_state[zip3]
        cb_w = zip_cbsa[zip3]
        if sum(st_w.values()) <= 0:
            # no population at all: fall back to area
            land = zip_land[zip3]
            st_w = defaultdict(float)
            cb_w = defaultdict(float)
            for (st, cb), a in land.items():
                st_w[st] += a
                cb_w[cb] += a
        state = max(st_w.items(), key=lambda kv: (kv[1], kv[0]))[0]
        top_cbsa = max(cb_w.items(), key=lambda kv: (kv[1], kv[0] or ''))[0]
        metro = cbsa_metro.get(top_cbsa) if top_cbsa else None
        near, miles = None, None
        if metro:
            in_metro += 1
        else:
            here = center(zip_center[zip3])
            candidates = [s for s, sts in metro_states.items() if state in sts and metro_center.get(s)]
            if here and candidates:
                best = min(candidates, key=lambda s: haversine_miles(here, metro_center[s]))
                near = best
                miles = int(round(haversine_miles(here, metro_center[best]) / 5.0) * 5)
                near_count += 1
            else:
                none_count += 1
        table[zip3] = [state, metro, near, miles]

    today = dt.date.today().isoformat()
    out = {
        'meta': {
            'title': 'ZIP code prefix (ZIP3) to state and metro, for the US Home Energy Planner',
            'generated': today,
            'script': 'tools/us/build_zip3.py',
            'format': 'zip3: { "<first three digits>": [state, metro, near, nearMiles] }. state = USPS code of the state '
                      'with most of the prefix\'s population. metro = slug of the covered metro (src/data/us/metros/) '
                      'whose CBSA holds most of the prefix\'s population, else null (the largest share may be another '
                      'CBSA or no CBSA at all). near and nearMiles are set only when metro is null: the covered metro '
                      'nearest to the prefix whose metropolitan area includes part of the same state, and the distance '
                      'in miles between the two population-weighted centers (rounded to 5); both null when no covered '
                      'metro is in that state.',
            'method': 'Each 2020 ZCTA\'s population (ACS 2020-2024 5-year, table B01003) is split across the counties it '
                      'touches in proportion to the land area of each part (the 2020 relationship file has no population '
                      'by part), each county is placed in its July 2023 CBSA, and the results are summed by the first three '
                      'digits of the ZCTA. Centers are population-weighted averages of ZCTA internal points. Covered '
                      'metros are matched to CBSAs by the MSA title in each metro record. Prefixes with no ZCTA (for '
                      'example PO-box-only or single-organization prefixes) are absent, as are Puerto Rico and the '
                      'island areas.',
            'notes': [
                'A prefix is mapped as a whole, so a few ZIP codes near metro edges get their neighbors\' metro.',
                'Connecticut\'s 2020 counties were replaced by planning regions in the 2023 delineation, so '
                'Connecticut ZCTA parts get no CBSA here (%d parts). None of the 26 covered metros includes '
                'Connecticut, so no result changes.' % unmatched_ct,
            ],
            'sources': [{'label': s['label'], 'href': s['href'], 'retrieved': today} for s in SOURCES.values()],
            'metros': {slug: {'cbsa': code, 'title': cbsas[code]['title']} for slug, code in sorted(metro_cbsa.items())},
            'counts': {'prefixes': len(table), 'inMetro': in_metro, 'nearestInState': near_count, 'noMetroInState': none_count},
        },
    }
    meta_json = json.dumps(out, indent=2, ensure_ascii=False)
    rows = ',\n'.join(f'    {json.dumps(k)}: {json.dumps(v)}' for k, v in table.items())
    text = meta_json[:-2] + ',\n  "zip3": {\n' + rows + '\n  }\n}\n'
    json.loads(text)  # sanity check
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f'wrote {args.out}: {len(table)} prefixes ({in_metro} in a covered metro, {near_count} nearest-in-state, '
          f'{none_count} with no covered metro in the state)', file=sys.stderr)


if __name__ == '__main__':
    main()
