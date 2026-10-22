"""The line drawings (tools/blender_profiles.py) → web/public/profiles, the lines in alpha over one colour:
- SPECIFICATIONS: Figma's line colour (#0E1F14, the page shows it at 20 %), at 1 px per mm (≥ 2× the page's largest
  scale); components/product/profiles.json: each drawing's size in mm and its margin, for the page's layout.
- with --plan, the configurator's technical drawing (#12100A, shown at 50 %), its three views at 0.5 px per mm (≥ 2×
  its scale); components/configurator/plans.json: each product's length, depth and height in mm and the margin.

python tools/prepare_profiles.py <blender out dir> [--plan]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src = Path(sys.argv[1])
PLAN = '--plan' in sys.argv
web = Path(__file__).resolve().parent.parent / 'web'
out = web / 'public' / 'profiles'
out.mkdir(parents=True, exist_ok=True)
index = {}


def save(name, colour, shrink, target):
    image = Image.open(src / f'{name}.png')
    alpha = image.getchannel('A').resize((image.width // shrink, image.height // shrink), Image.LANCZOS)
    pixels = np.zeros((alpha.height, alpha.width, 4), np.uint8)
    pixels[..., :3] = colour
    pixels[..., 3] = np.asarray(alpha)
    Image.fromarray(pixels).save(out / f'{target}.webp', lossless=True, method=6)
    return alpha.size


if PLAN:
    for meta_path in sorted(src.glob('*-plan.json')):
        meta = json.loads(meta_path.read_text())
        pid = meta['id']
        for view in ('top', 'front', 'side'):
            save(f'{pid}-plan-{view}', (0x12, 0x10, 0x0A), 4, f'{pid}-plan-{view}')
        index[pid] = {'mm': meta['mm'], 'margin': meta['margin']}
        print(pid, 'plan')
    (web / 'src' / 'components' / 'configurator' / 'plans.json').write_text(json.dumps(index, indent=1), newline='\n')
else:
    for meta_path in sorted(src.glob('*-profile.json')):
        meta = json.loads(meta_path.read_text())
        pid = meta['id']
        print(pid, save(f'{pid}-profile', (0x0E, 0x1F, 0x14), 2, pid))
        index[pid] = {'mm': meta['mm'], 'margin': meta['margin']}
    (web / 'src' / 'components' / 'product' / 'profiles.json').write_text(json.dumps(index, indent=1), newline='\n')
