// ───────────────────────── God's Eye · panels ─────────────────────────
// Layers sheet, settings sheet, and the sun ribbon (48 hours of light for wherever you're looking).
{
const $ = GE.$, F = GE.fmt;

// ── sheets ─────────────────────────────────────────────────
const sheets = { layers: $('layers'), settings: $('settings') }, btns = { layers: $('layersBtn'), settings: $('setBtn') };
GE.ui.sheet = (name) => { for (const k in sheets) { const on = k === name && sheets[k].hidden; sheets[k].hidden = !on; btns[k].setAttribute('aria-pressed', on); } };
btns.layers.onclick = () => GE.ui.sheet('layers'); btns.settings.onclick = () => GE.ui.sheet('settings');
addEventListener('keydown', (e) => { if (e.key === 'Escape') GE.ui.sheet(null); });
GE.on('needKeys', () => { GE.ui.sheet('settings'); setTimeout(() => $('kIon').focus(), 50); });

function toggleRow(parent, { key, label, desc, color, apply, count }) {
  const row = document.createElement('div'); row.className = 'trow';
  row.innerHTML = `<span class="dot" style="--c:${color}"></span><span class="tx"><b></b><small></small></span><button type="button" class="sw-toggle" role="switch"></button>`;
  row.querySelector('b').textContent = label; const small = row.querySelector('small'); small.textContent = desc;
  const sw = row.querySelector('button'); sw.setAttribute('aria-label', label);
  const sync = () => sw.setAttribute('aria-checked', !!GE.prefs[key]);
  sw.onclick = async () => { GE.prefs[key] = !GE.prefs[key]; GE.savePrefs(); sync(); await apply(GE.prefs[key]); };
  if (count) GE.on(count, (n) => (small.textContent = `${desc} · ${F.n(n)} now`));
  GE.on('prefs', sync); sync(); parent.append(row); return row;
}
GE.ui.initPanels = () => {
  const ov = $('ovList'), live = $('liveList');
  toggleRow(ov, { key: 'labels', label: 'Place names', desc: 'Cities, countries, peaks, seas', color: '#c9d3e3', apply: (on) => GE.labels.enable(on) });
  toggleRow(ov, { key: 'borders', label: 'Borders', desc: 'Countries and states, drawn sharp', color: '#faf7f0', apply: (on) => { GE.labels.borders.show = on; GE.scene.requestRender(); } });
  toggleRow(ov, { key: 'roads', label: 'Roads', desc: 'Highways and streets', color: '#f5b862', apply: (on) => { GE.L.roads.show = on; GE.scene.requestRender(); } });
  const terr = toggleRow(ov, { key: 'terrain', label: '3D terrain', desc: 'Mountains and canyons in true relief', color: '#b3a07d', apply: () => GE.applyTerrain() });
  const relief = document.createElement('div'); relief.className = 'chips'; relief.style.margin = '0 0 6px 19px';
  [1, 1.5, 2, 3].forEach((x) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = x + '×'; b.title = 'Relief exaggeration'; b.onclick = () => { GE.prefs.relief = x; GE.savePrefs(); GE.scene.verticalExaggeration = x; GE.scene.requestRender(); syncRelief(); }; relief.append(b); });
  const syncRelief = () => relief.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', parseFloat(b.textContent) === GE.prefs.relief)); syncRelief();
  terr.after(relief);
  toggleRow(ov, { key: 'lights', label: 'City lights at night', desc: 'NASA Black Marble on the dark side', color: '#ffcf80', apply: () => GE.applyLights() });
  toggleRow(ov, { key: 'sunEverywhere', label: 'Sunlight at every zoom', desc: 'Night falls on the street too', color: '#f5b862', apply: () => GE.applySunEverywhere() });
  toggleRow(ov, { key: 'shadows', label: 'Sun shadows', desc: 'Terrain and buildings cast real shadows', color: '#a99bff', apply: () => GE.applyShadows() });
  toggleRow(ov, { key: 'buildings', label: '3D buildings', desc: 'OpenStreetMap, needs an ion token', color: '#efe9df', apply: () => GE.applyBuildings() });
  toggleRow(live, { key: 'sats', label: 'Satellites', desc: 'Stations, brightest, GPS', color: '#f5b862', count: 'satsReady', apply: (on) => GE.live.sats.enable(on) });
  toggleRow(live, { key: 'starlink', label: 'Starlink', desc: 'Adds thousands of points', color: '#86a8ff', apply: (on) => { const S = GE.live.sats; if (!on) { for (const s of S.list) if (s.group === 'starlink') S.pts.remove(s.pt); S.list = S.list.filter((s) => s.group !== 'starlink'); } if (S.on) S.enable(true); } });
  toggleRow(live, { key: 'flights', label: 'Flights', desc: 'Live ADS-B where you look', color: '#8fd8ff', count: 'flights', apply: (on) => GE.live.flights.enable(on) });
  toggleRow(live, { key: 'quakes', label: 'Earthquakes', desc: 'USGS, M2.5+, past week', color: '#ff8f45', count: 'quakes', apply: (on) => GE.live.quakes.enable(on) });
  toggleRow(live, { key: 'fires', label: 'Wildfire hotspots', desc: 'NASA FIRMS satellites, last 24 h', color: '#ff6a3d', count: 'fires', apply: (on) => GE.live.fires.enable(on) });
  toggleRow(live, { key: 'events', label: 'Natural events', desc: 'NASA EONET: volcanoes, storms, big fires', color: '#b39dff', count: 'events', apply: (on) => GE.live.events.enable(on) });
  $('toolMeasure').onclick = () => { GE.ui.sheet(null); GE.measure.toggle(true); };
  $('toolDraw').onclick = () => { GE.ui.sheet(null); GE.draw.toggle(true); };

  // base Earth tiles
  const NOTES = { satellite: 'Esri World Imagery. In many cities it resolves detail down to about 30 cm.', daily: "NASA's satellite mosaic for one day: that day's clouds, smoke and snow. Sharp imagery returns as you zoom in.", photoreal: 'Google Photorealistic 3D Tiles, lit by the real sun. Search switches to Google to match.', night: "Earth at night from NASA's Black Marble." };
  const syncBase = () => {
    document.querySelectorAll('[data-base]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.base === GE.prefs.base));
    $('baseNote').textContent = NOTES[GE.prefs.base] + (GE.prefs.base !== 'photoreal' && !GE.keys.ion && !GE.keys.google ? ' 3D Cities unlocks with a free key in Settings.' : '');
    $('dailyBar').hidden = GE.prefs.base !== 'daily';
  };
  document.querySelectorAll('[data-base]').forEach((b) => (b.onclick = async () => { await GE.setBase(b.dataset.base); syncBase(); }));
  GE.on('base', syncBase); syncBase();
  const dd = $('dDate'), yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  dd.min = '2000-02-24'; dd.max = yest; dd.value = GE.dailyDate || yest;
  const setDate = (s) => { if (!s) return; s = s < dd.min ? dd.min : s > dd.max ? dd.max : s; dd.value = s; GE.setDailyDate(s); };
  dd.onchange = () => setDate(dd.value);
  const shift = (n) => { const d = new Date(dd.value + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); setDate(d.toISOString().slice(0, 10)); };
  $('dPrev').onclick = () => shift(-1); $('dNext').onclick = () => shift(1);

  // vision
  const syncVision = () => document.querySelectorAll('[data-vision]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.vision === GE.prefs.vision));
  document.querySelectorAll('[data-vision]').forEach((b) => (b.onclick = () => { GE.setVision(b.dataset.vision); syncVision(); }));
  GE.on('vision', syncVision); syncVision();

  // settings
  const syncDetail = () => document.querySelectorAll('[data-detail]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.detail === GE.prefs.detail));
  document.querySelectorAll('[data-detail]').forEach((b) => (b.onclick = () => { GE.setDetail(b.dataset.detail); syncDetail(); })); syncDetail();
  const pl = $('prefList'), units = document.createElement('div'); units.className = 'chips'; units.style.margin = '9px 0 4px';
  [['metric', 'Metric'], ['imperial', 'Imperial']].forEach(([k, t]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.u = k; b.textContent = t; b.onclick = () => { GE.prefs.units = k; GE.savePrefs(); units.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.u === k)); GE.ui.status && GE.ui.status(); }; units.append(b); });
  units.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.u === GE.prefs.units)); pl.append(units);
  toggleRow(pl, { key: 'voice', label: "Milo's voice", desc: 'Milo speaks replies and tour lines', color: '#8fd8ff', apply: (on) => { if (!on) GE.milo.stopVoice(); else GE.milo.speak("Milo's voice is on."); } });
  $('kIon').value = GE.keys.ion; $('kGoogle').value = GE.keys.google; $('kAnthropic').value = GE.keys.anthropic; $('kModel').value = GE.keys.model; $('kFirms').value = GE.keys.firms; $('kMly').value = GE.keys.mapillary; $('kRelay').value = GE.keys.relay;
  // a relay address: https only, no trailing slash (a bare host gets https:// added)
  const cleanRelay = (v) => { v = String(v || '').trim().replace(/\/+$/, ''); if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v; return /^https:\/\/[^\s/]+(\/[^\s]*)?$/i.test(v) ? v : ''; };
  $('kSave').onclick = async () => {
    const before = { ...GE.keys };
    Object.assign(GE.keys, { ion: $('kIon').value.trim(), google: $('kGoogle').value.trim(), anthropic: $('kAnthropic').value.trim(), model: $('kModel').value, firms: $('kFirms').value.trim(), mapillary: $('kMly').value.trim(), relay: cleanRelay($('kRelay').value) });
    GE.store.set('keys', GE.keys); GE.toast('Keys saved in this browser.');
    if (before.relay !== GE.keys.relay && GE.keys.relay) { GE.prefs.flights = true; GE.savePrefs(); GE.emit('prefs'); GE.live.flights.enable(true); GE.toast('Flight relay saved. Looking for live flights…'); } // try it at once
    if (before.ion !== GE.keys.ion) await GE.applyTerrain();
    if (before.ion !== GE.keys.ion || before.google !== GE.keys.google) { if (GE.photoreal) { GE.scene.primitives.remove(GE.photoreal); GE.photoreal = null; } GE.emit('needKeysChanged'); if (GE.prefs.base === 'photoreal') GE.setBase('photoreal'); }
    syncBase(); GE.emit('keys');
  };
  $('kClear').onclick = () => { GE.store.del('keys'); Object.assign(GE.keys, { ion: '', google: '', anthropic: '', firms: '', mapillary: '', relay: '' }); ['kIon', 'kGoogle', 'kAnthropic', 'kFirms', 'kMly', 'kRelay'].forEach((id) => ($(id).value = '')); GE.toast('Keys removed from this browser.'); if (GE.prefs.base === 'photoreal') GE.setBase('satellite'); GE.applyTerrain(); syncBase(); GE.emit('keys'); };
  $('setHome').onclick = () => { const c = GE.viewCenter(); if (!c) return; GE.CFG.home = { name: (GE.sel && GE.sel.name) || 'Home', sub: 'Your home view', lon: c.lon, lat: c.lat }; GE.store.set('home', GE.CFG.home); GE.toast('Home set to this view.'); };
  $('shareView').onclick = () => { GE.ui.writeHash(); setTimeout(() => GE.copy(location.href, 'Link to this exact view copied'), 750); };
};

