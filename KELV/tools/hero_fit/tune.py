"""Hero look fitting harness: compares the live 3D canvas with the Figma products render."""
import base64, io, json, os, shutil, subprocess, sys, time, urllib.request
import numpy as np
import websocket
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
PORT = 9334
URL = 'http://127.0.0.1:5174/'
PLACEHOLDER = r'C:\ATWWW\ATWWW Three.js scenes\KELV\web\public\images\products-placeholder.webp'
PATCH = 16
# product axes in page px (top end, bottom end, radius)
AXES = {
    'serum': ((400, 140), (540, 760), 130),
    'foam': ((810, 410), (600, 1080), 150),
    'cream': ((1090, 640), (800, 1030), 160),
}
# the clear cap, compared after compositing whatever its alpha (canvas px)
CAP = ((850, 330), (730, 560), 115)


class Page:
    def __init__(self, width=1440, height=1450):
        profile = os.path.join(HERE, 'chrome-tune')
        shutil.rmtree(profile, ignore_errors=True)
        self.proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', '--hide-scrollbars',
                                      f'--window-size={width},{height}', f'--user-data-dir={profile}', '--no-first-run',
                                      '--remote-allow-origins=*', 'about:blank'])
        for _ in range(200):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
                pages = [t for t in tabs if t['type'] == 'page']
                if pages: break
            except Exception:
                pass
            time.sleep(0.2)
        self.ws = websocket.create_connection(pages[0]['webSocketDebuggerUrl'], timeout=120)
        self.mid = 0
        self.cdp('Page.enable'); self.cdp('Runtime.enable')
        self.cdp('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=False)
        self.cdp('Page.navigate', url=URL + f'?_cb={int(time.time() * 1000)}')
        time.sleep(1)
        self.js("new Promise(r => { const t = () => window.__kelvHero ? r() : setTimeout(t, 100); t(); })")
        time.sleep(6)

    def cdp(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({'id': self.mid, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.mid:
                if 'error' in msg: raise RuntimeError(msg['error'])
                return msg.get('result', {})

    def js(self, expr):
        r = self.cdp('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r: raise RuntimeError(r['exceptionDetails'])
        return r.get('result', {}).get('value')

    def screenshot(self):
        return Image.open(io.BytesIO(base64.b64decode(self.cdp('Page.captureScreenshot', format='png')['data']))).convert('RGB')

    def box(self):
        return self.js("(() => { const r = document.querySelector('.hero-canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")

    def look(self, patch):
        self.js(f"""(() => {{ const look = window.__kelvHero_look || (window.__kelvHero_look = null);
            const deep = (t, p) => {{ for (const k in p) {{ if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) deep(t[k], p[k]); else t[k] = p[k]; }} }};
            deep(window.__LOOK, {json.dumps(patch)}); window.__kelvHero.applyLook(); }})()""")

    def canvas(self):
        url = self.js("(() => { window.__kelvHero.render(); return document.querySelector('.hero-canvas').toDataURL('image/png'); })()")
        return Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGBA')

    def close(self):
        self.ws.close(); self.proc.kill()


def composite(rgba, bg):
    a = np.asarray(rgba).astype(float) / 255
    b = np.asarray(bg).astype(float) / 255
    return a[..., :3] * a[..., 3:] + b * (1 - a[..., 3:]), a[..., 3]


def reference(size):
    im = Image.open(PLACEHOLDER).convert('RGBA')
    arr = np.asarray(im).astype(float) / 255
    pre = np.dstack([arr[..., :3] * arr[..., 3:], arr[..., 3]])
    pim = Image.fromarray((pre * 255).round().astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)
    p = np.asarray(pim).astype(float) / 255
    a = p[..., 3:]
    rgb = np.where(a > 1e-3, p[..., :3] / np.maximum(a, 1e-3), 0)
    return Image.fromarray((np.dstack([np.clip(rgb, 0, 1), a]) * 255).round().astype(np.uint8), 'RGBA')


def patch_labels(shape, origin):
    h, w = shape
    ys, xs = np.mgrid[0:h // PATCH, 0:w // PATCH]
    px = origin[0] + xs * PATCH + PATCH / 2
    py = origin[1] + ys * PATCH + PATCH / 2
    labels = np.full(xs.shape, '', dtype=object)
    best = np.full(xs.shape, np.inf)
    for name, ((x0, y0), (x1, y1), r) in AXES.items():
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.hypot(px - (x0 + t * dx), py - (y0 + t * dy))
        take = (d < r) & (d < best)
        labels[take] = name; best[take] = d[take]
    return labels


def patch_means(img, alpha):
    h, w = alpha.shape
    H, W = h // PATCH, w // PATCH
    c = img[:H * PATCH, :W * PATCH].reshape(H, PATCH, W, PATCH, 3).mean(axis=(1, 3))
    a = alpha[:H * PATCH, :W * PATCH].reshape(H, PATCH, W, PATCH).min(axis=(1, 3))
    return c, a


class Fitter:
    def __init__(self, page):
        self.page = page
        x, y, w, h = page.box()
        self.origin = (round(x), round(y))
        self.size = (round(w), round(h))
        page.js("document.querySelector('.hero-canvas').style.visibility = 'hidden'; document.querySelector('.hero__placeholder').style.visibility = 'hidden'")
        time.sleep(0.5)
        shot = page.screenshot()
        page.js("document.querySelector('.hero-canvas').style.visibility = ''")
        self.bg = shot.crop((self.origin[0], self.origin[1], self.origin[0] + self.size[0], self.origin[1] + self.size[1]))
        if self.bg.size != self.size:
            pad = Image.new('RGB', self.size, self.bg.getpixel((self.bg.width - 1, self.bg.height - 1)))
            pad.paste(self.bg, (0, 0)); self.bg = pad
        self.ref_img, ref_a = composite(reference(self.size), self.bg)
        self.ref_c, self.ref_pa = patch_means(self.ref_img, ref_a)
        self.labels = patch_labels((self.size[1], self.size[0]), self.origin)
        H, W = self.labels.shape
        ys, xs = np.mgrid[0:H, 0:W]
        px, py = xs * PATCH + PATCH / 2, ys * PATCH + PATCH / 2
        (x0, y0), (x1, y1), r = CAP
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy), 0, 1)
        self.cap = np.hypot(px - (x0 + t * dx), py - (y0 + t * dy)) < r
        self.labels[self.cap] = ''
        ref_alpha = np.asarray(reference(self.size))[..., 3].astype(float) / 255
        h2, w2 = (ref_alpha.shape[0] // PATCH) * PATCH, (ref_alpha.shape[1] // PATCH) * PATCH
        self.ref_pa_max = ref_alpha[:h2, :w2].reshape(h2 // PATCH, PATCH, w2 // PATCH, PATCH).max(axis=(1, 3))
        near = self.ref_pa_max > 0.02
        grown = near.copy()
        for _ in range(5):
            g = grown.copy()
            g[1:] |= grown[:-1]; g[:-1] |= grown[1:]; g[:, 1:] |= grown[:, :-1]; g[:, :-1] |= grown[:, 1:]
            grown = g
        self.halo = grown & ~near

    def measure(self, save=None):
        cimg = self.page.canvas()
        if cimg.size != self.size: cimg = cimg.resize(self.size)
        ours, a = composite(cimg, self.bg)
        if save:
            Image.fromarray((ours * 255).round().astype(np.uint8)).save(save)
        c, pa = patch_means(ours, a)
        mask = (pa > 0.98) & (self.ref_pa > 0.98)
        err = np.abs(c - self.ref_c).mean(axis=2) * 255
        sig = (c - self.ref_c).mean(axis=2) * 255
        out = {}
        for name in AXES:
            m = mask & (self.labels == name)
            out[name] = (round(float(err[m].mean()), 2), round(float(sig[m].mean()), 2), int(m.sum()))
        halo = self.halo & (self.ref_pa_max < 0.02)
        out['halo'] = (round(float(err[halo].mean()), 2), round(float(sig[halo].mean()), 2), int(halo.sum()))
        cm = self.cap & ((pa > 0.05) | (self.ref_pa > 0.05))
        out['cap'] = (round(float(err[cm].mean()), 2), round(float(sig[cm].mean()), 2), int(cm.sum()))
        allm = mask & (self.labels != '')
        out['total'] = round(float(err[allm].mean()), 3)
        return out


if __name__ == '__main__':
    page = Page()
    try:
        f = Fitter(page)
        print(f.measure(save=os.path.join(HERE, 'tune_ours.png')))
        Image.fromarray((f.ref_img * 255).round().astype(np.uint8)).save(os.path.join(HERE, 'tune_ref.png'))
    finally:
        page.close()
