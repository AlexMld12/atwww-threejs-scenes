"""Extrage din macheta Figma fundalul zonei 8 (produsul care se rotește spre footer).

Zona 8: cadrul 7219 → 8261 (1042 px), un gradient de la deschis (#F0F8FC) sus la navy jos
(imaginea xref 30 din PDF). Se COACE din randarea PDF-ului, fără produs, header și CTA-uri:
  · produsul (xref 12): se șterge `/<nume> Do` din flux (vezi extract_pillars.py — NU
    `replace_image`, care lasă un dreptunghi negru);
  · header-ul și CTA-urile: redactare cu `fill=False`.

Iese web/public/images/section8-bg.webp (2880 × 2084, 2× cadrul).

Footer-ul (8261 → 9111) NU are fundal propriu: e navy (#030F38) + aceeași strălucire ca
hero-ul, la aceleași coordonate (xref 24 are exact dimensiunile și poziția lui xref 126),
deci refolosește `hero-glow.webp`.

Pragul temei (unde header-ul redevine alb): contrastul WCAG al textului alb față de cel
#17110F pe gradient se egalează la y = 792 din 1042 → 0.76 din înălțime. Valoarea stă în
`data-theme-end` pe secțiune (index.html).

Rulare:  python tools/extract_footer.py     (pymupdf, pillow)
"""
import re
from pathlib import Path
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "reference" / "Homepage.pdf"
OUT = ROOT / "web" / "public" / "images" / "section8-bg.webp"

doc = pymupdf.open(PDF)
page = doc[0]
for x in range(1, doc.xref_length()):
    try:
        obj = doc.xref_object(x)
    except Exception:
        continue
    if ("/Subtype /Form" in obj or "/Type /Page" in obj) and doc.xref_is_stream(x):
        names = [n for n, r in re.findall(r"/(\w+) (\d+) 0 R", obj) if int(r) == 12]
        if names:
            st = doc.xref_stream(x).decode("latin1")
            for n in names:
                st = re.sub(r"/%s Do" % n, "", st)
            doc.update_stream(x, st.encode("latin1"))
for r in (pymupdf.Rect(0, 7219, 1440, 7310), pymupdf.Rect(0, 7625, 1440, 7660)):
    page.add_redact_annot(r, fill=False)
page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                      graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                      text=pymupdf.PDF_REDACT_TEXT_REMOVE)
pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=pymupdf.Rect(0, 7219, 1440, 8261))
im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
im.save(OUT, "WEBP", quality=82, method=6)
print(f"{OUT.name}  {im.width}x{im.height}  {OUT.stat().st_size // 1024} KB")
