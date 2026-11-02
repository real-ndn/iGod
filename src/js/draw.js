// ───────────────────────── God's Eye · draw on Earth ─────────────────────────
// Glowing strokes draped on the terrain. On iPad, Apple Pencil draws and fingers keep moving the map
// (like Procreate). With a mouse, left-drag draws. Pencil pressure sets the stroke width. Strokes are saved.
{
const C = Cesium, $ = GE.$;
const D = (GE.draw = { on: false, color: '#f5b862', strokes: [], cur: null, sawPen: false });
const COLORS = ['#f5b862', '#8fd8ff', '#ff6b8a', '#7be3b5', '#ffffff'];
const material = (c) => new C.PolylineGlowMaterialProperty({ color: C.Color.fromCssColorString(c), glowPower: 0.17, taperPower: 1 });
const toLL = (p) => { const k = C.Cartographic.fromCartesian(p); return [+(k.longitude * 57.29578).toFixed(6), +(k.latitude * 57.29578).toFixed(6)]; };
function pick(x, y) {
  const s = GE.scene, p2 = new C.Cartesian2(x, y);
  if (GE.photoreal && GE.photoreal.show) { try { const p = s.pickPosition(p2); if (p) return p; } catch {} }
  const ray = GE.camera.getPickRay(p2); return (ray && s.globe.pick(ray, s)) || GE.camera.pickEllipsoid(p2);
}
function save() { GE.store.set('strokes', D.strokes.slice(-120).map((s) => ({ c: s.c, w: s.w, ll: s.ll }))); }
function addEntity(s, live) {
  s.ent = GE.viewer.entities.add({ polyline: { positions: live ? new C.CallbackProperty(() => s.pos, false) : s.pos, width: s.w, clampToGround: true, material: material(s.c) } });
}
D.setColor = (c) => { D.color = c; document.querySelectorAll('#drawBar [data-c]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === c)); };
D.toggle = (on = !D.on) => {
  D.on = on; $('drawBar').hidden = !on; $('drawBtn').setAttribute('aria-pressed', on); document.body.classList.toggle('drawing', on);
  if (on) { GE.measure.on && GE.measure.toggle(false); GE.cam.stop(); $('drawHint').textContent = GE.isTablet ? 'Draw with Apple Pencil. Fingers still move the map.' : GE.isMobile ? 'Draw with one finger. Tap Done to move the map again.' : 'Drag to draw. Right-drag and scroll still move the map.'; }
};
D.undo = () => { const s = D.strokes.pop(); if (s) GE.viewer.entities.remove(s.ent); save(); GE.scene.requestRender(); };
D.clear = () => { D.strokes.forEach((s) => GE.viewer.entities.remove(s.ent)); D.strokes = []; save(); GE.scene.requestRender(); };
D.init = () => {
  const bar = $('drawSwatches');
  COLORS.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.dataset.c = c; b.style.setProperty('--sc', c); b.setAttribute('aria-label', 'Stroke color ' + c); b.onclick = () => D.setColor(c); bar.append(b); });
  D.setColor(D.color);
  $('drawBtn').onclick = () => D.toggle(); $('dUndo').onclick = D.undo; $('dClear').onclick = D.clear; $('dDone').onclick = () => D.toggle(false);
  // restore saved strokes
  for (const s of GE.store.get('strokes', [])) { const st = { c: s.c, w: s.w, ll: s.ll, pos: s.ll.map(([lo, la]) => C.Cartesian3.fromDegrees(lo, la)) }; if (st.pos.length > 1) { addEntity(st); D.strokes.push(st); } }
  const host = GE.viewer.container, canvas = GE.scene.canvas;
  const wants = (e) => { if (!D.on) return false; if (e.pointerType === 'pen') { D.sawPen = true; return true; } if (e.pointerType === 'mouse') return e.button === 0; return !D.sawPen && e.isPrimary; };
  const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  host.addEventListener('pointerdown', (e) => {
    if (!wants(e)) return; e.stopPropagation(); e.preventDefault();
    try { host.setPointerCapture(e.pointerId); } catch {}
    D.cur = { c: D.color, w: 4, pos: [], ll: [], pid: e.pointerId, press: [], last: null };
    addEntity(D.cur, true); add(e);
  }, true);
  const add = (e) => {
    const s = D.cur; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = at(ev); if (s.last && Math.hypot(x - s.last[0], y - s.last[1]) < 3) continue;
      const p = pick(x, y); if (!p) continue; s.last = [x, y]; s.pos.push(p); s.ll.push(toLL(p));
      if (ev.pointerType === 'pen' && ev.pressure > 0) s.press.push(ev.pressure);
    }
    if (s.press.length) s.w = 2.5 + (s.press.reduce((a, b) => a + b, 0) / s.press.length) * 10;
    if (s.ent) s.ent.polyline.width = s.w;
    GE.scene.requestRender();
  };
  host.addEventListener('pointermove', (e) => { if (!D.cur || e.pointerId !== D.cur.pid) return; e.stopPropagation(); e.preventDefault(); add(e); }, true);
  const end = (e) => {
    if (!D.cur || e.pointerId !== D.cur.pid) return; e.stopPropagation();
    const s = D.cur; D.cur = null; GE.viewer.entities.remove(s.ent);
    if (s.pos.length > 1) { addEntity(s); D.strokes.push(s); save(); }
    GE.scene.requestRender();
  };
  host.addEventListener('pointerup', end, true); host.addEventListener('pointercancel', end, true);
};
}
