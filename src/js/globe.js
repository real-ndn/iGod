// ───────────────────────── God's Eye · globe engine ─────────────────────────
// CesiumJS viewer, imagery stack, free worldwide terrain, real sun, vision modes, photoreal 3D.
{
const C = Cesium, R = Math.PI / 180;

// ── Terrarium terrain: AWS open elevation tiles (Web Mercator PNG) resampled into Cesium's geographic heightmaps.
GE.terra = (() => {
  const MAXZ = 15, LIMIT = GE.isMobile ? 90 : 180, MAX_ACTIVE = 10;
  const cache = new Map(), order = [], queue = []; let active = 0;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const pump = () => { while (active < MAX_ACTIVE && queue.length) { const job = queue.shift(); active++; job().finally(() => { active--; pump(); }); } };
  const schedule = (fn) => new Promise((res) => { queue.unshift(() => fn().then(res, () => res(null))); pump(); }); // newest first
  function load(z, x, y) {
    const k = z + '/' + x + '/' + y; let p = cache.get(k); if (p) return p;
    p = schedule(async () => {
      const r = await fetch(GE.fill(GE.CFG.url.terrarium, { z, x, y }), { mode: 'cors' }); if (!r.ok) return null;
      const img = await createImageBitmap(await r.blob());
      cx.clearRect(0, 0, 256, 256); cx.drawImage(img, 0, 0); if (img.close) img.close();
      const d = cx.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
      for (let i = 0, j = 0; i < 65536; i++, j += 4) { const v = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768; h[i] = v < 0 ? 0 : v; } // seafloor -> sea level
      return h;
    });
    cache.set(k, p); order.push(k); if (order.length > LIMIT) cache.delete(order.shift());
    return p;
  }
  const merc = (W) => ({ x: (lon) => ((lon + 180) / 360) * W, y: (lat) => { const s = Math.sin(GE.clamp(lat, -85.05, 85.05) * R); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * W; } });
  async function grid(west, north, spanX, spanY, N, z) {
    const W = 256 * (1 << z), T = 1 << z, m = merc(W);
    const gx0 = m.x(west) - 2, gx1 = m.x(west + spanX) + 2, gy0 = Math.max(0, m.y(north) - 2), gy1 = Math.min(W - 1, m.y(north - spanY) + 2);
    const tiles = new Map(), jobs = [];
    for (let ty = Math.floor(gy0 / 256); ty <= Math.floor(gy1 / 256); ty++)
      for (let tx = Math.floor(gx0 / 256); tx <= Math.floor(gx1 / 256); tx++) { const key = tx + ',' + ty; jobs.push(load(z, ((tx % T) + T) % T, ty).then((h) => tiles.set(key, h))); }
    await Promise.all(jobs);
    const px = (i, j) => { j = GE.clamp(j, 0, W - 1); const tx = Math.floor(i / 256), ty = Math.floor(j / 256), h = tiles.get(tx + ',' + ty); return h ? h[(j - ty * 256) * 256 + (i - tx * 256)] : 0; };
    const out = new Float32Array(N * N);
    for (let r = 0; r < N; r++) {
      const v = m.y(north - (spanY * r) / (N - 1)) - 0.5, j = Math.floor(v), fy = v - j;
      for (let c = 0; c < N; c++) {
        const u = m.x(west + (spanX * c) / (N - 1)) - 0.5, i = Math.floor(u), fx = u - i;
        const a = px(i, j), b = px(i + 1, j), cc = px(i, j + 1), d = px(i + 1, j + 1);
        out[r * N + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
      }
    }
    return out;
  }
  const provider = new C.CustomHeightmapTerrainProvider({
    width: 65, height: 65,
    credit: new C.Credit('Terrain: Mapzen Terrarium · AWS Open Data (USGS, SRTM, GMTED, ETOPO1)'),
    callback: (x, y, level) => { const n = 1 << level, span = 180 / n; return grid(-180 + x * span, 90 - y * span, span, span, 65, Math.min(MAXZ, Math.max(0, level - 1))); },
  });
  async function sample(lon, lat, z = 14) { const g = await grid(lon - 1e-5, lat + 1e-5, 2e-5, 2e-5, 2, z); return g[0]; }
  return { provider, sample };
})();

GE.initGlobe = function () {
  const v = (GE.viewer = new C.Viewer('globe', {
    baseLayer: false, terrainProvider: GE.terra.provider,
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, vrButton: false,
    creditContainer: 'credits', useBrowserRecommendedResolution: false, requestRenderMode: true, maximumRenderTimeChange: 20,
    msaaSamples: GE.isMobile ? 1 : 4, // iPad M-series and desktops can afford 4x MSAA orderIndependentTranslucency: false, showRenderLoopErrors: false,
    contextOptions: { webgl: { alpha: false, powerPreference: 'high-performance' } },
  }));
  const s = (GE.scene = v.scene), g = s.globe, cam = (GE.camera = v.camera);

  // light, air, space
  g.enableLighting = true; g.dynamicAtmosphereLighting = true; g.dynamicAtmosphereLightingFromSun = true;
  g.showGroundAtmosphere = true; g.depthTestAgainstTerrain = true; g.tileCacheSize = GE.isMobile ? 220 : GE.isTablet ? 420 : 500;
  g.baseColor = C.Color.fromCssColorString('#081322'); g.preloadAncestors = true;
  s.skyAtmosphere.show = true; s.fog.enabled = true; s.sun.show = true; s.moon.show = true; s.sun.glowFactor = 1.25;
  s.postProcessStages.fxaa.enabled = GE.isMobile; s.highDynamicRange = false;
  const ssc = s.screenSpaceCameraController; ssc.minimumZoomDistance = 4; ssc.maximumZoomDistance = 7.0e7; ssc.enableCollisionDetection = true;
  v.clock.shouldAnimate = true; v.clock.multiplier = 1;

  // imagery stack (bottom → top): Esri satellite, NASA daily, night lights, roads, places
  const url = GE.CFG.url, L = v.imageryLayers;
  const credit = (t) => new C.Credit(t, true);
  GE.L = {};
  GE.L.esri = L.addImageryProvider(new C.UrlTemplateImageryProvider({ url: url.esri, maximumLevel: 19, credit: credit('Imagery © Esri, Maxar, Earthstar Geographics, GIS User Community') }));
  GE.L.daily = null;
  GE.L.night = L.addImageryProvider(new C.UrlTemplateImageryProvider({ url: GE.fill(url.gibs, { layer: 'VIIRS_Black_Marble', date: '2016-01-01', lvl: 8, ext: 'png' }), maximumLevel: 8, credit: credit('Night lights: NASA Black Marble (GIBS)') }));
  GE.L.night.dayAlpha = 0; GE.L.night.nightAlpha = 1; GE.L.night.brightness = 1.35;
  GE.L.roads = L.addImageryProvider(new C.UrlTemplateImageryProvider({ url: url.roads, maximumLevel: 19, credit: credit('Labels © Esri') }));

  // vision modes: one post-process pass, five looks
  GE.visionStage = s.postProcessStages.add(new C.PostProcessStage({
    name: 'ge_vision',
    uniforms: { u_mode: () => GE.visionCode || 0, u_time: () => (performance.now() / 1000) % 600 },
    fragmentShader: `
      uniform sampler2D colorTexture; uniform float u_mode; uniform float u_time;
      in vec2 v_textureCoordinates;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 ironbow(float t){
        vec3 c = mix(vec3(0.0,0.0,0.05), vec3(0.32,0.0,0.55), smoothstep(0.0,0.3,t));
        c = mix(c, vec3(0.86,0.12,0.22), smoothstep(0.25,0.55,t));
        c = mix(c, vec3(1.0,0.55,0.0), smoothstep(0.5,0.78,t));
        return mix(c, vec3(1.0,0.97,0.75), smoothstep(0.78,1.0,t));
      }
      void main(){
        vec2 uv = v_textureCoordinates; vec3 c = texture(colorTexture, uv).rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114)); vec3 o = c;
        float vig = smoothstep(0.92, 0.32, length((uv - 0.5) * vec2(1.25, 1.0)));
        if (u_mode < 1.5) {            // night vision
          float n = hash(floor(uv * czm_viewport.zw / 1.5) + floor(u_time * 24.0)) - 0.5;
          float gl = pow(clamp(l * 1.9, 0.0, 1.0), 0.75) + n * 0.14;
          o = vec3(0.12, 1.0, 0.32) * gl * (0.92 + 0.08 * sin(uv.y * czm_viewport.w * 1.6)) * mix(0.35, 1.0, vig);
        } else if (u_mode < 2.5) {     // thermal (ironbow)
          o = ironbow(clamp(pow(l, 0.85) * 1.15, 0.0, 1.0));
        } else if (u_mode < 3.5) {     // noir
          float n = hash(uv * czm_viewport.zw + u_time) - 0.5;
          o = vec3(smoothstep(0.04, 0.92, l) + n * 0.045) * mix(0.55, 1.0, vig);
        } else {                       // cinema grade
          o = mix(c, c * vec3(1.07, 0.98, 0.86), 0.75); o = (o - 0.5) * 1.07 + 0.5; o *= mix(0.7, 1.0, vig);
        }
        out_FragColor = vec4(o, 1.0);
      }`,
  }));
  GE.visionStage.enabled = false;

  // keep going after a render error instead of freezing
  s.renderError.addEventListener((_, err) => {
    console.error(err); GE.toast('A layer failed to render. Turned off effects and kept going.');
    GE.visionStage.enabled = false; GE.visionCode = 0;
    if (GE.photoreal) { GE.photoreal.customShader = undefined; }
    setTimeout(() => { v.useDefaultRenderLoop = true; s.requestRender(); }, 50);
  });

  cam.percentageChanged = 0.02; cam.changed.addEventListener(() => GE.applyLights()); cam.moveEnd.addEventListener(() => GE.applyLights());
  GE.setDetail(GE.prefs.detail);
  return v;
};

// ── detail: Ultra renders at full device resolution and refines terrain/imagery further
GE.setDetail = (d) => {
  const v = GE.viewer, dpr = window.devicePixelRatio || 1; GE.prefs.detail = d; GE.savePrefs();
  v.resolutionScale = d === 'ultra' ? Math.min(1, (GE.isMobile ? 2 : 3) / dpr) : Math.max(0.5, 1 / dpr);
  GE.scene.globe.maximumScreenSpaceError = d === 'ultra' ? 1.33 : 2;
  if (GE.photoreal) GE.photoreal.maximumScreenSpaceError = d === 'ultra' ? 8 : 16;
  GE.scene.requestRender();
};

// ── time: the Cesium clock drives the sun everywhere
GE.time = {
  now: () => C.JulianDate.toDate(GE.viewer.clock.currentTime).getTime(),
  set(ms) { const v = GE.viewer; v.clock.currentTime = C.JulianDate.fromDate(new Date(ms)); GE.scene.requestRender(); GE.emit('time'); },
  offsetH: () => (GE.time.now() - Date.now()) / 3600000,
  live() { GE.time.play(false); GE.time.set(Date.now()); },
  play(on) { const c = GE.viewer.clock; GE.time.playing = on; c.multiplier = on ? 2400 : 1; c.shouldAnimate = true; GE.emit('time'); },
};

// ── where the screen is looking
GE.viewCenter = () => {
  const s = GE.scene, c = s.canvas, p = new C.Cartesian2(c.clientWidth / 2, c.clientHeight / 2);
  let pos = null;
  if (GE.photoreal && GE.photoreal.show) { try { pos = s.pickPosition(p); } catch {} }
  if (!pos) { const ray = GE.camera.getPickRay(p); pos = ray && s.globe.pick(ray, s); }
  if (!pos) pos = GE.camera.pickEllipsoid(p);
  if (!pos) return null;
  const k = C.Cartographic.fromCartesian(pos); return { lon: k.longitude / R, lat: k.latitude / R, h: k.height, pos };
};
GE.screenToLL = (x, y) => {
  const s = GE.scene, p = new C.Cartesian2(x, y); let pos = null;
  if (GE.photoreal && GE.photoreal.show && s.pickPositionSupported) { try { pos = s.pickPosition(p); } catch {} }
  if (!pos) { const ray = GE.camera.getPickRay(p); pos = (ray && s.globe.pick(ray, s)) || GE.camera.pickEllipsoid(p); }
  if (!pos) return null; const k = C.Cartographic.fromCartesian(pos); return { lon: k.longitude / R, lat: k.latitude / R, h: k.height, pos };
};
GE.heightAt = async (lon, lat) => {
  const s = GE.scene, k = C.Cartographic.fromDegrees(lon, lat);
  try {
    if (GE.photoreal && GE.photoreal.show && s.sampleHeightMostDetailed) { const [r] = await Promise.race([s.sampleHeightMostDetailed([k]), new Promise((_, j) => setTimeout(j, 2500))]); if (r && isFinite(r.height)) return r.height; }
    const quick = s.globe.getHeight(k); if (quick != null && GE.terrainKind !== 'terrarium') return quick;
    if (GE.terrainKind === 'ion') { const [r] = await C.sampleTerrainMostDetailed(s.terrainProvider, [k]); return r.height || 0; }
    if (GE.terrainKind === 'terrarium') return await Promise.race([GE.terra.sample(lon, lat, 14), new Promise((r) => setTimeout(() => r(quick || 0), 2500))]);
  } catch {}
  return 0;
};

// ── terrain choice: Cesium World Terrain (ion) > Terrarium (free) > flat
GE.applyTerrain = async () => {
  const s = GE.scene, p = GE.prefs;
  s.verticalExaggeration = p.relief || 1;
  if (!p.terrain) { s.terrainProvider = new C.EllipsoidTerrainProvider(); GE.terrainKind = 'flat'; s.globe.showWaterEffect = false; return; }
  if (GE.keys.ion) {
    try { C.Ion.defaultAccessToken = GE.keys.ion; s.terrainProvider = await C.createWorldTerrainAsync({ requestWaterMask: true, requestVertexNormals: true }); s.globe.showWaterEffect = true; GE.terrainKind = 'ion'; return; }
    catch (e) { console.warn(e); GE.toast('Cesium ion terrain did not load. Using open terrain.'); }
  }
  s.terrainProvider = GE.terra.provider; GE.terrainKind = 'terrarium'; s.globe.showWaterEffect = false;
};

// ── base Earth: satellite | daily (NASA, any date) | photoreal (Google 3D) | night
GE.gibsDaily = (date) => {
  const layer = date >= '2018-01-01' ? 'VIIRS_NOAA20_CorrectedReflectance_TrueColor' : date >= '2015-11-24' ? 'VIIRS_SNPP_CorrectedReflectance_TrueColor' : 'MODIS_Terra_CorrectedReflectance_TrueColor';
  return GE.fill(GE.CFG.url.gibs, { layer, date, lvl: 9, ext: 'jpg' });
};
GE.setDailyDate = (date) => {
  const L = GE.viewer.imageryLayers; GE.dailyDate = date;
  if (GE.L.daily) { L.remove(GE.L.daily, true); GE.L.daily = null; }
  if (GE.prefs.base !== 'daily') return;
  // maximumTerrainLevel hands over to sharp Esri imagery when you zoom close
  GE.L.daily = new C.ImageryLayer(new C.UrlTemplateImageryProvider({ url: GE.gibsDaily(date), maximumLevel: 9, credit: new C.Credit('Daily imagery: NASA EOSDIS GIBS (VIIRS / MODIS)', true) }), { maximumTerrainLevel: 12 });
  L.add(GE.L.daily, 1);
  GE.scene.requestRender();
};
GE.setBase = async (base) => {
  if (base === 'photoreal' && !GE.keys.ion && !GE.keys.google) { GE.toast('3D Cities needs a free Cesium ion token or a Google Maps key. Add one in Settings.', 6000); GE.emit('needKeys'); return false; }
  GE.prefs.base = base; GE.savePrefs();
  const g = GE.scene.globe;
  GE.L.esri.show = true; GE.L.esri.brightness = base === 'night' ? 0.28 : 1;
  GE.setDailyDate(GE.dailyDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  GE.applyLights();
  if (base === 'photoreal') { await GE.loadPhotoreal(); g.show = !GE.photoreal; }
  else { if (GE.photoreal) GE.photoreal.show = false; g.show = true; }
  GE.applyBuildings(); GE.scene.requestRender(); GE.emit('base', base); return true;
};
// Night lights are a regional view: full from space, gone by the time you're near the ground
// (Cesium blends day/night layers by the sun regardless of zoom, so we fade by altitude ourselves).
GE.applyLights = () => {
  const n = GE.L.night; if (!n) return;
  const night = GE.prefs.base === 'night', h = GE.camera.positionCartographic.height;
  const lo = night ? 2.5e5 : 5e5, hi = night ? 1.6e6 : 2.8e6, t = GE.clamp((h - lo) / (hi - lo), 0, 1), a = t * t * (3 - 2 * t);
  n.nightAlpha = a; n.dayAlpha = night ? a : 0; n.show = (night || GE.prefs.lights) && a > 0.002;
  GE.scene.requestRender();
};
GE.applySunEverywhere = () => {
  const g = GE.scene.globe, on = GE.prefs.sunEverywhere, r = 6356752;
  // only the surface lighting follows the sun everywhere; the ground-atmosphere night fade keys off the
  // camera's own position and would black out golden hour, so it keeps Cesium's defaults
  g.lightingFadeOutDistance = on ? 1 : (Math.PI / 2) * r; g.lightingFadeInDistance = on ? 2 : Math.PI * r;
  GE.scene.requestRender();
};
GE.applyShadows = () => {
  const v = GE.viewer, on = GE.prefs.shadows; v.shadows = on; v.terrainShadows = on ? C.ShadowMode.ENABLED : C.ShadowMode.DISABLED;
  if (on) { const sm = GE.scene.shadowMap; sm.softShadows = true; sm.darkness = 0.38; sm.size = GE.isMobile ? 1024 : 2048; sm.maximumDistance = 20000; }
  GE.scene.requestRender();
};

// Photoreal 3D Tiles, lit by the real sun: a custom shader darkens Google's daylight textures at night and warms them at golden hour.
GE.loadPhotoreal = async () => {
  if (GE.photoreal) { GE.photoreal.show = true; return; }
  try {
    const opts = { onlyUsingWithGoogleGeocoder: true };
    if (GE.keys.google) opts.key = GE.keys.google; else C.Ion.defaultAccessToken = GE.keys.ion;
    const ts = await C.createGooglePhotorealistic3DTileset(opts, { maximumScreenSpaceError: GE.prefs.detail === 'ultra' ? 8 : 16, showCreditsOnScreen: true });
    ts.customShader = new C.CustomShader({
      lightingModel: C.LightingModel.UNLIT,
      fragmentShaderText: `
        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          vec3 up = normalize(fsInput.attributes.positionWC);
          float s = dot(up, normalize(czm_sunDirectionWC));
          float day = smoothstep(-0.14, 0.06, s);
          float gold = exp(-pow((s - 0.06) / 0.11, 2.0)) * day;
          vec3 c = material.diffuse;
          c = mix(c * vec3(0.05, 0.07, 0.15), c, day);
          c = mix(c, c * vec3(1.16, 0.9, 0.66), gold * 0.55);
          material.diffuse = c;
        }`,
    });
    GE.photoreal = GE.scene.primitives.add(ts);
    GE.toast('Photoreal 3D cities on. Search now uses Google to match.');
  } catch (e) { console.warn(e); GE.photoreal = null; GE.toast('Could not load 3D cities. Check the key in Settings.', 6000); }
};
GE.applyBuildings = async () => {
  const want = GE.prefs.buildings && GE.keys.ion && GE.prefs.base !== 'photoreal';
  if (!want) { if (GE.osm) GE.osm.show = false; GE.scene.requestRender(); return; }
  if (GE.osm) { GE.osm.show = true; return; }
  try { C.Ion.defaultAccessToken = GE.keys.ion; GE.osm = GE.scene.primitives.add(await C.createOsmBuildingsAsync({ style: new C.Cesium3DTileStyle({ color: "color('#efe9df', 0.96)" }) })); }
  catch (e) { console.warn(e); GE.toast('OSM buildings need a valid Cesium ion token.'); }
};

// ── vision + creative look
GE.setVision = (mode) => {
  const code = { normal: 0, nv: 1, thermal: 2, mono: 3, cinema: 4 }[mode] ?? 0;
  GE.prefs.vision = mode; GE.savePrefs(); GE.visionCode = code;
  GE.visionStage.enabled = code > 0 || GE.prefs.mode === 'creative';
  if (code === 0 && GE.prefs.mode === 'creative') GE.visionCode = 4;
  GE.scene.requestRenderMode = !(GE.visionCode === 1 || GE.visionCode === 3); // animated grain needs every frame
  GE.scene.requestRender(); GE.emit('vision', mode);
};
GE.applyMode = (mode) => {
  GE.prefs.mode = mode; GE.savePrefs(); document.body.classList.toggle('creative', mode === 'creative');
  const sky = GE.scene.skyAtmosphere, at = GE.scene.atmosphere, warm = mode === 'creative';
  sky.hueShift = warm ? -0.025 : 0; sky.saturationShift = warm ? 0.12 : 0; sky.brightnessShift = warm ? 0.04 : 0;
  if (at) { at.hueShift = warm ? -0.02 : 0; at.saturationShift = warm ? 0.1 : 0; }
  GE.setVision(GE.prefs.vision); GE.emit('mode', mode);
};
}
