// ───────────────────────── God's Eye · camera ─────────────────────────
// Fly, orbit, dive, tour, ride a satellite, follow a flight, fly a road. Any touch hands control back.
{
const C = Cesium, R = Math.PI / 180;
const cam = () => GE.camera;
const K = (GE.cam = { mode: null });
let raf = 0, last = 0;
function loop(fn) {
  cancelAnimationFrame(raf); last = performance.now();
  const step = (t) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (fn(dt, t) === false) return; GE.scene.requestRender(); raf = requestAnimationFrame(step); };
  raf = requestAnimationFrame(step);
}
const lerpAng = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };
// How far a flown camera sits below the safe height over the terrain under it (0 when clear).
// Target heights can arrive late or coarse, and a camera inside a hill renders black.
const below = (margin = 70) => {
  const k = cam().positionCartographic, g = GE.scene.globe.show ? GE.scene.globe.getHeight(k) : null;
  return g == null ? 0 : Math.max(0, g * (GE.scene.verticalExaggeration || 1) + margin - k.height);
};
const wait = (ms) => new Promise((r) => (K.timer = setTimeout(r, ms)));
GE.setCaption = (eyebrow, text) => { const el = GE.$('caption'); el.innerHTML = ''; if (!text) return; const s = document.createElement('small'); s.textContent = eyebrow || ''; el.append(s, document.createTextNode(text)); };

K.stop = () => {
  cancelAnimationFrame(raf); raf = 0; clearTimeout(K.timer); K.flying = false;
  const was = K.mode; K.mode = null;
  try { cam().lookAtTransform(C.Matrix4.IDENTITY); } catch {}
  document.body.classList.remove('touring'); GE.setCaption();
  if (was) GE.emit('camMode', null);
};
K.set = (mode) => { K.mode = mode; GE.emit('camMode', mode); };
K.init = () => {
  const h = new C.ScreenSpaceEventHandler(GE.scene.canvas);
  const interrupt = () => { if (K.mode) K.stop(); };
  for (const t of [C.ScreenSpaceEventType.LEFT_DOWN, C.ScreenSpaceEventType.RIGHT_DOWN, C.ScreenSpaceEventType.MIDDLE_DOWN, C.ScreenSpaceEventType.WHEEL, C.ScreenSpaceEventType.PINCH_START]) h.setInputAction(interrupt, t);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && K.mode) K.stop(); });
};

// Fly to a point with a cinematic offset (heading/pitch in degrees, range in meters), or frame a rectangle [w,s,e,n].
K.flyTo = async (o, keepMode) => {
  if (!keepMode) K.stop();
  // K.flying: the app is moving the camera (road names step aside for it; see globe.js)
  const done = (v) => { K.flying = false; return v; };
  if (o.rect) {
    const sphere = C.BoundingSphere.fromRectangle3D(C.Rectangle.fromDegrees(...o.rect), C.Ellipsoid.WGS84, 0);
    K.flying = true;
    return new Promise((res) => cam().flyToBoundingSphere(sphere, { offset: new C.HeadingPitchRange(0, -0.8, 0), duration: o.duration, complete: () => res(done()), cancel: () => res(done()) }));
  }
  const h = o.h ?? (await GE.heightAt(o.lon, o.lat));
  const target = C.Cartesian3.fromDegrees(o.lon, o.lat, h);
  K.flying = true;
  return new Promise((res) => cam().flyToBoundingSphere(new C.BoundingSphere(target, 1), {
    offset: new C.HeadingPitchRange((o.heading ?? 0) * R, (o.pitch ?? -35) * R, o.range ?? 2500),
    duration: o.duration, easingFunction: o.easing, complete: () => res(done(true)), cancel: () => res(done(false)),
  }));
};
K.toPlace = (p, extra = {}) => K.flyTo({ lon: p.lon, lat: p.lat, heading: p.v ? p.v[0] : 0, pitch: p.v ? p.v[1] : -32, range: p.v ? p.v[2] : extra.range || 2500, ...extra });

