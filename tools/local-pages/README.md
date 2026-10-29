# Local service pages generator

Builds the data behind `/services/<service>/<city>/`, `/services/<service>/` and `/cities/<city>/`
(70 cities × 16 services) into `src/data/local/`.

```
python3 tools/local-pages/gen_pages.py     # out/cities.json + research/*.json  →  src/data/local/
python3 tools/local-pages/lint_pages.py    # scan every generated page for text defects
```

- `cities_master.py` — the 70 cities (2021 Census DGUIDs, FSAs).
- `build_data.py` — rebuilds `out/cities.json` from the raw public datasets. The raw files are not
  committed (the Census dwelling table alone is a 1.6 GB download); put them in `tools/local-pages/data/`:
  GeoNames `CA.txt`, NRCan HOT2000 climate stations (`hot2000g.json`), Statistics Canada tables
  98-10-0002-01, 98-10-0233-01 and 38-10-0286-01, and NRCan's service-organization list.
- `research/*.json` — provincial rules, radon, wells, utilities, municipal and commercial programs,
  each with its sources (checked September 28, 2026).
- `gen_pages.py` — all page text. Province-level facts live in the `PT` dict with their source URLs.

Everything in these pages is checked against the linked sources; re-verify before changing a number.
