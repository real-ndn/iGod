# God's Eye

A live 3D Earth that runs in the browser. It goes from orbit to street level on real satellite imagery and 3D terrain, lit by the real sun. Live layers add satellites, flights, earthquakes and wildfires. A voice guide named Milo can fly the globe for you.

**Open it:** **https://real-ndn.github.io/iGod/**

On iPad or iPhone, open the link in Safari and tap Share, then **Add to Home Screen**. It then opens full screen like an app.

## What it does

- **Earth:**
  - Esri satellite imagery, sharp down to street level.
  - Free worldwide 3D terrain.
  - NASA's daily satellite picture for any date since 2000.
  - Earth at night.
  - Optional Google photoreal 3D cities, lit by the real sun.
- **Time machine:** every archived high-resolution picture of a spot since 2014, with a swipe divider for then and now.
- **The real sun:**
  - Day and night, the atmosphere, city lights, terrain shadows and golden hour all follow the actual sun.
  - A 48-hour sun strip lets you scrub time for wherever you look.
- **Live Earth:**
  - Satellites with ride-along orbits.
  - Flights with a chase camera.
  - USGS earthquakes.
  - NASA wildfire hotspots.
  - NASA natural events: volcanoes, storms and ice.
- **Map:** crisp labels that stay upright when you tilt (cities, countries, states, peaks, seas, ranges) and sharp borders, all from Natural Earth.
- **Camera:** search anywhere, cinematic tour, orbit, dive, road flyover routes, measuring, and street-level photos (Mapillary).
- **Draw on Earth:** on iPad, Apple Pencil draws glowing strokes on the terrain while your fingers keep moving the map.
- **Vision modes:** night vision, thermal, noir and cinema.
- **Milo:** tap the orb to talk, hold it to type. Add an Anthropic key and Claude drives the globe with tools.
- **Modes:** User mode for the full map, Creative mode for a clean, cinematic HUD.

## Optional keys

Add these in **Settings**. They're saved only in your browser.

| Key | Unlocks |
| --- | --- |
| Cesium ion token (free) | Photoreal 3D cities, world terrain with animated water, 3D buildings |
| Google Maps API key | Google Photorealistic 3D Tiles directly |
| Anthropic API key | Milo thinks with Claude |
| NASA FIRMS map key (free) | Wildfire hotspots straight from NASA |
| Mapillary client token (free) | Street-level photos |

## Live data pipeline

`.github/workflows/pages.yml` publishes the site on every push to `main`, and again every hour. Each run, `scripts/refresh_data.py` saves fresh satellite orbits (from CelesTrak, at most every 6 hours) and wildfire hotspots (NASA FIRMS) into `site/data/`. The workflow then pushes the finished site to the `gh-pages` branch, which GitHub Pages serves. The app reads those files from its own address, which avoids browser cross-origin blocks on those services.

Nothing needs setting up. If you ever switch Settings → Pages → Source to **GitHub Actions**, the same workflow deploys that way instead.

**Optional:** for wildfires, go to Settings → Secrets and variables → Actions and add a secret named `FIRMS_MAP_KEY` holding your FIRMS map key.

## Build

```sh
python3 build.py          # writes site/index.html and dist/gods-eye-earth.html
```

The sources are in `src/`:

- `head.html` and `body.html`: the page.
- `js/`: one file per area (globe, live layers, labels, history, draw, street, camera, ui, panels, milo).
- `data/`: Natural Earth labels and borders, built by `tools/build_data.py`.
- `static/`: the manifest, service worker and icons.

`dist/gods-eye-earth.html` is a single self-contained file that also works opened straight from disk.

## Credits

- **Engine:** CesiumJS (Apache-2.0).
- **Imagery:** Esri World Imagery and World Imagery Wayback; NASA GIBS (VIIRS, MODIS, Black Marble).
- **Terrain:** Mapzen Terrarium on AWS Open Data.
- **Labels and borders:** Natural Earth (public domain).
- **Orbits:** CelesTrak and satellite.js (MIT).
- **Live feeds:** USGS earthquakes, NASA EONET and FIRMS, adsb.lol flights.
- **Search and routes:** Photon and OSRM (© OpenStreetMap contributors).
- **Street level:** Mapillary.
- **Photoreal 3D:** Google Map Tiles API.
