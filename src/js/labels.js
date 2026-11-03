// ───────────────────────── God's Eye · labels and borders ─────────────────────────
// Natural Earth (public domain): upright, crisp labels chosen per frame by importance, distance and
// screen space; country and state borders drawn as vectors into each map tile, so they stay sharp at any zoom.
{
const C = Cesium, R = Math.PI / 180;
const DATA = JSON.parse(document.getElementById('geData').textContent);
const F = GE.fmt;

// ── borders: vector lines rasterized per tile ─────────────
const lines = DATA.borders.a.map((row) => {
  const pts = new Float64Array(row.length - 1); let x = 0, y = 0, w = 999, s = 999, e = -999, n = -999;
  for (let i = 1; i < row.length; i += 2) { x += row[i]; y += row[i + 1]; const lo = x / 1000, la = y / 1000; pts[i - 1] = lo; pts[i] = la; if (lo < w) w = lo; if (lo > e) e = lo; if (la < s) s = la; if (la > n) n = la; }
  return { kind: row[0], pts, w, s, e, n };
});
const CELL = 6, grid = new Map();
lines.forEach((l, idx) => { for (let cx = Math.floor(l.w / CELL); cx <= Math.floor(l.e / CELL); cx++) for (let cy = Math.floor(l.s / CELL); cy <= Math.floor(l.n / CELL); cy++) { const k = cx + ',' + cy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(idx); } });
const linesIn = (w, s, e, n) => { const out = new Set(); for (let cx = Math.floor(w / CELL); cx <= Math.floor(e / CELL); cx++) for (let cy = Math.floor(s / CELL); cy <= Math.floor(n / CELL); cy++) { const a = grid.get(cx + ',' + cy); if (a) for (const i of a) { const l = lines[i]; if (l.e >= w && l.w <= e && l.n >= s && l.s <= n) out.add(l); } } return out; };
const empty = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
function BorderProvider() {
  this.tilingScheme = new C.WebMercatorTilingScheme(); this.rectangle = this.tilingScheme.rectangle;
  this.tileWidth = 512; this.tileHeight = 512; this.minimumLevel = 0; this.maximumLevel = 21;
  this.errorEvent = new C.Event(); this.credit = new C.Credit('Borders and names: Natural Earth', false); this.hasAlphaChannel = true;
  this.proxy = undefined; this.tileDiscardPolicy = undefined; this.ready = true;
}
BorderProvider.prototype.getTileCredits = () => undefined;
BorderProvider.prototype.pickFeatures = () => undefined;
BorderProvider.prototype.requestImage = function (x, y, level) {
  const r = this.tilingScheme.tileXYToRectangle(x, y, level), w = r.west / R, s = r.south / R, e = r.east / R, n = r.north / R, pad = (e - w) * 0.03;
  const set = linesIn(w - pad, s - pad, e + pad, n + pad); if (!set.size) return Promise.resolve(empty);
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
  const N = 2 ** level, px = (lon) => (((lon + 180) / 360) * N - x) * 512;
  const py = (lat) => { const sn = Math.sin(GE.clamp(lat, -85.05, 85.05) * R); return ((0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * N - y) * 512; };
  g.lineJoin = 'round'; g.lineCap = 'round';
  const base = level < 3 ? 1.1 : level < 6 ? 1.7 : level < 10 ? 2.4 : 3;
  for (const pass of [0, 1]) for (const l of set) {
    if (l.kind === 2 && level < 3) continue;
    const st = l.kind === 2, disputed = l.kind === 1;
    g.beginPath(); let prev = null;
    for (let i = 0; i < l.pts.length; i += 2) { const lo = l.pts[i], X = px(lo), Y = py(l.pts[i + 1]); if (prev === null || Math.abs(lo - prev) > 180) g.moveTo(X, Y); else g.lineTo(X, Y); prev = lo; }
    if (pass === 0) { g.setLineDash([]); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = (st ? base * 0.8 : base) + (level < 4 ? 1.4 : 2.2); }
    else { g.setLineDash(st ? [5, 6] : disputed ? [9, 7] : []); g.strokeStyle = st ? 'rgba(236,241,248,.55)' : disputed ? 'rgba(245,184,98,.85)' : 'rgba(250,247,240,.88)'; g.lineWidth = st ? base * 0.8 : base; }
    g.stroke();
  }
  return Promise.resolve(cv);
};

// ── labels ───────────────────────────────────────────────
// Each entry: type, name, cartesian position, minimum zoom, optional maximum zoom, priority, extra.
const E = [];
const add = (t, row, pri, maxZ, extra) => E.push({ t, name: row[0], lon: row[1], lat: row[2], z: row[3], maxZ, pri, extra, pos: C.Cartesian3.fromDegrees(row[1], row[2], 0) });
DATA.labels.c.forEach((r) => add('c', r, r[3] - 1.2, r[4]));
DATA.labels.m.forEach((r) => add('m', r, r[3] - (r[4] === 'ocean' ? 2 : 0.4), 99, r[4]));
DATA.labels.s.forEach((r) => add('s', r, r[3] + 0.3, r[4]));
DATA.labels.p.forEach((r) => add('p', r, r[3] - (r[5] & 1 ? 0.6 : 0) - (r[5] & 2 ? 0.3 : 0) - r[4] * 0.04, 99, { rank: r[4], cap: !!(r[5] & 1) }));
DATA.labels.k.forEach((r) => add('k', r, r[3] + 0.6, 99, { elev: r[4], cls: r[5] }));
DATA.labels.r.forEach((r) => add('r', r, r[3] + 0.8, 99, r[4]));
// hero places (and Home) join the label set so they always read when you're close
GE.PLACES.forEach((h) => { for (let i = E.length - 1; i >= 0; i--) if (E[i].name.toLowerCase() === h.name.toLowerCase() && Math.abs(E[i].lat - h.lat) < 0.4 && Math.abs(E[i].lon - h.lon) < 0.4) E.splice(i, 1); add('p', [h.name, h.lon, h.lat, 9.5], 9, 99, { rank: 5, cap: false }); });
E.sort((a, b) => a.pri - b.pri);
GE.labelPlaces = DATA.labels.p; // reused by search for instant offline hits

const spaced = (s) => s.toUpperCase().split('').join(' ');
const STYLE = {
  c: (e) => ({ text: spaced(e.name), font: '600 13.5px "Instrument Sans", system-ui, sans-serif', fill: 'rgba(255,255,255,.95)', ow: 4 }),
  s: (e) => ({ text: spaced(e.name), font: '500 10.5px "Instrument Sans", system-ui, sans-serif', fill: 'rgba(222,231,245,.82)', ow: 3 }),
  p: (e) => ({ text: e.name, font: `${e.extra.cap || e.extra.rank >= 6 ? 600 : 500} ${e.extra.cap ? 14.5 : e.extra.rank >= 6 ? 13.5 : 12.5}px "Instrument Sans", system-ui, sans-serif`, fill: '#ffffff', ow: 3.5, dot: true }),
  k: (e) => ({ text: `▲ ${e.name}\n${F.elev(e.extra.elev)}`, font: '500 11.5px "Instrument Sans", system-ui, sans-serif', fill: '#ffe9bf', ow: 3 }),
  r: (e) => ({ text: /range|desert|plateau|plain|basin|lowland|valley|tundra/.test(e.extra) ? spaced(e.name) : e.name, font: 'italic 500 11.5px "Instrument Sans", system-ui, sans-serif', fill: 'rgba(243,226,192,.9)', ow: 3 }),
  m: (e) => (e.extra === 'ocean' ? { text: spaced(e.name), font: 'italic 500 14px "Instrument Sans", system-ui, sans-serif', fill: 'rgba(170,220,255,.92)', ow: 3 } : { text: e.name, font: 'italic 500 12.5px "Instrument Sans", system-ui, sans-serif', fill: 'rgba(170,220,255,.9)', ow: 3 }),
  // live natural events: sit just above their icon
  v: (e) => ({ text: e.name, font: '600 11.5px "Instrument Sans", system-ui, sans-serif', fill: e.extra.rx ? '#ffe3ad' : e.extra.cat === 'wildfires' ? '#ffcdb4' : '#e8eefc', ow: 3.5, oy: -17 }),
};
const meas = document.createElement('canvas').getContext('2d'), wcache = new Map();
const textBox = (st) => { const k = st.font + '|' + st.text; let v = wcache.get(k); if (!v) { meas.font = st.font; const parts = st.text.split('\n'); v = { w: Math.max(...parts.map((p) => meas.measureText(p).width)), h: parts.length * 15 }; wcache.set(k, v); } return v; };

const LB = (GE.labels = { on: true, coll: null, dots: null, pool: [], dpool: [] });
const scratch = new C.Cartesian2();
LB.init = () => {
  LB.coll = GE.scene.primitives.add(new C.LabelCollection());
  LB.dots = GE.scene.primitives.add(new C.PointPrimitiveCollection());
  LB.borders = new C.ImageryLayer(new BorderProvider()); GE.viewer.imageryLayers.add(LB.borders); // add() returns nothing
  LB.borders.show = GE.prefs.borders;
  let pending = false, last = 0;
  const kick = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; const t = performance.now(); if (t - last < 120) return setTimeout(kick, 130); last = t; LB.update(); }); };
  GE.camera.changed.addEventListener(kick); GE.camera.moveEnd.addEventListener(() => setTimeout(LB.update, 30));
  addEventListener('resize', kick); document.fonts && document.fonts.ready.then(() => { wcache.clear(); LB.update(); });
  GE.on('prefs', () => { if (LB.borders) LB.borders.show = GE.prefs.borders; });
  LB.update();
};
LB.enable = (on) => { LB.on = on; LB.update(); };
LB.update = () => {
  const s = GE.scene, cam = GE.camera; if (!LB.coll) return;
  const used = [], usedD = [];
  if (LB.on && !GE.cam.touringHides) {
    const H = s.canvas.clientHeight || 800, W = s.canvas.clientWidth || 1200, camPos = cam.positionWC;
    const occ = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, camPos);
    const camH = cam.positionCartographic.height, k = (H * 156543) / 1.15, zNear = Math.log2(k / Math.max(camH, 1));
    const rect = cam.computeViewRectangle(C.Ellipsoid.WGS84);
    let w = -180, so = -90, ea = 180, no = 90; if (rect) { w = rect.west / R; so = rect.south / R; ea = rect.east / R; no = rect.north / R; }
    const wraps = ea < w, boxes = [], MAX = GE.isMobile ? 70 : 150;
    const inView = (e) => !(e.lat < so || e.lat > no || (wraps ? e.lon < w && e.lon > ea : e.lon < w || e.lon > ea));
    const onGround = (e) => { // close to the ground, lift labels onto the terrain so they sit on the right spot when tilted
      if (camH >= 4e5) return e.pos;
      const now = performance.now(); if (!e.hp || now - e.ht > 4000) { const hh = s.globe.show ? s.globe.getHeight(C.Cartographic.fromDegrees(e.lon, e.lat)) : null; if (hh != null) { e.hp = C.Cartesian3.fromDegrees(e.lon, e.lat, hh * (s.verticalExaggeration || 1) + 12); e.ht = now; } }
      return e.hp || e.pos;
    };
    // live layers claim their space first, nearest first, and only once you're regional (no wall of text from orbit)
    const live = [];
    const reach = camH < 1.2e6 ? Math.max(4.2e5, camH * 1.5) : 0;
    if (reach) for (const src of GE.labelSources) { const a = src(); if (a) for (const e of a) { if (!inView(e)) continue; const d = C.Cartesian3.distance(camPos, e.pos); if (d < reach) live.push([d + (e.pri || 0) * 6e4, e]); } }
    live.sort((a, b) => a[0] - b[0]);
    let nLive = 0;
    for (const [, e] of live) {
      if (nLive >= (GE.isMobile ? 12 : 26)) break;
      if (e.ent && e.ent.show === false) continue;
      const pos = onGround(e); if (!occ.isPointVisible(pos)) continue;
      const p = C.SceneTransforms.worldToWindowCoordinates(s, pos, scratch); if (!p || p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
      const st = STYLE[e.t](e), tb = textBox(st), bx = p.x - tb.w / 2 - 4, by = p.y + st.oy - tb.h - 3, bw = tb.w + 8, bh = tb.h + 6;
      if (bx < 0 || bx + bw > W || by < 0) continue; // whole name on screen, or none of it
      let hit = false; for (const b of boxes) if (bx < b[0] + b[2] && bx + bw > b[0] && by < b[1] + b[3] && by + bh > b[1]) { hit = true; break; } if (hit) continue;
      boxes.push([bx, by, bw, bh], [p.x - 14, p.y - 14, 28, 28]); // the label and its icon
      used.push([e, st, pos]); nLive++;
    }
    let checked = 0;
    for (const e of E) {
      if (e.z > zNear + 0.6) break; // sorted by priority ≈ min zoom: nothing later can show
      if (used.length >= MAX || checked > 2600) break;
      if (!inView(e)) continue;
      checked++;
      const pos = onGround(e);
      const dist = C.Cartesian3.distance(camPos, pos), zl = Math.log2(k / Math.max(dist, 1));
      if (e.z > zl + 0.45 || zl > (e.maxZ ?? 99) + 0.6) continue;
      if (!occ.isPointVisible(pos)) continue;
      const p = C.SceneTransforms.worldToWindowCoordinates(s, pos, scratch); if (!p) continue;
      if (p.x < -40 || p.y < -20 || p.x > W + 40 || p.y > H + 20) continue;
      const st = STYLE[e.t](e), tb = textBox(st);
      const bx = st.dot ? p.x + 5 : p.x - tb.w / 2, by = p.y - tb.h / 2 - (e.t === 'k' ? tb.h / 2 : 0), bw = tb.w + (st.dot ? 6 : 0) + 8, bh = tb.h + 6;
      let hit = false; for (const b of boxes) if (bx < b[0] + b[2] && bx + bw > b[0] && by < b[1] + b[3] && by + bh > b[1]) { hit = true; break; } if (hit) continue;
      boxes.push([bx - 4, by - 3, bw, bh]);
      used.push([e, st, pos]); if (st.dot) usedD.push([e, pos]);
    }
  }
  while (LB.pool.length < used.length) LB.pool.push(LB.coll.add({ show: false, style: C.LabelStyle.FILL_AND_OUTLINE, outlineColor: C.Color.BLACK.withAlpha(0.78), disableDepthTestDistance: Number.POSITIVE_INFINITY }));
  while (LB.dpool.length < usedD.length) LB.dpool.push(LB.dots.add({ show: false, pixelSize: 5, outlineColor: C.Color.BLACK.withAlpha(0.7), outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY }));
  LB.pool.forEach((l, i) => {
    const u = used[i]; if (!u) { l.show = false; return; }
    const [e, st, pos] = u; l.position = pos;
    if (l._k !== e) { l._k = e; l.text = st.text; l.font = st.font; l.fillColor = C.Color.fromCssColorString(st.fill); l.outlineWidth = st.ow;
      l.horizontalOrigin = st.dot ? C.HorizontalOrigin.LEFT : C.HorizontalOrigin.CENTER; l.verticalOrigin = e.t === 'k' || st.oy ? C.VerticalOrigin.BOTTOM : C.VerticalOrigin.CENTER; l.pixelOffset = new C.Cartesian2(st.dot ? 8 : 0, st.oy || 0); }
    l.show = true;
  });
  LB.dpool.forEach((d, i) => { const u = usedD[i]; if (!u) { d.show = false; return; } const [e, pos] = u; d.position = pos; d.color = e.extra.cap ? C.Color.fromCssColorString('#f5b862') : C.Color.WHITE; d.pixelSize = e.extra.cap ? 6.5 : 5; d.show = true; });
  s.requestRender();
};
}
