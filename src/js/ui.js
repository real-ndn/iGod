// ───────────────────────── God's Eye · interface ─────────────────────────
// Search, place cards, picking, status line, navigation, measuring, modes, shareable views.
{
const C = Cesium, R = Math.PI / 180, $ = GE.$, F = GE.fmt;
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const svg = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;

// ── Search ─────────────────────────────────────────────────
const q = $('q'), list = $('results');
let rows = [], cursor = -1, ctl = null;
const usingGoogle = () => GE.prefs.base === 'photoreal' && GE.photoreal && GE.photoreal.show;
let gsvc = null;
const googleSvc = () => gsvc || (gsvc = GE.keys.google ? new C.GoogleGeocoderService({ key: GE.keys.google }) : new C.IonGeocoderService({ scene: GE.scene, accessToken: GE.keys.ion, geocodeProviderType: C.IonGeocodeProviderType.GOOGLE }));
GE.on('needKeys', () => (gsvc = null));
function renderRows(r) {
  rows = r; cursor = r.length ? 0 : -1;
  list.replaceChildren(...r.map((row, i) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.role = 'option'; b.setAttribute('aria-selected', i === cursor);
    b.innerHTML = '<span class="n"></span><span class="t"></span><span class="s"></span>';
    b.querySelector('.n').textContent = row.name; b.querySelector('.s').textContent = row.sub || ''; b.querySelector('.t').textContent = row.tag || '';
    b.onclick = () => choose(row); li.append(b); return li;
  }));
}
const photonRow = (f) => {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  const sub = [p.street && (p.housenumber ? p.housenumber + ' ' + p.street : p.street), p.city || p.town || p.village || p.county, p.state, p.country].filter((x, i, a) => x && x !== p.name && a.indexOf(x) === i).join(', ');
  return { name: p.name || p.street || sub || 'Place', sub, tag: p.osm_value === 'yes' ? p.osm_key : p.osm_value, kind: p.type, lon, lat, rect: p.extent ? [p.extent[0], p.extent[3], p.extent[2], p.extent[1]] : null };
};
GE.geocode = async (text, signal) => {
  if (usingGoogle()) {
    const res = await googleSvc().geocode(text);
    return res.slice(0, 6).map((r) => {
      const d = r.destination;
      if (d instanceof C.Rectangle) { const c = C.Rectangle.center(d); return { name: r.displayName.split(',')[0], sub: r.displayName.split(',').slice(1).join(',').trim(), tag: 'google', lon: c.longitude / R, lat: c.latitude / R, rect: [d.west / R, d.south / R, d.east / R, d.north / R] }; }
      const k = C.Cartographic.fromCartesian(d); return { name: r.displayName, sub: '', tag: 'google', lon: k.longitude / R, lat: k.latitude / R };
    });
  }
  const u = new URL(GE.CFG.url.photon), c = GE.viewCenter();
  u.searchParams.set('q', text); u.searchParams.set('limit', '7'); u.searchParams.set('lang', 'en');
  if (c) { u.searchParams.set('lat', c.lat.toFixed(3)); u.searchParams.set('lon', c.lon.toFixed(3)); }
  const d = await GE.fetchJSON(u.toString(), { signal });
  return (d.features || []).map(photonRow);
};
async function search(text) {
  text = text.trim(); $('qClear').hidden = !text;
  if (!text) return renderRows([]);
  const m = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (m) return renderRows([{ name: `${(+m[1]).toFixed(5)}, ${(+m[2]).toFixed(5)}`, sub: 'Coordinates', tag: 'lat, lon', lat: +m[1], lon: +m[2] }]);
  const local = GE.PLACES.filter((p) => norm(p.name + ' ' + p.sub).includes(norm(text))).map((p) => ({ ...p, tag: 'hero' }));
  const nt = norm(text); for (const r of GE.labelPlaces || []) { if (local.length >= 5) break; if (norm(r[0]).startsWith(nt) && !local.some((l) => l.name === r[0])) local.push({ name: r[0], sub: 'City', tag: 'city', kind: 'city', lon: r[1], lat: r[2] }); }
  const sats = GE.live.sats.on ? GE.live.sats.list.filter((s) => norm(s.name).includes(norm(text))).slice(0, 3).map((s) => ({ name: s.name, sub: 'Satellite, live position', tag: 'orbit', sat: s })) : [];
  renderRows([...local, ...sats]);
  if (text.length < 2) return;
  if (ctl) ctl.abort(); ctl = new AbortController(); const my = ctl;
  try { const r = await GE.geocode(text, my.signal); if (my === ctl) renderRows([...local, ...sats, ...r].slice(0, 9)); }
  catch (e) { if (e.name !== 'AbortError') console.warn(e); }
}
const searchSoon = GE.debounce(search, 260), searchSlow = GE.debounce(search, 650);
q.addEventListener('input', () => (usingGoogle() ? searchSlow : searchSoon)(q.value));
q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!rows.length) return; cursor = (cursor + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; [...list.querySelectorAll('button')].forEach((b, i) => b.setAttribute('aria-selected', i === cursor)); }
  if (e.key === 'Escape') { q.value = ''; renderRows([]); q.blur(); }
});
$('searchForm').addEventListener('submit', async (e) => { e.preventDefault(); if (rows[cursor]) return choose(rows[cursor]); await search(q.value); if (rows[0]) choose(rows[0]); });
$('qClear').onclick = () => { q.value = ''; renderRows([]); $('qClear').hidden = true; q.focus(); };
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#searchForm')) list.replaceChildren(); });
const RANGE = { country: 4e6, state: 1.3e6, region: 9e5, county: 2.2e5, city: 26000, district: 9000, town: 9000, village: 4500, locality: 4000, suburb: 3500, neighbourhood: 2200, street: 1100, house: 450 };
function choose(r) {
  list.replaceChildren(); q.blur(); q.value = r.name; $('qClear').hidden = false;
  if (r.sat) return GE.ui.showSat(r.sat, true);
  const p = { name: r.name, sub: r.sub, lon: r.lon, lat: r.lat };
  GE.ui.showPlace(p);
  if (r.v) return GE.cam.toPlace(r);
  const span = r.rect ? Math.max(Math.abs(r.rect[2] - r.rect[0]), Math.abs(r.rect[3] - r.rect[1])) : 0;
  if (span > 0.03) return GE.cam.flyTo({ rect: r.rect });
  GE.cam.flyTo({ lon: r.lon, lat: r.lat, heading: 0, pitch: -38, range: RANGE[r.kind] || (r.tag === 'lat, lon' ? 2500 : 1300) });
}
GE.ui = { choose };

