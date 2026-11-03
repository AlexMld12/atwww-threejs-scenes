"""The product pictures that put themselves together → web/public/assembly:

  <id>.glb               tools/blender_configurator.py --assembly: the pieces, meshopt (gltf-transform, through npx)
  <id>-ao.webp           its AO atlas
  <id>-sky.webp, -sun.webp   tools/blender_gallery.py --views assembly: the empty plaza from the picture's camera,
                         as the gallery's plates (scene-linear over its scale, sRGB-encoded)
  assembly.json          each product's camera and the plates' scales

python tools/prepare_assembly.py <configurator out dir> <gallery out dir>
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

pieces, plates = Path(sys.argv[1]), Path(sys.argv[2])
out = Path(__file__).resolve().parent.parent / 'web' / 'public' / 'assembly'
out.mkdir(parents=True, exist_ok=True)
AO_PX = 1024


def encode(linear):
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


index = {}
for meta_path in sorted(plates.glob('*-gallery.json')):
    meta = json.loads(meta_path.read_text())
    pid = meta['id']
    view = meta['views']['assembly']
    view['scales'] = {}
    for light in ('sky', 'sun'):
        plate = cv2.imread(str(plates / f'{pid}-assembly-{light}.hdr'), cv2.IMREAD_ANYDEPTH | cv2.IMREAD_ANYCOLOR)[..., ::-1]
        scale = float(np.percentile(plate, 99.95)) * 1.05
        pixels = np.clip(encode(np.clip(plate / scale, 0, 1)) * 255 + 0.5, 0, 255).astype(np.uint8)
        Image.fromarray(pixels).save(out / f'{pid}-{light}.webp', quality=90, method=6)
        view['scales'][light] = round(scale, 5)
    view.pop('box', None)
    index[pid] = view

    subprocess.run(
        ['npx', '--yes', '@gltf-transform/cli@4.5.1', 'meshopt', str(pieces / f'{pid}-assembly.glb'), str(out / f'{pid}.glb')],
        check=True,
        shell=True,
    )
    ao = Image.open(pieces / f'{pid}-ao.png').convert('L')
    ao.resize((AO_PX, AO_PX), Image.LANCZOS).save(out / f'{pid}-ao.webp', quality=88)
    print(pid, (out / f'{pid}.glb').stat().st_size // 1024, 'KB', view['scales'])

(out / 'assembly.json').write_text(json.dumps(index, separators=(',', ':')))
