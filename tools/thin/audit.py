"""Thin-content and affiliate audit of a built site (dist-ca, dist-us, dist-bu). Not part of the build.

For every page type (URL template): pages, median words of main text, how much of each page is unique within its
type (as written, and with place names and numbers blanked), pages under 250 words, affiliate links and their rel.

    python3 tools/thin/audit.py dist-ca audityourhome.ca
    python3 tools/thin/audit.py dist-us audityourhome.com
    python3 tools/thin/audit.py dist-bu audityourbuilding.com

See the plan: "Keeping the audit sites clear of thin-content and affiliate problems" (CLAUDE.md has the link)."""
import sys, re, os, json, html, unicodedata, statistics, collections
from html.parser import HTMLParser

BLOCK = {'p','li','td','th','h1','h2','h3','h4','h5','summary','dd','dt','figcaption','caption','blockquote','div','section','article','tr','br','details','label','option'}
SKIP = {'script','style','nav','header','footer','svg','noscript','form','select','template'}
PROVS = ['british columbia','alberta','saskatchewan','manitoba','ontario','quebec','new brunswick','nova scotia','prince edward island','newfoundland and labrador','newfoundland','yukon','northwest territories','nunavut']

def strip_acc(s): return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))

class Main(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.out=[]; self.skip=0; self.inmain=0; self.links=[]; self.meta_robots=''; self.cur=None
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='meta' and (a.get('name') or '').lower()=='robots': self.meta_robots=(a.get('content') or '').lower()
        if tag=='main': self.inmain+=1
        if tag in SKIP: self.skip+=1
        if tag in BLOCK: self.out.append('\n')
        if tag=='a' and a.get('href'): self.links.append((a.get('href'), (a.get('rel') or ''), self.inmain>0))
    def handle_endtag(self, tag):
        if tag=='main': self.inmain=max(0,self.inmain-1)
        if tag in SKIP: self.skip=max(0,self.skip-1)
        if tag in BLOCK: self.out.append('\n')
    def handle_data(self, d):
        if self.inmain and not self.skip: self.out.append(d)

def sentences(text):
    out=[]
    for line in text.split('\n'):
        line=' '.join(line.split())
        if not line: continue
        for s in re.split(r'(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9“"(])', line):
            s=s.strip()
            if len(s.split())>=4: out.append(s)
    return out

def tkey(path):
    seg=[x for x in path.strip('/').split('/') if x]
    if not seg: return '/'
    if len(seg)==1: return f'/{seg[0]}/'
    if seg[0]=='fr': return '/fr/'+('*/'*(len(seg)-1)) if len(seg)>2 else f'/fr/{seg[1]}/' if len(seg)==2 else '/fr/'
    return f'/{seg[0]}/'+'*/'*(len(seg)-1)

def mask(s, names):
    t=strip_acc(s).lower()
    for n in names:
        if n and len(n)>2: t=t.replace(n,'@')
    for p in PROVS: t=t.replace(p,'@')
    t=re.sub(r'[\$−-]?\d[\d,\.]*','#',t)
    return re.sub(r'\s+',' ',t)

def run(dist, domain, out=None):
    pages=[]
    for root,_,files in os.walk(dist):
        if 'index.html' not in files: continue
        path='/'+os.path.relpath(root,dist).replace(os.sep,'/')+'/'
        if path=='/./': path='/'
        raw=open(os.path.join(root,'index.html'),encoding='utf-8',errors='ignore').read()
        if 'http-equiv="refresh"' in raw[:2000].lower(): continue
        p=Main(); p.feed(raw)
        text=''.join(p.out)
        sents=sentences(text)
        seg=[x for x in path.strip('/').split('/') if x]
        names=set()
        for sg in seg[-2:]:
            names.add(sg.replace('-',' '))
        aff=[(h,r) for h,r,inm in p.links if re.search(r'amazon\.|amzn\.to|[?&]tag=|awin|flexoffers|shareasale|bookshop\.org', h)]
        ext=[(h,r) for h,r,inm in p.links if inm and re.match(r'https?://', h) and domain not in h]
        pages.append(dict(path=path,key=tkey(path),noindex='noindex' in p.meta_robots,sents=sents,names=names,words=sum(len(s.split()) for s in sents),aff=aff,ext=ext))
    idx=[p for p in pages if not p['noindex']]
    groups=collections.defaultdict(list)
    for p in idx: groups[p['key']].append(p)
    rows=[]
    for k,g in groups.items():
        n=len(g)
        rawc=collections.Counter(); mc=collections.Counter()
        for p in g:
            p['_raw']=set(s.lower() for s in p['sents']); p['_m']=set(mask(s,p['names']) for s in p['sents'])
            rawc.update(p['_raw']); mc.update(p['_m'])
        ur=[]; um=[]; uw=[]
        for p in g:
            if not p['words']: ur.append(0); um.append(0); uw.append(0); continue
            w_raw=sum(len(s.split()) for s in p['sents'] if rawc[s.lower()]==1)
            w_m=sum(len(s.split()) for s in p['sents'] if mc[mask(s,p['names'])]==1)
            ur.append(w_raw/p['words']); um.append(w_m/p['words']); uw.append(w_m)
            p['uniq_m']=w_m/p['words']; p['uniq_words']=w_m
        rows.append(dict(key=k,pages=n,words=int(statistics.median([p['words'] for p in g])),minwords=min(p['words'] for p in g),
                         uniq_raw=statistics.median(ur) if n>1 else None,uniq_mask=statistics.median(um) if n>1 else None,uniq_words=int(statistics.median(uw)) if n>1 else None,
                         aff_pages=sum(1 for p in g if p['aff']),aff_links=sum(len(p['aff']) for p in g)))
    rows.sort(key=lambda r:-r['pages'])
    total=len(idx)
    print(f"\n===== {domain}: {len(pages)} pages, {total} indexable, {len(pages)-total} noindex")
    print(f"{'template':34} {'pages':>5} {'share':>6} {'med words':>9} {'min':>5} {'uniq raw':>8} {'uniq masked':>11} {'uniq words':>10} {'aff pages':>9}")
    for r in rows:
        if r['pages']<3 and r['aff_pages']==0: continue
        f=lambda x: '   —' if x is None else f"{x*100:5.0f}%"
        print(f"{r['key'][:34]:34} {r['pages']:5d} {r['pages']/total*100:5.1f}% {r['words']:9d} {r['minwords']:5d} {f(r['uniq_raw']):>8} {f(r['uniq_mask']):>11} {str(r['uniq_words'] if r['uniq_words'] is not None else '—'):>10} {r['aff_pages']:9d}")
    small=[r for r in rows if r['pages']<3]
    print(f"(+ {sum(r['pages'] for r in small)} pages in {len(small)} one-off templates)")
    affp=[p for p in idx if p['aff']]
    rels=collections.Counter()
    for p in affp:
        for h,r in p['aff']: rels[r or '(none)']+=1
    print(f"affiliate: {len(affp)} of {total} indexable pages carry {sum(len(p['aff']) for p in affp)} affiliate links; rel values: {dict(rels)}")
    print('  pages:', sorted(collections.Counter(p['key'] for p in affp).items(), key=lambda x:-x[1])[:12])
    thin=[p for p in idx if p['words']<250]
    print(f"pages under 250 words of main text: {len(thin)}", [p['path'] for p in thin[:14]])
    if out:
        json.dump([dict(path=p['path'],key=p['key'],words=p['words'],uniq=p.get('uniq_m'),uniq_words=p.get('uniq_words'),aff=len(p['aff'])) for p in idx], open(out,'w'))
    return rows,total

if __name__=='__main__':
    run(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)   # optional third argument: write per-page JSON there
