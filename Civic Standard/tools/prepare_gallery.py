"""The gallery's renders (tools/blender_gallery.py) → web/public/gallery: each plate as WebP (scene-linear over its
scale, sRGB-encoded, as prepare_plaza.py), the distance as 16 bits in two bytes (red high, green low) in a lossless
WebP, at half the size and 12 bits (shrink_distance), and gallery.json: every product's cameras with the plates' scales.

python tools/prepare_gallery.py <blender out dir>
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / 'web' / 'public' / 'gallery'
out.mkdir(parents=True, exist_ok=True)
index_path = out / 'gallery.json'
index = json.loads(index_path.read_text()) if index_path.exists() else {}


def encode(linear):
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def decode(encoded):
    return np.where(encoded <= 0.04045, encoded / 12.92, np.power((encoded + 0.055) / 1.055, 2.4))


def shrink_distance(q):
    """The distance at half the size (every other pixel: nearest, never a blend of two depths) and to 12 bits (7 mm
    over the 30 m): the leaves' soft shadow needs no more, and the file is an eighth (the repo's size)."""
    return (q[::2, ::2] >> 4) << 4


for meta_path in sorted(src.glob('*-gallery.json')):
    meta = json.loads(meta_path.read_text())
    pid = meta['id']
    for name, view in meta['views'].items():
        base = f'{pid}-{name}'
        view['scales'] = {}
        for light in ('sky', 'sun'):
            plate = cv2.imread(str(src / f'{base}-{light}.hdr'), cv2.IMREAD_ANYDEPTH | cv2.IMREAD_ANYCOLOR)[..., ::-1]
            scale = float(np.percentile(plate, 99.95)) * 1.05
            pixels = np.clip(encode(np.clip(plate / scale, 0, 1)) * 255 + 0.5, 0, 255).astype(np.uint8)
            Image.fromarray(pixels).save(out / f'{base}-{light}.webp', quality=90, method=6)
            view['scales'][light] = round(scale, 5)
        # Blender wrote the distance through the Standard view: undo its sRGB curve, then split the 16 bits
        raw = cv2.imread(str(src / f'{base}-distance.png'), cv2.IMREAD_UNCHANGED)
        if raw.ndim == 3:
            raw = raw[..., 0]
        q = np.clip(np.rint(decode(raw.astype(np.float64) / 65535) * 65535), 0, 65535).astype(np.uint16)
        q = shrink_distance(q)
        packed = np.stack([q >> 8, q & 255, np.zeros_like(q)], axis=-1).astype(np.uint8)
        Image.fromarray(packed).save(out / f'{base}-distance.webp', lossless=True, method=6)
        print(base, view['scales'])
    # a run of some views adds to the product's others
    views = {**index.get(pid, {}).get('views', {}), **meta['views']}
    index[pid] = {'distanceMax': meta['distanceMax'], 'views': views}

index_path.write_text(json.dumps(index, separators=(',', ':')), newline='\n')
print('gallery.json', len(index))
