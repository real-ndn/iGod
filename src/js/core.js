// ───────────────────────── God's Eye · core ─────────────────────────
// Config, storage, events, formatting, sun astronomy. Everything hangs off window.GE.
const GE = (window.GE = window.GE || {});

GE.CFG = {
  home: { name: 'Old Town Cottonwood', sub: 'Verde Valley, Arizona', lon: -112.0233, lat: 34.7487 },
  url: {
    esri: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    places: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    roads: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    gibs: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level{lvl}/{z}/{y}/{x}.{ext}',
    terrarium: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    photon: 'https://photon.komoot.io/api/',
    photonRev: 'https://photon.komoot.io/reverse',
    quakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
    events: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=45',
    celestrak: 'https://celestrak.org/NORAD/elements/gp.php?GROUP={g}&FORMAT=tle',
    iss: 'https://api.wheretheiss.at/v1/satellites/25544',
    adsb: 'https://api.adsb.lol/v2/point/{lat}/{lon}/{r}',
    osrm: 'https://router.project-osrm.org/route/v1/driving/{a};{b}?overview=full&geometries=geojson',
    satjs: 'https://cdn.jsdelivr.net/npm/satellite.js@7.1.0/+esm',
    wayback: 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json',
    waybackMap: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap/{rel}/{z}/{y}/{x}',
    firms: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_NOAA20_NRT/world/1',
    mapillary: 'https://graph.mapillary.com/images',
    mapillaryJs: 'https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.js',
    mapillaryCss: 'https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.css',
    claude: 'https://api.anthropic.com/v1/messages',
  },
};

// Hero places: instant search hits and the cinematic tour.
GE.PLACES = [
  { name: 'Old Town Cottonwood', sub: 'Verde Valley, Arizona', lon: -112.0233, lat: 34.7487, v: [35, -26, 1700], line: 'Home. Old Town Cottonwood, where the Verde River runs through red-rock country.' },
  { name: 'Jerome', sub: 'Cleopatra Hill, Arizona', lon: -112.1138, lat: 34.7489, v: [250, -22, 1600], line: 'Jerome. A copper town hanging off Cleopatra Hill, a mile above the valley floor.' },
  { name: 'Cathedral Rock', sub: 'Sedona, Arizona', lon: -111.7932, lat: 34.82, v: [20, -16, 2300], line: 'Cathedral Rock. Sedona sandstone at its most theatrical.' },
  { name: 'Grand Canyon', sub: 'Mather Point, Arizona', lon: -112.1078, lat: 36.0617, v: [0, -20, 9000], line: 'The Grand Canyon. A mile deep, and two billion years of rock on the walls.' },
  { name: 'Horseshoe Bend', sub: 'Page, Arizona', lon: -111.5104, lat: 36.8791, v: [200, -40, 1900], line: 'Horseshoe Bend, where the Colorado River turns back on itself.' },
  { name: 'Monument Valley', sub: 'Navajo Nation', lon: -110.101, lat: 36.9845, v: [300, -14, 7500], line: 'Monument Valley. The buttes everyone has seen in a western.' },
  { name: 'Mount Everest', sub: 'Nepal and China', lon: 86.925, lat: 27.9881, v: [200, -16, 17000], line: 'Everest. Eight thousand eight hundred and forty-nine meters, the top of the world.' },
  { name: 'Matterhorn', sub: 'Switzerland and Italy', lon: 7.6586, lat: 45.9763, v: [230, -14, 7000], line: 'The Matterhorn, carved into a pyramid by four glaciers.' },
  { name: 'Manhattan', sub: 'New York City', lon: -73.9855, lat: 40.758, v: [30, -28, 5200], line: 'Manhattan. Eight million people on a granite island.' },
  { name: 'Tokyo', sub: 'Japan', lon: 139.7454, lat: 35.6586, v: [330, -30, 9000], line: 'Tokyo, the largest city on Earth.' },
];
GE.TOUR = ['Old Town Cottonwood', 'Jerome', 'Cathedral Rock', 'Grand Canyon', 'Horseshoe Bend', 'Mount Everest', 'Matterhorn', 'Manhattan'];

