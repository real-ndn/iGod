#!/usr/bin/env node
// Films the God's Eye tour on real imagery, frame by frame, so it plays smoothly on any device.
//
// The app runs on a virtual clock. Each frame, time moves on by exactly 1/fps, the globe is drawn,
// and nothing is captured until every map tile in view has loaded. So the film is sharp end to end,
// however slow the machine or the network. GitHub Actions runs this: .github/workflows/record-tour.yml.
//
// A software GPU takes seconds to paint a frame, so the tour is filmed in parts, on several machines
// at once. Every part flies the whole tour from the start on the same clock, so the camera is in exactly
// the same place, but only loads and paints its own stretch. --assemble joins them.
//
//   node tools/record-tour.mjs [siteDir=site] [outDir=tour-out] [--fps 30] [--size 1920x1280] [--seconds N] [--part K/N] [--no-encode]
//   node tools/record-tour.mjs --assemble partsDir [outDir=tour-out]
//
// Writes, in outDir: tour.mp4 (H.264, starts streaming at once), tour.json (when each caption and
// line of narration starts, and exactly where the film ends) and poster.jpg. With --part K/N it
// writes part-K.mp4 and part-K.json instead, for --assemble.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// The look of the film, whatever the viewer's own settings: late-afternoon sun, labels, roads and
// borders on, live layers off, true relief (the stops' views are framed for it), Milo silent (the app
// narrates live over the film).
export const FILM_PREFS = {
  mode: 'user', base: 'satellite', detail: 'ultra', vision: 'normal', voice: false,
  labels: true, roads: true, borders: true, terrain: true, relief: 1, lights: true, sunEverywhere: true, shadows: false, buildings: false,
  sats: false, starlink: false, flights: false, quakes: false, events: false, fires: false,
};
export const SUN_ALT = 12; // degrees: the sun this high, and sinking, at every stop