K.orbit = async (target, opts = {}) => {
  const c = target || GE.viewCenter(); if (!c) return;
  const h = c.h ?? (await GE.heightAt(c.lon, c.lat));
  let center = C.Cartesian3.fromDegrees(c.lon, c.lat, h), lift = 0;
  const range = opts.range || GE.clamp(C.Cartesian3.distance(cam().positionWC, center), 400, 3e6);
  let heading = cam().heading; const pitch = opts.pitch ?? (cam().pitch < -1.15 ? -0.5 : cam().pitch);
  if (!opts.keep) K.stop(); K.set(opts.keep ? K.mode : 'orbit');
  const mode = K.mode, t0 = performance.now();
  return new Promise((res) => loop((dt, t) => {
    if (K.mode !== mode) { res(false); return false; }
    heading += dt * (opts.speed || 0.1); cam().lookAt(center, new C.HeadingPitchRange(heading, pitch, range));
    const d = below(); if (d > 0) { lift += d; center = C.Cartesian3.fromDegrees(c.lon, c.lat, h + lift); cam().lookAt(center, new C.HeadingPitchRange(heading, pitch, range)); }
    if (opts.ms && t - t0 > opts.ms) { cam().lookAtTransform(C.Matrix4.IDENTITY); res(true); return false; }
  }));
};

K.dive = async (p) => {
  p = p || GE.sel || GE.CFG.home; K.stop(); K.set('dive');
  await new Promise((res) => cam().flyTo({ destination: C.Cartesian3.fromDegrees(p.lon, p.lat, 5.2e6), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration: 2.2, complete: res, cancel: res }));
  if (K.mode !== 'dive') return;
  await K.flyTo({ lon: p.lon, lat: p.lat, heading: (cam().heading / R) + 70, pitch: -18, range: 2200, duration: 4.6, easing: C.EasingFunction.QUARTIC_IN_OUT }, true);
  if (K.mode === 'dive') K.orbit({ lon: p.lon, lat: p.lat }, { pitch: -0.32, speed: 0.06 });
};

