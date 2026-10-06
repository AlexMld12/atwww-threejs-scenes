"""Extrage din macheta Figma (docs/reference/Homepage.pdf) asset-urile HERO-ului.

Macheta e un singur PDF de 1440 x 9111. Fiecare imagine a fost găsită prin
`page.get_image_info(xrefs=True)`; xref-urile de mai jos sunt cele din exportul din
2026-10-05. Dacă designerul re-exportă PDF-ul, xref-urile se schimbă — rulează
`python tools/extract_figma.py --list` și actualizează tabelul.

Ce iese (în web/public/images/ și web/src/assets/):
  hero-glow.webp      strălucirea cyan din spatele produselor (xref 126 + smask 124).
                      Ocupă în machetă -609..1993 x 168..2378. E foarte blurată, deci
                      se livrează la 1/4 din rezoluție — banding-ul se verifică vizual.
  products-placeholder.webp  randarea celor 3 produse (xref 100 + smask 98).
                      ⚠️ PROVIZORIU: ține locul GLB-urilor până le primim. Se șterge
                      odată cu `.hero__placeholder` din index.html.
  logo.svg            KELV° — cele două trasee vectoriale din colțul stânga-sus.

Rulare:  python tools/extract_figma.py     (cere `pip install pymupdf pillow numpy`)
"""
import sys
from pathlib import Path
import numpy as np
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "reference" / "Homepage.pdf"
IMG = ROOT / "web" / "public" / "images"
ASSETS = ROOT / "web" / "src" / "assets"

doc = pymupdf.open(PDF)
page = doc[0]

if "--list" in sys.argv:
    for i, im in enumerate(page.get_image_info(xrefs=True)):
        print(i, im["xref"], [round(v) for v in im["bbox"]], im["width"], im["height"])
    sys.exit()


def rgba(xref):
    """Imaginea + masca ei alfa (smask), ca PIL RGBA."""
    info = doc.extract_image(xref)
    pix = pymupdf.Pixmap(doc, xref)
    if info.get("smask"):
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, info["smask"]))
    # ⚠️ prin PNG, NU `Image.frombytes(pix.samples)`: `samples` e PREMULTIPLICAT cu alfa,
    # iar browserul mai înmulțește o dată → alfa la pătrat. Strălucirea ieșea vizibil mai
    # închisă pe margini (alfa 0.64 se vedea ca 0.41). `tobytes("png")` demultiplică.
    from io import BytesIO
    return Image.open(BytesIO(pix.tobytes("png")))


def save(im, name, width, quality=82, lossless=False):
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = IMG / name
    im.save(out, "WEBP", quality=quality, method=6, lossless=lossless)
    print(f"{name:28s} {im.width}x{im.height}  {out.stat().st_size // 1024} KB")


IMG.mkdir(parents=True, exist_ok=True)
ASSETS.mkdir(parents=True, exist_ok=True)

# --- strălucirea: 5204 px în sursă pentru 2602 px în machetă (2x). E un gradient moale,
# deci 1300 px ajung; la 1720+ se întinde, dar nu are detalii care să se vadă.
save(rgba(126), "hero-glow.webp", 1300, quality=90)


# --- spuma (xref 116): NU se mai extrage aici. Din 2026-10-06 fundalul cardului e
# `pillar-1.webp`, copt din randarea cadrului întreg al secțiunii 2 (tools/extract_pillars.py)
# — imaginea + tenta + vigneta exact ca în Figma, în loc de gradul aproximat de aici.

# --- produsele, placeholder: 2880 px pentru 1322 px în machetă.
save(rgba(100), "products-placeholder.webp", 1800, quality=85)


# --- logo-ul, vectorial
def path_d(g, ox, oy):
    d, cur = [], None
    f = lambda p: f"{p.x - ox:.2f} {p.y - oy:.2f}"
    for it in g["items"]:
        if it[0] in ("l", "c"):
            if cur is None or abs(cur.x - it[1].x) > 1e-3 or abs(cur.y - it[1].y) > 1e-3:
                d.append("M" + f(it[1]))
            if it[0] == "l":
                d.append("L" + f(it[2])); cur = it[2]
            else:
                d.append("C" + f(it[2]) + " " + f(it[3]) + " " + f(it[4])); cur = it[4]
        elif it[0] == "re":
            r = it[1]
            d.append(f"M{r.x0-ox:.2f} {r.y0-oy:.2f}H{r.x1-ox:.2f}V{r.y1-oy:.2f}H{r.x0-ox:.2f}Z")
            cur = None
    if g.get("closePath"):
        d.append("Z")
    return "".join(d)


logo = [g for g in page.get_drawings()
        if g["rect"].y0 > 40 and g["rect"].y1 < 75 and g["rect"].x1 < 135]
x0 = min(g["rect"].x0 for g in logo); y0 = min(g["rect"].y0 for g in logo)
x1 = max(g["rect"].x1 for g in logo); y1 = max(g["rect"].y1 for g in logo)
paths = "".join(
    f'<path fill="currentColor"{" fill-rule=" + chr(34) + "evenodd" + chr(34) if g.get("even_odd") else ""}'
    f' d="{path_d(g, x0, y0)}"/>' for g in logo)
(ASSETS / "logo.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {x1-x0:.2f} {y1-y0:.2f}">{paths}</svg>\n',
    encoding="utf-8")
print(f"logo.svg                     {x1-x0:.2f} x {y1-y0:.2f} (in macheta la x={x0:.2f}, y={y0:.2f})")
