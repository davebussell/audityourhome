"""Build the heat pump model data from the ENERGY STAR certified heat pump list.

Source: ENERGY STAR Certified Heat Pumps (data.energystar.gov dataset 83eb-xbyy), one row per
certified outdoor/indoor combination, with a Markets field that says whether the combination is
certified for Canada, the United States or both.

Usage:
  python3 tools/heatpumps/build_estar.py <estar.csv> <estar.csv.meta.json>

Writes src/data/heatpumps/estar.json:
  meta       dataset name, row count, refresh date
  markets.ca / markets.us
    totals     counts, cold-climate share, refrigerant mix
    brands     per brand page: counts by type, best ratings, top certified models
    directory  every brand registered for the market (display name, certifying company, counts)
    leaders    best cold-climate ducted and ductless systems, best cooling efficiency
"""
import csv
import collections
import datetime
import json
import os
import re
import statistics
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
MAP = json.load(open(os.path.join(ROOT, 'tools', 'heatpumps', 'brand-map.json')))
OUT = os.path.join(ROOT, 'src', 'data', 'heatpumps', 'estar.json')

VARIANT = {}
for slug, page in MAP['pages'].items():
    for variant, display in page['variants'].items():
        VARIANT[variant] = (slug, display)
KEEP_CAPS = set(MAP['keepCaps'])

# Placeholder listings that are clearly not products (e.g. a "TEST-COND" model under "BRAND10").
JUNK_BRANDS = {'BRAND10'}
A2L = ('R-454B', 'R-32')

TYPE = {'HP - Split System': 'ducted', 'HP - Mini or Multi Split': 'ductless', 'HP - Single Package': 'packaged'}


def pretty(name):
    """Registered names are often all capitals; show them in title case unless they're acronyms."""
    if name in KEEP_CAPS or not name.isupper() or len(name) <= 4:
        return name
    return ' '.join(w if (len(w) <= 3 and w.isupper() and w not in ('AND', 'THE', 'AIR')) else w.capitalize() for w in name.split())


