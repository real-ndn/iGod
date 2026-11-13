// ───────────────────────── God's Eye · boot ─────────────────────────
(async () => {
  const $ = GE.$;
  GE.CFG.miloOwner = 'Gilberto';
  if (!window.Cesium) { $('bootMsg').textContent = 'The 3D engine did not load. Check the connection and reload.'; return; }
  try { GE.initGlobe(); }
  catch (e) { console.error(e); $('bootMsg').textContent = 'This browser could not start 3D graphics (WebGL).'; return; }

  GE.scene.canvas.addEventListener('pointerdown', () => (GE.touched = true), { once: true });
  GE.cam.init(); GE.ui.initPicking(); GE.ui.initNav(); GE.ui.initPanels(); GE.ui.initCinema();
  GE.L.roads.show = GE.prefs.roads;
  GE.labels.init(); GE.labels.enable(GE.prefs.labels); GE.history.init(); GE.draw.init(); GE.street.init();
  GE.applySunEverywhere(); GE.applyShadows();
  GE.applyMode(GE.prefs.mode); GE.ui.syncMode(); document.fonts && document.fonts.ready.then(() => GE.ui.syncMode());
  GE.applyTerrain();
  await GE.setBase(GE.prefs.base === 'photoreal' && !GE.keys.ion && !GE.keys.google ? 'satellite' : GE.prefs.base);

  for (const [k, layer] of [['quakes', 'quakes'], ['events', 'events'], ['fires', 'fires'], ['sats', 'sats'], ['flights', 'flights']]) if (GE.prefs[k]) GE.live[layer].enable(true);

  const fromLink = GE.ui.readHash();
  if (!fromLink) {
    // open on the line between day and night, so the first thing you see is the real sun
    const t = Date.now(), { ra, gmst } = GE.sun.eq(t), subLon = (((ra - gmst) * 180) / Math.PI + 540) % 360 - 180;
    GE.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(((subLon - 72 + 540) % 360) - 180, 18, 2.25e7) });
  }
  GE.ribbon.init();
  GE.tourFilm.init();
  GE.camera.moveEnd.addEventListener(() => { GE.ui.writeHash(); GE.ui.status(); });
  GE.camera.changed.addEventListener(() => GE.ui.status());

  let done = false;
  const finish = () => {
    if (done) return; done = true; $('boot').classList.add('gone'); setTimeout(() => $('boot').remove(), 1000);
    GE.ui.status(); GE.milo.greet();
    if (location.protocol !== 'file:') GE.tourFilm.load(); // the recorded tour, if one is published
    if (!fromLink && !GE.cam.mode && !GE.touched) GE.cam.spin(); // idle drift until the first touch
  };
  GE.scene.globe.tileLoadProgressEvent.addEventListener((n) => { if (n === 0) setTimeout(finish, 300); });
  setTimeout(finish, 8000);
  // installable app: works offline for the shell and caches the engine after the first visit
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