// ── Card ───────────────────────────────────────────────────
const card = $('card');
let cardKey = null;
function openCard({ kind, kc, title, sub, facts = [], acts = [], coords, links = [], key }) {
  cardKey = key || null;
  $('cKind').textContent = kind; $('cKind').style.setProperty('--kc', kc || 'var(--ice)');
  $('cTitle').textContent = title; $('cSub').textContent = sub || '';
  $('cFacts').replaceChildren(...facts.filter(Boolean).map(([k, v, cls, small]) => { const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; if (cls) dd.className = cls; if (small) { const s = document.createElement('small'); s.textContent = small; dd.append(s); } d.append(dt, dd); return d; }));
  $('cActs').replaceChildren(...acts.filter(Boolean).map((a) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill' + (a.pri ? ' pri' : ''); b.innerHTML = (a.icon ? svg(a.icon) : '') + '<span></span>'; b.lastChild.textContent = a.label; b.onclick = a.fn; return b; }));
  $('cCoords').textContent = coords ? F.ll(coords[0], coords[1]) : ''; $('cCoords').onclick = () => coords && GE.copy(`${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`, 'Coordinates copied');
  $('cLinks').replaceChildren(...links.map(([t, href]) => { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t + ' ↗'; a.style.marginLeft = '10px'; return a; }));
  card.hidden = false; GE.emit('card', key);
}
GE.ui.closeCard = () => { card.hidden = true; cardKey = null; GE.sel = null; if (GE.pin) GE.pin.show = false; GE.live.sats.select && GE.live.sats.on && GE.live.sats.select(null); GE.emit('sel'); GE.scene.requestRender(); };
$('cClose').onclick = GE.ui.closeCard;
GE.on('time', GE.debounce(() => GE.ui.refreshCard && GE.ui.refreshCard(), 250));

const sunFacts = (lat, lon) => {
  const t = GE.time.now(), s = GE.sun.altAz(t, lat, lon), ph = GE.sun.phase(s.alt);
  const set = GE.sun.cross(lat, lon, t, -0.833, -1), rise = GE.sun.cross(lat, lon, t, -0.833, 1), gold = GE.sun.cross(lat, lon, t, 6, -1);
  return [
    ['Sun', `${s.alt >= 0 ? '+' : '−'}${Math.abs(s.alt).toFixed(1)}° ${F.dir(s.az)}`, ph === 'Golden hour' ? 'gold' : '', ph],
    ['Golden hour', ph === 'Golden hour' ? 'Now' : gold ? F.rel(gold - t) : 'Not today', 'gold', gold && ph !== 'Golden hour' ? F.clock(gold) + ' your time' : ''],
    ['Sunset', set ? F.rel(set - t) : '—', '', set ? F.clock(set) : ''],
    ['Sunrise', rise ? F.rel(rise - t) : '—', '', rise ? F.clock(rise) : ''],
  ];
};
GE.ui.goldenHere = (p) => {
  const t = GE.sun.cross(p.lat, p.lon, Date.now() - 3600e3, 4, -1, 40); if (!t) { GE.toast('The sun does not set there in the next day.'); return null; }
  if (!GE.prefs.sunEverywhere) { GE.prefs.sunEverywhere = true; GE.savePrefs(); GE.applySunEverywhere(); GE.emit('prefs'); }
  GE.time.play(false); GE.time.set(t); return t;
};
const dropPin = (lon, lat) => {
  const pos = C.Cartesian3.fromDegrees(lon, lat);
  if (!GE.pin) GE.pin = GE.viewer.entities.add({ position: pos, point: { pixelSize: 11, color: C.Color.fromCssColorString('#f5b862').withAlpha(0.25), outlineColor: C.Color.fromCssColorString('#f5b862'), outlineWidth: 2.5, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 5e6 } });
  GE.pin.position = pos; GE.pin.show = true; GE.scene.requestRender();
};
GE.ui.showPlace = async (p, opts = {}) => {
  GE.sel = p; dropPin(p.lon, p.lat); GE.emit('sel');
  const key = 'p' + p.lon.toFixed(5) + p.lat.toFixed(5);
  const render = (h) => openCard({
    key, kind: p.kind || 'Place', kc: 'var(--ice)', title: p.name || 'Dropped pin', sub: p.sub || (p.name ? '' : 'Looking up the address…'),
    facts: [['Elevation', h == null ? '…' : F.elev(h)], ['Local light', GE.sun.phase(GE.sun.altAz(GE.time.now(), p.lat, p.lon).alt)], ...sunFacts(p.lat, p.lon)].slice(0, 6),
    acts: [
      { label: 'Orbit', icon: 'orbit', pri: true, fn: () => GE.cam.orbit({ lon: p.lon, lat: p.lat, h }) },
      { label: 'Golden hour', icon: 'sun', fn: () => { const t = GE.ui.goldenHere(p); if (t) { GE.cam.flyTo({ lon: p.lon, lat: p.lat, heading: GE.sun.altAz(t, p.lat, p.lon).az + 180, pitch: -14, range: 2600 }); GE.milo && GE.milo.say(`Golden hour at ${p.name || 'this spot'}: ${F.clock(t)} your time. Clock moved.`); } } },
      { label: 'Drive here', icon: 'route', fn: () => GE.ui.routeTo(p) },
      { label: 'Street level', icon: 'person', fn: () => GE.street.open(p.lon, p.lat) },
      { label: 'Then & now', icon: 'history', fn: async () => { GE.toast('Searching the imagery archive for this spot…', 3000); try { const list = await GE.history.localDates(p.lon, p.lat); if (!list.length) return GE.toast('No archived changes here. Zoom in closer and try again.'); GE.history.show(list[list.length - 1]); GE.history.setCompare(true); GE.toast(`Left: ${list[list.length - 1].date.slice(0, 4)}. Right: today. Drag the divider.`, 5000); } catch { GE.toast('The imagery archive did not answer.'); } } },
      { label: 'Share', icon: 'link', fn: () => GE.copy(GE.ui.linkFor(p.lat, p.lon, 1800, 0, -90), 'Link to this spot copied') },
    ],
    coords: [p.lat, p.lon],
    links: [['Street View', `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}`]],
  });
  render(null); GE.ui.refreshCard = () => { if (GE.sel === p && !card.hidden) render(p.h); };
  const hp = GE.heightAt(p.lon, p.lat).then((h) => { p.h = h; return h; }).catch(() => null);
  if (!p.name && !usingGoogle() && !opts.noReverse) {
    try {
      const d = await GE.fetchJSON(`${GE.CFG.url.photonRev}?lat=${p.lat}&lon=${p.lon}&lang=en`, { timeout: 7000 });
      const f = d.features && d.features[0];
      if (f && GE.sel === p) { const r = photonRow(f); p.name = r.name; p.sub = r.sub; }
    } catch {}
  }
  if (GE.sel === p) { p.sub = p.sub || ''; render(await hp); }
};
GE.ui.linkFor = (lat, lon, h, hd = 0, pt = -35) => `${location.href.split('#')[0]}#${lat.toFixed(5)},${lon.toFixed(5)},${Math.round(h)},${Math.round(hd)},${Math.round(pt)}`;

GE.ui.routeTo = async (p) => {
  const from = GE.here ? { ...GE.here, name: 'You' } : { ...GE.CFG.home };
  GE.toast(`Routing from ${from.name}…`, 2500);
  try {
    const r = await GE.cam.route(from, { ...p, name: p.name || 'Pin' });
    openCard({ key: 'route', kind: 'Route', kc: 'var(--gold)', title: `${from.name} → ${p.name || 'Pin'}`, sub: 'Fastest drive, OpenStreetMap roads',
      facts: [['Distance', F.dist(r.distance)], ['Drive time', F.rel(r.duration * 1000).replace('in ', '')]],
      acts: [{ label: 'Fly the road', icon: 'film', pri: true, fn: () => GE.cam.flyRoute() }, { label: 'Clear', icon: 'x', fn: () => { GE.viewer.entities.remove(GE.routeEnt); GE.routeEnt = null; GE.route = null; GE.ui.closeCard(); } }],
      coords: [p.lat, p.lon], links: [['Google Maps', `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${p.lat},${p.lon}`]] });
    return r;
  } catch (e) { console.warn(e); GE.toast('No drivable route found between those two points.'); }
};

GE.ui.showSat = (s, fly) => {
  const S = GE.live.sats; if (!S.lib) return; S.select(s); GE.sel = null; if (GE.pin) GE.pin.show = false;
  const draw = () => {
    const st = S.state(s); if (!st) return;
    openCard({ key: 'sat' + s.id, kind: s.id === '25544' ? 'Space station' : 'Satellite', kc: 'var(--gold)', title: s.name, sub: `NORAD ${s.id} · ${{ stations: 'Space stations', visual: 'Brightest satellites', 'gps-ops': 'GPS constellation', starlink: 'Starlink' }[s.group] || s.group}`,
      facts: [['Altitude', F.dist(st.altKm * 1000)], ['Speed', F.speed(st.speed)], ['One orbit', F.n(st.period, 0) + ' min'], ['Inclination', st.inc.toFixed(1) + '°'], ['Over', `${Math.abs(st.lat).toFixed(1)}°${st.lat >= 0 ? 'N' : 'S'} ${Math.abs(st.lon).toFixed(1)}°${st.lon >= 0 ? 'E' : 'W'}`]],
      acts: [{ label: 'Ride along', icon: 'sat', pri: true, fn: () => GE.cam.ride(s) }, { label: 'Look from Earth', icon: 'eye', fn: () => GE.camera.flyTo({ destination: C.Cartesian3.fromDegrees(st.lon, st.lat, st.altKm * 1000 + 2.2e6), duration: 2.5 }) }],
      coords: [st.lat, st.lon], links: [['N2YO', `https://www.n2yo.com/satellite/?s=${s.id}`]] });
  };
  draw(); if (fly) { const st = S.state(s); st && GE.camera.flyTo({ destination: C.Cartesian3.fromDegrees(st.lon, st.lat, st.altKm * 1000 + 3.0e6), duration: 2.6 }); }
  const k = 'sat' + s.id, iv = setInterval(() => { if (cardKey !== k || card.hidden) return clearInterval(iv); draw(); }, 1000);
};
GE.ui.showFlight = (f) => {
  GE.sel = null; if (GE.pin) GE.pin.show = false;
  const draw = () => { const p = GE.live.flights.position(f); openCard({ key: 'fl' + f.id, kind: 'Flight · live', kc: 'var(--ice)', title: f.cs, sub: [f.type, f.reg].filter(Boolean).join(' · ') || 'Aircraft',
    facts: [['Altitude', f.alt ? F.elev(f.alt) : 'On ground'], ['Speed', F.speed(f.gs)], ['Heading', Math.round(f.trk) + '° ' + F.dir(f.trk)], f.squawk ? ['Squawk', f.squawk] : null],
    acts: [{ label: 'Follow', icon: 'plane', pri: true, fn: () => GE.cam.follow(f) }], coords: [p.lat, p.lon], links: [[GE.live.flights.name || 'adsb.lol', `https://${(GE.live.flights.name || 'adsb.lol').replace('adsb.fi', 'globe.adsb.fi').replace('airplanes.live', 'globe.airplanes.live')}/?icao=${f.id}`]] }); };
  draw(); const k = 'fl' + f.id, iv = setInterval(() => { if (cardKey !== k || card.hidden) return clearInterval(iv); draw(); }, 2000);
};
GE.ui.showQuake = (g) => {
  GE.sel = { name: g.place, lon: g.lon, lat: g.lat }; GE.emit('sel');
  openCard({ key: 'q' + g.time, kind: 'Earthquake', kc: 'var(--ember)', title: `M${g.mag.toFixed(1)} · ${g.place}`, sub: `${F.ago(g.time)} · ${new Date(g.time).toLocaleString()}`,
    facts: [['Magnitude', g.mag.toFixed(1)], ['Depth', F.dist(g.depth * 1000)], ['When', F.ago(g.time)], g.tsunami ? ['Tsunami', 'Flagged', 'gold'] : null],
    acts: [{ label: 'Fly there', icon: 'orbit', pri: true, fn: () => GE.cam.flyTo({ lon: g.lon, lat: g.lat, pitch: -30, range: 60000 }).then(() => GE.cam.orbit({ lon: g.lon, lat: g.lat }, { speed: 0.05 })) }],
    coords: [g.lat, g.lon], links: [['USGS', g.url]] });
};
GE.ui.showFire = (r) => {
  const [lat, lon, frp, conf, when, dn] = r, t = Date.parse(when.slice(0, 10) + 'T' + when.slice(11, 13) + ':' + when.slice(13, 15) + ':00Z');
  GE.sel = { name: 'Wildfire hotspot', lon, lat }; GE.emit('sel');
  openCard({ key: 'f' + lat + lon, kind: 'Wildfire hotspot', kc: 'var(--ember)', title: `${F.n(frp, frp < 10 ? 1 : 0)} MW of fire`, sub: `Seen ${isFinite(t) ? F.ago(t) : when} by NOAA-20 VIIRS, ${dn === 'N' ? 'at night' : 'by day'}`,
    facts: [['Fire power', F.n(frp, 1) + ' MW'], ['Confidence', ['Low', 'Nominal', 'High'][conf] || '—'], ['Detected', isFinite(t) ? F.clock(t, { month: 'short', day: 'numeric' }) : when], ['Data age', GE.live.fires.when ? F.ago(GE.live.fires.when) : '—']],
    acts: [{ label: 'Fly there', icon: 'orbit', pri: true, fn: () => GE.cam.flyTo({ lon, lat, pitch: -30, range: 9000 }) }, { label: 'Then & now', icon: 'history', fn: () => GE.ui.showPlace({ lon, lat }) }],
    coords: [lat, lon], links: [['FIRMS map', `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lon.toFixed(3)},${lat.toFixed(3)},11z`]] });
};
GE.ui.showEvent = (g) => {
  GE.sel = { name: g.title, lon: g.lon, lat: g.lat }; GE.emit('sel');
  openCard({ key: 'e' + g.title, kind: g.catName, kc: 'var(--ember)', title: g.title, sub: 'NASA Earth Observatory event tracker',
    facts: [['Category', g.catName], ['Last report', g.date ? F.ago(Date.parse(g.date)) : '—'], g.mag ? ['Size', `${F.n(g.mag)} ${g.magUnit || ''}`] : null],
    acts: [{ label: 'Fly there', icon: 'orbit', pri: true, fn: () => GE.cam.flyTo({ lon: g.lon, lat: g.lat, pitch: -28, range: 40000 }) }],
    coords: [g.lat, g.lon], links: g.link ? [['Source', g.link]] : [] });
};

// ── Picking ────────────────────────────────────────────────
GE.ui.initPicking = () => {
  const v = GE.viewer, h = new C.ScreenSpaceEventHandler(GE.scene.canvas);
  v.cesiumWidget.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  h.setInputAction((e) => {
    if (GE.measure.on) return GE.measure.add(e.position);
    const picked = GE.scene.pick(e.position), id = picked && picked.id;
    const meta = id && (id.ge || (id.kind ? id : null));
    if (meta) {
      if (meta.kind === 'sat') return GE.ui.showSat(meta.s);
      if (meta.kind === 'flight' && meta.f) return GE.ui.showFlight(meta.f);
      if (meta.kind === 'quake') return GE.ui.showQuake(meta);
      if (meta.kind === 'event') return GE.ui.showEvent(meta);
      if (meta.kind === 'fire') return GE.ui.showFire(meta.r);
      if (meta.kind === 'iss') { const st = GE.live.issNow(); return st && openCard({ key: 'iss', kind: 'Space station', kc: 'var(--gold)', title: 'International Space Station', sub: 'Live position', facts: [['Altitude', F.dist(st.altKm * 1000)], ['Speed', F.speed(st.speed)]], acts: [{ label: 'Ride along', icon: 'sat', pri: true, fn: () => GE.cam.ride('iss') }], coords: [st.lat, st.lon] }); }
    }
    if (picked && (picked.primitive === GE.photoreal || picked.primitive === GE.osm || !id)) { const ll = GE.screenToLL(e.position.x, e.position.y); if (ll) GE.ui.showPlace({ lon: ll.lon, lat: ll.lat }); return; }
    const ll = GE.screenToLL(e.position.x, e.position.y); if (ll) GE.ui.showPlace({ lon: ll.lon, lat: ll.lat });
  }, C.ScreenSpaceEventType.LEFT_CLICK);
  h.setInputAction((e) => {
    const ll = GE.screenToLL(e.position.x, e.position.y); if (!ll) return;
    const r = C.Cartesian3.distance(GE.camera.positionWC, ll.pos);
    GE.camera.flyToBoundingSphere(new C.BoundingSphere(ll.pos, 1), { offset: new C.HeadingPitchRange(GE.camera.heading, Math.min(GE.camera.pitch, -0.35), GE.clamp(r * 0.4, 30, 5e7)), duration: 0.9 });
  }, C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  // status line follows the pointer on desktop, the screen center on touch
  let mx = null, my = null, pending = false;
  h.setInputAction((e) => { mx = e.endPosition.x; my = e.endPosition.y; if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; GE.ui.status(); }); } }, C.ScreenSpaceEventType.MOUSE_MOVE);
  GE.scene.canvas.addEventListener('pointerleave', () => { mx = my = null; GE.ui.status(); });
  GE.ui.status = () => {
    const el = $('status'); if (!el || getComputedStyle(el).display === 'none') return;
    let ll = null;
    if (mx != null) { const p = GE.camera.pickEllipsoid(new C.Cartesian2(mx, my)); if (p) { const k = C.Cartographic.fromCartesian(p); ll = { lon: k.longitude / R, lat: k.latitude / R, h: GE.scene.globe.getHeight(k) }; } }
    if (!ll) { const c = GE.viewCenter(); if (c) ll = { lon: c.lon, lat: c.lat, h: c.h }; }
    const eye = GE.camera.positionCartographic.height, parts = [];
    if (ll) { parts.push(`<b>${F.ll(ll.lat, ll.lon)}</b>`); if (ll.h != null && isFinite(ll.h) && ll.h > -450 && eye < 2e6) parts.push(`elev <b>${F.elev(ll.h)}</b>`); const s = GE.sun.altAz(GE.time.now(), ll.lat, ll.lon); parts.push(`sun <b>${s.alt.toFixed(0)}° ${F.dir(s.az)}</b>`); }
    parts.unshift(`eye <b>${F.dist(eye)}</b>`);
    el.innerHTML = parts.join('<span class="sep">·</span>');
  };
};

