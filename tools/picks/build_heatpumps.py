"""Heat pump top picks: three slots (best performance, best do-it-yourself, best value) for every climate zone and
three situations (a house with ducts, a house without ducts, one room), on both sites.

Inputs (all already in the repo, researched October 19, 2026):
  src/data/heatpumps/estar.json    ENERGY STAR certified heat pumps: the top certified systems per brand and type,
                                   plus the leaderboards (built by tools/heatpumps/build_estar.py)
  src/data/heatpumps/brands.json   where each brand is sold, its warranty in each country, price tier, DIY terms
  src/data/climate/{ca,us}.json    the climate zones (7 in Canada, 9 in the US) the sites already use
  tools/picks/heatpumps-overrides.json   editor's locks, exclusions, manual products (window units) and notes

Writes src/data/picks/heatpumps.json. Run it whenever one of the inputs changes:
  python3 tools/picks/build_heatpumps.py

How a pick is made (the How we pick page prints the same rules from the "method" block):
  1. Gates, pass or fail: the brand is sold in that country and we hold its warranty terms there; a current refrigerant
     (R-454B or R-32); a variable-speed compressor; in cold zones ENERGY STAR's cold-climate designation (and in Canada
     NRCan's rebate thresholds); in very cold zones at least 80% of rated output kept at -15 C (5 F).
  2. Score: each metric is scaled 0 to 1 across the systems that passed, then weighted by the zone's climate kind.
  3. Best performance = top score. Best value = top score among brands in the budget or mid price tier. Best
     do-it-yourself = the best system sold for owner installation with pre-charged lines (and, in the US, a window
     heat pump for one room). A runner-up from another brand backs up each pick.
"""
import datetime
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
P = lambda *a: os.path.join(ROOT, *a)
ESTAR = json.load(open(P('src', 'data', 'heatpumps', 'estar.json')))
BRANDS = json.load(open(P('src', 'data', 'heatpumps', 'brands.json')))['brands']
CLIMATE = {c: json.load(open(P('src', 'data', 'climate', f'{c}.json'))) for c in ('ca', 'us')}
OVR = json.load(open(P('tools', 'picks', 'heatpumps-overrides.json')))
OUT = P('src', 'data', 'picks', 'heatpumps.json')

A2L = ('R-454B', 'R-32')

# Each zone's climate kind decides the weights and the cold-climate gates.
KIND = {
    'ca': {
        'coastal-bc': 'mild', 'bc-southern-interior': 'cold', 'great-lakes-st-lawrence': 'cold', 'very-cold-east': 'very-cold',
        'prairies': 'very-cold', 'atlantic': 'cold', 'north': 'extreme',
    },
    'us': {
        'very-cold': 'very-cold', 'cold': 'cold', 'cold-dry': 'cold', 'mixed-humid': 'mixed', 'mixed-humid-warm': 'mixed-warm',
        'hot-humid': 'hot-humid', 'hot-dry': 'hot-dry', 'mild-coastal': 'mild', 'marine': 'mild',
    },
}
WEIGHTS = {
    'extreme': {'ret': 0.35, 'cop5': 0.30, 'hspf2': 0.15, 'warranty': 0.15, 'seer2': 0.05},
    'very-cold': {'ret': 0.35, 'cop5': 0.30, 'hspf2': 0.15, 'warranty': 0.15, 'seer2': 0.05},
    'cold': {'cop5': 0.30, 'ret': 0.25, 'hspf2': 0.20, 'warranty': 0.15, 'seer2': 0.10},
    'mixed': {'hspf2': 0.25, 'seer2': 0.20, 'eer2': 0.15, 'cop5': 0.15, 'warranty': 0.15, 'ret': 0.10},
    'mixed-warm': {'seer2': 0.25, 'hspf2': 0.20, 'eer2': 0.20, 'warranty': 0.15, 'cop5': 0.10, 'ret': 0.10},
    'hot-humid': {'seer2': 0.35, 'eer2': 0.30, 'warranty': 0.20, 'hspf2': 0.15},
    'hot-dry': {'eer2': 0.40, 'seer2': 0.30, 'warranty': 0.20, 'hspf2': 0.10},
    'mild': {'hspf2': 0.35, 'seer2': 0.25, 'warranty': 0.20, 'cop5': 0.10, 'ret': 0.10},
}
KIND_LABEL = {
    'extreme': 'extreme cold', 'very-cold': 'very cold winters', 'cold': 'cold winters', 'mixed': 'cold winters and hot summers',
    'mixed-warm': 'mild winters and hot summers', 'hot-humid': 'hot, humid summers', 'hot-dry': 'very hot, dry summers', 'mild': 'mild winters',
}
COLD_REQUIRED = {'extreme', 'very-cold', 'cold', 'mixed'}
RET_MIN = {'extreme': 0.85, 'very-cold': 0.80}
METRIC_LABEL = {
    'cop5': 'efficiency (COP) at -15 C / 5 F', 'ret': 'heat output kept at -15 C / 5 F', 'hspf2': 'seasonal heating efficiency (HSPF2)',
    'seer2': 'seasonal cooling efficiency (SEER2)', 'eer2': 'efficiency on the hottest days (EER2)', 'warranty': 'registered warranty length',
}
# The sizes we compare in each situation (rated cooling capacity, BTU/h): like with like.
SITUATIONS = {
    # nominal 2 to 4 tons (some 2-ton pairings rate a little under 24,000)
    'ducted': {'types': ('ducted',), 'cap': (22000, 48000), 'single': True},
    # one wall-mounted head big enough for a floor or an open main level: nominal 1 to 2 tons
    'ductless': {'types': ('ductless',), 'cap': (11000, 24000), 'single': True},
    # one room: nominal half a ton to 1 ton
    'room': {'types': ('ductless',), 'cap': (6000, 12500), 'single': True},
}


