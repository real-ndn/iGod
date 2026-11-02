// ───────────────────────── God's Eye · Milo ─────────────────────────
// A small orb. Tap to talk, hold to type. Local commands always work; with an Anthropic key Milo
// thinks with Claude and drives the globe through tools.
{
const $ = GE.$, F = GE.fmt, R = Math.PI / 180;
const orb = $('orb'), cap = $('miloCap'), form = $('miloForm'), input = $('miloIn');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let capT, rec = null, listening = false, busy = false, history = GE.store.get('milo.history', []);
const state = (s) => (orb.dataset.s = s || '');

const milo = (GE.milo = {
  show(text, you) {
    cap.innerHTML = ''; if (you) { const y = document.createElement('span'); y.className = 'you'; y.textContent = '“' + you + '”'; cap.append(y); }
    cap.append(document.createTextNode(text)); cap.classList.add('on'); clearTimeout(capT);
    capT = setTimeout(() => cap.classList.remove('on'), Math.max(5000, text.length * 75));
  },
  speak(text) {
    if (!GE.prefs.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text);
      const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      u.voice = vs.find((v) => /natural|premium|enhanced/i.test(v.name)) || vs.find((v) => /Daniel|Samantha|Aaron|Evan|Google US English|Google UK English Male/i.test(v.name)) || vs[0] || null;
      u.rate = 1.03; u.pitch = 0.97; u.onstart = () => state('speak'); u.onend = u.onerror = () => state(listening ? 'listen' : busy ? 'think' : '');
      speechSynthesis.speak(u);
    } catch {}
  },
  say(text, you) { milo.show(text, you); milo.speak(text); },
});

// ── input: tap = voice (when the browser has it), hold or no-voice = keyboard
let pressT = 0, held = false;
orb.addEventListener('pointerdown', () => { held = false; pressT = setTimeout(() => { held = true; openForm(); }, 450); });
orb.addEventListener('pointerup', () => clearTimeout(pressT));
orb.addEventListener('pointerleave', () => clearTimeout(pressT));
orb.addEventListener('contextmenu', (e) => { e.preventDefault(); openForm(); });
orb.addEventListener('click', () => { if (held) return; if (listening) return rec && rec.stop(); if (SR) listen(); else openForm(); });
function openForm() { form.hidden = !form.hidden; if (!form.hidden) setTimeout(() => input.focus(), 30); }
form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; form.hidden = true; handle(t); });
input.addEventListener('keydown', (e) => { if (e.key === 'Escape') form.hidden = true; });
function listen() {
  try {
    try { speechSynthesis.cancel(); } catch {}
    rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1;
    let final = '';
    rec.onstart = () => { listening = true; state('listen'); milo.show('Listening…'); };
    rec.onresult = (e) => { let t = ''; for (const r of e.results) { t += r[0].transcript; if (r.isFinal) final = t; } milo.show('…', t); };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { GE.toast('Microphone access was declined. Hold the orb to type instead.'); openForm(); } };
    rec.onend = () => { listening = false; state(busy ? 'think' : ''); if (final.trim()) handle(final.trim()); else cap.classList.remove('on'); };
    rec.start();
  } catch (e) { console.warn(e); openForm(); }
}
addEventListener('keydown', (e) => { if (e.target.closest('input, select, textarea')) return; if (e.key === 'm' || e.key === 'M') { e.preventDefault(); SR ? listen() : openForm(); } });