// ── storage (wrapped: private windows and blocked storage must never break the app)
GE.store = {
  get(k, d) { try { const v = localStorage.getItem('ge.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ge.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('ge.' + k); } catch {} },
};
GE.keys = Object.assign({ ion: '', google: '', anthropic: '', model: 'claude-haiku-5-5', firms: '', mapillary: '' }, GE.store.get('keys', {}));
GE.prefs = Object.assign({
  mode: 'user', base: 'satellite', detail: 'ultra', units: 'metric', voice: true,
  labels: true, roads: true, terrain: true, relief: 1, lights: true, sunEverywhere: false, shadows: false, buildings: false,
  borders: true, sats: false, starlink: false, flights: false, quakes: true, events: false, fires: false, vision: 'normal',
}, GE.store.get('prefs', {}));
GE.savePrefs = () => GE.store.set('prefs', GE.prefs);
const home = GE.store.get('home', null); if (home) GE.CFG.home = home;

// ── tiny event bus
GE.bus = new EventTarget();
GE.on = (t, f) => GE.bus.addEventListener(t, (e) => f(e.detail));
GE.emit = (t, d) => GE.bus.dispatchEvent(new CustomEvent(t, { detail: d }));

// ── helpers
GE.$ = (id) => document.getElementById(id);
GE.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
GE.lerp = (a, b, t) => a + (b - a) * t;
// device class: phone, tablet (iPad, including iPadOS reporting itself as a Mac), or desktop
GE.device = (() => {
  const ipad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const coarse = matchMedia('(pointer: coarse)').matches, short = Math.min(screen.width, screen.height);
  if (ipad || (coarse && short >= 700)) return 'tablet';
  return coarse || innerWidth < 760 ? 'phone' : 'desktop';
})();
GE.isMobile = GE.device === 'phone'; GE.isTablet = GE.device === 'tablet';
document.documentElement.classList.add(GE.device);
GE.debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
GE.fill = (tpl, o) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
GE.fetchJSON = async (url, opt = {}) => {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opt.timeout || 12000);
  try { const r = await fetch(url, { ...opt, signal: opt.signal || ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return opt.text ? await r.text() : await r.json(); }
  finally { clearTimeout(t); }
};
let toastT;
GE.toast = (msg, ms = 3800) => { const el = GE.$('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); };
GE.copy = async (text, ok = 'Copied') => { try { await navigator.clipboard.writeText(text); GE.toast(ok); } catch { GE.toast(text, 6000); } };

// ── formatting
const nf = (d) => new Intl.NumberFormat(undefined, { maximumFractionDigits: d });
GE.fmt = {
  n: (v, d = 0) => nf(d).format(v),
  dist(m) { if (GE.prefs.units === 'imperial') { const mi = m / 1609.344; return mi < 0.2 ? nf(0).format(m * 3.28084) + ' ft' : nf(mi < 10 ? 2 : 1).format(mi) + ' mi'; } return m < 1000 ? nf(0).format(m) + ' m' : nf(m < 10000 ? 2 : m < 100000 ? 1 : 0).format(m / 1000) + ' km'; },
  elev(m) { return GE.prefs.units === 'imperial' ? nf(0).format(m * 3.28084) + ' ft' : nf(0).format(m) + ' m'; },
  speed(ms) { return GE.prefs.units === 'imperial' ? nf(0).format(ms * 2.23694) + ' mph' : nf(0).format(ms * 3.6) + ' km/h'; },
  ll(lat, lon, d = 4) { return `${Math.abs(lat).toFixed(d)}° ${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(d)}° ${lon >= 0 ? 'E' : 'W'}`; },
  clock(ms, o = {}) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...o }).format(ms); },
  rel(ms) { const m = Math.round(Math.abs(ms) / 60000), h = Math.floor(m / 60), r = m % 60; const s = h ? `${h}h ${r}m` : `${r}m`; return ms >= 0 ? 'in ' + s : s + ' ago'; },
  ago(ms) { const s = (Date.now() - ms) / 1000; if (s < 90) return 'just now'; if (s < 5400) return Math.round(s / 60) + ' min ago'; if (s < 129600) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago'; },
  dir(az) { return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(az / 22.5) % 16]; },
};

// ── sun astronomy (accurate to ~0.01°, plenty for light and golden hour)
const R = Math.PI / 180;
GE.sun = {
  eq(ms) {
    const d = ms / 86400000 + 2440587.5 - 2451545.0;
    const g = (357.529 + 0.98560028 * d) * R, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R, e = (23.439 - 0.00000036 * d) * R;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = ((((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24) * 15 * R;
    return { ra, dec, gmst };
  },
  altAz(ms, lat, lon) {
    const { ra, dec, gmst } = GE.sun.eq(ms), H = gmst + lon * R - ra, p = lat * R;
    const alt = Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(dec) * Math.cos(p)) + Math.PI;
    return { alt: alt / R, az: ((az / R) % 360 + 360) % 360 };
  },
  // next time (after fromMs) the sun crosses `alt` going down (dir=-1) or up (dir=+1); null if none within spanH
  cross(lat, lon, fromMs, alt, dir, spanH = 30) {
    const step = 6 * 60000; let t0 = fromMs, a0 = GE.sun.altAz(t0, lat, lon).alt;
    for (let t = fromMs + step; t <= fromMs + spanH * 3600000; t += step) {
      const a = GE.sun.altAz(t, lat, lon).alt;
      if ((dir < 0 && a0 >= alt && a < alt) || (dir > 0 && a0 <= alt && a > alt)) return t0 + ((alt - a0) / (a - a0)) * (t - t0);
      t0 = t; a0 = a;
    }
    return null;
  },
  phase(alt) { return alt > 6 ? 'Daylight' : alt > -4 ? 'Golden hour' : alt > -6 ? 'Blue hour' : alt > -18 ? 'Twilight' : 'Night'; },
};
