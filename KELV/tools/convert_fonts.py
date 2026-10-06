"""Convertește fonturile Archivo Expanded / ExtraCondensed din TTF în WOFF2.

Sursa: C:\\ATWWW\\0_Fonts\\Archivo Expanded  și  C:\\ATWWW\\0_Fonts\\Archivo ExtraCondensed
(nu sunt pe Google Fonts ca familii separate). Destinația: web/public/fonts/.

Se convertesc doar greutățile DREPTE (fără italic) — italicul nu apare în machetă.
Un @font-face declarat dar nefolosit nu se descarcă, deci a avea toate 9 greutățile
pe disc nu costă nimic la încărcare; costă doar ~1 MB în repo.

Fără subsetare: fișierele sunt deja mici (~40–60 KB), iar subsetarea ar tăia
diacriticele românești dacă vreodată textul trece în română.

Rulare:  python tools/convert_fonts.py      (cere `pip install fonttools brotli`)
"""
from pathlib import Path
from fontTools.ttLib import TTFont

SRC = Path(r"C:\ATWWW\0_Fonts")
DST = Path(__file__).resolve().parent.parent / "web" / "public" / "fonts"
FAMILIES = ["Archivo Expanded", "Archivo ExtraCondensed"]

DST.mkdir(parents=True, exist_ok=True)
for fam in FAMILIES:
    for ttf in sorted((SRC / fam).glob("*/*.ttf")):
        if "Italic" in ttf.stem:
            continue
        out = DST / (ttf.stem.replace("_", "-") + ".woff2")   # Archivo-Expanded-Black.woff2
        f = TTFont(ttf)
        f.flavor = "woff2"
        f.save(out)
        print(f"{out.name:40s} {out.stat().st_size // 1024:4d} KB")
