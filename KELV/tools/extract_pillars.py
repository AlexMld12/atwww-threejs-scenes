"""Extrage din macheta Figma asset-urile secțiunii PILLARS (secțiunile 2–4 din PDF).

Ce iese în web/public/images/:
  pillar-1.webp / -2 / -3   fundalurile celor trei piloni, COPTE din randarea PDF-ului:
                            imaginea + tenta + vignetele, exact cum le compune Figma,
                            dar FĂRĂ texte, produse și cercuri. 2880 × 1700 (2× cadrul).
  product-1.webp / -2 / -3  randările produselor (Foam Cleanser, Active Serum, Barrier
                            Cream), cu alfa. ⚠️ PROVIZORII — țin locul GLB-urilor.

Cum se obține fundalul curat (fiecare pas a avut un drum respins):
  1. Produsele: se șterge din fluxul PDF-ului operatorul `/<nume> Do` care le desenează.
     ⚠️ NU `page.replace_image()` cu o imagine transparentă de 1 px: înlocuitorul își
     pierde masca și desena un DREPTUNGHI NEGRU rotit în locul produsului.
  2. Textele, header-ul, CTA-urile: redactare cu `fill=False` (imaginile rămân).
  3. Cercurile: ⚠️ NU prin `/ca .29 → /ca 0` în ExtGState: starea e partajată cu grupul
     cadrului, iar secțiunile 2 și 4 ieșeau complet ALBE. Nici prin redactare: inelele
     ies din pagină, deci niciun dreptunghi nu le „acoperă" complet. Se SCAD analitic din
     randare: inel alb la 29%, 1 px grosime, centru și rază măsurate pe profilul radial
     al pixelilor (dreptunghiul de încadrare al traseului din PDF dă rază 653, dar
     include punctele de control ale curbelor; inelul real e la 651 → 652).
     Reziduu măsurat după scădere: ~4/255, sub textura fundalului.

Rulare:  python tools/extract_pillars.py      (pymupdf, pillow, numpy)
"""
import re
from io import BytesIO
from pathlib import Path
import numpy as np
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "reference" / "Homepage.pdf"
IMG = ROOT / "web" / "public" / "images"
FRAMES = (1709, 2559, 3409)          # vârful cadrelor de 850 ale pilonilor
PRODUCTS = (12, 58, 142)             # xref-urile randărilor de produs, în ordinea pilonilor
S = 2                                # rezoluția coacerii (2× cadrul de 1440)
# inelele per pilon, în coordonate de cadru: (cx, cy, r_interior, r_exterior)
RINGS = {0: [(929, 734 - 0, 651, 652)],
         1: [],
         2: [(526.5, 531.5, 430.5, 431.5), (1071, 708, 487, 488)]}


def save(im, name, width=None, quality=82):
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = IMG / name
    im.save(out, "WEBP", quality=quality, method=6)
    print(f"{name:20s} {im.width}x{im.height}  {out.stat().st_size // 1024} KB")


# ---- produsele (din documentul NEATINS) ----
doc = pymupdf.open(PDF)
for i, x in enumerate(PRODUCTS):
    info = doc.extract_image(x)
    pix = pymupdf.Pixmap(doc, x)
    if info.get("smask"):
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, info["smask"]))
    # ⚠️ prin PNG: `samples` e premultiplicat (vezi extract_figma.py)
    save(Image.open(BytesIO(pix.tobytes("png"))), f"product-{i + 1}.webp", 1400, quality=88)

# ---- fundalurile ----
doc = pymupdf.open(PDF)
page = doc[0]
for x in range(1, doc.xref_length()):
    try:
        obj = doc.xref_object(x)
    except Exception:
        continue
    if ("/Subtype /Form" in obj or "/Type /Page" in obj) and doc.xref_is_stream(x):
        names = [n for n, r in re.findall(r"/(\w+) (\d+) 0 R", obj) if int(r) in PRODUCTS]
        if names:
            st = doc.xref_stream(x).decode("latin1")
            for n in names:
                st = re.sub(r"/%s Do" % n, "", st)
            doc.update_stream(x, st.encode("latin1"))
for y0 in FRAMES:
    for r in (pymupdf.Rect(0, y0, 1440, y0 + 90),          # liniuțe + header
              pymupdf.Rect(200, y0 + 330, 660, y0 + 490),   # titlul
              pymupdf.Rect(890, y0 + 355, 1200, y0 + 490),  # 0X/03 + paragraf
              pymupdf.Rect(0, y0 + 770, 1440, y0 + 830)):   # tagline + CTA-uri
        page.add_redact_annot(r, fill=False)
page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                      graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                      text=pymupdf.PDF_REDACT_TEXT_REMOVE)


def coverage(h, w, cx, cy, r0, r1, ss=4):
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    cov = np.zeros((h, w), np.float32)
    for sy in range(ss):
        for sx in range(ss):
            d = np.hypot((xs + (sx + .5) / ss) / S - cx, (ys + (sy + .5) / ss) / S - cy)
            cov += (d >= r0) & (d <= r1)
    return cov / (ss * ss)


for i, y0 in enumerate(FRAMES):
    pix = page.get_pixmap(matrix=pymupdf.Matrix(S, S), clip=pymupdf.Rect(0, y0, 1440, y0 + 850))
    im = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w, pix.n)[..., :3].astype(np.float32)
    a = np.zeros(im.shape[:2], np.float32)
    for (cx, cy, r0, r1) in RINGS[i]:
        a = 1 - (1 - a) * (1 - 0.29 * coverage(*a.shape, cx, cy, r0, r1))
    im = (im - 255 * a[..., None]) / (1 - a[..., None])
    save(Image.fromarray(np.clip(im, 0, 255).round().astype(np.uint8)), f"pillar-{i + 1}.webp", quality=80)
