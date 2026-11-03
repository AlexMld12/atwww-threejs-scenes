"""The assembly pictures' stills (scene/plaza/assembly.ts): the plaza empty, as the loop starts, captured as the
browser draws it → web/public/assembly/<id>-poster.webp. They sit under the live picture until it is ready.

Needs the dev server (npm run dev, port 5175) and Chrome. python tools/capture_assembly_posters.py
"""
import base64
import io
import json
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'web' / 'public' / 'assembly'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
SITE = 'http://127.0.0.1:5175'
PORT = 9333
# 1720 wide, where the clamp rule stops growing
WIDTH, HEIGHT = 1720, 1100

catalogue = {p['id']: p for p in json.loads((ROOT / 'web' / 'src' / 'components' / 'product' / 'catalogue.json').read_text())}
products = [catalogue[i] for i in json.loads((OUT / 'assembly.json').read_text())]

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
        figure = "document.querySelector('.picture[data-view=wide]')"
        # ready off screen (it loads once the hero is in), its clock still at nought
        for _ in range(120):
            time.sleep(0.25)
            if js(f"!!{figure}?.querySelector('.picture__mask.is-ready')"):
                break
        else:
            print(product['id'], 'not ready, skipped')
            continue
        js(f"window.scrollTo(0, {figure}.getBoundingClientRect().top + scrollY - 100)")
        time.sleep(0.3)  # on screen: a few frames of the empty plaza, before the first piece comes
        # read in the frame after three's own draw (the drawing buffer is not kept)
        url = js(f"new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({figure}.querySelector('canvas').toDataURL('image/png')))))")
        image = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
        image.save(OUT / f"{product['id']}-poster.webp", quality=72, method=6)
        print(product['id'], 'ok', image.size)
finally:
    chrome.kill()
