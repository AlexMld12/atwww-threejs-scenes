"""The gallery's stills: each live picture of a product's page (scene/plaza/gallery.ts), captured as the browser draws
it, → web/public/gallery/<id>-<view>-poster.webp. They sit under the live pictures until their plates are in.

Needs the dev server (npm run dev, port 5175) and Chrome. python tools/capture_gallery_posters.py [ids…]
"""
import base64
import io
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'web' / 'public' / 'gallery'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
SITE = 'http://127.0.0.1:5175'
PORT = 9333
# 1720 wide, where the clamp rule stops growing
WIDTH, HEIGHT = 1720, 1100

catalogue = json.loads((ROOT / 'web' / 'src' / 'components' / 'product' / 'catalogue.json').read_text())
wanted = set(sys.argv[1:])
products = [p for p in catalogue if not wanted or p['id'] in wanted]

profile = tempfile.mkdtemp(prefix='cs-posters-')
chrome = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={profile}',
                           f'--window-size={WIDTH},{HEIGHT}', '--hide-scrollbars', 'about:blank'])
try:
    for _ in range(50):
        try:
            tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
            break
        except OSError:
            time.sleep(0.2)
    tab = next(t for t in tabs if t['type'] == 'page')
    ws = websocket.create_connection(tab['webSocketDebuggerUrl'], suppress_origin=True, timeout=120)
    ids = iter(range(1, 1 << 30))

    def call(method, **params):
        i = next(ids)
        ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            reply = json.loads(ws.recv())
            if reply.get('id') == i:
                return reply.get('result', {})

    def js(expression):
        result = call('Runtime.evaluate', expression=expression, awaitPromise=True, returnByValue=True)
        return result.get('result', {}).get('value')

    call('Emulation.setDeviceMetricsOverride', width=WIDTH, height=HEIGHT, deviceScaleFactor=1, mobile=False)
    for product in products:
        call('Page.navigate', url=f"{SITE}/products/{product['slug']}")
        time.sleep(3)
        shots = []
        # each picture brought on screen in turn (a picture is drawn only while it is seen)
        for view in json.loads(js("JSON.stringify([...document.querySelectorAll('.picture')].map(f => f.dataset.view))")):
            figure = f"document.querySelector('.picture[data-view={view}]')"
            js(f"window.scrollTo(0, {figure}.getBoundingClientRect().top + scrollY - 100)")
            for _ in range(80):
                time.sleep(0.25)
                if js(f"{figure}.querySelector('.picture__mask').classList.contains('is-ready')"):
                    break
            else:
                print(product['id'], view, 'not ready, skipped')
                continue
            time.sleep(1.5)  # a few frames drawn, the leaves moving
            shots.append((view, js(f"{figure}.querySelector('canvas').toDataURL('image/png')")))
        for view, url in shots:
            image = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
            image.save(OUT / f"{product['id']}-{view}-poster.webp", quality=72, method=6)
        print(product['id'], 'ok')
finally:
    chrome.kill()
