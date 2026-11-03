// ───────────────────────── God's Eye · live Earth ─────────────────────────
// Satellites (CelesTrak + SGP4), flights (ADS-B), earthquakes (USGS), natural events (NASA EONET).
{
const C = Cesium, R = Math.PI / 180;
GE.live = {};
const col = (css, a = 1) => C.Color.fromCssColorString(css).withAlpha(a);
const FONT = '500 12px "Instrument Sans", system-ui, sans-serif';

// ── Satellites ────────────────────────────────────────────────
const SAT = (GE.live.sats = { on: false, list: [], lib: null, pts: null, lbl: null, orbit: null, timer: 0, sel: null, iss: null });
const STYLE = {
  stations: { c: '#f5b862', size: 6, label: true }, visual: { c: '#d7f1ff', size: 4 }, 'gps-ops': { c: '#7be3b5', size: 4 }, starlink: { c: '#86a8ff', size: 2, a: 0.7 },
};
async function tle(group) {
  const key = 'tle.' + group, c = GE.store.get(key, null);
  if (c && Date.now() - c.t < 6 * 3600e3) return c.txt;
  if (/^https?:/.test(location.protocol)) { try { const t = await GE.fetchJSON(`data/tle-${group}.txt`, { text: true, timeout: 15000 }); if (/^1 \d/m.test(t)) { if (t.length < 600000) GE.store.set(key, { t: Date.now(), txt: t }); return t; } } catch {} }
  const txt = await GE.fetchJSON(GE.fill(GE.CFG.url.celestrak, { g: group }), { text: true, timeout: 25000 });
  if (!/^1 \d/m.test(txt)) throw new Error('No TLE data');
  if (txt.length < 600000) GE.store.set(key, { t: Date.now(), txt });
  return txt;
}
function parseTLE(txt, group) {
  const L = txt.split(/\r?\n/).map((s) => s.trimEnd()).filter(Boolean), out = [];
  for (let i = 0; i < L.length - 2; ) {
    if (!L[i].startsWith('1 ') && L[i + 1].startsWith('1 ') && L[i + 2].startsWith('2 ')) { out.push({ name: L[i].trim(), l1: L[i + 1], l2: L[i + 2], group, id: L[i + 1].slice(2, 7).trim() }); i += 3; } else i++;
  }
  return out;
}
const scratch = new C.Cartesian3();
function satState(s, ms = GE.time.now()) {
  const lib = SAT.lib, d = new Date(ms), pv = lib.propagate(s.rec, d);
  if (!pv || !pv.position || typeof pv.position !== 'object') return null;
  const gmst = lib.gstime(d), e = lib.eciToEcf(pv.position, gmst), g = lib.eciToGeodetic(pv.position, gmst), v = pv.velocity;
  return { pos: new C.Cartesian3(e.x * 1000, e.y * 1000, e.z * 1000), lat: g.latitude / R, lon: g.longitude / R, altKm: g.height, speed: Math.hypot(v.x, v.y, v.z) * 1000, period: (2 * Math.PI) / s.rec.no, inc: s.rec.inclo / R };
}
SAT.state = satState;
function satUpdate() {
  if (!SAT.on || !SAT.lib) return;
  const lib = SAT.lib, d = new Date(GE.time.now()), gmst = lib.gstime(d);
  for (const s of SAT.list) {
    const pv = lib.propagate(s.rec, d);
    if (!pv || !pv.position || typeof pv.position !== 'object') { s.pt.show = false; continue; }
    const e = lib.eciToEcf(pv.position, gmst); scratch.x = e.x * 1000; scratch.y = e.y * 1000; scratch.z = e.z * 1000;
    s.pt.position = scratch; s.pt.show = true; if (s.lb) s.lb.position = scratch;
  }
  // redraw the orbit ring every 20 s, and at once when the clock jumps, so it always runs through the satellite
  const sel = SAT.sel; if (sel && sel.orbitAt && (Date.now() - sel.orbitAt > 20000 || Math.abs(GE.time.now() - sel.orbitT) > 60000)) drawOrbit(sel);
  GE.scene.requestRender(); GE.emit('sats');
}
function drawOrbit(s) {
  if (!SAT.orbit) SAT.orbit = GE.scene.primitives.add(new C.PolylineCollection());
  SAT.orbit.removeAll(); if (!s || !SAT.lib) return;
  const lib = SAT.lib, now = GE.time.now(), gmst = lib.gstime(new Date(now)), per = (2 * Math.PI) / s.rec.no, pts = [];
  for (let i = 0; i <= 160; i++) { const d = new Date(now + ((i / 160) * per - per * 0.25) * 60000), pv = lib.propagate(s.rec, d); if (pv && pv.position && typeof pv.position === 'object') { const e = lib.eciToEcf(pv.position, gmst); pts.push(new C.Cartesian3(e.x * 1000, e.y * 1000, e.z * 1000)); } }
  SAT.orbit.add({ positions: pts, width: 3, material: C.Material.fromType('PolylineGlow', { color: col(STYLE[s.group]?.c || '#8fd8ff', 0.9), glowPower: 0.18 }) });
  s.orbitAt = Date.now(); s.orbitT = now; GE.scene.requestRender();
}
SAT.select = (s) => { SAT.sel = s; drawOrbit(s); if (SAT.selLb) { SAT.lbl.remove(SAT.selLb); if (SAT.selOwner) SAT.selOwner.lb = null; SAT.selLb = SAT.selOwner = null; } if (s && !s.lb) { SAT.selOwner = s; SAT.selLb = SAT.lbl.add({ position: s.pt.position, text: s.name, font: FONT, fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(10, 0), horizontalOrigin: C.HorizontalOrigin.LEFT }); s.lb = SAT.selLb; } };
SAT.find = (q) => { q = String(q).toLowerCase(); if (/\biss\b|space station|zarya/.test(q)) q = 'iss (zarya)'; return SAT.list.find((s) => s.name.toLowerCase() === q) || SAT.list.find((s) => s.name.toLowerCase().includes(q)); };
SAT.enable = async (on) => {
  SAT.on = on; clearInterval(SAT.timer);
  if (SAT.pts) SAT.pts.show = on; if (SAT.lbl) SAT.lbl.show = on; if (SAT.orbit) SAT.orbit.show = on;
  if (!on) { GE.scene.requestRender(); return; }
  try { SAT.lib = SAT.lib || (await import(GE.CFG.url.satjs)); }
  catch (e) { console.warn(e); GE.toast('Orbit math could not load. Showing the ISS from its live feed.'); return ISS.enable(true); }
  const groups = ['stations', 'visual', 'gps-ops'].concat(GE.prefs.starlink ? ['starlink'] : []);
  const have = new Set(SAT.list.map((s) => s.group)), seen = new Set(SAT.list.map((s) => s.id));
  if (!SAT.pts) { SAT.pts = GE.scene.primitives.add(new C.PointPrimitiveCollection()); SAT.lbl = GE.scene.primitives.add(new C.LabelCollection()); }
  let failed = 0;
  for (const g of groups) {
    if (have.has(g)) continue;
    try {
      for (const s of parseTLE(await tle(g), g)) {
        if (seen.has(s.id)) continue; seen.add(s.id);
        try { s.rec = SAT.lib.twoline2satrec(s.l1, s.l2); } catch { continue; }
        const st = STYLE[g], iss = s.id === '25544';
        s.pt = SAT.pts.add({ position: C.Cartesian3.ZERO, pixelSize: iss ? 9 : st.size, color: col(iss ? '#ffffff' : st.c, st.a || 1), outlineColor: col(st.c, 0.55), outlineWidth: iss ? 3 : 0, id: { kind: 'sat', s } });
        if (st.label || iss) s.lb = SAT.lbl.add({ position: C.Cartesian3.ZERO, text: iss ? 'ISS' : s.name, font: FONT, fillColor: col(iss ? '#ffffff' : '#f6dcb2'), outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(10, 0), horizontalOrigin: C.HorizontalOrigin.LEFT, translucencyByDistance: new C.NearFarScalar(2e6, 1, 4e7, iss ? 0.9 : 0.0) });
        SAT.list.push(s); if (iss) SAT.iss = s;
      }
    } catch (e) { console.warn(g, e); failed++; }
  }
  if (!SAT.list.length) { GE.toast('Satellite catalog (CelesTrak) is unreachable from this browser. Showing the ISS from its live feed.', 6000); return ISS.enable(true); }
  if (failed) GE.toast(`Some satellite groups did not load (${failed}).`);
  satUpdate(); SAT.timer = setInterval(satUpdate, GE.prefs.starlink ? 2000 : 1000);
  GE.emit('satsReady', SAT.list.length);
};
GE.on('time', () => SAT.on && satUpdate());

// ISS fallback: wheretheiss.at live position when the catalog or SGP4 is unavailable
const ISS = (GE.live.iss = { on: false, timer: 0, ent: null, last: null });
ISS.enable = async (on) => {
  ISS.on = on; clearInterval(ISS.timer); if (ISS.ent) ISS.ent.show = on; if (!on) return;
  const tick = async () => {
    try {
      const d = await GE.fetchJSON(GE.CFG.url.iss, { timeout: 8000 });
      ISS.last = { lat: d.latitude, lon: d.longitude, altKm: d.altitude, speed: d.velocity / 3.6, t: Date.now() };
      const p = C.Cartesian3.fromDegrees(d.longitude, d.latitude, d.altitude * 1000);
      if (!ISS.ent) ISS.ent = GE.viewer.entities.add({ position: p, point: { pixelSize: 10, color: C.Color.WHITE, outlineColor: col('#f5b862', 0.6), outlineWidth: 3 }, label: { text: 'ISS', font: FONT, pixelOffset: new C.Cartesian2(12, 0), horizontalOrigin: C.HorizontalOrigin.LEFT, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE } });
      ISS.ent.position = p; ISS.ent.ge = { kind: 'iss' }; GE.scene.requestRender();
    } catch (e) { console.warn(e); }
  };
  await tick(); ISS.timer = setInterval(tick, 5000);
};
// One function for "where is the ISS right now": SGP4 when available, live feed otherwise.
GE.live.issNow = () => {
  if (SAT.on && SAT.iss) { const st = satState(SAT.iss); return st && { ...st, src: 'sgp4' }; }
  if (ISS.last) return { ...ISS.last, pos: C.Cartesian3.fromDegrees(ISS.last.lon, ISS.last.lat, ISS.last.altKm * 1000), src: 'feed' };
  return null;
};

// ── Flights (ADS-B Exchange-compatible feed from adsb.lol) ─────────
const FL = (GE.live.flights = { on: false, map: new Map(), bb: null, poll: 0, anim: 0, warned: false });
const planeImg = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.translate(32, 32); g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 4; g.beginPath();
  [[0, -27], [3.5, -20], [3.5, -7], [26, 6], [26, 11], [3.5, 5], [2.5, 19], [9, 24], [9, 27], [0, 25], [-9, 27], [-9, 24], [-2.5, 19], [-3.5, 5], [-26, 11], [-26, 6], [-3.5, -7], [-3.5, -20]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath(); g.fill(); return c;
})();
const altColor = (m) => C.Color.fromHsl(GE.clamp(0.09 + (m / 12500) * 0.47, 0.09, 0.56), 0.85, 0.66, 1);
async function flightPoll() {
  if (!FL.on || FL.busy) return; // one poll at a time, even when a feed is slow
  FL.busy = true;
  try { await flightPollOnce(); } finally { FL.busy = false; }
}
async function flightPollOnce() {
  const ch = GE.camera.positionCartographic.height;
  if (ch > 2.6e6) { if (!FL.hinted) { GE.toast('Zoom in below 2,500 km to see live flights around you.'); FL.hinted = true; } return; }
  const c = GE.viewCenter(); if (!c) return;
  const r = Math.round(GE.clamp(ch / 1852 * 1.1, 25, 250)), q = { lat: c.lat.toFixed(3), lon: c.lon.toFixed(3), r };
  const relay = (GE.keys.relay || '').replace(/\/+$/, ''), feeds = [...(relay ? [relay + GE.CFG.url.relayPath] : []), GE.CFG.url.adsb, ...GE.CFG.url.adsbAlt];
  try {
    // the feed that answered last time first, then the others
    let d = null;
    if (FL.feeds !== feeds.join()) { FL.feeds = feeds.join(); FL.src = 0; } // the relay changed: start from the top
    for (const i of [FL.src || 0, ...feeds.keys()].filter((v, k, a) => a.indexOf(v) === k)) {
      try { d = await GE.fetchJSON(GE.fill(feeds[i], q), { timeout: 8000 }); if (d && (d.ac || d.aircraft)) { FL.src = i; FL.name = relay && i === 0 ? 'adsb.lol' : new URL(feeds[i]).host.replace(/^(api|opendata)\./, ''); break; } d = null; } catch {}
      if (!FL.on) return;
    }
    if (!d) throw new Error('no flight feed answered');
    FL.fails = 0;
    const now = Date.now(), list = d.ac || d.aircraft || [];
    for (const a of list) {
      if (a.lat == null || a.lon == null) continue;
      const alt = a.alt_baro === 'ground' ? 0 : (a.alt_geom ?? a.alt_baro ?? 0) * 0.3048;
      let f = FL.map.get(a.hex);
      const rec = { id: a.hex, cs: (a.flight || '').trim() || a.r || a.hex.toUpperCase(), type: a.t || '', reg: a.r || '', lat: a.lat, lon: a.lon, alt, gs: (a.gs || 0) * 0.514444, trk: a.track ?? a.true_heading ?? 0, t0: now - (a.seen_pos || 0) * 1000, seen: now, squawk: a.squawk };
      if (!f) { f = rec; f.bb = FL.bb.add({ image: planeImg, position: C.Cartesian3.fromDegrees(a.lon, a.lat, alt), scale: 0.4, scaleByDistance: new C.NearFarScalar(3e3, 1.1, 3e6, 0.45), alignedAxis: C.Cartesian3.UNIT_Z, id: { kind: 'flight', f: null } }); FL.map.set(a.hex, f); }
      else Object.assign(f, rec);
      f.bb.id.f = f; f.bb.rotation = -f.trk * R; f.bb.color = altColor(alt);
    }
    for (const [k, f] of FL.map) if (now - f.seen > 60000) { FL.bb.remove(f.bb); FL.map.delete(k); }
    GE.emit('flights', FL.map.size);
  } catch (e) {
    console.warn(e);
    // twice in a row with nothing from any feed: switch the layer off instead of polling (and drawing) for nothing
    if (++FL.fails >= 2) {
      GE.toast(relay ? "Your flight relay didn't answer. Check its address in Settings → Flight relay, then turn Flights on again."
        : 'Live flights need a free flight relay, because the public flight feeds block web pages. Settings → Flight relay shows the two-minute setup.', 9000);
      GE.prefs.flights = false; GE.savePrefs(); GE.emit('prefs'); FL.enable(false);
    }
  }
}
FL.position = (f, now = Date.now()) => {
  const dt = GE.clamp((now - f.t0) / 1000, 0, 90), dist = f.gs * dt, tr = f.trk * R;
  const lat = f.lat + (dist * Math.cos(tr)) / 111320, lon = f.lon + (dist * Math.sin(tr)) / (111320 * Math.cos(f.lat * R));
  return { lat, lon, alt: f.alt, pos: C.Cartesian3.fromDegrees(lon, lat, f.alt) };
};
// no planes, no frames: an empty sky shouldn't keep the iPad drawing five times a second
function flightAnim() { if (!FL.map.size) return; const now = Date.now(); for (const f of FL.map.values()) f.bb.position = FL.position(f, now).pos; GE.scene.requestRender(); }
FL.enable = (on) => {
  FL.on = on; clearInterval(FL.poll); clearInterval(FL.anim);
  if (!FL.bb) FL.bb = GE.scene.primitives.add(new C.BillboardCollection({ scene: GE.scene }));
  FL.bb.show = on; if (!on) { GE.scene.requestRender(); return; }
  FL.fails = 0; flightPoll(); FL.poll = setInterval(flightPoll, 9000); FL.anim = setInterval(flightAnim, 200);
};
FL.find = (q) => { q = String(q).toLowerCase().replace(/\s/g, ''); for (const f of FL.map.values()) if (f.cs.toLowerCase().replace(/\s/g, '') === q || f.reg.toLowerCase() === q) return f; return null; };