// ── shared helpers for both brains
async function placeFrom(text) {
  const t = text.trim(); if (!t) return null;
  if (/^(home|my home)$/i.test(t)) return { ...GE.CFG.home };
  if (/^(me|here|my location|where i am)$/i.test(t)) return GE.here ? { ...GE.here, name: 'You' } : null;
  const hero = GE.PLACES.find((p) => p.name.toLowerCase() === t.toLowerCase()); if (hero) return hero;
  const r = await GE.geocode(t).catch(() => []); return r[0] || null;
}
const centerOrSel = () => GE.sel || GE.viewCenter();
function timeTo(moment, p = centerOrSel()) {
  if (!p) return null; const now = Date.now(), s = GE.sun;
  let t = null;
  if (moment === 'now') { GE.time.live(); return now; }
  if (moment === 'golden_hour') return GE.ui.goldenHere(p);
  if (moment === 'sunset') t = s.cross(p.lat, p.lon, now - 3600e3, -0.833, -1, 40);
  if (moment === 'sunrise') t = s.cross(p.lat, p.lon, now - 3600e3, -0.833, 1, 40);
  if (moment === 'night') t = s.cross(p.lat, p.lon, now - 3600e3, -18, -1, 40);
  if (moment === 'solar_noon') { let best = -99; for (let k = -12; k <= 24; k += 0.1) { const tt = now + k * 3600e3, a = s.altAz(tt, p.lat, p.lon).alt; if (a > best) { best = a; t = tt; } } }
  if (t == null) return null;
  if (!GE.prefs.sunEverywhere) { GE.prefs.sunEverywhere = true; GE.savePrefs(); GE.applySunEverywhere(); GE.emit('prefs'); }
  GE.time.play(false); GE.time.set(GE.clamp(t, now - 24 * 3600e3, now + 24 * 3600e3)); return t;
}
const LAYERS = { sats: /satellite|sats\b/, starlink: /starlink/, flights: /flight|plane|aircraft|adsb|air traffic/, quakes: /earthquake|quake|seismic/, fires: /hotspot|firms|wildfire|\bfires?\b/, events: /volcano|storm|hurricane|natural event|\bevents?\b/, borders: /border/, labels: /label|place name|names/, roads: /road|street|highway/, terrain: /terrain|relief|mountain/, lights: /city light|night light|lights/, shadows: /shadow/, buildings: /building/, sunEverywhere: /sunlight everywhere|real sun/ };
async function setLayer(k, on) {
  if (!(k in GE.prefs)) throw new Error('Unknown layer ' + k);
  GE.prefs[k] = on; GE.savePrefs(); GE.emit('prefs');
  const map = { sats: () => GE.live.sats.enable(on), flights: () => GE.live.flights.enable(on), quakes: () => GE.live.quakes.enable(on), events: () => GE.live.events.enable(on), labels: () => GE.labels.enable(on), borders: () => (GE.labels.borders.show = on), fires: () => GE.live.fires.enable(on), roads: () => (GE.L.roads.show = on), terrain: () => GE.applyTerrain(), lights: () => GE.applyLights(), shadows: () => GE.applyShadows(), buildings: () => GE.applyBuildings(), sunEverywhere: () => GE.applySunEverywhere(), starlink: () => GE.live.sats.on && GE.live.sats.enable(true) };
  await (map[k] || (() => 0))(); GE.scene.requestRender();
}
async function ride(name = 'iss') {
  if (!GE.live.sats.on) { GE.prefs.sats = true; GE.savePrefs(); GE.emit('prefs'); await GE.live.sats.enable(true); }
  const s = /iss|space station/i.test(name) ? GE.live.sats.iss : GE.live.sats.find(name);
  if (s) { GE.ui.showSat(s); GE.cam.ride(s); return s.name; }
  if (/iss|space station/i.test(name)) { await GE.live.iss.enable(true); GE.cam.ride('iss'); return 'ISS'; }
  return null;
}
async function routeCmd(fromTxt, toTxt, fly = true) {
  const to = await placeFrom(toTxt); if (!to) return `I couldn't find ${toTxt}.`;
  const from = fromTxt ? await placeFrom(fromTxt) : GE.here ? { ...GE.here, name: 'You' } : { ...GE.CFG.home };
  if (!from) return `I couldn't find ${fromTxt}.`;
  const r = await GE.cam.route(from, to).catch(() => null); if (!r) return 'There is no drivable route between those.';
  if (fly) GE.cam.flyRoute(r);
  return `${from.name || 'Start'} to ${to.name}: ${F.dist(r.distance)}, about ${F.rel(r.duration * 1000).replace('in ', '')} of driving.${fly ? ' Flying the road now.' : ''}`;
}
async function describe() {
  const c = GE.viewCenter(), k = GE.camera.positionCartographic, out = { camera_altitude_m: Math.round(k.height), heading_deg: Math.round(GE.camera.heading / R), pitch_deg: Math.round(GE.camera.pitch / R), simulated_time: new Date(GE.time.now()).toISOString(), hours_from_now: +GE.time.offsetH().toFixed(2), base: GE.prefs.base, vision: GE.prefs.vision, mode: GE.prefs.mode, layers_on: Object.keys(LAYERS).filter((x) => GE.prefs[x]) };
  if (c) { out.center = { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), ground_elevation_m: Math.round(c.h || 0) }; const s = GE.sun.altAz(GE.time.now(), c.lat, c.lon); out.sun = { altitude_deg: +s.alt.toFixed(1), azimuth_deg: Math.round(s.az), phase: GE.sun.phase(s.alt) }; out.place_name = GE.ribbon.name || null; }
  if (GE.sel) out.selected = { name: GE.sel.name, lat: GE.sel.lat, lon: GE.sel.lon };
  if (GE.history.cur) out.historical_imagery = { date: GE.history.cur.date, compare: GE.history.compare };
  if (GE.live.fires.on) out.wildfire_hotspots = GE.live.fires.n;
  if (GE.live.quakes.on) out.earthquakes_loaded = GE.live.quakes.n; if (GE.live.flights.on) out.flights_tracked = GE.live.flights.map.size;
  if (GE.live.sats.on) out.satellites_tracked = GE.live.sats.list.length;
  return out;
}