// ── cinema dock (Creative mode) ────────────────────────────
GE.ui.initCinema = () => {
  const toggle = (mode, start) => () => (GE.cam.mode === mode ? GE.cam.stop() : start());
  $('cTour').onclick = toggle('tour', () => GE.cam.tour());
  $('cOrbit').onclick = toggle('orbit', () => GE.cam.orbit(GE.sel || undefined));
  $('cDive').onclick = () => GE.cam.dive(GE.sel || null);
  $('cGold').onclick = () => { const p = GE.sel || GE.viewCenter(); if (!p) return; const t = GE.ui.goldenHere(p); if (t) GE.toast(`Golden hour here starts ${F.clock(t)} your time.`); };
  $('cIss').onclick = toggle('ride', async () => { const n = await GE.rideSat('iss'); GE.toast(n ? `Riding with the ${n === 'ISS (ZARYA)' ? 'ISS' : n}. Touch anywhere to let go.` : 'The ISS feed did not answer.'); });
  const ORDER = ['normal', 'nv', 'thermal', 'mono', 'cinema'], NAMES = { normal: 'Normal vision', nv: 'Night vision', thermal: 'Thermal', mono: 'Noir', cinema: 'Cinema grade' };
  $('cVision').onclick = () => { const next = ORDER[(ORDER.indexOf(GE.prefs.vision) + 1) % ORDER.length]; GE.setVision(next); GE.toast(NAMES[next], 1600); };
  GE.on('camMode', (m) => { $('cTour').setAttribute('aria-pressed', m === 'tour'); $('cOrbit').setAttribute('aria-pressed', m === 'orbit'); $('cIss').setAttribute('aria-pressed', m === 'ride'); });
};

