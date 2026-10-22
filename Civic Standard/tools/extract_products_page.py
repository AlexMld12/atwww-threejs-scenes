"""The products page (Figma: Products.pdf): the grid's cards and the category cards → JSON, and the renders → WebP.

python tools/extract_products_page.py <catalog dir>
Each image in the PDF is one of the catalogue's 2400 px renders: matched by its pixels, so the cards name products by
their catalogue id. Writes web/src/components/products/grid.json and web/public/products/<id>.webp.
"""
import io
import json
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

catalog = Path(sys.argv[1])
out_images = Path('web/public/products')
out_images.mkdir(parents=True, exist_ok=True)
SIZE = 1100  # the largest card shows a render ~600 px wide: sharp on 2× screens
CELL = 32

page = pymupdf.open('docs/reference/Products.pdf')
pdf = page[0]


def thumb(image):
    return np.asarray(image.convert('RGBA').resize((CELL, CELL), Image.BILINEAR), dtype=np.float32)


renders = {p.stem.removeprefix('UF09_01_PACK_'): p for p in (catalog / 'images').glob('*.png')}
thumbs = {pid: thumb(Image.open(path)) for pid, path in renders.items()}

by_xref = {}
for xref in {info['xref'] for info in pdf.get_image_info(xrefs=True)}:
    pix = pymupdf.Pixmap(page, xref)
    if pix.width != 2400:
        continue
    smask = page.xref_get_key(xref, 'SMask')
    image = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
    if smask[0] == 'xref':
        alpha = pymupdf.Pixmap(page, int(smask[1].split()[0]))
        image.putalpha(Image.frombytes('L', (alpha.width, alpha.height), alpha.samples))
    t = thumb(image)
    by_xref[xref] = min(thumbs, key=lambda pid: float(np.abs(thumbs[pid] - t).mean()))

for pid in sorted(set(by_xref.values())):
    image = Image.open(renders[pid]).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)
    image.save(out_images / f'{pid}.webp', quality=88, method=6)


def texts_in(rect):
    found = []
    for block in pdf.get_text('dict', clip=rect)['blocks']:
        for line in block.get('lines', []):
            span = line['spans'][0]
            found.append((round(span['size'], 1), ''.join(s['text'] for s in line['spans']).strip(), line['bbox']))
    return found


GRID_TOP = 858.2
COL = [30, 381, 732, 1083]
STEP_Y = 372
cards = []
for drawing in pdf.get_drawings():
    r = drawing['rect']
    fill = drawing.get('fill')
    if not fill or r.y0 < GRID_TOP - 1 or r.y0 > 3500 or r.width < 300 or r.height < 300:
        continue
    colour = '#' + ''.join(f'{round(c * 255):02x}' for c in fill)
    if colour not in ('#e7e5df', '#3a3735'):
        continue
    col = min(range(4), key=lambda i: abs(COL[i] - r.x0))
    row = round((r.y0 - GRID_TOP) / STEP_Y)
    span = (round((r.width + 24) / 351), round((r.height + 24) / STEP_Y))
    if any(c['col'] == col and c['row'] == row for c in cards):
        continue
    items = texts_in(r)
    images = [
        (by_xref.get(info['xref']), info['bbox'])
        for info in pdf.get_image_info(xrefs=True)
        if info['xref'] in by_xref
        and r.contains(pymupdf.Point((info['bbox'][0] + info['bbox'][2]) / 2, (info['bbox'][1] + info['bbox'][3]) / 2))
    ]
    card = {'col': col, 'row': row, 'w': span[0], 'h': span[1]}
    for size, text, _ in items:
        if size == 16:
            card['name'] = text
        elif size == 10:
            card['tag'] = text
        elif size == 12:
            card['finish'] = text
        elif size == 11:
            card['measure'] = text
    if colour == '#3a3735':
        card['catalogue'] = True
    if images:
        pid, (x0, y0, x1, y1) = images[0]
        card['id'] = pid
        # the render's square, in % of the card (Figma places each one by hand)
        card['image'] = [
            round((x0 - r.x0) / r.width * 100, 2),
            round((y0 - r.y0) / r.height * 100, 2),
            round((x1 - x0) / r.width * 100, 2),
        ]
    cards.append(card)

# Where Figma's file is off: two renders are alike enough to match each other (G2 / K5_1900, the same frame) and the
# bike rack carries the benches' tag.
OVERRIDES = {('Frame Bench with Backrest', '1900 MM'): {'id': 'K5_1900'}, ('Plaza Bike Rack', '4 BIKES'): {'tag': 'BIKE RACKS'}}
for card in cards:
    card.update(OVERRIDES.get((card.get('name'), card.get('measure')), {}))
for pid in {c['id'] for c in cards if 'id' in c} - set(by_xref.values()):
    Image.open(renders[pid]).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS).save(out_images / f'{pid}.webp', quality=88, method=6)

cards.sort(key=lambda c: (c['row'], c['col']))
categories = []
for x0 in (30, 178, 326, 474, 622, 770):
    rect = pymupdf.Rect(x0, 473.2, x0 + 140, 643.2)
    label = next(text for size, text, _ in texts_in(rect) if size == 12)
    image = next(
        (by_xref[info['xref']], info['bbox'])
        for info in pdf.get_image_info(xrefs=True)
        if info['xref'] in by_xref and rect.contains(pymupdf.Rect(info['bbox']))
    )
    pid, (ix0, iy0, ix1, _) = image
    categories.append({'name': label, 'id': pid, 'image': [round(ix0 - x0, 1), round(iy0 - 473.2, 1), round(ix1 - ix0, 1)]})

# the catalogue card's photo (678 px wide in Figma: 1600 covers 2× screens)
photo = next(i for i in pdf.get_image_info(xrefs=True) if i['width'] == 2880)['xref']
photo = Image.open(io.BytesIO(pymupdf.Pixmap(page, photo).tobytes('png'))).convert('RGB')
photo.resize((1600, round(photo.height * 1600 / photo.width)), Image.LANCZOS).save(out_images / 'catalogue.webp', quality=85)

Path('web/src/components/products/grid.json').write_text(
    json.dumps({'cards': cards, 'categories': categories}, indent=1, ensure_ascii=False) + '\n', encoding='utf8'
)
print(len(cards), 'cards', len(categories), 'categories', len(set(by_xref.values())), 'renders')