def warranty(slug, mk):
    w = ((BRANDS.get(slug) or {}).get('warranty') or {}).get(mk) or {}
    years = max(w.get('parts') or 0, w.get('compressor') or 0)
    return w, years


def rows_for(mk):
    """Every system we hold for a market (per-brand top lists, cooling tops and leaderboards), once each."""
    m = ESTAR['markets'][mk]
    rows = []
    for slug, b in m['brands'].items():
        for lst in (b.get('top') or {}).values():
            if isinstance(lst, list):
                rows += lst
        rows += b.get('topCooling') or []
    for lst in m['leaders'].values():
        rows += lst
    seen, out = set(), []
    for r in rows:
        key = (r['outdoor'], r.get('indoor'))
        if key in seen or not r.get('slug'):
            continue
        seen.add(key)
        out.append(r)
    return out


def gate(r, mk, kind, sit, why_not):
    """Pass/fail before any scoring. why_not collects the reason a row fails (for the build report)."""
    b = BRANDS.get(r['slug'])
    spec = SITUATIONS[sit]
    if r['type'] not in spec['types']:
        return False
    if spec['single'] and not r.get('indoor'):
        return False  # multi-zone outdoor units are not like-for-like with a single head
    cap = r.get('capCool') or 0
    if not (spec['cap'][0] <= cap <= spec['cap'][1]):
        return False
    if r['slug'] in OVR.get('exclude', {}).get(mk, []):
        why_not['excluded by editor'] = why_not.get('excluded by editor', 0) + 1
        return False
    if not b or b.get('soldIn', {}).get(mk) is not True:
        why_not['not confirmed on sale in this country'] = why_not.get('not confirmed on sale in this country', 0) + 1
        return False
    w, years = warranty(r['slug'], mk)
    if not years:
        why_not['no warranty terms on file for this country'] = why_not.get('no warranty terms on file for this country', 0) + 1
        return False
    if r.get('refrig') not in A2L:
        why_not['older refrigerant'] = why_not.get('older refrigerant', 0) + 1
        return False
    if 'variable' not in (r.get('staging') or '').lower():
        why_not['not variable-speed'] = why_not.get('not variable-speed', 0) + 1
        return False
    if kind in COLD_REQUIRED and not r.get('cold'):
        why_not['not cold-climate certified'] = why_not.get('not cold-climate certified', 0) + 1
        return False
    if mk == 'ca' and kind in COLD_REQUIRED and not r.get('nrcanLike'):
        why_not["below NRCan's rebate thresholds"] = why_not.get("below NRCan's rebate thresholds", 0) + 1
        return False
    if kind in RET_MIN and (r.get('ret') or 0) < RET_MIN[kind]:
        why_not['loses too much output in deep cold'] = why_not.get('loses too much output in deep cold', 0) + 1
        return False
    return True


def metric(r, k, mk):
    if k == 'warranty':
        return warranty(r['slug'], mk)[1] or None
    v = r.get(k)
    if v is None:
        return None
    if k == 'ret':
        return min(v, 1.2)  # small units can show odd ratios; past 120% it no longer separates systems
    return v


