#!/usr/bin/env python3
"""Turn Natural Earth (public domain) into compact label and border sets for God's Eye.

labels.json  {"p": places, "c": countries, "s": states, "k": peaks, "r": regions, "m": marine}
             each row: [name, lon, lat, minZoom, ...extra]
borders.json {"a": [[kind, delta-encoded coords...], ...]}  coords in 1/1000 degree
"""
import json, math, pathlib, sys
import os
# git clone --depth 1 https://github.com/nvkelso/natural-earth-vector, then point NE_DIR at its geojson folder
NE = pathlib.Path(os.environ.get('NE_DIR', 'natural-earth-vector/geojson'))
OUT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'data'
OUT.mkdir(parents=True, exist_ok=True)

def load(name):
    return json.load(open(NE / name))['features']

def r3(v):
    return round(float(v), 3)

def centroid(geom):
    """Area-weighted centroid of the largest polygon's outer ring."""
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    best, best_a = None, -1
    for poly in polys:
        ring = poly[0]; a = cx = cy = 0.0
        for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
            f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
        if abs(a) > best_a and a != 0:
            best_a, best = abs(a), (cx / (3 * a), cy / (3 * a))
    return best

def num(v, d=99.0):
    try:
        x = float(v)
        return d if math.isnan(x) else x
    except (TypeError, ValueError):
        return d

out = {}
# populated places: minZoom from Natural Earth, a population rank 0-9, and flags (1 national capital, 2 megacity)
P = []
for f in load('ne_10m_populated_places_simple.geojson'):
    p = f['properties']; name = p.get('name') or p.get('nameascii')
    if not name: continue
    pop = num(p.get('pop_max'), 0)
    rank = max(0, min(9, int(math.log10(pop)) if pop > 0 else 0))
    flags = (1 if num(p.get('adm0cap'), 0) >= 1 else 0) | (2 if num(p.get('megacity'), 0) >= 1 else 0)
    P.append([name, r3(p['longitude']), r3(p['latitude']), round(num(p.get('min_zoom'), 9), 1), rank, flags])
P.sort(key=lambda r: (r[3], -r[4]))
out['p'] = P

C = []
for f in load('ne_10m_admin_0_countries.geojson'):
    p = f['properties']; name = p.get('NAME_EN') or p.get('NAME')
    x, y = p.get('LABEL_X'), p.get('LABEL_Y')
    if not name or x is None: continue
    C.append([name, r3(x), r3(y), round(num(p.get('MIN_LABEL'), 4), 1), round(num(p.get('MAX_LABEL'), 10), 1)])
out['c'] = C

S = []
for f in load('ne_10m_admin_1_states_provinces.geojson'):
    p = f['properties']; name = p.get('name_en') or p.get('name')
    if not name or p.get('longitude') is None: continue
    mn = num(p.get('min_label'), 9)
    if mn > 8.5: continue
    S.append([name, r3(p['longitude']), r3(p['latitude']), round(mn, 1), round(num(p.get('max_label'), 11), 1)])
out['s'] = S

K = []
for f in load('ne_10m_geography_regions_elevation_points.geojson'):
    p = f['properties']; name = p.get('name_en') or p.get('name')
    if not name: continue
    K.append([name, r3(p['long_x']), r3(p['lat_y']), round(num(p.get('min_zoom'), 8), 1), int(num(p.get('elevation'), 0)), (p.get('featurecla') or '').lower()[:10]])
out['k'] = K

Rg = []
for f in load('ne_10m_geography_regions_polys.geojson'):
    p = f['properties']; name = p.get('NAME_EN') or p.get('NAME'); c = centroid(f['geometry']) if f.get('geometry') else None
    if not name or not c: continue
    Rg.append([name, r3(c[0]), r3(c[1]), round(num(p.get('MIN_LABEL'), 6), 1), (p.get('FEATURECLA') or '').lower()[:12]])
for f in load('ne_10m_geography_regions_points.geojson'):
    p = f['properties']; name = p.get('name_en') or p.get('name')
    if not name: continue
    Rg.append([name, r3(p['long_x']), r3(p['lat_y']), round(num(p.get('min_zoom'), 6), 1), (p.get('featurecla') or '').lower()[:12]])
out['r'] = Rg

M = []
for f in load('ne_10m_geography_marine_polys.geojson'):
    p = f['properties']; name = p.get('name_en') or p.get('name'); c = centroid(f['geometry']) if f.get('geometry') else None
    if not name or not c: continue
    M.append([name, r3(c[0]), r3(c[1]), round(num(p.get('min_label'), 4), 1), (p.get('featurecla') or '').lower()[:8]])
out['m'] = M

json.dump(out, open(OUT / 'labels.json', 'w'), separators=(',', ':'), ensure_ascii=False)

# borders: Douglas-Peucker simplify, then delta-encode in 1/1000 degree
def dp(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (x1, y1), (x2, y2) = pts[a], pts[b]; dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1e-12
        best, bi = 0, -1
        for i in range(a + 1, b):
            x0, y0 = pts[i]; d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / L
            if d > best: best, bi = d, i
        if best > tol: keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def lines(feats, kind_fn, tol):
    rows = []
    for f in feats:
        g = f['geometry']
        if not g: continue
        parts = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        kind = kind_fn(f['properties'])
        for part in parts:
            s = dp([(float(x), float(y)) for x, y in part], tol)
            if len(s) < 2: continue
            enc, px, py = [kind], 0, 0
            for x, y in s:
                ix, iy = round(x * 1000), round(y * 1000); enc += [ix - px, iy - py]; px, py = ix, iy
            rows.append(enc)
    return rows

def k0(p):
    c = (p.get('FEATURECLA') or p.get('featurecla') or '').lower()
    return 1 if ('disputed' in c or 'indefinite' in c or 'line of control' in c) else 0

B = lines(load('ne_10m_admin_0_boundary_lines_land.geojson'), k0, 0.006)
B += lines(load('ne_50m_admin_1_states_provinces_lines.geojson'), lambda p: 2, 0.01)
json.dump({'a': B}, open(OUT / 'borders.json', 'w'), separators=(',', ':'))
for n in ('labels.json', 'borders.json'):
    print(n, round((OUT / n).stat().st_size / 1024), 'KB')
print({k: len(v) for k, v in out.items()}, 'border lines', len(B), 'points', sum((len(r) - 1) // 2 for r in B))
