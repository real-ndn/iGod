#!/usr/bin/env python3
"""Refresh God's Eye live data for GitHub Pages (runs hourly in GitHub Actions).

Writes into <site>/data/:
  tle-<group>.txt   satellite orbits from CelesTrak (refreshed at most every 6 hours, as CelesTrak asks)
  firms.json        NASA FIRMS VIIRS (NOAA-20) wildfire hotspots, last 24 h; needs the FIRMS_MAP_KEY secret
  status.json       what was refreshed and when

Serving these from the same origin as the app sidesteps browser cross-origin limits on those services.
"""
import csv, io, json, os, sys, time, pathlib, urllib.request
from datetime import datetime, timezone

SITE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'site')
DATA = SITE / 'data'; DATA.mkdir(parents=True, exist_ok=True)
PAGES = (os.environ.get('PAGES_URL') or '').rstrip('/')
UA = {'User-Agent': "GodsEye/1.0 (GitHub Pages hourly refresh)"}
now = datetime.now(timezone.utc)

def get(url, timeout=90):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()

prev = {}
if PAGES:
    try: prev = json.loads(get(f'{PAGES}/data/status.json', 20))
    except Exception: prev = {}
status = {'updated': now.isoformat(timespec='seconds'), 'tle': {}, 'firms': None}

for g in ['stations', 'visual', 'gps-ops', 'starlink']:
    old = (prev.get('tle') or {}).get(g) or {}
    fresh = old.get('t') and (now - datetime.fromisoformat(old['t'])).total_seconds() < 6 * 3600
    try:
        if fresh and PAGES:
            txt = get(f'{PAGES}/data/tle-{g}.txt').decode(); status['tle'][g] = old
        else:
            txt = get(f'https://celestrak.org/NORAD/elements/gp.php?GROUP={g}&FORMAT=tle').decode()
            status['tle'][g] = {'t': now.isoformat(timespec='seconds'), 'n': txt.count('\n1 ') + txt.startswith('1 ')}
        if '\n1 ' in txt:
            (DATA / f'tle-{g}.txt').write_text(txt)
    except Exception as e:
        status['tle'][g] = {'error': str(e)[:200]}
    time.sleep(1)

key = os.environ.get('FIRMS_MAP_KEY', '').strip()
if key:
    try:
        raw = get(f'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_NOAA20_NRT/world/1', 180).decode()
        rows = []
        for r in csv.DictReader(io.StringIO(raw)):
            conf = (r.get('confidence') or '').lower()
            c = 2 if conf.startswith('h') else 0 if conf.startswith('l') else 1
            if c == 0: continue
            try:
                rows.append([round(float(r['latitude']), 4), round(float(r['longitude']), 4), round(float(r.get('frp') or 0), 1), c,
                             f"{r['acq_date']} {str(r['acq_time']).zfill(4)}", r.get('daynight', ''), round(float(r.get('bright_ti4') or 0), 1)])
            except (KeyError, ValueError):
                continue
        rows.sort(key=lambda x: -x[2]); rows = rows[:60000]
        (DATA / 'firms.json').write_text(json.dumps({'updated': now.isoformat(timespec='seconds'), 'source': 'NASA FIRMS VIIRS_NOAA20_NRT', 'rows': rows}, separators=(',', ':')))
        status['firms'] = {'t': now.isoformat(timespec='seconds'), 'n': len(rows)}
    except Exception as e:
        status['firms'] = {'error': str(e)[:200]}

(DATA / 'status.json').write_text(json.dumps(status, indent=1))
print(json.dumps(status, indent=1))