// ── Sun ribbon ─────────────────────────────────────────────
const cv = $('rbCanvas'), track = $('rbTrack'), H48 = 48 * 3600e3;
const RB = (GE.ribbon = { where: null, name: '', t0: 0 });
const STOPS = [[-90, [7, 10, 26]], [-18, [9, 13, 34]], [-12, [16, 22, 58]], [-6, [36, 46, 104]], [-4, [62, 76, 150]], [-2, [214, 110, 64]], [1, [244, 150, 74]], [6, [255, 205, 128]], [14, [178, 214, 246]], [40, [126, 186, 240]], [90, [100, 168, 232]]];
const skyRGB = (a) => { for (let i = 1; i < STOPS.length; i++) if (a <= STOPS[i][0]) { const [a0, c0] = STOPS[i - 1], [a1, c1] = STOPS[i], t = (a - a0) / (a1 - a0); return c0.map((v, k) => Math.round(v + (c1[k] - v) * t)); } return STOPS[STOPS.length - 1][1]; };
RB.locate = () => {
  const s = GE.sel; if (s) { RB.where = { lat: s.lat, lon: s.lon }; RB.name = s.name || 'Pin'; return; }
  const c = GE.viewCenter(); if (c) { RB.where = { lat: c.lat, lon: c.lon }; if (!RB.name || RB.nameAt !== `${c.lat.toFixed(1)},${c.lon.toFixed(1)}`) RB.lookupName(c); }
};
RB.lookupName = GE.debounce(async (c) => {
  RB.nameAt = `${c.lat.toFixed(1)},${c.lon.toFixed(1)}`;
  if (GE.camera.positionCartographic.height > 3e6) { RB.name = `${Math.abs(c.lat).toFixed(0)}°${c.lat >= 0 ? 'N' : 'S'} ${Math.abs(c.lon).toFixed(0)}°${c.lon >= 0 ? 'E' : 'W'}`; RB.label(); return; }
  if (GE.prefs.base === 'photoreal') return;
  try { const d = await GE.fetchJSON(`${GE.CFG.url.photonRev}?lat=${c.lat}&lon=${c.lon}&lang=en`, { timeout: 6000 }); const p = d.features && d.features[0] && d.features[0].properties; if (p) { RB.name = p.city || p.town || p.village || p.county || p.state || p.name || p.country || ''; RB.label(); } } catch {}
}, 900);
RB.draw = () => {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = track.clientWidth, h = track.clientHeight; if (!w || !RB.where) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'), n = cv.width; RB.t0 = Date.now() - H48 / 2;
  for (let i = 0; i < n; i += 2) { const t = RB.t0 + (i / n) * H48, c = skyRGB(GE.sun.altAz(t, RB.where.lat, RB.where.lon).alt); g.fillStyle = `rgb(${c})`; g.fillRect(i, 0, 2, cv.height); }
  // midnights in the viewer's own time zone, as faint ticks
  g.fillStyle = 'rgba(255,255,255,.22)';
  const d = new Date(RB.t0); d.setHours(24, 0, 0, 0);
  for (let t = d.getTime(); t < RB.t0 + H48; t += 86400e3) g.fillRect(((t - RB.t0) / H48) * n, 0, Math.max(1, dpr), cv.height);
  $('rbNow').style.left = '50%';
  RB.head();
};
RB.head = () => {
  const w = track.clientWidth, t = GE.time.now(), off = t - Date.now();
  if (GE.time.playing && off > H48 / 2) GE.time.set(Date.now() - H48 / 2);
  $('rbHead').style.left = GE.clamp((t - (Date.now() - H48 / 2)) / H48, 0, 1) * w + 'px';
  track.setAttribute('aria-valuenow', (off / 3600e3).toFixed(2));
  $('rbTime').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(t);
  const live = Math.abs(off) < 120000 && !GE.time.playing, o = $('rbOff');
  o.classList.toggle('live', live);
  const a = Math.abs(off) / 60000, hh = Math.floor(a / 60), mm = Math.round(a % 60);
  o.textContent = live ? 'Live' : GE.time.playing ? 'Playing' : `${off >= 0 ? '+' : '−'}${hh}h ${String(mm).padStart(2, '0')}m`;
  $('rbPlay').innerHTML = `<svg class="i"><use href="#i-${GE.time.playing ? 'pause' : 'play'}"/></svg>`; $('rbPlay').setAttribute('aria-pressed', !!GE.time.playing);
  RB.label();
};
RB.label = () => {
  if (!RB.where) return; const s = GE.sun.altAz(GE.time.now(), RB.where.lat, RB.where.lon);
  $('rbPlace').textContent = `${RB.name ? RB.name + ' · ' : ''}${GE.sun.phase(s.alt)} · sun ${s.alt.toFixed(0)}°`;
};
const scrub = (x) => { const r = track.getBoundingClientRect(), f = GE.clamp((x - r.left) / r.width, 0, 1); let t = Date.now() - H48 / 2 + f * H48; if (Math.abs(t - Date.now()) < 5 * 60000) t = Date.now(); GE.time.play(false); GE.time.set(t); RB.head(); };
track.addEventListener('pointerdown', (e) => { track.setPointerCapture(e.pointerId); scrub(e.clientX); });
track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) scrub(e.clientX); });
track.addEventListener('keydown', (e) => { const step = (e.shiftKey ? 60 : 15) * 60000; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); GE.time.play(false); GE.time.set(GE.clamp(GE.time.now() + (e.key === 'ArrowRight' ? step : -step), Date.now() - H48 / 2, Date.now() + H48 / 2)); RB.head(); } });
$('rbLive').onclick = () => { GE.time.live(); RB.head(); };
$('rbPlay').onclick = () => { GE.time.play(!GE.time.playing); RB.head(); };
$('rbGold').onclick = () => { if (!RB.where) return; const t = GE.ui.goldenHere(RB.where); if (t) { RB.head(); GE.toast(`Golden hour ${RB.name ? 'in ' + RB.name + ' ' : ''}starts ${F.clock(t)} your time.`); } };
RB.init = () => {
  RB.locate(); RB.draw();
  const relocate = GE.debounce(() => { RB.locate(); RB.draw(); }, 400);
  GE.camera.moveEnd.addEventListener(relocate); GE.on('sel', relocate); addEventListener('resize', relocate);
  setInterval(RB.head, 500); setInterval(RB.draw, 60000); GE.on('time', RB.head);
};
}
