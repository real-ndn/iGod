// God's Eye flight relay: a Cloudflare Worker (free plan) that lets your God's Eye page read live
// ADS-B air traffic. The public feeds answer servers, but they send no CORS header, so a web page
// can't read them directly. This relay only forwards "aircraft near a point" queries, and only for
// your own site. Setup steps: README.md, "Live flights".

const SITES = ['https://real-ndn.github.io']; // pages allowed to use this relay

const FEEDS = [
  (lat, lon, r) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${r}`,
  (lat, lon, r) => `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${r}`,
];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': SITES.includes(origin) ? origin : SITES[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // other websites can't borrow it (opening the address yourself, with no Origin, still works for testing)
    if (origin && !SITES.includes(origin)) return new Response('Not allowed', { status: 403, headers: cors });

    const m = new URL(request.url).pathname.match(/^\/v2\/point\/(-?\d{1,2}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)\/(\d{1,3})$/);
    if (request.method !== 'GET' || !m) {
      return new Response('God\'s Eye flight relay is running. Ask for /v2/point/{lat}/{lon}/{radius in nm}.', { status: 404, headers: cors });
    }
    const lat = (+m[1]).toFixed(2), lon = (+m[2]).toFixed(2), r = Math.min(250, Math.max(1, +m[3]));

    // everyone looking at the same spot within 5 seconds shares one call to the feed
    const cache = caches.default, key = new Request(`https://ge-relay.cache/${lat}/${lon}/${r}`);
    let res = await cache.match(key);
    if (!res) {
      for (const feed of FEEDS) {
        try {
          const up = await fetch(feed(lat, lon, r), { headers: { 'User-Agent': 'GodsEye-relay/1.0 (+https://github.com/real-ndn/iGod)', Accept: 'application/json' } });
          if (!up.ok) continue;
          res = new Response(await up.text(), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=5' } });
          ctx.waitUntil(cache.put(key, res.clone()));
          break;
        } catch {}
      }
    }
    if (!res) return new Response(JSON.stringify({ ac: [], msg: 'No flight feed answered' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });

    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