// ── Earthquakes (USGS, M2.5+, past 7 days) ─────────
const Q = (GE.live.quakes = { on: false, ds: null, timer: 0, n: 0, labels: [] });
// magnitudes (M4.5 and up) go through the label engine too, so they never sit on top of place names
GE.labelSources.push(() => (Q.on ? Q.labels : null));
async function quakeLoad() {
  try {
    const d = await GE.fetchJSON(GE.CFG.url.quakes), now = Date.now(); Q.ds.entities.removeAll(); Q.n = 0;
    const labels = [];
    for (const f of d.features || []) {
      const [lon, lat, depth] = f.geometry.coordinates, m = f.properties.mag ?? 0, t = f.properties.time, age = now - t;
      const c = age < 3600e3 ? '#ff4d3a' : age < 86400e3 ? '#ff8f45' : '#ffc95c', a = age < 86400e3 ? 0.95 : 0.7, pos = C.Cartesian3.fromDegrees(lon, lat);
      const e = Q.ds.entities.add({
        position: pos, show: horizon.see(pos),
        point: { pixelSize: 4 + Math.max(0, m - 2.5) * 2.6, color: col(c, a), outlineColor: col(c, 0.28), outlineWidth: m >= 5.5 ? 5 : 2, scaleByDistance: new C.NearFarScalar(1.5e5, 1.15, 2.2e7, 0.5), heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 2.5e6 },
      });
      e.ge = { kind: 'quake', mag: m, place: f.properties.place || 'Earthquake', time: t, depth, url: f.properties.url, lat, lon, tsunami: f.properties.tsunami };
      e.gePos = pos;
      if (m >= 4.5) labels.push({ t: 'q', name: 'M' + m.toFixed(1), lon, lat, pos, pri: -m * 2, reach: 9e6, ent: e, extra: { m } });
      Q.n++;
    }
    Q.labels = labels; horizon.kick(); GE.labels.update && GE.labels.update(); GE.scene.requestRender(); GE.emit('quakes', Q.n);
  } catch (e) { console.warn(e); GE.toast('USGS earthquake feed did not load.'); }
}
Q.enable = (on) => {
  Q.on = on; clearInterval(Q.timer);
  if (!Q.ds) { Q.ds = new C.CustomDataSource('quakes'); GE.viewer.dataSources.add(Q.ds); }
  Q.ds.show = on; GE.labels.update && GE.labels.update(); if (!on) { GE.scene.requestRender(); return; }
  quakeLoad(); Q.timer = setInterval(quakeLoad, 5 * 60000);
};