// The tour. When a recorded film of it is published with the site, the Tour button plays that instead
// (smooth on any device: see tourfilm.js). This is the live 3D version, and what the recorder films.
//   opts.live     skip the film
//   opts.quiet    no voice, no toasts (filming)
//   opts.heights  { stop name: metres }, so no stop waits on the network
//   opts.clock(i) the time of day to arrive at stop i; the sun sweeps there during the flight
K.tour = async (opts = {}) => {
  if (!opts.live && GE.tourFilm && GE.tourFilm.ready()) return GE.tourFilm.play();
  K.stop(); K.set('tour'); document.body.classList.add('touring');
  if (!GE.prefs.voice && !opts.quiet) GE.toast("Milo's voice is off. Turn it on in Settings to hear the tour.", 5000);
  const stops = GE.TOUR.map((n) => GE.PLACES.find((p) => p.name === n)).filter(Boolean), H = opts.heights || {};
  for (let i = 0; i < stops.length && K.mode === 'tour'; i++) {
    const p = stops[i], dur = i ? 8 : 5.5;
    GE.setCaption(`${i + 1} / ${stops.length} · ${p.sub}`, p.line); if (!opts.quiet) GE.milo && GE.milo.speak(p.line);
    if (opts.clock) sweepClock(GE.time.now(), opts.clock(i), dur * 1000);
    const ok = await K.flyTo({ lon: p.lon, lat: p.lat, h: H[p.name], heading: p.v[0] - 40, pitch: p.v[1], range: p.v[2], duration: dur, easing: C.EasingFunction.QUADRATIC_IN_OUT }, true);
    if (!ok || K.mode !== 'tour') break;
    await K.orbit({ lon: p.lon, lat: p.lat, h: H[p.name] }, { keep: true, ms: 6500, speed: 0.07, range: p.v[2], pitch: p.v[1] * R });
  }
  if (K.mode === 'tour') { K.stop(); if (!opts.quiet) GE.milo && GE.milo.say('That was the tour. Tell me where to go next.'); }
};
// ease the clock from one time of day to another over a flight (the planet's light sweeps round with it)
function sweepClock(from, to, ms) {
  if (Math.abs(to - from) < 60000) return;
  const t0 = performance.now();
  const tick = () => {
    const u = Math.min(1, (performance.now() - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    GE.time.set(from + (to - from) * e);
    if (u < 1 && K.mode === 'tour') requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Ride along with a satellite: first-person from orbit, looking down the ground track.
K.ride = (s) => {
  K.stop(); K.set('ride'); let hdg = cam().heading;
  const sats = GE.live.sats, issMode = s === 'iss';
  loop(() => {
    if (K.mode !== 'ride') return false;
    const sat = issMode ? sats.iss : s;
    const st = sat && sats.lib ? sats.state(sat) : GE.live.issNow(); if (!st) return;
    const ahead = sat && sats.lib ? sats.state(sat, GE.time.now() + 5000) : null;
    if (ahead) {
      const inv = C.Matrix4.inverseTransformation(C.Transforms.eastNorthUpToFixedFrame(st.pos), new C.Matrix4());
      const d = C.Matrix4.multiplyByPoint(inv, ahead.pos, new C.Cartesian3()); hdg = lerpAng(hdg, Math.atan2(d.x, d.y), 0.2);
    }
    const up = C.Cartesian3.normalize(st.pos, new C.Cartesian3()), eye = C.Cartesian3.add(st.pos, C.Cartesian3.multiplyByScalar(up, 1500, up), new C.Cartesian3());
    cam().setView({ destination: eye, orientation: { heading: hdg, pitch: -0.4, roll: 0 } });
  });
};

// Chase a live flight from behind.
K.follow = (f) => {
  K.stop(); K.set('follow'); let hd = f.trk * R;
  loop(() => {
    const FL = GE.live.flights; if (K.mode !== 'follow' || !FL.map.has(f.id)) { if (K.mode === 'follow') K.stop(); return false; }
    hd = lerpAng(hd, f.trk * R, 0.04); cam().lookAt(FL.position(f).pos, new C.HeadingPitchRange(hd, -0.2, 1600));
  });
};

// Roads: route with OSRM, then fly it at drone height.
const hav = (a, b) => { const p1 = a[1] * R, p2 = b[1] * R, dp = p2 - p1, dl = (b[0] - a[0]) * R; const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(x)); };
const bearing = (a, b) => { const p1 = a[1] * R, p2 = b[1] * R, dl = (b[0] - a[0]) * R; return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)); };
K.route = async (from, to) => {
  const d = await GE.fetchJSON(GE.fill(GE.CFG.url.osrm, { a: `${from.lon},${from.lat}`, b: `${to.lon},${to.lat}` }), { timeout: 15000 });
  const r = d.routes && d.routes[0]; if (!r) throw new Error('No route');
  const coords = r.geometry.coordinates, snap = d.waypoints && d.waypoints[1] && d.waypoints[1].distance;
  if (snap > 2000) GE.toast(`That pin is ${GE.fmt.dist(snap)} from the nearest road, so the drive ends there.`, 6500);
  if (GE.routeEnt) GE.viewer.entities.remove(GE.routeEnt);
  GE.routeEnt = GE.viewer.entities.add({ polyline: { positions: C.Cartesian3.fromDegreesArray(coords.flat()), width: 7, clampToGround: true, material: new C.PolylineGlowMaterialProperty({ glowPower: 0.25, taperPower: 1, color: C.Color.fromCssColorString('#f5b862') }) } });
  GE.route = { coords, distance: r.distance, duration: r.duration, from, to };
  GE.scene.requestRender(); GE.emit('route', GE.route);
  return GE.route;
};
K.flyRoute = async (route = GE.route) => {
  if (!route) return; K.stop(); K.set('route'); document.body.classList.add('touring'); // cinematic, like the tour: any touch hands back control
  const c = route.coords, cum = [0];
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + hav(c[i - 1], c[i]));
  const total = cum[cum.length - 1]; if (total < 50) return K.stop();
  const at = (s) => { s = GE.clamp(s, 0, total); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]); return [GE.lerp(c[lo][0], c[hi][0], t), GE.lerp(c[lo][1], c[hi][1], t)]; };
  const dur = GE.clamp(total / 240, 16, 90) * 1000, h0 = await GE.heightAt(c[0][0], c[0][1]);
  // Long drives are flown faster, so fly them higher: the ground stays readable and tiles keep up.
  // Short ones stay at drone height (about 1.1 km behind and above the road).
  const speed = total / (dur / 1000), range = GE.clamp(speed * 4, 1100, 42000), pitch = -GE.clamp(0.3 + (range - 1100) / 42000 * 0.45, 0.3, 0.75);
  const look = Math.max(450, range * 0.4);
  let hd = bearing(at(0), at(look)), h = h0, lift = 0, sampling = false, t0 = performance.now();
  GE.setCaption('Road flyover', `${route.from.name || 'Start'} → ${route.to.name || 'Destination'} · ${GE.fmt.dist(total)}`);
  await K.flyTo({ lon: c[0][0], lat: c[0][1], h: h0, heading: hd / R, pitch: pitch / R, range, duration: 2.6 }, true);
  if (K.mode !== 'route') return; t0 = performance.now();
  loop((dt, t) => {
    if (K.mode !== 'route') return false;
    const u = GE.clamp((t - t0) / dur, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2, s = e * total, p = at(s);
    hd = lerpAng(hd, bearing(at(s - look * 0.3), at(s + look)), 0.035);
    // what's on screen answers at once; the finer sample refines it when it lands
    const quick = GE.scene.globe.getHeight(C.Cartographic.fromDegrees(p[0], p[1]));
    if (quick != null) h = Math.max(h - 40, GE.lerp(h, quick * (GE.scene.verticalExaggeration || 1), 0.2));
    if (!sampling && range < 6000) { sampling = true; GE.heightAt(p[0], p[1]).then((v) => { h = GE.lerp(h, v, 0.5); sampling = false; }); }
    lift *= 0.985; // ease back down once past the high ground
    const hpr = new C.HeadingPitchRange(hd, pitch, range);
    cam().lookAt(C.Cartesian3.fromDegrees(p[0], p[1], h + lift), hpr);
    const d = below(90); if (d > 0) { lift += d; cam().lookAt(C.Cartesian3.fromDegrees(p[0], p[1], h + lift), hpr); }
    if (u >= 1) { cam().lookAtTransform(C.Matrix4.IDENTITY); K.stop(); return false; }
  });
};

