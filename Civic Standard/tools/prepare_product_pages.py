"""The product pages' data from the colleague's catalogue (produse_shop.json) → web/src/components/product/catalogue.json:
name, category, the page's address, the dimensions and the model's other sizes (the hero's Configuration); the
range it belongs to, its painted part and its documented feature (SPECIFICATIONS).

python tools/prepare_product_pages.py
"""
import json
import re
from collections import Counter
from pathlib import Path

CATALOGUE = Path(r'C:\ATWWW\Civic Standard\DEVELOPER_STUDIO_2026-10-20\DEVELOPER_STUDIO_2026-10-20\catalog\produse_shop.json')
out = Path(__file__).resolve().parent.parent / 'web' / 'src' / 'components' / 'product' / 'catalogue.json'
out.parent.mkdir(parents=True, exist_ok=True)

products = json.loads(CATALOGUE.read_text(encoding='utf-8'))['products']
names = Counter(p['name'] for p in products)
kebab = lambda text: re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')

pages = []
for p in products:
    # a name shared by two sizes of a model (K1, K3, K4…) gets the size in its address
    slug = kebab(p['name']) if names[p['name']] == 1 else f"{kebab(p['name'])}-{kebab(p['variant_id'])}"
    sizes = []
    for size in p['sizes_for_this_model']:
        dims = size['dimensions_mm']
        sizes.append({'id': f"{p['model_id']}_{size['variant']}", 'dimensions': dims, 'label': size['label']})
    pages.append({
        'id': p['id'],
        'slug': slug,
        'name': p['name'],
        'category': p['category'],
        'dimensions': p['dimensions_mm'],
        'finish': p['current_finish']['name'],
        'components': p['fixed_components'],
        'collection': p['collection'],
        'paintedPart': p['painted_part'],
        'feature': p['feature'],
        'sizes': sizes,
    })

out.write_text(json.dumps(pages, indent=1, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
print(len(pages), [p['slug'] for p in pages])