// Runs in the page before anything else: replaces the page's clock and animation frames with
// virtual ones that only move when the recorder says so.
export function virtualClock({ prefs, fps }) {
  try { localStorage.setItem('ge.prefs', JSON.stringify(prefs)); } catch {}
  const perf = window.performance, realNow = perf.now.bind(perf), realDate = Date.now.bind(Date);
  const realRAF = window.requestAnimationFrame.bind(window), realCAF = window.cancelAnimationFrame.bind(window);
  // The virtual clock starts at the same moment on every machine and counts whole frames, so every
  // part does exactly the same arithmetic: a flight that ends right on a frame ends on the same frame
  // everywhere (from the page's own start time, rounding could tip it either way).
  const VT0 = 1e8;
  let on = false, vt = 0, epoch = 0, seq = 1, n = 0;
  const queue = new Map();
  perf.now = () => (on ? vt : realNow());
  Date.now = () => (on ? epoch + vt : realDate());
  window.requestAnimationFrame = (cb) => { if (!on) return realRAF(cb); const id = -seq++; queue.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { if (!queue.delete(id)) realCAF(id); };
  // the next real display frame: paces our drawing to what the browser can show
  const display = () => new Promise((r) => realRAF(() => r()));
  const blank = () => false; // a draw that updates and loads everything but paints nothing
  window.__film = {
    fps,
    start() { vt = VT0; n = 0; epoch = realDate() - vt; on = true; },
    t: () => (vt - VT0) / 1000,
    // Draw until a frame comes out with every tile in view loaded, at most `cap` ms, and hand back
    // that frame, read straight off the canvas in the same breath as it's drawn (no waiting on the
    // page compositor, which a software GPU makes slow).
    // While tiles are still arriving, the globe updates and loads as usual but nothing is painted
    // (debugCommandFilter): the software GPU's time goes on the one frame that is kept. A view that
    // is already loaded is painted at once.
    // paintable false: flying ahead to another part's stretch. Everything loads as usual (so the camera,
    // which keeps clear of the terrain it can see, goes exactly where it would), but nothing is painted.
    async settle(cap = 120000, grab = true, paintable = true) {
      const GE = window.GE, S = GE.scene, v = GE.viewer, g = S.globe, t0 = realNow();
      let paint = paintable && this.warm, painted = 0;
      for (let draws = 1; ; draws++) {
        S.debugCommandFilter = paint ? undefined : blank; painted += paint;
        GE.labels.update(); v.render();
        const loaded = g.tilesLoaded && (draws > 1 || this.quiet());
        // a new letter takes two or three draws to reach the screen; a frame waits for it (a few
        // draws at most, and never again for an image that is stuck for good)
        const late = paintable ? this.pending() : 0, waitLate = late > 0 && draws <= 8 && this.stuck < 30;
        if (late && loaded && !waitLate) this.stuck++;
        const timedOut = !(loaded && !waitLate) && realNow() - t0 > cap, ready = (loaded && !waitLate) || timedOut;
        if (draws === 1 && paintable) this.warm = ready; // ready at the first look: the next frame probably will be too, so paint it straight away
        if (ready && (paint || !paintable)) {
          S.debugCommandFilter = undefined;
          return { waited: Math.round(realNow() - t0), draws, painted, late, timedOut, img: grab && paint ? S.canvas.toDataURL('image/jpeg', 0.93) : '' };
        }
        paint = ready; // everything's in: draw it for real
        if (!ready) await display();
      }
    },
    stuck: 0, warm: false, timeouts: 0,
    // Letters and markers on screen whose image hasn't reached the GPU yet. Label letters are drawn
    // into a shared texture during one draw and only show from a later one, so without this a new
    // label flashes in with letters missing.
    pending() {
      const seen = new Set(); let n = 0;
      const bbs = (c) => {
        if (!c || seen.has(c)) return; seen.add(c);
        const q = c._textureAtlas && c._textureAtlas._imagesToAddQueue; if (q) n += q.length;
        for (const b of c._billboards || []) if (b && b.show && (b.textureDirty || (b._imageTexture && b._imageTexture._loadState === 2))) n++;
      };
      const walk = (p, d) => {
        if (!p || typeof p !== 'object' || d > 8 || seen.has(p)) return;
        if (p._glyphBillboardCollection) { seen.add(p); bbs(p._glyphBillboardCollection); bbs(p._backgroundBillboardCollection); return; }
        if (Array.isArray(p._billboards) && '_textureAtlas' in p) { bbs(p); return; }
        seen.add(p);
        if (Array.isArray(p._primitives)) for (const q of p._primitives) walk(q, d + 1);
        walk(p._labelCollection, d + 1); walk(p._billboardCollection, d + 1);
      };
      walk(window.GE.scene.primitives, 0);
      return n;
    },
    // nothing still on its way over the network
    quiet() { const s = window.Cesium.RequestScheduler.statistics; return !s || !s.numberOfActiveRequests; },
    // one frame: time moves on, everything animated takes its step, the globe loads and is drawn
    // (keep false: flying ahead, nothing painted)
    async frame(keep = true) {
      vt = VT0 + (++n * 1000) / fps;
      const due = [...queue.values()]; queue.clear();
      for (const cb of due) { try { cb(vt); } catch (e) { console.error('frame callback', e); } }
      // Let everything those steps set off happen before the first draw (the next stop's flight is started
      // from a promise). Otherwise a flight's clock starts on whichever draw comes first, which differs
      // between a part that is filming and one that is flying ahead, and the parts no longer meet exactly.
      await new Promise((r) => setTimeout(r, 0));
      // flying ahead: nothing about the camera's path depends on the globe, so one quick draw moves everything on
      const r = keep ? await this.settle() : this.skip();
      if (r.timedOut) this.timeouts++;
      const GE = window.GE, net = window.Cesium.RequestScheduler.statistics; // tiles asked for, and how many the servers refused
      const k = GE.camera.positionCartographic, g = keep ? GE.scene.globe.getHeight(k) : null;
      const low = g != null && k.height < g * (GE.scene.verticalExaggeration || 1) + 25; // the camera within 25 m of the ground
      return { done: !GE.cam.mode, t: this.t(), stuck: this.stuck, timeouts: this.timeouts, cam: this.cam(), low, fetched: net.numberOfActiveRequestsEver, failed: net.numberOfFailedRequests, ...r };
    },
    skip() { const S = window.GE.scene; S.debugCommandFilter = blank; window.GE.viewer.render(); S.debugCommandFilter = undefined; return { draws: 1, painted: 0, waited: 0, late: 0, timedOut: false, img: '' }; },
    cam() { const c = window.GE.camera, k = c.positionCartographic, R = 180 / Math.PI; return { lon: k.longitude * R, lat: k.latitude * R, height: k.height, heading: c.heading, pitch: c.pitch, roll: c.roll }; },
    // flying ahead, the globe isn't even loaded: those draws are never seen
    ahead(on) { const S = window.GE.scene; S.postProcessStages.fxaa.enabled = !on; S.globe.show = !on; },
  };
}

// After the app has booted: set the scene, then film this part's frames (the whole tour when there
// is one part). Returns what --assemble needs to know about them.
export async function film(page, { outDir, fps = 30, seconds = 0, part = [0, 1], log = console.log, onFrame } = {}) {
  const [k, N] = part, frames = path.join(outDir, 'frames-' + k);
  fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });

  const plan = await page.evaluate(async (SUN_ALT) => {
    const GE = window.GE, C = window.Cesium;
    document.body.classList.add('recording'); GE.recording = true; GE.touched = true;
    GE.cam.stop(); GE.scene.requestRenderMode = false;
    GE.scene.msaaSamples = 1; GE.scene.postProcessStages.fxaa.enabled = true; GE.scene.globe.maximumScreenSpaceError = 1.6;
    // The parts are filmed on different machines and must join exactly, so the camera's path can't
    // depend on which terrain tiles happen to be loaded: Cesium's own terrain clamp is off (the app's
    // is too, while GE.recording). The tour's views keep well clear of the ground anyway.
    GE.scene.screenSpaceCameraController.enableCollisionDetection = false;
    const stops = GE.TOUR.map((n) => GE.PLACES.find((p) => p.name === n)).filter(Boolean);
    // each stop's ground height at full detail, however long the network takes, so no flight waits on
    // it mid-film and every part flies to exactly the same spots
    const exact = async (p) => {
      for (let i = 0; i < 6; i++) {
        try {
          const h = GE.terrainKind === 'terrarium' ? await GE.terra.sample(p.lon, p.lat, 14)
            : (await C.sampleTerrainMostDetailed(GE.scene.terrainProvider, [C.Cartographic.fromDegrees(p.lon, p.lat)]))[0].height;
          if (h && isFinite(h)) return h;
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      return GE.heightAt(p.lon, p.lat);
    };
    const heights = {};
    for (const p of stops) heights[p.name] = await exact(p);
    // the light: at each stop, the moment the sun sinks through SUN_ALT, time only moving forward.
    // Neighbouring stops share a moment; between continents the light sweeps round with the flight.
    const alt = (t, p) => GE.sun.altAz(t, p.lat, p.lon).alt;
    const sinks = (from, p) => { let t = from, a = alt(t, p); for (let k = 0; k < 600; k++) { const n = t + 300000, b = alt(n, p); if (a > SUN_ALT && b <= SUN_ALT) return n; t = n; a = b; } return from; };
    const clocks = []; let t = Date.UTC(2026, 9, 15, 12); // mid-October: long, warm afternoon light
    stops.forEach((p, i) => { const c = sinks(i ? t - 5400000 : t, p); t = i && c - t < 5400000 ? t : c; clocks.push(t); });
    // opening shot: the whole planet, Arizona below
    GE.time.set(clocks[0]); // (and again once the virtual clock starts)
    GE.camera.setView({ destination: C.Cartesian3.fromDegrees(-112, 31, 1.6e7), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } });
    return { names: stops.map((p) => p.name), heights, clocks };
  }, SUN_ALT);
  log('heights', JSON.stringify(plan.heights));
  log('light', plan.clocks.map((c, i) => `${plan.names[i]} ${new Date(c).toISOString().slice(5, 16)}Z`).join(' · '));

  await page.evaluate(() => document.fonts.ready); // label letters are drawn once and kept, so in the right font
  log('opening shot: loading', (await page.evaluate(() => window.__film.settle(120000, false))).waited, 'ms');
  await page.evaluate((plan) => {
    const GE = window.GE, F = window.__film;
    GE.viewer.useDefaultRenderLoop = false; // from here on, the recorder draws every frame itself
    F.start(); F.captions = [];
    // Cesium's clock moves by the time between draws: one tick on the new clock, then the scene's time of day
    GE.viewer.clock.tick(); GE.time.set(plan.clocks[0]);
    const show = GE.setCaption;
    GE.setCaption = (eyebrow, text) => { F.captions.push({ t: F.t(), eyebrow: eyebrow || '', text: text || '' }); return show(eyebrow, text); };
    GE.cam.tour({ live: true, quiet: true, heights: plan.heights, clock: (i) => plan.clocks[i] });
  }, plan);

  // this part's stretch of the film (the whole tour runs a little under 114 s)
  const total = Math.round((seconds || 114) * fps);
  const from = Math.floor((k * total) / N), to = k === N - 1 ? (seconds ? total : Infinity) : Math.floor(((k + 1) * total) / N);
  const t0 = Date.now();
  let n = 0, st = { done: false }, first = null, last = null, low = 0;
  if (from) {
    log(`part ${k + 1} of ${N}: frames ${from} to ${Number.isFinite(to) ? to - 1 : 'the end'}. Flying ahead to frame ${from} first, without loading or painting anything`);
    await page.evaluate(() => window.__film.ahead(true));
    while (n < from && !st.done) {
      st = await page.evaluate(() => window.__film.frame(false)); n++;
      if (n % (fps * 10) === 0) log(`ahead: frame ${n} of ${from} · ${((Date.now() - t0) / n / 1000).toFixed(2)} s per frame · ${st.fetched} tiles fetched, ${st.failed} failed`);
    }
    await page.evaluate(() => window.__film.ahead(false));
    // the globe was off while flying ahead, so this view loads from scratch: let it, before the first kept frame
    const w = await page.evaluate(() => window.__film.settle(600000, false, false));
    log(`reached frame ${n} in ${Math.round((Date.now() - t0) / 60000)} min; its view took ${Math.round(w.waited / 1000)} s to load`);
  }
  const t1 = Date.now();
  while (!st.done && n < to) {
    st = await page.evaluate(() => window.__film.frame());
    fs.writeFileSync(path.join(frames, String(n).padStart(5, '0') + '.jpg'), Buffer.from(st.img.slice(st.img.indexOf(',') + 1), 'base64'));
    first = first || st.cam; last = st.cam; if (st.low) low++;
    n++; if (onFrame) onFrame(n, st);
    const kept = n - from;
    if (kept % (fps * 2) === 0) {
      const per = (Date.now() - t1) / kept, left = st.done ? 0 : Math.max(0, (Number.isFinite(to) ? to : total) - n);
      log(`frame ${n} · ${st.t.toFixed(1)} s of film · ${(per / 1000).toFixed(2)} s per frame (${st.draws} draws, ${st.waited} ms last) · ${st.fetched} tiles fetched, ${st.failed} failed · about ${Math.round((left * per) / 60000)} min to go`);
    }
  }
  // where the next part takes over: one more frame, unpainted, so --assemble can check the seam
  const next = !st.done && Number.isFinite(to) ? (await page.evaluate(() => window.__film.frame(false))).cam : null;
  const captions = await page.evaluate(() => window.__film.captions);
  const kept = Math.max(0, n - from);
  log(`part ${k + 1} of ${N}: filmed ${kept} frames in ${Math.round((Date.now() - t0) / 60000)} min` + (st.done ? ', to the end of the tour' : '') + ` · ${st.fetched} tiles fetched, ${st.failed} failed`
    + (st.stuck ? ` · ${st.stuck} frames went out with an image still loading` : '') + (low ? ` · ${low} frames with the camera within 25 m of the ground` : '')
    + (st.timeouts ? ` · ${st.timeouts} frames went out before their tiles had all loaded` : ''));
  return { part: k, of: N, fps, from, frames: kept, done: !!st.done, names: plan.names, heights: plan.heights, captions, first, last, next, low, timeouts: st.timeouts || 0, dir: frames };
}