def num(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def refrigerant_group(r):
    r = (r or '').upper()
    if '454' in r:
        return 'R-454B'
    if 'R-32' in r or r == 'R32' or r.startswith('R-32'):
        return 'R-32'
    if '410' in r:
        return 'R-410A'
    return 'other' if r else 'unknown'


def iso(d):
    return (d or '')[:10] or None


def load(path):
    rows = []
    with open(path, newline='') as fh:
        for r in csv.DictReader(fh):
            markets = r.get('markets') or ''
            mk = [m for m, label in (('ca', 'Canada'), ('us', 'United States')) if label in markets]
            if not mk:
                continue
            brand = (r.get('outdoor_unit_brand_name') or '').strip()
            if not brand or brand.upper() in JUNK_BRANDS or 'TEST' in (r.get('model_number') or '').upper():
                continue
            slug, display = VARIANT.get(brand, (None, pretty(brand)))
            cap47 = num(r.get('heating_capacity_at_47_f_btu_h'))
            cap5 = num(r.get('heating_capacity_at_5_f_btu_h'))
            ret = round(cap5 / cap47, 3) if cap47 and cap5 and cap47 > 0 else None
            rows.append({
                'mk': mk,
                'slug': slug,
                'display': display,
                'partner': (r.get('energy_star_partner') or '').strip(),
                'series': (r.get('series_name') or '').strip(),
                'outdoor': (r.get('model_number') or '').strip(),
                'indoor': (r.get('indoor_unit_model_number') or '').strip(),
                'furnace': (r.get('furnace_model_number') or '').strip(),
                'type': TYPE.get(r.get('product_type'), 'other'),
                'cold': (r.get('cold_climate') or '').strip() == 'Yes',
                'seer2': num(r.get('seer2_btu_wh')),
                'eer2': num(r.get('eer2_btu_wh')),
                'hspf2': num(r.get('hspf2_btu_wh')),
                'cool': num(r.get('cooling_capacity_btu_h')),
                'cap47': cap47,
                'cap17': num(r.get('heating_capacity_at_17_f_btu_h')),
                'cap5': cap5,
                'ret': ret,
                'cop5': num(r.get('cop_at_5_f')),
                'staging': (r.get('compressor_staging') or '').strip() or None,
                'refrig': refrigerant_group(r.get('refrigerant_type')),
                'ahri': (r.get('ahri_reference_number') or '').strip() or None,
                'mostEff': (r.get('meets_most_efficient_criteria') or '').strip() == 'Yes',
                'available': iso(r.get('date_available_on_market')),
                'certified': iso(r.get('date_certified')),
            })
    return rows


def nrcan_like(r):
    """Meets the cold-climate thresholds NRCan publishes for its Eligible Product List, as far as ENERGY STAR
    data can show: COP of at least 1.8 at 5°F (-15°C), at least 70% of rated capacity there, a continuously
    variable compressor and SEER2 of at least 15.2. NRCan's HSPF2 (Region V) floor can't be checked from this
    data, so this is a pointer to models that are likely listed, not a substitute for NRCan's list."""
    return bool(r['cop5'] and r['cop5'] >= 1.8 and r['ret'] and r['ret'] >= 0.7
                and r['staging'] == 'Continuously variable' and (r['seer2'] or 0) >= 15.2)


def rank_key(r):
    """Cold-weather ranking: efficiency at 5°F first, then how much capacity it keeps, then HSPF2."""
    return (r['cop5'] or 0, min(r['ret'] or 0, 1.5), r['hspf2'] or 0)


def cool_key(r):
    return (r['seer2'] or 0, r['eer2'] or 0)


def model_view(r, brand_name=None, also=None):
    v = {
        'brand': brand_name or r['display'],
        'slug': r['slug'],
        'series': r['series'] or None,
        'outdoor': r['outdoor'],
        'indoor': r['indoor'] or r['furnace'] or None,
        'type': r['type'],
        'cap47': int(r['cap47']) if r['cap47'] else None,
        'cap5': int(r['cap5']) if r['cap5'] else None,
        'capCool': int(r['cool']) if r.get('cool') else None,
        'ret': r['ret'],
        'cop5': r['cop5'],
        'hspf2': r['hspf2'],
        'seer2': r['seer2'],
        'eer2': r['eer2'],
        'cold': r['cold'],
        'refrig': r['refrig'],
        'staging': r['staging'],
        'ahri': r['ahri'],
        'mostEff': r['mostEff'],
        'nrcanLike': nrcan_like(r),
        'alsoAs': also or [],
    }
    return v


def best_per_model(rows, key):
    best = {}
    for r in rows:
        k = (r['slug'] or r['display'], r['outdoor'])
        if k not in best or key(r) > key(best[k]):
            best[k] = r
    return list(best.values())


def plausible(r):
    """Leave out listings whose ratings can't be physically right, so a typo never tops a table."""
    if r['cop5'] is not None and not (1.0 <= r['cop5'] <= 4.5):
        return False
    if r['ret'] is not None and not (0.3 <= r['ret'] <= 1.6):
        return False
    if r['hspf2'] is not None and r['hspf2'] > 16:
        return False
    if r['seer2'] is not None and r['seer2'] > 40:
        return False
    return True


def signature(r):
    return (r['type'], r['cap47'], r['cap5'], r['cop5'], r['hspf2'], r['seer2'], r['eer2'])


def top(rows, key, n, per_family=None, a2l_only=False, family=lambda r: r['slug'] or r['partner']):
    """Best systems by key: one row per outdoor model, identical rebadged ratings folded into one row
    (the others listed in alsoAs), at most per_family rows per brand family."""
    cands = [r for r in best_per_model(rows, key) if plausible(r)]
    if a2l_only:
        cands = [r for r in cands if r['refrig'] in A2L]
    groups = collections.OrderedDict()
    pri = {s: i for i, s in enumerate(MAP.get('leadPriority', []))}
    cands.sort(key=lambda r: (pri.get(r['slug'], 999), r['display']))
    cands.sort(key=key, reverse=True)  # stable: equal ratings keep the priority order
    for r in cands:
        groups.setdefault(signature(r), []).append(r)
    picked, counts = [], collections.Counter()
    for sig, members in groups.items():
        lead = members[0]
        if key(lead)[0] <= 0:
            continue
        f = family(lead)
        if per_family and counts[f] >= per_family:
            continue
        counts[f] += 1
        also = []
        for m in members[1:]:
            label = MAP['pages'][m['slug']]['name'] if m['slug'] else m['display']
            lead_label = MAP['pages'][lead['slug']]['name'] if lead['slug'] else lead['display']
            if label != lead_label and label not in also:
                also.append(label)
        picked.append((lead, also[:8]))
        if len(picked) >= n:
            break
    return picked


def share(part, whole):
    return round(part / whole, 3) if whole else None


def mx(vals):
    vals = [v for v in vals if v is not None]
    return max(vals) if vals else None


def med(vals):
    vals = [v for v in vals if v is not None]
    return round(statistics.median(vals), 2) if vals else None


def refrig_mix(rows):
    by_model = {}
    for r in rows:
        by_model.setdefault((r['slug'] or r['display'], r['outdoor']), r['refrig'])
    c = collections.Counter(by_model.values())
    total = sum(c.values())
    return {k: c.get(k, 0) for k in ('R-454B', 'R-32', 'R-410A', 'other', 'unknown')} | {'models': total}


def brand_stats(rows, name):
    ok = [r for r in rows if plausible(r)]
    types = collections.defaultdict(list)
    for r in rows:
        types['ducted' if r['type'] in ('ducted', 'packaged') else 'ductless'].append(r)
    out = {
        'systems': len(rows),
        'outdoorModels': len({r['outdoor'] for r in rows}),
        'byType': {t: {'systems': len(v), 'outdoorModels': len({r['outdoor'] for r in v})} for t, v in types.items()},
        'coldSystems': sum(r['cold'] for r in rows),
        'coldShare': share(sum(r['cold'] for r in rows), len(rows)),
        'coldOutdoorModels': len({r['outdoor'] for r in rows if r['cold']}),
        'nrcanLikeOutdoorModels': len({r['outdoor'] for r in rows if nrcan_like(r)}),
        'variableOutdoorModels': len({r['outdoor'] for r in rows if r['staging'] == 'Continuously variable'}),
        'bestCop5': mx(r['cop5'] for r in ok),
        'medianCop5Cold': med(r['cop5'] for r in ok if r['cold']),
        'bestRet5': mx(min(r['ret'], 1.5) if r['ret'] else None for r in ok),
        'bestHspf2': mx(r['hspf2'] for r in ok),
        'medianHspf2': med(r['hspf2'] for r in ok),
        'bestSeer2': mx(r['seer2'] for r in ok),
        'bestEer2': mx(r['eer2'] for r in ok),
        'mostEfficientSystems': sum(r['mostEff'] for r in rows),
        'refrigerants': refrig_mix(rows),
        'latestCertified': mx(r['certified'] for r in rows),
        'partners': sorted({r['partner'] for r in rows}),
        'names': sorted({r['display'] for r in rows}),
        'a2lOutdoorModels': len({r['outdoor'] for r in rows if r['refrig'] in A2L}),
        'top': {},
        'topA2L': {},
        'topCooling': [model_view(r, name, also) for r, also in (top(rows, cool_key, 4, a2l_only=True) or top(rows, cool_key, 4))],
    }
    for t, v in types.items():
        picks = top(v, rank_key, 6, a2l_only=True)
        out['topA2L'][t] = bool(picks)
        if not picks:
            picks = top(v, rank_key, 6)
        out['top'][t] = [model_view(r, name, also) for r, also in picks]
    return out


def market(rows, mk):
    mrows = [r for r in rows if mk in r['mk']]
    page_rows = collections.defaultdict(list)
    dir_rows = collections.defaultdict(list)
    for r in mrows:
        if r['slug']:
            page_rows[r['slug']].append(r)
        dir_rows[(r['display'], r['slug'])].append(r)

    brands = {slug: brand_stats(v, MAP['pages'][slug]['name']) for slug, v in page_rows.items()}

    directory = []
    for (display, slug), v in dir_rows.items():
        types = sorted({'ducted' if r['type'] in ('ducted', 'packaged') else 'ductless' for r in v})
        directory.append({
            'name': display,
            'page': slug,
            'company': '; '.join(sorted({r['partner'] for r in v})),
            'systems': len(v),
            'outdoorModels': len({r['outdoor'] for r in v}),
            'coldShare': share(sum(r['cold'] for r in v), len(v)),
            'coldOutdoorModels': len({r['outdoor'] for r in v if r['cold']}),
            'nrcanLikeOutdoorModels': len({r['outdoor'] for r in v if nrcan_like(r)}),
            'bestCop5': mx(r['cop5'] for r in v if plausible(r)),
            'bestHspf2': mx(r['hspf2'] for r in v if plausible(r)),
            'bestSeer2': mx(r['seer2'] for r in v if plausible(r)),
            'types': types,
        })
    directory.sort(key=lambda d: (-d['outdoorModels'], d['name'].lower()))

    def pool(pred):
        return [r for r in mrows if pred(r)]

    ducted = lambda r: r['type'] in ('ducted', 'packaged') and (r['cap47'] or 0) >= 24000
    ductless = lambda r: r['type'] == 'ductless'
    name_of = lambda r: MAP['pages'][r['slug']]['name'] if r['slug'] else r['display']
    def lead(pred, key, n):
        return [model_view(r, name_of(r), also) for r, also in top(pool(pred), key, n, per_family=2, a2l_only=True)]

    leaders = {
        'coldDucted': lead(lambda r: ducted(r) and r['cold'], rank_key, 12),
        'coldDuctless': lead(lambda r: ductless(r) and r['cold'], rank_key, 12),
        'coolDucted': lead(ducted, cool_key, 10),
        'coolDuctless': lead(ductless, cool_key, 10),
    }

    totals = {
        'systems': len(mrows),
        'outdoorModels': len({(r['slug'] or r['display'], r['outdoor']) for r in mrows}),
        'brands': len(directory),
        'brandPages': len(brands),
        'companies': len({r['partner'] for r in mrows}),
        'coldShare': share(sum(r['cold'] for r in mrows), len(mrows)),
        'ductlessSystems': sum(r['type'] == 'ductless' for r in mrows),
        'ductedSystems': sum(r['type'] in ('ducted', 'packaged') for r in mrows),
        'refrigerants': refrig_mix(mrows),
        'a2lShare': share(sum(1 for r in mrows if r['refrig'] in A2L), len(mrows)),
        'mostEfficientShare': share(sum(r['mostEff'] for r in mrows), len(mrows)),
        'coldOutdoorModels': len({(r['slug'] or r['display'], r['outdoor']) for r in mrows if r['cold']}),
        'nrcanLikeOutdoorModels': len({(r['slug'] or r['display'], r['outdoor']) for r in mrows if nrcan_like(r)}),
    }
    return {'totals': totals, 'brands': brands, 'directory': directory, 'leaders': leaders}


def main():
    csv_path, meta_path = sys.argv[1], sys.argv[2]
    rows = load(csv_path)
    meta = json.load(open(meta_path))
    updated = datetime.datetime.fromtimestamp(int(meta['rowsUpdatedAt']), datetime.timezone.utc).date().isoformat()
    out = {
        'meta': {
            'name': meta.get('name', 'ENERGY STAR Certified Heat Pumps'),
            'dataset': 'https://data.energystar.gov/d/83eb-xbyy',
            'rows': len(rows),
            'datasetUpdated': updated,
            'pulled': datetime.date.today().isoformat(),
            'note': 'One row per certified outdoor/indoor combination. Markets says whether a combination is certified for Canada, the US or both. Heating capacity at 5°F is the maximum capacity; at 47°F it is the rated capacity.',
        },
        'markets': {mk: market(rows, mk) for mk in ('ca', 'us')},
    }
    with open(OUT, 'w') as fh:
        json.dump(out, fh, separators=(',', ':'), ensure_ascii=False)
    for mk in ('ca', 'us'):
        t = out['markets'][mk]['totals']
        print(mk, t['systems'], 'systems,', t['brands'], 'brands,', t['brandPages'], 'brand pages, cold share', t['coldShare'])
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
