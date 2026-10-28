"""The colleague's project renders (3000 px squares, PNG) → web/public/projects, in three sizes.

python tools/prepare_projects.py <renders dir>   (C:\\ATWWW\\Civic Standard\\Renders)

tube/<slug>.webp   512 px: a panel of the tube (the hero and /projects; the panel crops it as CSS cover does)
<slug>-m.webp      1280 px: the project panel's picture, and the full screen on a phone
<slug>.webp        2400 px: the full screen behind an open project
The order and the texts are in web/src/components/projects/projects.json.
"""
import json
import sys
from pathlib import Path

from PIL import Image

src = Path(sys.argv[1])
dst = Path('web/public/projects')
(dst / 'tube').mkdir(parents=True, exist_ok=True)
projects = json.loads(Path('web/src/components/projects/projects.json').read_text(encoding='utf-8'))

SIZES = [('tube/{}.webp', 512, 80), ('{}-m.webp', 1280, 82), ('{}.webp', 2400, 82)]

for project in projects:
    image = Image.open(src / f"{project['render']}.png").convert('RGB')
    for pattern, size, quality in SIZES:
        image.resize((size, size), Image.LANCZOS).save(dst / pattern.format(project['slug']), quality=quality, method=6)
    print(project['slug'])
