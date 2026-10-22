"""The plaza's plates (tools/blender_plaza.py) → web/public/plaza: each light's plate as WebP, scene-linear divided by its
own scale and sRGB-encoded (the 8 bits go where the eye needs them); the environment as it is; plaza.json with scales.

python tools/prepare_plaza.py <blender out dir>
"""
import json
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / 'web' / 'public' / 'plaza'
out.mkdir(parents=True, exist_ok=True)
meta = json.loads((src / 'plaza.json').read_text())


def encode(linear):
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


meta['scales'] = {}
for light in ('sky', 'sun'):
    plate = cv2.imread(str(src / f'plaza-{light}.hdr'), cv2.IMREAD_ANYDEPTH | cv2.IMREAD_ANYCOLOR)[..., ::-1]
    scale = float(np.percentile(plate, 99.95)) * 1.05
    pixels = np.clip(encode(np.clip(plate / scale, 0, 1)) * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(pixels).save(out / f'{light}.webp', quality=90, method=6)
    meta['scales'][light] = round(scale, 5)
    print(light, plate.shape, scale)

shutil.copy(src / 'plaza-env.hdr', out / 'env.hdr')
(out / 'plaza.json').write_text(json.dumps(meta, indent=1), newline='\n')
