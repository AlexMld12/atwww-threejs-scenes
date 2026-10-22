"""tools/blender_configurator.py (+ _env.py) + blender_view_lut.py → web/public/configurator (the configurator's assets).

python tools/prepare_configurator.py <blender out dir> <view-lut.png> <catalog dir>
GLBs: meshopt + quantisation (gltf-transform, through npx). Textures: WebP. products.json: the scenes' cameras, lights,
bounds and shadows, with the catalogue's dimensions and capacities.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, lut, catalog = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
dst = Path('web/public/configurator')
dst.mkdir(parents=True, exist_ok=True)

AO_PX = 1024
SHADOW_ALPHA_FLOOR = 2  # 8-bit: the long soft tail stops at 0 before the square's edge

products = {p['id']: p for p in json.loads((catalog / 'produse_shop.json').read_text(encoding='utf8'))['products']}
# an export of a few products adds them to the ones already there
out = json.loads((dst / 'products.json').read_text()) if (dst / 'products.json').exists() else {}
for meta_path in sorted(src.glob('*.json')):
    meta = json.loads(meta_path.read_text())
    pid = meta['id']
    subprocess.run(
        ['npx', '--yes', '@gltf-transform/cli@4.5.1', 'meshopt', str(src / f'{pid}.glb'), str(dst / f'{pid}.glb')],
        check=True,
        shell=True,
    )
    ao = Image.open(src / f'{pid}-ao.png').convert('L')
    ao.resize((AO_PX, AO_PX), Image.LANCZOS).save(dst / f'{pid}-ao.webp', quality=88)

    shadow = np.asarray(Image.open(src / f'{pid}-shadow.png')).astype(np.float32)
    alpha = shadow[..., 3] / (65535 if shadow[..., 3].max() > 255 else 255) * 255
    alpha = np.clip(alpha - SHADOW_ALPHA_FLOOR, 0, 255).astype(np.uint8)
    Image.fromarray(alpha).convert('RGB').save(dst / f'{pid}-shadow.webp', quality=90)

    shutil.copy(src / f'{pid}-env.hdr', dst / f'{pid}-env.hdr')

    product = products[pid]
    meta['dimensionsMm'] = product['dimensions_mm']
    meta['feature'] = product['feature']
    out[pid] = meta
    print(pid, (dst / f'{pid}.glb').stat().st_size // 1024, 'KB')

for name in ('plastic', 'zinc'):
    for kind in ('colour', 'roughness'):
        Image.open(src / f'finish-{name}-{kind}.png').convert('RGB').save(dst / f'finish-{name}-{kind}.webp', quality=92)
shutil.copy(lut, dst / 'view-lut.png')
(dst / 'products.json').write_text(json.dumps(out, separators=(',', ':')))
print('products.json', len(out))