// One part's frames, encoded nearly losslessly for --assemble, and what it needs to know about them.
export function encodePart(outDir, info, log = console.log) {
  const { dir, ...meta } = info, file = `part-${info.part}.mp4`;
  if (info.frames) {
    const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(info.fps), '-start_number', String(info.from), '-i', path.join(dir, '%05d.jpg'), '-frames:v', String(info.frames),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', '-g', String(info.fps * 2), path.join(outDir, file)], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('ffmpeg failed on part ' + info.part);
  }
  fs.writeFileSync(path.join(outDir, `part-${info.part}.json`), JSON.stringify({ v: 1, file: info.frames ? file : null, ...meta }, null, 1));
  log(`part ${info.part + 1} of ${info.of}: ${info.frames} frames` + (info.frames ? ` in ${file}, ${(fs.statSync(path.join(outDir, file)).size / 1e6).toFixed(1)} MB` : ''));
}

// how far apart two camera positions are: meters, and degrees of turn
function gap(a, b) {
  if (!a || !b) return { m: 0, deg: 0 };
  const R = 6378137, rad = Math.PI / 180, turn = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
  const m = Math.hypot((b.lon - a.lon) * rad * R * Math.cos(a.lat * rad), (b.lat - a.lat) * rad * R, b.height - a.height);
  return { m, deg: Math.max(turn(a.heading, b.heading), turn(a.pitch, b.pitch), turn(a.roll, b.roll)) / rad };
}