// ── Navigation stack ───────────────────────────────────────
GE.ui.initNav = () => {
  const comp = $('compass').firstElementChild;
  GE.scene.postRender.addEventListener(() => {
    comp.style.transform = `rotate(${-GE.camera.heading / R}deg)`;
    $('tiltBtn').textContent = GE.camera.pitch < -1.2 ? '3D' : '2D';
  });
  $('compass').onclick = () => GE.cam.north();
  $('tiltBtn').onclick = () => GE.cam.tilt();
  $('zin').onclick = () => GE.cam.zoom(0.42); $('zout').onclick = () => GE.cam.zoom(2.4);
  $('homeBtn').onclick = () => { const h = GE.PLACES.find((p) => p.name === GE.CFG.home.name) || { ...GE.CFG.home, v: [35, -28, 2200] }; GE.ui.showPlace({ name: GE.CFG.home.name, sub: GE.CFG.home.sub, lon: GE.CFG.home.lon, lat: GE.CFG.home.lat }); GE.cam.toPlace(h); };
  $('locBtn').onclick = () => GE.ui.locate();
  // Full screen. On iPad, Safari puts its own ✕ in the top-left corner, so the top bar moves over for it.
  // Opened from the Home Screen the app is already full screen, so the button goes away.
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) { $('fsBtn').hidden = true; document.documentElement.classList.add('standalone'); }
  const fsSync = () => { document.documentElement.classList.toggle('fs', !!fsEl()); };
  document.addEventListener('fullscreenchange', fsSync); document.addEventListener('webkitfullscreenchange', fsSync);
  $('fsBtn').onclick = async () => {
    const d = document, el = d.documentElement;
    try {
      if (fsEl()) await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen());
      else await (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen());
    } catch { GE.toast(GE.device === 'desktop' ? 'Full screen is not available here.' : 'For full screen, tap Share → Add to Home Screen, then open God’s Eye from there.', 6500); }
  };
  addEventListener('keydown', (e) => { if (e.target.closest('input, select, textarea')) return; if (e.key === 'n' || e.key === 'N') GE.cam.north(); if (e.key === '/') { e.preventDefault(); q.focus(); } });
};
GE.ui.locate = () => {
  if (!navigator.geolocation) return GE.toast('Location is not available in this browser.');
  GE.toast('Finding you…', 2500);
  navigator.geolocation.getCurrentPosition((p) => {
    const { latitude: lat, longitude: lon } = p.coords; GE.here = { lat, lon };
    if (!GE.youEnt) GE.youEnt = GE.viewer.entities.add({ position: C.Cartesian3.fromDegrees(lon, lat), point: { pixelSize: 12, color: C.Color.fromCssColorString('#8fd8ff'), outlineColor: C.Color.WHITE, outlineWidth: 3, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 5e6 } });
    GE.youEnt.position = C.Cartesian3.fromDegrees(lon, lat);
    GE.ui.showPlace({ lon, lat, kind: 'You are here' }); GE.cam.flyTo({ lon, lat, pitch: -40, range: 1500 });
  }, () => GE.toast('Location permission was declined, so I cannot find you. Home is one tap away.'), { enableHighAccuracy: true, timeout: 12000 });
};