// Ground markers skip the depth test near the camera so terrain can't swallow them. From low down that
// also let markers on the far side of the planet shine through the ground, so anything past the horizon hides.
const horizon = (GE.live.horizon = (() => {
  const occ = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, C.Cartesian3.ZERO);
  let pending = false, hooked = false;
  const see = (p) => { occ.cameraPosition = GE.camera.positionWC; return occ.isPointVisible(p); };
  function run() {
    pending = false; occ.cameraPosition = GE.camera.positionWC; let changed = false;
    for (const L of [Q, EV]) if (L.on && L.ds) for (const e of L.ds.entities.values) { if (!e.gePos) continue; const v = occ.isPointVisible(e.gePos); if (e.show !== v) { e.show = v; changed = true; } }
    if (FI.on && FI.pts) for (let i = 0, n = FI.pts.length; i < n; i++) { const p = FI.pts.get(i), v = occ.isPointVisible(p.position); if (p.show !== v) { p.show = v; changed = true; } }
    if (changed) GE.scene.requestRender();
  }
  // while you pinch or swipe this runs at most 4 times a second, off the gesture's frames; once more when the camera settles
  let last = 0;
  const kick = () => {
    if (!GE.camera) return;
    if (!hooked) { hooked = true; GE.camera.changed.addEventListener(kick); GE.camera.moveEnd.addEventListener(() => setTimeout(run, 0)); }
    if (pending || !(Q.on || EV.on || FI.on)) return;
    pending = true; setTimeout(() => { last = performance.now(); run(); }, Math.max(0, 250 - (performance.now() - last)));
  };
  return { see, kick, run };
})());