def score(pool, kind, mk):
    W = WEIGHTS[kind]
    lo, hi = {}, {}
    for k in W:
        vals = [metric(r, k, mk) for r in pool if metric(r, k, mk) is not None]
        lo[k], hi[k] = (min(vals), max(vals)) if vals else (0, 0)
    out = []
    for r in pool:
        s = 0.0
        for k, w in W.items():
            v = metric(r, k, mk)
            if v is None or hi[k] == lo[k]:
                s += w * (0.5 if v is not None else 0)
                continue
            s += w * (v - lo[k]) / (hi[k] - lo[k])
        out.append((round(s, 4), r))
    out.sort(key=lambda t: (-t[0], -(t[1].get('cop5') or 0), -(t[1].get('hspf2') or 0), t[1]['outdoor']))
    return out


def line_for(r):
    """The maker's product line this system belongs to (brands.json), for its name and cold-weather claim.
    A model code named in the line (e.g. "(KTAP1)", "(5TCV0)", "27VNA3") that appears in the outdoor model wins;
    otherwise the line that shares the most words with ENERGY STAR's series name."""
    import re
    b = BRANDS.get(r['slug']) or {}
    want = {'ducted': ('ducted', 'central'), 'ductless': ('ductless', 'mini-split', 'wall'), 'packaged': ('packaged',)}[r['type']]
    outdoor = (r.get('outdoor') or '').upper().replace('-', '')
    series = (r.get('series') or '').lower()
    lines = [l for l in (b.get('lines') or []) if any(w in (l.get('type') or '') for w in want)]
    for l in lines:
        codes = re.findall(r'\b([A-Z0-9]{4,}[A-Z0-9]*)\b', (l.get('name') or '').replace('-', ''))
        codes = [c for c in codes if any(ch.isdigit() for ch in c) and any(ch.isalpha() for ch in c)]
        if any(c in outdoor for c in codes):
            return l
    best = None
    for l in lines:
        if bool(l.get('coldClimate')) != bool(r.get('cold')):
            continue
        name = (l.get('name') or '').lower()
        tokens = [t for t in re.split(r'[^a-z0-9+]+', series) if len(t) > 2 and t not in ('series', 'heat', 'pump')]
        hit = sum(1 for t in tokens if t in name)
        if hit and (best is None or hit > best[0]):
            best = (hit, l)
    return best[1] if best else None


def tons(cap):
    return round((cap or 0) / 12000 * 2) / 2


def view(r, mk, kind, sc=None):
    b = BRANDS[r['slug']]
    w, years = warranty(r['slug'], mk)
    ln = line_for(r)
    v = {
        'brand': b['name'], 'slug': r['slug'], 'series': r.get('series'), 'line': (ln or {}).get('name'), 'claim': (ln or {}).get('claim') or None,
        'outdoor': r['outdoor'], 'indoor': r.get('indoor'), 'ahri': r.get('ahri'), 'type': r['type'],
        'capCool': r.get('capCool'), 'cap47': r.get('cap47'), 'cap5': r.get('cap5'), 'tons': tons(r.get('capCool')),
        'cop5': r.get('cop5'), 'ret': r.get('ret'), 'hspf2': r.get('hspf2'), 'seer2': r.get('seer2'), 'eer2': r.get('eer2'),
        'refrig': r.get('refrig'), 'staging': r.get('staging'), 'cold': bool(r.get('cold')), 'nrcanLike': bool(r.get('nrcanLike')),
        'mostEff': bool(r.get('mostEff')), 'priceTier': b.get('priceTier'), 'channel': b.get('channel'),
        'warranty': {'parts': w.get('parts'), 'compressor': w.get('compressor'), 'registrationRequired': w.get('registrationRequired'), 'years': years},
    }
    if sc is not None:
        v['score'] = sc
    return v


def pick_from(scored, exclude_brands=()):
    for sc, r in scored:
        if r['slug'] in exclude_brands:
            continue
        return sc, r
    return None