// ── local brain: fast, offline, no key
async function local(text) {
  const t = text.toLowerCase().trim();
  if (/^(stop|cancel|halt|enough|pause)\b/.test(t)) { GE.cam.stop(); try { speechSynthesis.cancel(); } catch {} return 'Stopped. You have the controls.'; }
  if (/\btour\b|show me around/.test(t)) { GE.cam.tour(); return 'Rolling the tour. Touch anywhere to take over.'; }
  if (/\b(ride|board|fly with|follow)\b.*\b(iss|space station|hubble|satellite)/.test(t) || /^(the )?iss\b/.test(t)) { const n = await ride(/hubble/.test(t) ? 'hubble' : 'iss'); return n ? `Riding with ${n}. That's real orbital speed.` : 'I could not reach the satellite catalog.'; }
  let m = t.match(/(?:drive|route|directions|road trip)(?: me)?(?: from (.+?))? to (.+)$/);
  if (m) return routeCmd(m[1], m[2]);
  if (/golden hour|sunset|sunrise|solar noon|\bnoon\b|\bmidnight\b|\bat night\b|tonight/.test(t)) {
    const where = (t.match(/\b(?:in|at|over|for) (.+?)$/) || [])[1];
    if (where) { const p = await placeFrom(where); if (p) { GE.ui.showPlace({ name: p.name, sub: p.sub, lon: p.lon, lat: p.lat }); await GE.cam.flyTo({ lon: p.lon, lat: p.lat, pitch: -16, range: 3000, heading: p.v ? p.v[0] : 0 }); } }
    const mo = /sunrise/.test(t) ? 'sunrise' : /sunset/.test(t) ? 'sunset' : /noon/.test(t) ? 'solar_noon' : /night|midnight/.test(t) ? 'night' : 'golden_hour';
    const when = timeTo(mo); return when ? `${mo.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())} there is ${F.clock(when)} your time. Clock moved.` : 'The sun does not do that there in the next day.';
  }
  if (/\b(back to )?(now|live|real time|reset (the )?time)\b/.test(t) && !/fly|go|show/.test(t)) { GE.time.live(); return 'Back to live time.'; }
  const vis = /night vision/.test(t) ? 'nv' : /thermal|infrared|heat/.test(t) ? 'thermal' : /noir|black and white|mono/.test(t) ? 'mono' : /cinema|cinematic look/.test(t) ? 'cinema' : /normal (vision|view)|regular vision/.test(t) ? 'normal' : null;
  if (vis) { GE.setVision(vis); return { nv: 'Night vision on.', thermal: 'Thermal on.', mono: 'Noir.', cinema: 'Cinema grade on.', normal: 'Back to normal vision.' }[vis]; }
  if (/creative mode/.test(t)) { GE.applyMode('creative'); GE.ui.syncMode(); return 'Creative mode. HUD down, light up.'; }
  if (/user mode|normal mode/.test(t)) { GE.applyMode('user'); GE.ui.syncMode(); return 'User mode.'; }
  if (/\b(show|turn on|enable|add|hide|turn off|disable|remove)\b/.test(t)) for (const [k, re] of Object.entries(LAYERS)) if (re.test(t)) { const on = !/\b(hide|off|disable|remove)\b/.test(t); await setLayer(k, on); return `${on ? 'Showing' : 'Hiding'} ${k === 'sats' ? 'satellites' : k === 'quakes' ? 'earthquakes' : k === 'events' ? 'natural events' : k}.`; }
  if (/\b(orbit|circle|drone)\b/.test(t)) { GE.cam.orbit(); return 'Orbiting.'; }
  if (/\bdive\b/.test(t)) { GE.cam.dive(GE.sel); return 'Diving in.'; }
  if (/back to today|today'?s imagery|current imagery/.test(t)) { GE.history.show(null); return 'Back to today\'s imagery.'; }
  const yr = t.match(/\b(?:in|from|back to|around)\s+((?:19|20)\d\d)\b/);
  if (yr || /then and now|time machine|historical imagery|old imagery|compare/.test(t)) {
    const it = await GE.history.showYear(yr ? +yr[1] : 2014); if (!it) return 'The imagery archive did not answer.';
    if (/then and now|compare|swipe/.test(t) || !yr) GE.history.setCompare(true);
    return `Showing the ${new Date(it.date + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} picture${GE.history.compare ? '. Drag the divider to compare with today.' : '.'}`;
  }
  if (/\b(draw|sketch)\b/.test(t)) { GE.draw.toggle(true); return GE.isTablet ? 'Draw with your Pencil. Fingers still move the map.' : 'Drawing on. Tap Done to move the map again.'; }
  if (/street (level|view)|streetlens|walk around|on the ground/.test(t)) { const c = GE.sel || GE.viewCenter(); if (!c) return 'Point me at a spot first.'; GE.street.open(c.lon, c.lat); return 'Looking for street-level photos here.'; }
  if (/zoom in|closer|get closer/.test(t)) { GE.cam.zoom(0.4); return 'Closer.'; }
  if (/zoom out|pull back|further/.test(t)) { GE.cam.zoom(2.5); return 'Pulling back.'; }
  if (/whole (earth|world|planet)|from space|\bglobe\b|\bspace\b/.test(t)) { const c = GE.viewCenter() || GE.CFG.home; GE.cam.stop(); GE.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 1.8e7), duration: 3 }); return 'The whole planet.'; }
  if (/\bnorth\b/.test(t)) { GE.cam.north(); return 'North up.'; }
  if (/top down|overhead|straight down|\b2d\b/.test(t)) { if (GE.camera.pitch > -1.2) GE.cam.tilt(); return 'Looking straight down.'; }
  if (/\btilt\b|\b3d\b/.test(t)) { if (GE.camera.pitch < -1.2) GE.cam.tilt(); return 'Tilted.'; }
  if (/where am i|my location|find me/.test(t)) { GE.ui.locate(); return 'Finding you.'; }
  if (/^(go )?home$|take me home|fly home/.test(t)) { $('homeBtn').click(); return `Home: ${GE.CFG.home.name}.`; }
  if (/what('s| is) (here|this|that)|where (are we|is this)/.test(t)) { const d = await describe(); return `${d.place_name || 'Somewhere at ' + F.ll(d.center?.lat || 0, d.center?.lon || 0, 2)}. Sun at ${d.sun ? d.sun.altitude_deg + '°, ' + d.sun.phase.toLowerCase() : 'unknown'}.`; }
  const q = (t.match(/^(?:fly (?:me )?to|take me to|go to|show me|find|search(?: for)?|where is|zoom (?:in )?(?:to|on))\s+(.+)$/) || [])[1] || text;
  const p = await placeFrom(q.replace(/[?.!]+$/, ''));
  if (p) { if (p.v) { GE.ui.showPlace({ name: p.name, sub: p.sub, lon: p.lon, lat: p.lat }); GE.cam.toPlace(p); } else GE.ui.choose(p); return `${p.name}${p.sub ? ', ' + p.sub.split(',').slice(-1)[0].trim() : ''}.`; }
  return "I didn't catch a place in that. Try “fly me to Sedona” or “golden hour at the Grand Canyon”.";
}

// ── Claude brain: tools that drive the globe
const TOOLS = [
  { name: 'fly_to', description: 'Fly the camera to a place anywhere on Earth, by name or by lat/lon. range_m is the distance from the target: 300 street, 2500 neighborhood, 25000 city, 400000 region, 8000000 continent. pitch_deg: -90 straight down, -15 near the horizon.', input_schema: { type: 'object', properties: { query: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' }, range_m: { type: 'number' }, pitch_deg: { type: 'number' }, heading_deg: { type: 'number' } } } },
  { name: 'search_places', description: 'Look up places by name. Returns up to 5 matches with coordinates.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'describe_view', description: 'What the camera sees now: center coordinates, place name, altitude, local sun, simulated time, layers, selection.', input_schema: { type: 'object', properties: {} } },
  { name: 'set_layer', description: 'Turn a layer on or off. One of: labels, roads, terrain, lights, sunEverywhere, shadows, buildings, sats, starlink, flights, quakes, events.', input_schema: { type: 'object', properties: { layer: { type: 'string' }, on: { type: 'boolean' } }, required: ['layer', 'on'] } },
  { name: 'set_base', description: 'Earth imagery: satellite (sharp aerial), daily (NASA mosaic of one day; pass date YYYY-MM-DD), photoreal (Google 3D cities, needs a key), night (Earth at night).', input_schema: { type: 'object', properties: { base: { type: 'string', enum: ['satellite', 'daily', 'photoreal', 'night'] }, date: { type: 'string' } }, required: ['base'] } },
  { name: 'set_time', description: 'Move the clock that drives the sun: hours_from_now between -24 and 24, or a moment at the current place.', input_schema: { type: 'object', properties: { hours_from_now: { type: 'number' }, moment: { type: 'string', enum: ['now', 'golden_hour', 'sunset', 'sunrise', 'solar_noon', 'night'] } } } },
  { name: 'set_vision', description: 'Visual filter for the whole view.', input_schema: { type: 'object', properties: { mode: { type: 'string', enum: ['normal', 'nv', 'thermal', 'mono', 'cinema'] } }, required: ['mode'] } },
  { name: 'camera_move', description: 'Cinematic moves around the current view or selection.', input_schema: { type: 'object', properties: { move: { type: 'string', enum: ['orbit', 'dive', 'tour', 'stop', 'north', 'tilt', 'top_down', 'zoom_in', 'zoom_out', 'space'] } }, required: ['move'] } },
  { name: 'ride_satellite', description: 'First-person ride with a satellite by name (ISS, HUBBLE, TIANGONG…). Turns the satellite layer on.', input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'route', description: 'Driving route between two places (names, "home", or "me"), drawn on the map; fly=true flies the road like a drone.', input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, fly: { type: 'boolean' } }, required: ['to'] } },
  { name: 'set_history', description: 'Time machine: show archived full-resolution satellite imagery from a past year (2014 onward) at the current place, optionally with a swipe divider comparing it to today. off=true returns to today.', input_schema: { type: 'object', properties: { year: { type: 'number' }, compare: { type: 'boolean' }, off: { type: 'boolean' } } } },
  { name: 'street_view', description: 'Open street-level photos (Mapillary) nearest to a place name or lat/lon, or the current view if neither is given.', input_schema: { type: 'object', properties: { query: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' } } } },
  { name: 'set_mode', description: 'Interface mode: user (labels, info cards) or creative (cinematic look, minimal HUD).', input_schema: { type: 'object', properties: { mode: { type: 'string', enum: ['user', 'creative'] } }, required: ['mode'] } },
];
async function runTool(name, a) {
  switch (name) {
    case 'fly_to': {
      let p = null; if (isFinite(a.lat) && isFinite(a.lon)) p = { lat: +a.lat, lon: +a.lon, name: a.query || 'Point' }; else if (a.query) p = await placeFrom(String(a.query));
      if (!p) throw new Error('Place not found'); GE.ui.showPlace({ name: p.name, sub: p.sub, lon: p.lon, lat: p.lat }, { noReverse: true });
      GE.cam.flyTo({ lon: p.lon, lat: p.lat, range: a.range_m || (p.v ? p.v[2] : 3000), pitch: a.pitch_deg ?? (p.v ? p.v[1] : -32), heading: a.heading_deg ?? (p.v ? p.v[0] : 0) });
      return { flying_to: p.name, lat: p.lat, lon: p.lon };
    }
    case 'search_places': return (await GE.geocode(String(a.query))).slice(0, 5).map((r) => ({ name: r.name, context: r.sub, type: r.tag, lat: +r.lat.toFixed(5), lon: +r.lon.toFixed(5) }));
    case 'describe_view': return describe();
    case 'set_layer': await setLayer(String(a.layer), !!a.on); return 'ok';
    case 'set_base': if (a.date) GE.dailyDate = a.date; return (await GE.setBase(a.base)) ? 'ok' : 'needs a Cesium ion token or Google key in Settings';
    case 'set_time': if (a.moment) { const t = timeTo(a.moment); return t ? { moved_to: new Date(t).toISOString() } : 'not within a day'; } GE.time.play(false); GE.time.set(Date.now() + GE.clamp(+a.hours_from_now || 0, -24, 24) * 3600e3); return 'ok';
    case 'set_vision': GE.setVision(a.mode); return 'ok';
    case 'camera_move': return local({ orbit: 'orbit', dive: 'dive', tour: 'tour', stop: 'stop', north: 'north', tilt: 'tilt', top_down: 'top down', zoom_in: 'zoom in', zoom_out: 'zoom out', space: 'whole earth' }[a.move] || 'stop');
    case 'ride_satellite': return (await ride(String(a.name))) || 'satellite not found';
    case 'route': return routeCmd(a.from, String(a.to), a.fly !== false);
    case 'set_history': { if (a.off) { GE.history.show(null); return 'today'; } const it = await GE.history.showYear(+a.year || 2014); if (a.compare) GE.history.setCompare(true); return it ? { showing: it.date, compare: GE.history.compare } : 'archive unavailable'; }
    case 'street_view': { let p = null; if (isFinite(a.lat) && isFinite(a.lon)) p = { lat: +a.lat, lon: +a.lon }; else if (a.query) p = await placeFrom(String(a.query)); else p = GE.sel || GE.viewCenter(); if (!p) throw new Error('No place'); await GE.street.open(p.lon, p.lat); return 'opened if photos exist nearby'; }
    case 'set_mode': GE.applyMode(a.mode === 'creative' ? 'creative' : 'user'); GE.ui.syncMode(); return 'ok';
  }
  throw new Error('Unknown tool');
}
const SYSTEM = () => `You are Milo, ${GE.CFG.miloOwner ? GE.CFG.miloOwner + "'s" : 'the'} personal AI guide inside God's Eye, a live 3D Earth (CesiumJS) with real satellite imagery, terrain, the real sun, satellites, flights, earthquakes and NASA events.
Voice: calm, warm, curious, a little cinematic. Never gushing. Your words are spoken aloud: at most two short sentences, plain text, no markdown, no lists, no emoji.
Act, don't narrate: when asked for anything visual, call the tools. Use describe_view when you need to know where the camera is. Chain tools when it helps (for example fly_to then set_time golden_hour).
Live layers are public feeds: say "live" only for those. If something fails, say so briefly and offer the closest alternative.
Viewer's local time: ${new Date().toString()}.`;
async function claude(text) {
  history.push({ role: 'user', content: text }); history = history.slice(-12); while (history.length && history[0].role !== 'user') history.shift();
  const msgs = history.slice();
  for (let round = 0; round < 6; round++) {
    const r = await fetch(GE.CFG.url.claude, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': GE.keys.anthropic, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: GE.keys.model || 'claude-haiku-5-5', max_tokens: 500, system: SYSTEM(), tools: TOOLS, messages: msgs }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw Object.assign(new Error(e.error?.message || 'HTTP ' + r.status), { status: r.status }); }
    const d = await r.json(); msgs.push({ role: 'assistant', content: d.content });
    const uses = d.content.filter((c) => c.type === 'tool_use');
    if (d.stop_reason !== 'tool_use' || !uses.length) {
      const say = d.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim() || 'Done.';
      history.push({ role: 'assistant', content: say }); GE.store.set('milo.history', history.slice(-12)); return say;
    }
    const results = [];
    for (const u of uses) { try { const out = await runTool(u.name, u.input || {}); results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out ?? 'ok').slice(0, 6000) }); } catch (e) { results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Error: ' + e.message, is_error: true }); } }
    msgs.push({ role: 'user', content: results });
  }
  return 'Done.';
}

async function handle(text) {
  busy = true; state('think'); milo.show('…', text);
  try {
    let reply;
    if (GE.keys.anthropic) {
      try { reply = await claude(text); }
      catch (e) { console.warn(e); if (e.status === 401 || e.status === 403) GE.toast('Anthropic rejected the key. Check it in Settings.'); else if (e.status === 429) GE.toast('Claude is rate-limiting this key. Using quick commands.'); reply = await local(text); }
    } else reply = await local(text);
    busy = false; state(''); milo.say(reply, text);
  } catch (e) { console.warn(e); busy = false; state(''); milo.say('Something went wrong there. Try that again?', text); }
}
GE.milo.handle = handle;
GE.rideSat = ride;
GE.milo.greet = () => milo.show(GE.keys.anthropic ? "I'm Milo, thinking with Claude. Tap me and say where to go." : "I'm Milo. Tap me and tell me where to go. Hold me to type.");
}
