"""Pozițiile literelor titlului mare BEYOND / ALWAYS / STATE OF MIND (hero + footer).

⚠️ De ce literă cu literă (raportat de user, 2026-10-06: „literele intră una în alta"):
un singur `letter-spacing` pe rând NU reproduce macheta. Figma a așezat literele cu
golurile lor proprii (măsurat în hero: B→E 5.3, E→Y 2.8, Y→O −5.6 între dreptunghiuri,
O→N 3.7, N→D 5.4 px); Chrome aplică peste spațierea negativă kerning-ul fontului (E-Y,
A-V…), iar unele perechi ajungeau să se atingă. Variantele încercate:
  · spațiere rezolvată pe lățimea rândului, cu kerning  → lățimea bună, perechi lipite;
  · fără kerning                                        → E→Y −2.5 în loc de +2.8.
Aici fiecare literă primește marginea care îi pune CERNEALA exact unde e în PDF:
    m_(i+1) = (L_(i+1) − xmin_(i+1)·s) − (L_i − xmin_i·s) − adv_i·s       (în em: / s)
L = marginea stângă a cernelii din PDF (hero, 130.3 px), xmin / adv din fontul real.
Spațiile dintre cuvinte nu sunt litere: golul lor intră în marginea primei litere din
cuvântul următor. A și S din ALWAYS sunt, în PDF, imagini blurate — litera se centrează
pe centrul imaginii.

Iese un fragment HTML (span-uri cu `--m`, în em), copiat în index.html la hero și footer;
footer-ul e același titlu ×1.4152, deci aceleași em-uri.
Rulare:  python tools/mega_spacing.py
"""
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

SIZE = 130.3
FONTS = {
    "cond": r"C:\ATWWW\0_Fonts\Archivo ExtraCondensed\Archivo-ExtraCondensed-Font-Family\Archivo_ExtraCondensed-ExtraBold.ttf",
    "exp": r"C:\ATWWW\0_Fonts\Archivo Expanded\Archivo-Expanded-Font-Family\Archivo_Expanded-Black.ttf",
}
# (literă, marginea stângă a cernelii în PDF) — din get_drawings() pe cadrul hero-ului;
# pentru A / S blurate: centrul imaginii (xref 104: 342–494, xref 122: 900–1034)
LINES = [
    ("cond", [("B", 513.32), ("E", 573.94), ("Y", 626.86), ("O", 684.4), ("N", 750.9), ("D", 810.9)]),
    ("exp", [("A", ("center", 418.0)), ("L", 482.6), ("W", 561.4), ("A", 702.3), ("Y", 798.9), ("S", ("center", 967.0))]),
    ("cond", [("S", 381.1), ("T", 435.0), ("A", 481.0), ("T", 536.0), ("E", 596.2), (" ", None), ("O", 656.0),
              ("F", 722.4), (" ", None), ("M", 773.4), ("I", 855.2), ("N", 880.5), ("D", 940.5)]),
]

fonts = {k: TTFont(v) for k, v in FONTS.items()}


def metrics(font, ch):
    gs, cm = font.getGlyphSet(), font.getBestCmap()
    g = cm[ord(ch)]
    bp = BoundsPen(gs)
    gs[g].draw(bp)
    upm = font["head"].unitsPerEm
    xmin, xmax = (bp.bounds[0], bp.bounds[2]) if bp.bounds else (0, 0)
    return xmin / upm, xmax / upm, font["hmtx"][g][0] / upm


for fam, letters in LINES:
    f = fonts[fam]
    glyphs = [(c, L) for c, L in letters if c != " "]
    # pen origin (px) al fiecărei litere = cerneala din PDF − bearing-ul stâng
    pens = []
    for c, L in glyphs:
        xmin, xmax, adv = metrics(f, c)
        if isinstance(L, tuple):                     # literă blurată: centrată pe imagine
            L = L[1] - (xmax - xmin) * SIZE / 2
        pens.append((c, L - xmin * SIZE, adv * SIZE))
    out = []
    word_breaks = {i for i, (c, _) in enumerate([x for x in letters if True]) if c == " "}
    idx = 0
    space_before = set()
    k = 0
    for c, L in letters:
        if c == " ":
            space_before.add(k)
        else:
            k += 1
    for i, (c, pen, adv) in enumerate(pens):
        m = 0.0 if i == 0 else (pen - (pens[i - 1][1] + pens[i - 1][2])) / SIZE
        out.append((c, m, i in space_before))
    html = "".join(
        (" " if sp else "") + f'<i style="--m:{m:.4f}em">{c}</i>' for c, m, sp in out)
    print(fam, html)
    print("   lățimea cernelii:", round(pens[-1][1] - pens[0][1], 1))
