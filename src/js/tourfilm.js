// ───────────────────────── God's Eye · tour film ─────────────────────────
// The tour as a pre-recorded film, made on real imagery by tools/record-tour.mjs (see the README).
// A film plays smoothly on any device, because nothing has to load mid-flight. Milo still narrates
// live, in sync with the picture, and when it ends the live globe is waiting at the last stop.
{
const $ = GE.$, C = Cesium;
const F = (GE.tourFilm = { meta: null, open: false });
const BASE = 'tour/';

F.ready = () => !!(F.meta && F.meta.chapters && F.meta.duration);
// tour.json is a few hundred bytes; the film itself only streams once you tap Tour
F.load = async () => {
  try { const m = await GE.fetchJSON(BASE + 'tour.json', { timeout: 8000 }); if (m && m.chapters && m.duration && m.file) F.meta = m; } catch {}
  return F.ready();
};

const el = () => $('film'), vid = () => $('filmVideo');
let raf = 0, next = 0, idleT = 0, startT = 0, landed = null;

function caption(c) {
  const cap = $('filmCap');
  if (!c || !c.text) { cap.classList.remove('on'); return; }
  cap.innerHTML = ''; const s = document.createElement('small'); s.textContent = c.eyebrow || '';
  cap.append(s, document.createTextNode(c.text)); cap.classList.add('on');
}
// cues: each stop's caption and Milo's line, at the moment the film reaches it
function cues() {
  const v = vid(), m = F.meta; if (!F.open) return;
  while (next < m.chapters.length && v.currentTime >= m.chapters[next].t) {
    const c = m.chapters[next++]; landed = c.name || landed; caption(c);
    if (c.text) GE.milo && GE.milo.speak(c.text);
  }
  raf = requestAnimationFrame(cues);
}
// the ✕ steps aside while the film plays; a tap or the mouse brings it back for a few seconds
function wake() { const e = el(); e.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => !vid().paused && e.classList.add('idle'), 2600); }
function toggle() {
  const v = vid(), e = el(); wake();
  if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); e.classList.remove('paused'); }
  else { v.pause(); e.classList.add('paused'); GE.milo && GE.milo.stopVoice(); }
}

F.play = () => {
  if (F.open || !F.ready()) return;
  const m = F.meta, e = el(), v = vid();
  GE.cam.stop(); GE.cam.set('tour');
  F.open = true; next = 0; landed = null; caption(null);
  e.hidden = false; e.classList.remove('playing', 'paused', 'idle'); requestAnimationFrame(() => e.classList.add('on'));
  const src = BASE + m.file + '?v=' + encodeURIComponent(m.recorded || '');
  if (v.getAttribute('src') !== src) { v.poster = m.poster ? BASE + m.poster : ''; v.src = src; }
  try { v.currentTime = 0; } catch {}
  GE.viewer.useDefaultRenderLoop = false; // the globe rests while the film plays, so the iPad gives it everything
  const p = v.play(); if (p && p.catch) p.catch(() => fallback());
  startT = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(cues); wake();
  // nothing moving after 12 s (no connection, or the film isn't there): fly the live tour instead
  clearTimeout(F.watch); F.watch = setTimeout(() => { if (F.open && v.currentTime < 0.05) fallback(); }, 12000);
};

function fallback() {
  if (!F.open) return;
  F.close(false, true);
  GE.toast("The tour film didn't load, so here's the live 3D tour instead.", 5000);
  GE.cam.tour({ live: true });
}

// finished: land the live globe exactly where the film ends. Closed early: jump to the stop on screen.
F.close = (finished, quiet) => {
  if (!F.open) return;
  F.open = false; cancelAnimationFrame(raf); clearTimeout(F.watch); clearTimeout(idleT);
  const v = vid(), e = el(), m = F.meta;
  try { v.pause(); } catch {}
  GE.viewer.useDefaultRenderLoop = true;
  if (finished && m.end) {
    GE.camera.setView({ destination: C.Cartesian3.fromDegrees(m.end.lon, m.end.lat, m.end.height), orientation: { heading: m.end.heading, pitch: m.end.pitch, roll: m.end.roll || 0 } });
  } else if (!quiet && landed) {
    const p = GE.PLACES.find((x) => x.name === landed); if (p) GE.cam.toPlace(p, { duration: 0 });
  }
  if (!finished) GE.milo && GE.milo.stopVoice();
  caption(null); e.classList.remove('on');
  setTimeout(() => { if (!F.open) e.hidden = true; }, 750);
  if (GE.cam.mode === 'tour') GE.cam.stop();
  GE.scene.requestRender();
  if (finished) GE.milo && GE.milo.say('That was the tour. Tell me where to go next.');
};

F.init = () => {
  const e = el(), v = vid();
  v.addEventListener('playing', () => { e.classList.add('playing'); e.classList.remove('paused'); });
  v.addEventListener('ended', () => F.close(true));
  v.addEventListener('error', () => { if (F.open && v.currentTime < 0.05) fallback(); });
  // a tap brings the ✕ back; with it showing, a tap pauses or carries on. The ✕ ends the tour.
  e.addEventListener('click', (ev) => {
    if (ev.target.closest('#filmClose')) return;
    if (e.classList.contains('idle') && !v.paused) return wake();
    toggle();
  });
  e.addEventListener('pointermove', (ev) => { if (F.open && ev.pointerType === 'mouse') wake(); });
  $('filmClose').onclick = (ev) => { ev.stopPropagation(); F.close(false); };
  addEventListener('keydown', (ev) => { if (!F.open) return; if (ev.key === 'Escape') F.close(false); if (ev.key === ' ') { ev.preventDefault(); toggle(); } });
  // the Tour button or Milo stopping the tour also ends the film
  GE.on('camMode', (mode) => { if (F.open && mode !== 'tour') F.close(false); });
  // leaving the app pauses the film; coming back leaves it paused, ready to carry on with a tap
  document.addEventListener('visibilitychange', () => { if (document.hidden && F.open && !v.paused) { v.pause(); e.classList.add('paused'); e.classList.remove('idle'); GE.milo && GE.milo.stopVoice(); } });
};
}
