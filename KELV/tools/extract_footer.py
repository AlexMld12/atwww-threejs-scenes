"""Zona 8 (produsul care se rotește spre footer) și footer-ul, din macheta Figma (doar dev).

Macheta din 2026-10-08: zona 8 (7219 → 8261) e #F0F8FC plat + o elipsă albastră difuză (xref 30,
-401…1837 × 7827…9596), care în site crește și urcă la scroll (use-zone-glow.ts). Fundalul copt din
PDF și elipsa singură pe #F0F8FC diferă cu 0.5 / 255 în medie, deci elipsa e singurul strat.

Iese web/public/images/zone8-glow.webp (1119 × 885, jumătate din mărimea de design; e difuză).
Alfa prin tobytes('png'): Pixmap.samples e premultiplicat (CLAUDE.md).

Footer-ul (8261 → 9111) NU are fundal propriu: navy + strălucirea hero-ului (`hero-glow.webp`),
ancorată sus; în site e 0.85× în jurul aceluiași centru, ca să nu atingă marginea de jos (userul).

Rulare:  python tools/extract_footer.py     (pymupdf, pillow)
"""
import io
from pathlib import Path
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "reference" / "Homepage.pdf"
OUT = ROOT / "web" / "public" / "images" / "zone8-glow.webp"

doc = pymupdf.open(PDF)
pix = pymupdf.Pixmap(doc, 30)
pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, doc.extract_image(30)["smask"]))
im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
im = im.resize((1119, 885), Image.LANCZOS)
im.save(OUT, "WEBP", quality=90, method=6)
print(f"{OUT.name}  {im.width}x{im.height}  {OUT.stat().st_size // 1024} KB")