// ── Natural events (NASA EONET: wildfires, volcanoes, storms, ice) ─────────
const EV = (GE.live.events = { on: false, ds: null, timer: 0, n: 0 });
const CAT = { wildfires: ['#ff7a3d', 'Wildfire'], volcanoes: ['#ff4d4d', 'Volcano'], severeStorms: ['#b39dff', 'Severe storm'], seaLakeIce: ['#8fe3ff', 'Sea and lake ice'], floods: ['#5aa9ff', 'Flood'], drought: ['#e0b46b', 'Drought'], dustHaze: ['#d9c19a', 'Dust and haze'], landslides: ['#c08a5a', 'Landslide'], snow: ['#eaf4ff', 'Snow'], tempExtremes: ['#ff9db0', 'Temperature extreme'], earthquakes: ['#ffc95c', 'Earthquake'], manmade: ['#c7cdd8', 'Man-made'], waterColor: ['#6fe0c0', 'Water color'] };
const iconCache = {};
function evIcon(cat) {
  if (iconCache[cat]) return iconCache[cat];
  const [c] = cat === 'rx' ? ['#f5b862'] : CAT[cat] || ['#8fd8ff'], cv = document.createElement('canvas'); cv.width = cv.height = 48; const g = cv.getContext('2d');
  const grd = g.createRadialGradient(24, 24, 2, 24, 24, 22); grd.addColorStop(0, c); grd.addColorStop(0.55, c + 'cc'); grd.addColorStop(1, c + '00');
  g.fillStyle = grd; g.beginPath(); g.arc(24, 24, 22, 0, 7); g.fill();
  g.fillStyle = '#0a0d14'; g.beginPath();
  if (cat === 'wildfires' || cat === 'rx') { g.moveTo(24, 12); g.bezierCurveTo(33, 21, 31, 33, 24, 35); g.bezierCurveTo(17, 33, 15, 25, 21, 19); g.bezierCurveTo(21, 24, 24, 25, 24, 12); }
  else if (cat === 'volcanoes') { g.moveTo(13, 34); g.lineTo(21, 17); g.lineTo(27, 17); g.lineTo(35, 34); }
  else if (cat === 'severeStorms') { g.arc(24, 24, 7, 0, 7); g.moveTo(31, 24); g.arc(24, 24, 11, 0, 4); }
  else { g.arc(24, 24, 5, 0, 7); }
  g.fill(); return (iconCache[cat] = cv);
}
// "Prescribed Fire KENDRICK RX-WRD CY26, Coconino, Arizona" → "Kendrick RX-WRD CY26" (the card keeps the full title)
const shortTitle = (t) => {
  let s = String(t || '').replace(/^\s*(prescribed fire|wildfire|wildfires|fire)\s+/i, '').split(',')[0].trim();
  if (s && s === s.toUpperCase() && /[A-Z]{4}/.test(s)) s = s.toLowerCase().replace(/\b[a-z]{4,}\b/g, (w) => w[0].toUpperCase() + w.slice(1)).replace(/\b(rx|wrd|[a-z]{1,3}\d+)\b/g, (w) => w.toUpperCase());
  return s.length > 34 ? s.slice(0, 32).trim() + '…' : s || String(t || 'Event');
};
EV.labels = [];
// names go through the main label engine, so they never pile on top of each other or the place names
GE.labelSources.push(() => (EV.on ? EV.labels : null));
async function eventLoad() {
  try {
    const d = await GE.fetchJSON(GE.CFG.url.events, { timeout: 20000 }); EV.ds.entities.removeAll(); EV.n = 0;
    const labels = [];
    for (const ev of d.events || []) {
      const cat = ev.categories?.[0]?.id || 'manmade', g = ev.geometry?.[ev.geometry.length - 1]; if (!g) continue;
      let lon, lat;
      if (g.type === 'Point') [lon, lat] = g.coordinates;
      else if (g.type === 'Polygon') { const ring = g.coordinates[0]; lon = ring.reduce((a, p) => a + p[0], 0) / ring.length; lat = ring.reduce((a, p) => a + p[1], 0) / ring.length; }
      else continue;
      const rx = /^\s*prescribed/i.test(ev.title || ''), pos = C.Cartesian3.fromDegrees(lon, lat);
      const e = EV.ds.entities.add({
        position: pos, show: horizon.see(pos),
        billboard: { image: evIcon(rx ? 'rx' : cat), scale: rx ? 0.52 : 0.62, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 2.5e6, scaleByDistance: new C.NearFarScalar(2e4, 1.1, 1.5e7, 0.5) },
      });
      e.gePos = pos;
      e.ge = { kind: 'event', title: ev.title, cat, catName: rx ? 'Prescribed fire' : (CAT[cat] || [0, ev.categories?.[0]?.title || 'Event'])[1], date: g.date, link: ev.sources?.[0]?.url || ev.link, lat, lon, mag: g.magnitudeValue, magUnit: g.magnitudeUnit };
      labels.push({ t: 'v', name: shortTitle(ev.title), lon, lat, pos, pri: rx ? 1 : 0, extra: { rx, cat }, ent: e });
      EV.n++;
    }
    EV.labels = labels; horizon.kick(); GE.labels.update && GE.labels.update();
    GE.scene.requestRender(); GE.emit('events', EV.n);
  } catch (e) { console.warn(e); GE.toast('NASA EONET events did not load.'); }
}
EV.enable = (on) => {
  EV.on = on; clearInterval(EV.timer);
  if (!EV.ds) { EV.ds = new C.CustomDataSource('events'); GE.viewer.dataSources.add(EV.ds); }
  EV.ds.show = on; GE.labels.update && GE.labels.update(); if (!on) { GE.scene.requestRender(); return; }
  eventLoad(); EV.timer = setInterval(eventLoad, 30 * 60000);
};