// Joins the parts into the film: checks every seam, encodes once for streaming, and writes
// tour.mp4, poster.jpg and tour.json into outDir.
export function assemble(dir, outDir, log = console.log) {
  const parts = fs.readdirSync(dir).filter((f) => /^part-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).sort((a, b) => a.part - b.part);
  if (!parts.length) throw new Error('no parts in ' + dir);
  const N = parts[0].of, warn = (m) => log(process.env.GITHUB_ACTIONS ? `::warning::${m}` : `warning: ${m}`);
  if (parts.length !== N || parts.some((p, i) => p.part !== i)) throw new Error(`expected ${N} parts, found ${parts.map((p) => p.part).join(', ')}`);
  for (const p of parts) if (JSON.stringify(p.heights) !== JSON.stringify(parts[0].heights)) warn(`part ${p.part + 1} measured different ground heights at the stops, so its camera path differs`);
  const low = parts.reduce((s, p) => s + (p.low || 0), 0), soft = parts.reduce((s, p) => s + (p.timeouts || 0), 0);
  if (low) warn(`${low} frames have the camera within 25 m of the ground`);
  if (soft) warn(`${soft} frames went out before all their tiles had loaded (the network was slow), so they may look soft`);
  for (let i = 1; i < N; i++) {
    const a = parts[i - 1], b = parts[i];
    if (!b.frames) continue; // the tour ended before this part's stretch
    if (a.from + a.frames !== b.from) throw new Error(`part ${i + 1} starts at frame ${b.from}, but part ${i} stopped at frame ${a.from + a.frames}`);
    const d = gap(a.next, b.first);
    log(`seam ${i}: the camera is ${d.m.toFixed(3)} m and ${d.deg.toFixed(4)}° from where part ${i} left it`);
    if (d.m > 0.5 || d.deg > 0.05) warn(`the camera jumps ${d.m.toFixed(1)} m at the start of part ${i + 1}`);
  }
  const filmed = parts.filter((p) => p.frames), final = parts[N - 1], fps = final.fps;
  if (!filmed.length) throw new Error('no frames filmed');
  fs.mkdirSync(outDir, { recursive: true });
  const list = path.join(outDir, 'parts.txt');
  fs.writeFileSync(list, filmed.map((p) => `file '${path.resolve(dir, p.file)}'`).join('\n') + '\n');
  // chapters: the i-th caption belongs to the i-th stop (the last part has flown the whole tour, so it has them all)
  let i = 0;
  const chapters = final.captions.filter((c) => c.text).map((c) => ({ t: +c.t.toFixed(3), name: final.names[i++], eyebrow: c.eyebrow, text: c.text }));
  const frames = filmed.reduce((s, p) => s + p.frames, 0), duration = +(frames / fps).toFixed(3);
  const gc = chapters.find((c) => c.name === 'Grand Canyon') || chapters[Math.floor(chapters.length / 2)];
  const posterT = Math.max(0, Math.min(duration - 0.5, (gc ? gc.t : duration / 2) + 11));
  const desc = {
    v: 1, file: 'tour.mp4', poster: 'poster.jpg', fps, width: final.width, height: final.height, frames, duration,
    recorded: new Date().toISOString(), light: `sun ${SUN_ALT}° above the horizon at each stop`, chapters, end: filmed[filmed.length - 1].last,
  };
  if (!final.done) log('note: the film stops before the end of the tour (--seconds)');
  encode(list, outDir, desc, posterT, log);
  fs.writeFileSync(path.join(outDir, 'tour.json'), JSON.stringify(desc, null, 1));
  return desc;
}

