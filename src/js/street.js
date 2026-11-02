// ───────────────────────── God's Eye · StreetLens ─────────────────────────
// Street-level photos from Mapillary (needs a free client token). Opens the nearest photo to a spot,
// and a gold marker on the globe follows you as you walk through the imagery.
{
const C = Cesium, $ = GE.$;
const S = (GE.street = { viewer: null, marker: null, loading: null });
const loadLib = () => S.loading || (S.loading = new Promise((res, rej) => {
  if (window.mapillary) return res();
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = GE.CFG.url.mapillaryCss; document.head.append(css);
  const js = document.createElement('script'); js.src = GE.CFG.url.mapillaryJs; js.onload = res; js.onerror = () => { S.loading = null; rej(new Error('Mapillary viewer did not load')); }; document.head.append(js);
}));
async function nearest(lon, lat) {
  for (const d of [0.0015, 0.006]) {
    const u = new URL(GE.CFG.url.mapillary);
    u.searchParams.set('access_token', GE.keys.mapillary); u.searchParams.set('fields', 'id,computed_geometry,geometry,captured_at,is_pano'); u.searchParams.set('limit', '60');
    u.searchParams.set('bbox', [lon - d, lat - d, lon + d, lat + d].map((v) => v.toFixed(6)).join(','));
    const r = await GE.fetchJSON(u.toString(), { timeout: 12000 }), list = r.data || [];
    if (list.length) {
      const score = (im) => { const g = (im.computed_geometry || im.geometry).coordinates; return Math.hypot(g[0] - lon, (g[1] - lat) * 1.2) * (im.is_pano ? 0.6 : 1); };
      return list.sort((a, b) => score(a) - score(b))[0];
    }
  }
  return null;
}
function mark(lon, lat) {
  const pos = C.Cartesian3.fromDegrees(lon, lat);
  if (!S.marker) S.marker = GE.viewer.entities.add({ position: pos, point: { pixelSize: 13, color: C.Color.fromCssColorString('#f5b862'), outlineColor: C.Color.WHITE, outlineWidth: 3, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 5e6 } });
  S.marker.position = pos; S.marker.show = true; GE.scene.requestRender();
}
S.open = async (lon, lat) => {
  if (!GE.keys.mapillary) { GE.toast('Street level needs a free Mapillary client token. Add it in Settings.', 6000); GE.emit('needKeys'); return; }
  GE.toast('Looking for street-level photos here…', 2500);
  let im;
  try { im = await nearest(lon, lat); } catch (e) { console.warn(e); GE.toast('Mapillary did not answer. Check the token in Settings.'); return; }
  if (!im) { GE.toast('No street-level photos within about 600 m of this spot yet.'); return; }
  try { await loadLib(); } catch (e) { GE.toast(e.message); return; }
  $('street').hidden = false; document.body.classList.add('streeting');
  const g = (im.computed_geometry || im.geometry).coordinates; mark(g[0], g[1]);
  if (!S.viewer) {
    S.viewer = new window.mapillary.Viewer({ accessToken: GE.keys.mapillary, container: 'streetView', imageId: String(im.id), component: { cover: false } });
    S.viewer.on('image', (ev) => { const ll = ev.image && ev.image.lngLat; if (ll) mark(ll.lng, ll.lat); const t = ev.image && ev.image.capturedAt; $('stDate').textContent = t ? 'Captured ' + new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''; });
  } else { S.viewer.moveTo(String(im.id)).catch(() => {}); setTimeout(() => S.viewer.resize(), 60); }
};
S.close = () => { $('street').hidden = true; document.body.classList.remove('streeting'); if (S.marker) S.marker.show = false; GE.scene.requestRender(); };
S.init = () => {
  $('stClose').onclick = S.close;
  $('stBig').onclick = () => { $('street').classList.toggle('big'); setTimeout(() => S.viewer && S.viewer.resize(), 320); };
  addEventListener('resize', () => S.viewer && !$('street').hidden && S.viewer.resize());
};
}