// ── Wildfire hotspots (NASA FIRMS, VIIRS on NOAA-20, last 24 hours) ─────────
const FI = (GE.live.fires = { on: false, pts: null, timer: 0, n: 0, when: null });
function parseFirms(csv) {
  const L = csv.trim().split(/\r?\n/), h = L.shift().split(','), ix = (n) => h.indexOf(n);
  const la = ix('latitude'), lo = ix('longitude'), fr = ix('frp'), cf = ix('confidence'), dt = ix('acq_date'), tm = ix('acq_time'), dn = ix('daynight'), br = ix('bright_ti4');
  return L.map((l) => { const c = l.split(','); const conf = String(c[cf]).toLowerCase(); return [+c[la], +c[lo], +c[fr] || 0, conf.startsWith('h') ? 2 : conf.startsWith('l') ? 0 : 1, c[dt] + ' ' + String(c[tm]).padStart(4, '0'), c[dn], +c[br] || 0]; })
    .filter((r) => isFinite(r[0]) && isFinite(r[1]) && r[3] > 0);
}
GE.live.parseFirms = parseFirms;
async function fireLoad() {
  let rows = null, when = null;
  if (/^https?:/.test(location.protocol)) { try { const d = await GE.fetchJSON('data/firms.json', { timeout: 20000 }); if (d && d.rows && d.rows.length) { rows = d.rows; when = Date.parse(d.updated); } } catch {} }
  if (!rows && GE.keys.firms) { try { rows = parseFirms(await GE.fetchJSON(GE.fill(GE.CFG.url.firms, { key: encodeURIComponent(GE.keys.firms) }), { text: true, timeout: 45000 })); when = Date.now(); } catch (e) { console.warn(e); } }
  if (!rows) { GE.toast('Wildfire hotspots need your NASA FIRMS map key in Settings, or the GitHub data pipeline.', 7000); GE.prefs.fires = false; GE.savePrefs(); GE.emit('prefs'); FI.enable(false); return; }
  rows.sort((a, b) => b[2] - a[2]); rows = rows.slice(0, GE.isMobile ? 15000 : 45000);
  FI.pts.removeAll();
  for (const r of rows) {
    const f = r[2], c = f < 5 ? '#ffd166' : f < 20 ? '#ffa04d' : f < 80 ? '#ff6a3d' : '#ff2d55';
    FI.pts.add({ position: C.Cartesian3.fromDegrees(r[1], r[0], 0), pixelSize: GE.clamp(2.5 + Math.log2(1 + f) * 1.1, 2.5, 11), color: col(c, 0.92), scaleByDistance: new C.NearFarScalar(5e4, 1.4, 1.5e7, 0.55), disableDepthTestDistance: 1.2e7, id: { kind: 'fire', r } });
  }
  FI.n = rows.length; FI.when = when; horizon.kick(); GE.scene.requestRender(); GE.emit('fires', FI.n);
}
FI.enable = (on) => {
  FI.on = on; clearInterval(FI.timer);
  if (!FI.pts) FI.pts = GE.scene.primitives.add(new C.PointPrimitiveCollection());
  FI.pts.show = on; if (!on) { GE.scene.requestRender(); return; }
  fireLoad(); FI.timer = setInterval(fireLoad, 30 * 60000);
};
}
