// ───────────────────────── God's Eye · time machine ─────────────────────────
// Esri World Imagery Wayback: every archived release of the world imagery since 2014, at full resolution.
// "Dates for this spot" walks the release history for the tile you're looking at and keeps only the
// releases where the picture actually changed there. Swipe compares any date with today.
{
const C = Cesium, R = Math.PI / 180, $ = GE.$;
const H = (GE.history = { items: null, layer: null, cur: null, compare: false, pos: 0.5 });
const monthYear = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

H.load = async () => {
  if (H.items) return H.items;
  const cfg = await GE.fetchJSON(GE.CFG.url.wayback, { timeout: 15000 });
  H.items = Object.keys(cfg).filter((k) => /^\d+$/.test(k)).map((k) => { const it = cfg[k], m = /\d{4}-\d{2}-\d{2}/.exec(it.itemTitle || ''); return m && it.itemURL ? { rel: +k, date: m[0], url: it.itemURL } : null; })
    .filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  return H.items;
};
const tileOf = (lon, lat, z) => { const n = 2 ** z, s = Math.sin(GE.clamp(lat, -85.05, 85.05) * R); return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n) }; };
H.zoomHere = () => GE.clamp(Math.round(Math.log2(((GE.scene.canvas.clientHeight || 800) * 156543) / 1.15 / Math.max(GE.camera.positionCartographic.height, 50))), 11, 18);
H.localDates = async (lon, lat, z = H.zoomHere()) => {
  const items = await H.load(), { x, y } = tileOf(lon, lat, z), out = [];
  let idx = 0, guard = 0;
  while (idx < items.length && guard++ < 45) {
    const r = await GE.fetchJSON(GE.fill(GE.CFG.url.waybackMap, { rel: items[idx].rel, z, y, x }), { timeout: 9000 });
    if (!r || !r.data || !r.data[0]) break;
    const sel = r.select && r.select[0] ? +r.select[0] : items[idx].rel, j = items.findIndex((i) => i.rel === sel);
    if (j < 0) break; if (!out.includes(items[j])) out.push(items[j]); idx = j + 1;
  }
  return out;
};
H.show = (item) => {
  const L = GE.viewer.imageryLayers;
  if (H.layer) { L.remove(H.layer, true); H.layer = null; }
  H.cur = item || null;
  if (item) {
    const url = item.url.replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}');
    H.layer = new C.ImageryLayer(new C.UrlTemplateImageryProvider({ url, maximumLevel: 19, credit: new C.Credit(`Historical imagery ${item.date}: Esri World Imagery Wayback`, true) }));
    L.add(H.layer, L.indexOf(GE.L.esri) + 1);
    if (GE.prefs.base !== 'satellite') GE.setBase('satellite');
  }
  H.setCompare(H.compare && !!item);
  GE.emit('history', item); GE.scene.requestRender();
};
H.showYear = async (year) => {
  const items = await H.load(), c = GE.sel || GE.viewCenter();
  let pool = items; try { if (c) { const local = await H.localDates(c.lon, c.lat); if (local.length) pool = local; } } catch {}
  const best = pool.reduce((a, b) => (Math.abs(+b.date.slice(0, 4) - year) < Math.abs(+a.date.slice(0, 4) - year) ? b : a), pool[0]);
  H.show(best); return best;
};
H.setCompare = (on) => {
  H.compare = !!on && !!H.layer;
  if (H.layer) H.layer.splitDirection = H.compare ? C.SplitDirection.LEFT : C.SplitDirection.NONE;
  GE.scene.splitPosition = H.pos;
  const sw = $('swipe'); sw.hidden = !H.compare; sw.style.left = H.pos * 100 + '%';
  $('swL').textContent = H.cur ? monthYear(H.cur.date) : '';
  GE.emit('historyCompare', H.compare); GE.scene.requestRender();
};

H.init = () => {
  const grip = $('swipe').querySelector('.grip');
  const drag = (e) => { H.pos = GE.clamp(e.clientX / innerWidth, 0.04, 0.96); GE.scene.splitPosition = H.pos; $('swipe').style.left = H.pos * 100 + '%'; GE.scene.requestRender(); };
  grip.addEventListener('pointerdown', (e) => { grip.setPointerCapture(e.pointerId); drag(e); });
  grip.addEventListener('pointermove', (e) => { if (grip.hasPointerCapture(e.pointerId)) drag(e); });
  grip.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { H.pos = GE.clamp(H.pos + (e.key === 'ArrowRight' ? 0.03 : -0.03), 0.04, 0.96); drag({ clientX: H.pos * innerWidth }); } });

  const chips = $('tmDates'), all = $('tmAll'), note = $('tmNote');
  const mark = () => { chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', !!H.cur && b.dataset.rel === String(H.cur.rel))); $('tmToday').setAttribute('aria-pressed', !H.cur); all.value = H.cur ? String(H.cur.rel) : ''; };
  const chip = (it) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.rel = it.rel; b.textContent = monthYear(it.date); b.title = it.date; b.onclick = () => H.show(it); return b; };
  $('tmFind').onclick = async () => {
    const c = GE.sel || GE.viewCenter(); if (!c) return;
    note.textContent = 'Checking every archived release for this spot…'; chips.replaceChildren();
    try {
      const list = await H.localDates(c.lon, c.lat);
      chips.replaceChildren(...list.map(chip));
      note.textContent = list.length ? `${list.length} different pictures of this spot since ${list[list.length - 1].date.slice(0, 4)}. Tap one, then turn on swipe to compare.` : 'No archived changes found here. Try zooming in closer.';
      mark();
    } catch (e) { console.warn(e); note.textContent = 'The imagery archive did not answer. Try again in a moment.'; }
  };
  $('tmToday').onclick = () => H.show(null);
  all.addEventListener('focus', async () => { if (all.options.length > 1) return; try { (await H.load()).forEach((it) => all.add(new Option(it.date, it.rel))); } catch { note.textContent = 'The imagery archive did not answer.'; } }, { once: true });
  all.onchange = async () => { const it = (await H.load()).find((i) => String(i.rel) === all.value); H.show(it || null); };
  GE.on('history', mark); GE.on('historyCompare', (on) => $('tmCompare').setAttribute('aria-checked', on));
  $('tmCompare').onclick = () => { if (!H.layer) { note.textContent = 'Pick a date first, then swipe to compare it with today.'; return; } H.setCompare(!H.compare); };
  mark();
};
}
