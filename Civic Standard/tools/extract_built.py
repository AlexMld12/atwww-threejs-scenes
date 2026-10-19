"""The photos of BUILT OUTSIDE (Figma: Civic Standard.pdf) → web/public/built/<n>.webp.

python tools/extract_built.py

1 is the hero's bench (same file as web/public/hero/bench.webp), 2 the planters, 3 the bins.
"""
import io
from pathlib import Path

import pymupdf
from PIL import Image

PHOTOS = {1: 60, 2: 40, 3: 52}

document = pymupdf.open('docs/reference/Civic Standard.pdf')
out = Path('web/public/built')
out.mkdir(parents=True, exist_ok=True)
for number, xref in PHOTOS.items():
    image = Image.open(io.BytesIO(pymupdf.Pixmap(document, xref).tobytes('png'))).convert('RGB')
    # Shown full screen: kept close to the source.
    image.save(out / f'{number}.webp', quality=95, method=6)
    print(number, image.size)
