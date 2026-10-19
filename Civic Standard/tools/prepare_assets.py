"""Turns the Blender exports (tools/blender_export.py, tools/blender_backdrop.py) into web/public/hero.

python tools/prepare_assets.py <export dir> <backdrop dir>
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, backdrop = Path(sys.argv[1]), Path(sys.argv[2])
dst = Path('web/public/hero')
(dst / 'paintings').mkdir(parents=True, exist_ok=True)

PAINTING_MAX_HEIGHT = 1024


def srgb_decode(v):
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


shutil.copy(src / 'logo.glb', dst / 'logo.glb')
shutil.copy(src / 'studio.hdr', dst / 'studio.hdr')

for slot in range(1, 8):
    image = Image.open(src / f'painting-{slot}.png').convert('RGB')
    if image.height > PAINTING_MAX_HEIGHT:
        image = image.resize((round(image.width * PAINTING_MAX_HEIGHT / image.height), PAINTING_MAX_HEIGHT), Image.LANCZOS)
    image.save(dst / 'paintings' / f'{slot}.webp', quality=86, method=6)

# three.js encodes to sRGB after tone mapping, so the curve hands back linear light.
linear, display = np.load(src / 'view-curve.npy')
curve = {
    'log2Min': float(np.log2(linear[0])),
    'log2Max': float(np.log2(linear[-1])),
    'values': [round(float(v), 6) for v in srgb_decode(display)],
}
(dst / 'view-curve.json').write_text(json.dumps(curve))

# The wall's two layers: its light and the leaves' shadow (the shadow spans 0.8…1, so its errors shrink 5 ×).
Image.open(backdrop / 'backdrop-light.png').convert('RGB').save(dst / 'backdrop-light.webp', quality=90, method=6)
Image.open(backdrop / 'backdrop-leaves.png').convert('L').save(dst / 'backdrop-leaves.webp', quality=92, method=6)