def diy_rows(mk, sit, kind):
    """Systems sold for owner installation: the DIY lines in overrides (pre-charged quick-connect lines)."""
    spec = SITUATIONS[sit]
    cfg = OVR['diy']
    out = []
    for r in rows_for(mk):
        if r['slug'] not in cfg['brands']:
            continue
        if not any(tag.lower() in (r.get('series') or '').lower() for tag in cfg['seriesContains']):
            continue
        if r['type'] not in spec['types'] or (spec['single'] and not r.get('indoor')):
            continue
        cap = r.get('capCool') or 0
        if not (spec['cap'][0] <= cap <= spec['cap'][1]):
            continue
        if r.get('refrig') not in A2L:
            continue
        if kind in COLD_REQUIRED and not r.get('cold'):
            continue
        out.append(r)
    return out


def build_market(mk):
    clim = CLIMATE[mk]
    zones = {}
    report = {}
    all_rows = rows_for(mk)
    for key, prof in clim['profiles'].items():
        kind = KIND[mk][key]
        z = {
            'key': key, 'label': prof.get('label'), 'oneLiner': prof.get('oneLiner'), 'kind': kind, 'kindLabel': KIND_LABEL[kind],
            'weights': WEIGHTS[kind], 'situations': {}, 'note': OVR.get('zoneNotes', {}).get(mk, {}).get(key),
        }
        for sit in SITUATIONS:
            why_not = {}
            pool = [r for r in all_rows if gate(r, mk, kind, sit, why_not)]
            scored = score(pool, kind, mk)
            s = {'eligible': len(pool), 'excludedReasons': why_not}
            perf = pick_from(scored)
            if perf:
                s['performance'] = view(perf[1], mk, kind, perf[0])
                ru = pick_from(scored, exclude_brands={perf[1]['slug']})
                if ru:
                    s['performance']['runnerUp'] = view(ru[1], mk, kind, ru[0])
            value_pool = [(sc, r) for sc, r in scored if (BRANDS[r['slug']].get('priceTier') in OVR['valueTiers'])]
            val = pick_from(value_pool)
            if val:
                s['value'] = view(val[1], mk, kind, val[0])
                ru = pick_from(value_pool, exclude_brands={val[1]['slug']})
                if ru:
                    s['value']['runnerUp'] = view(ru[1], mk, kind, ru[0])
            # do-it-yourself: the best owner-installable system that clears the climate's cold-climate gate
            dpool = diy_rows(mk, sit, kind)
            if dpool:
                dsc = score(dpool, kind, mk)
                d = view(dsc[0][1], mk, kind, dsc[0][0])
                # in very cold zones a DIY unit that keeps less than the zone's floor is a supplement, not the main heat
                d['supplementOnly'] = bool(kind in RET_MIN and (d['ret'] or 0) < RET_MIN[kind])
                alt = OVR.get('runnerUpManual', {}).get(f'{mk}/{sit}/diy')
                if alt:
                    d['runnerUpManual'] = alt
                s['diy'] = d
            else:
                s['diy'] = None
                s['diyReason'] = OVR['diyNone'].get(sit, OVR['diyNone']['default'])
            # editor locks
            lock = OVR.get('locks', {}).get(mk, {}).get(key, {}).get(sit, {})
            for slot, val_ in lock.items():
                s[slot] = val_
            z['situations'][sit] = s
            report[f'{mk}/{key}/{sit}'] = {
                'eligible': len(pool),
                'performance': s.get('performance', {}).get('brand'),
                'value': s.get('value', {}).get('brand'),
                'diy': (s.get('diy') or {}).get('brand'),
            }
        zones[key] = z
    return zones, report


def main():
    today = datetime.date.today().isoformat()
    out = {
        'checked': OVR.get('checked', today),
        'built': today,
        'dataAsOf': {'energyStar': ESTAR['meta']['pulled'], 'brands': json.load(open(P('src', 'data', 'heatpumps', 'brands.json')))['checked']},
        'method': {
            'slots': OVR['slots'], 'gates': OVR['gatesText'], 'weights': WEIGHTS, 'kindLabel': KIND_LABEL, 'metricLabel': METRIC_LABEL,
            'retMin': RET_MIN, 'coldRequired': sorted(COLD_REQUIRED), 'valueTiers': OVR['valueTiers'], 'situations': SITUATIONS,
        },
        'costs': OVR['costs'],
        'markets': {},
    }
    full = {}
    for mk in ('ca', 'us'):
        zones, report = build_market(mk)
        out['markets'][mk] = {'zones': zones, 'kinds': KIND[mk]}
        full.update(report)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    for k, v in full.items():
        print(f"{k:45s} eligible {v['eligible']:3d} | perf {v['performance']} | value {v['value']} | diy {v['diy']}")
    print('wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    sys.exit(main())
