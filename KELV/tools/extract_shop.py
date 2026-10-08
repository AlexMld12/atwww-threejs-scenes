r"""Shop pages: raster images taken from the Figma exports (dev only).

Exports live in docs/reference/shop/ (git-ignored; originals in C:\ATWWW\KELV\).
  · product-k1/k2/k3.webp — the packshots (2048², with alpha), cards + product page + cart
  · shop-scene.webp      — the REF_129 shelf render (product page, More Informations)
  · coming-soon.webp     — the blurred bottle of the "coming soon" cards
Alpha is kept via tobytes('png'): Pixmap.samples is premultiplied (see CLAUDE.md).
"""
import io
from pathlib import Path
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "docs/reference/shop"
OUT = ROOT / "web/public/images/shop"


def save(doc, xref, name, width=None, quality=90):
    pix = pymupdf.Pixmap(doc, xref)
    smask = doc.extract_image(xref).get("smask")
    if smask:
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    if width and img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(OUT / name, quality=quality, method=6)
    print(name, img.size, img.mode)


OUT.mkdir(parents=True, exist_ok=True)
overview = pymupdf.open(REF / "Product Overview.pdf")
save(overview, 32, "product-k1.webp", 1024)
save(overview, 132, "product-k2.webp", 1024)
save(overview, 104, "product-k3.webp", 1024)
save(overview, 118, "coming-soon.webp", 800)
product = pymupdf.open(REF / "Open.pdf")
save(product, 28, "shop-scene.webp", 2400, 86)
