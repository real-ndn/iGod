#!/usr/bin/env python3
"""Bundle God's Eye.

  dist/gods-eye-earth.html   one self-contained file (open it anywhere)
  site/                      the GitHub Pages site: index.html + manifest + service worker + icons
"""
import json, pathlib, shutil
root = pathlib.Path(__file__).resolve().parent
src = root / 'src'
order = ['core', 'globe', 'live', 'labels', 'history', 'draw', 'street', 'camera', 'ui', 'panels', 'milo', 'main']
js = '\n'.join((src / 'js' / f'{n}.js').read_text() for n in order)
data = {'labels': json.loads((src / 'data' / 'labels.json').read_text()), 'borders': json.loads((src / 'data' / 'borders.json').read_text())}
HOSTED = 'https://real-ndn.github.io/iGod/'
# If the 3D engine is blocked (for example inside an app's file preview), say so instead of freezing on the splash.
GUARD = """if (!window.Cesium) {
  var msg = document.getElementById('bootMsg'), bar = document.querySelector('#boot .bar');
  if (bar) bar.remove();
  if (msg) { msg.style.cssText = 'max-width:320px;text-align:center;line-height:1.6;text-transform:none;letter-spacing:.02em;font-size:13px';
    msg.innerHTML = 'This viewer blocked the 3D engine, so God\\'s Eye cannot start here.<br>Open it in Safari or Chrome:<br><a style="color:#f5b862" href="HOSTED" target="_blank" rel="noopener">HOSTED</a>'; }
  return;
}
""".replace('HOSTED', HOSTED)
blob = json.dumps(data, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
html = ((src / 'head.html').read_text() + (src / 'body.html').read_text()
        + '<script type="application/json" id="geData">' + blob + '</script>\n'
        + '<script>\n(function () {\n"use strict";\n' + GUARD + js + '\n})();\n</script>\n</body>\n</html>\n')
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'gods-eye-earth.html').write_text(html)
site = root / 'site'
if site.exists():
    for p in site.iterdir():
        if p.name != 'data':
            shutil.rmtree(p) if p.is_dir() else p.unlink()
site.mkdir(exist_ok=True)
(site / 'index.html').write_text(html)
for p in (src / 'static').rglob('*'):
    if p.is_file():
        dst = site / p.relative_to(src / 'static'); dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, dst)
(site / '.nojekyll').write_text('')
print(f'dist/gods-eye-earth.html {len(html) / 1024:.0f} KB; site/ ready')