K.spin = () => { K.stop(); K.set('spin'); loop((dt) => { if (K.mode !== 'spin') return false; cam().rotate(C.Cartesian3.UNIT_Z, -dt * 0.035); }); };
K.north = () => { const c = GE.viewCenter(); if (!c) return cam().flyTo({ destination: cam().positionWC, orientation: { heading: 0, pitch: cam().pitch, roll: 0 }, duration: 0.8 }); const r = C.Cartesian3.distance(cam().positionWC, c.pos); cam().flyToBoundingSphere(new C.BoundingSphere(c.pos, 1), { offset: new C.HeadingPitchRange(0, cam().pitch, r), duration: 0.8 }); };
K.tilt = () => {
  const c = GE.viewCenter(); if (!c) return; K.stop();
  const r = C.Cartesian3.distance(cam().positionWC, c.pos), top = cam().pitch < -1.2;
  cam().flyToBoundingSphere(new C.BoundingSphere(c.pos, 1), { offset: new C.HeadingPitchRange(cam().heading, top ? -0.5 : -Math.PI / 2 + 0.001, r), duration: 1.1 });
};
K.zoom = (f) => {
  const c = GE.viewCenter(); K.stop();
  if (!c) { cam().zoomIn(cam().positionCartographic.height * (1 - f)); return; }
  const r = C.Cartesian3.distance(cam().positionWC, c.pos);
  cam().flyToBoundingSphere(new C.BoundingSphere(c.pos, 1), { offset: new C.HeadingPitchRange(cam().heading, cam().pitch, GE.clamp(r * f, 6, 6e7)), duration: 0.55 });
};
}
