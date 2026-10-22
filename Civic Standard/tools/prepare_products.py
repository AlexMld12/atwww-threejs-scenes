"""The catalogue renders (2400 px, transparent, product + shadow) → web/public/range, cropped to what they show.

python tools/prepare_products.py <catalog dir>   (the colleague's DEVELOPER_STUDIO_…/catalog)
"""
import sys
from pathlib import Path

from PIL import Image


src = Path(sys.argv[1]) / 'images'
dst = Path('web/public/range')
dst.mkdir(parents=True, exist_ok=True)

# FROM THE RANGE, in the slider's order (web/src/components/range/content.ts has their texts)
RANGE = ['K7_armrests', 'K5_1900', 'K6_1900', 'K4_1900', 'G2_std', 'G6_std', 'G8_std', 'G7_std', 'G3_std', 'K7_noArmrests']
MAX_WIDTH = 960  # the product spans 86 % of the 465 px card: sharp on 2× screens up to ~1720 px wide
ALPHA_FLOOR = 4  # the shadow fades out for a long way: taken off every pixel, so it reaches 0 before the crop's edge

for product_id in RANGE:
    image = Image.open(src / f'UF09_01_PACK_{product_id}.png').convert('RGBA')
    image.putalpha(image.getchannel('A').point(lambda a: max(0, a - ALPHA_FLOOR)))
    image = image.crop(image.getchannel('A').getbbox())
    if image.width > MAX_WIDTH:
        image = image.resize((MAX_WIDTH, round(image.height * MAX_WIDTH / image.width)), Image.LANCZOS)
    image.save(dst / f'{product_id}.webp', quality=90, method=4, exact=True)
    print(product_id, image.size)
