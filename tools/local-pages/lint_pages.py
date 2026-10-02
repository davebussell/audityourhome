import json, re, html, glob, collections, sys, os
def txt(h):
    h = re.sub(r'</(p|li|ul|ol|h\d)>|<br\s*/?>', ' ', h)  # block ends become spaces
    return html.unescape(re.sub(r'<[^>]+>', '', h))
pats = {
 'ellipsis': r'…',
 'raw url in text': r'https?://',
 'none-ish': r'\bIn None\b|\bNone,|: None\b|\bnan\b|\bn/a\b|\bundefined\b',
 'one plural': r'\b1 (organizations|programs|homes|houses|incentives|rules|cities|services|kits)\b',
 'lowercase sentence start': r'(?<!\b[A-Z])(?<!\bSt)(?<!\bMt)(?<!\bNo)[.!?] (?!e\.g|i\.e|a\.m|p\.m)[a-z]{2,}',
 'double space': r'\S  +\S',
 'space before punct': r'\w [,;:.](?:\s|$)',
 'empty parens': r'\(\s*\)',
 'duplicate word': r'\b(\w{3,}) \1\b',
 'missing space': r'[a-z][.,;][A-Z][a-z]',
}
hits = collections.defaultdict(list)
for f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'data', 'local', 'cities', '*.json'))):
    d = json.load(open(f))
    for svc, p in d['pages'].items():
        chunks = [('title', p['title']), ('description', p['description']), ('lede', p['lede'])]
        chunks += [('glance', f"{g['k']}: {g['v']}" + (f" ({g['sub']})" if g.get('sub') else '')) for g in p['glance']]
        chunks += [('section:' + s['h2'], txt(s['html'])) for s in p['sections']]
        chunks += [('faq', f['q'] + ' ' + f['a']) for f in p['faq']]
        if p.get('providers'):
            chunks.append(('prov', (p['providers'].get('special') or '') + ' ' + p['providers']['note']))
        if p.get('programs'):
            chunks += [('prog', i['summary']) for i in p['programs']['items']]
        for where, t in chunks:
            for name, pat in pats.items():
                for m in re.finditer(pat, t):
                    hits[name].append((d['slug'], svc, where, t[max(0, m.start()-70): m.end()+50]))
    hub = d['hub']
    for k in ('lede','climate','housing','heating','radon','description'):
        t = hub.get(k) or ''
        for name, pat in pats.items():
            for m in re.finditer(pat, t):
                hits[name].append((d['slug'], 'HUB', k, t[max(0,m.start()-70):m.end()+50]))
for name, lst in hits.items():
    uniq = collections.OrderedDict()
    for slug, svc, where, ctx in lst:
        key = (svc, where.split(':')[0], re.sub(r'[\d,.%$−-]+', '#', ctx[:100]))
        uniq.setdefault(key, (slug, svc, where, ctx))
    print(f'=== {name}: {len(lst)} hits, {len(uniq)} distinct')
    for v in list(uniq.values())[:int(sys.argv[1]) if len(sys.argv) > 1 else 15]:
        print('   ', v[0], '|', v[1], '|', v[2][:40], '|', v[3].replace('\n', ' '))