// ── Measure ────────────────────────────────────────────────
GE.measure = { on: false, pts: [], ents: [] };
const M = GE.measure;
const geodesic = (a, b) => new C.EllipsoidGeodesic(C.Cartographic.fromCartesian(a), C.Cartographic.fromCartesian(b)).surfaceDistance;
M.redraw = () => {
  M.ents.forEach((e) => GE.viewer.entities.remove(e)); M.ents = [];
  const gold = C.Color.fromCssColorString('#f5b862');
  M.pts.forEach((p) => M.ents.push(GE.viewer.entities.add({ position: p, point: { pixelSize: 8, color: C.Color.WHITE, outlineColor: gold, outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 5e6 } })));
  if (M.pts.length > 1) M.ents.push(GE.viewer.entities.add({ polyline: { positions: M.pts.slice(), width: 3, clampToGround: true, material: new C.PolylineDashMaterialProperty({ color: gold, gapColor: C.Color.BLACK.withAlpha(0.35), dashLength: 18 }) } }));
  let d = 0; for (let i = 1; i < M.pts.length; i++) d += geodesic(M.pts[i - 1], M.pts[i]);
  $('mOut').textContent = M.pts.length < 2 ? 'Tap points on the ground' : `${F.dist(d)}  ·  ${M.pts.length} points`;
  GE.scene.requestRender();
};
M.add = (pos) => { const ll = GE.screenToLL(pos.x, pos.y); if (!ll) return; M.pts.push(ll.pos); M.redraw(); };
M.toggle = (on = !M.on) => { M.on = on; $('measure').hidden = !on; $('measureBtn').setAttribute('aria-pressed', on); if (on) { M.pts = []; M.redraw(); GE.ui.closeCard(); } else { M.ents.forEach((e) => GE.viewer.entities.remove(e)); M.ents = []; GE.scene.requestRender(); } };
$('measureBtn').onclick = () => M.toggle();
$('mUndo').onclick = () => { M.pts.pop(); M.redraw(); };
$('mDone').onclick = () => { M.on = false; $('measure').hidden = true; $('measureBtn').setAttribute('aria-pressed', false); };
addEventListener('keydown', (e) => { if (e.key === 'Escape' && M.on) M.toggle(false); });