// H.264 for every browser; capped so it streams comfortably and stays under GitHub's 100 MB file limit
export const CREDIT = 'Imagery © Esri, Maxar, Earthstar Geographics · Terrain: Mapzen Terrarium, AWS Open Data · Places: Natural Earth';
const FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Helvetica.ttc'];
export function encode(list, outDir, desc, posterT, log = console.log) {
  const out = path.join(outDir, 'tour.mp4'), poster = path.join(outDir, 'poster.jpg');
  const font = FONTS.find((f) => fs.existsSync(f)), px = Math.round((desc.height || 1080) / 72);
  const credit = font ? ['-vf', `drawtext=fontfile=${font}:text='${CREDIT.replace(/[:']/g, (c) => '\\' + c)}':fontsize=${px}:fontcolor=white@0.62:shadowcolor=black@0.7:shadowx=1:shadowy=1:x=w-tw-${px * 1.5}:y=h-th-${px}`] : [];
  if (!font) log('no font found, so the imagery credit is not burned in');
  const run = (crf, max) => spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...credit, '-r', String(desc.fps),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-maxrate', max, '-bufsize', '10M', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-g', String(desc.fps * 2), '-movflags', '+faststart', '-tag:v', 'avc1', '-an', out], { stdio: 'inherit' });
  let r = run(21, '5M');
  if (r.status !== 0) throw new Error('ffmpeg failed');
  if (fs.statSync(out).size > 92e6) { log('over 92 MB, encoding again a little smaller'); r = run(24, '3.8M'); if (r.status !== 0) throw new Error('ffmpeg failed'); }
  const still = (t) => { fs.rmSync(poster, { force: true }); spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', out, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', poster], { stdio: 'inherit' }); return fs.existsSync(poster); };
  if (!still(posterT) && !still(desc.duration / 2) && !still(0)) throw new Error('could not take the poster frame');
  log(`tour.mp4 ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${desc.duration} s`);
}

