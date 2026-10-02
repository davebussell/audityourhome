import json, sys, concurrent.futures as cf, requests
import os
HERE = os.path.dirname(os.path.abspath(__file__))
urls = list(json.load(open(os.path.join(HERE, 'ext_urls.json'))).keys())
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
     'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-CA,en;q=0.9'}
def check(u):
    try:
        r = requests.get(u, headers=H, timeout=25, allow_redirects=True, stream=True)
        code = r.status_code
        final = r.url
        r.close()
        return u, code, final
    except Exception as e:
        return u, 'ERR ' + type(e).__name__, ''
out = {}
with cf.ThreadPoolExecutor(16) as ex:
    for u, code, final in ex.map(check, urls):
        out[u] = [code, final]
json.dump(out, open(os.path.join(HERE, 'url_status.json'), 'w'), indent=1)
bad = {u: v for u, v in out.items() if not (isinstance(v[0], int) and v[0] < 400)}
print('checked', len(out), 'not-ok', len(bad))
for u, v in sorted(bad.items(), key=lambda kv: str(kv[1][0])):
    print(v[0], u)