// ── Modes ──────────────────────────────────────────────────
GE.ui.syncMode = () => {
  const seg = document.querySelector('.seg'), btns = seg.querySelectorAll('button'), thumb = seg.querySelector('.thumb');
  btns.forEach((b) => { const on = b.dataset.mode === GE.prefs.mode; b.setAttribute('aria-pressed', on); if (on) { thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft - 3}px)`; } });
};
document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { GE.applyMode(b.dataset.mode); GE.ui.syncMode(); }));
addEventListener('resize', () => GE.ui.syncMode && GE.ui.syncMode());

// ── Shareable view in the URL ──────────────────────────────
GE.ui.writeHash = GE.debounce(() => {
  if (GE.cam.mode) return;
  const k = GE.camera.positionCartographic;
  history.replaceState(null, '', GE.ui.linkFor(k.latitude / R, k.longitude / R, k.height, GE.camera.heading / R, GE.camera.pitch / R).replace(/^[^#]*/, ''));
}, 700);
GE.ui.readHash = () => {
  const m = location.hash.slice(1).split(',').map(Number);
  if (m.length < 3 || m.some((x) => !isFinite(x))) return false;
  GE.camera.setView({ destination: C.Cartesian3.fromDegrees(m[1], m[0], m[2]), orientation: { heading: (m[3] || 0) * R, pitch: (m[4] ?? -90) * R, roll: 0 } });
  return true;
};
}