async function main() {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && /^--(fps|size|seconds|part)$/.test(argv[i - 1])));
  if (argv.includes('--assemble')) {
    const [dir = 'parts', outDir = 'tour-out'] = positional;
    assemble(dir, outDir);
    console.log('wrote', path.join(outDir, 'tour.json'));
    return;
  }
  const [siteDir = 'site', outDir = 'tour-out'] = positional;
  const fps = +opt('fps', 30), [W, H] = opt('size', '1920x1280').split('x').map(Number), seconds = +opt('seconds', 0);
  const [k, N] = opt('part', '0/1').split('/').map(Number);
  if (!(N >= 1 && k >= 0 && k < N)) throw new Error('--part K/N counts K from 0 to N-1');
  fs.mkdirSync(outDir, { recursive: true });

  const root = path.resolve(siteDir);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 300)); });
  await page.addInitScript(virtualClock, { prefs: FILM_PREFS, fps });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.GE && window.GE.viewer && window.GE.cam && window.GE.TOUR, null, { timeout: 180000 });
  await page.waitForTimeout(4000);

  const info = await film(page, { outDir, fps, seconds, part: [k, N] });
  info.width = W; info.height = H;
  await browser.close(); server.close();
  encodePart(outDir, info);
  if (N === 1 && !argv.includes('--no-encode')) { assemble(outDir, outDir); console.log('wrote', path.join(outDir, 'tour.json')); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
