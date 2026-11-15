"""What a page-per-place set says that is its own. Not part of the build.

For a grid /<prefix>/<kind>/<place>/ (services x cities, calculators x cities) or /<prefix>/<place>/ (depth 1):
  - words that change with the place: sentences (place name blanked, numbers kept) that are NOT on 90%+ of that kind's pages;
  - the distinct numbers in those sentences;
  - with --pair: the three-way split per kind: same on every city / the city's shared block (also on that city's other
    kinds) / only this kind in this city. The last column is the plan's "words only that page has"; the gate proposed in
    the plan asks for 150.

    python3 tools/thin/local.py dist-ca services
    python3 tools/thin/local.py dist-ca services --pair
    python3 tools/thin/local.py dist-ca calculators --pair
    python3 tools/thin/local.py dist-bu commercial-energy-audit 1
    python3 tools/thin/local.py dist-ca cities 1"""
import sys, os, re, collections, statistics
sys.path.insert(0, os.path.dirname(__file__))
from audit import Main, sentences, strip_acc, PROVS
def nm(s, names):
    t=strip_acc(s).lower()
    for n in names:
        if n and len(n)>2: t=t.replace(n,'@')
    return re.sub(r'\s+',' ',t)
def load(dist, prefix, depth=2):
    out=collections.defaultdict(dict); base=os.path.join(dist,prefix.strip('/'))
    for root,_,files in os.walk(base):
        if 'index.html' not in files: continue
        rel=os.path.relpath(root,base).split(os.sep)
        if len(rel)!=depth: continue
        raw=open(os.path.join(root,'index.html'),encoding='utf-8',errors='ignore').read()
        p=Main(); p.feed(raw)
        if 'noindex' in p.meta_robots: continue
        place=rel[-1]; kind=rel[0] if depth==2 else prefix.strip('/')
        names={place.replace('-',' ')}
        out[kind][place]=[(nm(s,names), s) for s in sentences(''.join(p.out))]
    return out
def run(dist,prefix,depth=2):
    g=load(dist,prefix,depth); rows=[]
    for kind,pages in sorted(g.items()):
        n=len(pages); c=collections.Counter()
        for ss in pages.values(): c.update(set(m for m,_ in ss))
        vw=[]; vs=[]; nums=[]; tot=[]
        for place,ss in pages.items():
            var=[(m,s) for m,s in ss if c[m] < 0.9*n]
            w=sum(len(s.split()) for _,s in var); t=sum(len(s.split()) for _,s in ss) or 1
            vw.append(w); vs.append(w/t); tot.append(t)
            nums.append(len(set(re.findall(r'\d[\d,\.]*', ' '.join(s for _,s in var)))))
        rows.append((kind,n,int(statistics.median(tot)),int(statistics.median(vw)),statistics.median(vs)*100,int(statistics.median(nums)),min(vw)))
    print(f"{dist} /{prefix}/")
    print(f"  {'kind':30} {'pages':>5} {'words':>6} {'vary words':>10} {'vary %':>7} {'local numbers':>13} {'min vary':>8}")
    for r in sorted(rows,key=lambda r:-r[3]): print(f"  {r[0][:30]:30} {r[1]:5d} {r[2]:6d} {r[3]:10d} {r[4]:6.0f}% {r[5]:13d} {r[6]:8d}")

def pair(dist, prefix, floor=150):
    g = load(dist, prefix); kinds = sorted(g)
    kc = {k: collections.Counter() for k in kinds}; pc = collections.defaultdict(collections.Counter)
    for k in kinds:
        for place, ss in g[k].items():
            u = set(m for m, _ in ss); kc[k].update(u); pc[place].update(u)
    print(f"{dist} /{prefix}/  (words per page, medians)")
    print(f"  {'kind':30} {'total':>6} {'same on every city':>18} {'city block':>10} {'only this page':>14}")
    alls = []
    for k in kinds:
        n = len(g[k]); a = []; b = []; c = []; t = []
        for place, ss in g[k].items():
            A = B = C = 0
            for m, s in ss:
                w = len(s.split())
                if kc[k][m] >= 0.9 * n: A += w
                elif pc[place][m] >= 2: B += w
                else: C += w
            a.append(A); b.append(B); c.append(C); t.append(A + B + C)
        alls += c
        print(f"  {k[:30]:30} {int(statistics.median(t)):6d} {int(statistics.median(a)):18d} {int(statistics.median(b)):10d} {int(statistics.median(c)):14d}")
    print(f"  all pages: median {int(statistics.median(alls))} words only on that page | under {floor}: {sum(1 for x in alls if x < floor)} of {len(alls)}")

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--pair']
    if '--pair' in sys.argv: pair(args[0], args[1])
    else: run(args[0], args[1], int(args[2]) if len(args) > 2 else 2)
