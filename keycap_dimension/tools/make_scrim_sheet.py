# -*- coding: utf-8 -*-
"""
Compune fundalul de desene tehnice pentru scrim-ul din actul de pasi.

    python tools/make_scrim_sheet.py

Iesire: web/public/textures/scrim_sheet.png  (+ _prev.png pentru verificare)

CE SE COMPUNE, SI DE CE ASA
---------------------------
Sursele sunt scanurile reale de datasheet din `source/assets/models/papers_images/`,
aceleasi foi care stau prinse pe pegboard in cadrele cu biroul. Alese dupa ce s-a zoomat
in scrim-ul din macheta Figma si s-a citit ce scrie pe el: sectiunea prin switch cu
"SMD-LED" si textul german (11.png), diagramele encoderului "Output A / Output B ... the
code repeats from 1 to 4" (38.jpg), keycap-ul "SECTION A-A SCALE 2:1" (34.jpg) si desenul
mecanic cu arborii (39.jpg).

⚠️ TREI FOI INTREGI, INTR-UN RAND. Au fost CINCI incercari inainte, respinse pe rand:
  1. patru pagini intregi, asezate de mana         -> "unele peste altele";
  2. sase pagini, mai mici                         -> tot suprapuse;
  3. patru pagini intr-un rand, fara suprapunere   -> una iesea un ciot (185 px din 760);
  4. benzi dreptunghiulare din pagini, in grila 2x2 -> "combinate si taiate": grila taia
     prin desene si prin randuri de text;
  5. elemente individuale, decupate si impachetate -> nimic taiat, dar ieseau marunte,
     asezate in rafturi vizibile si cu repetitii evidente. Arata a catalog de pictograme,
     nu a perete de schite.

Ce le lega pe toate: incercam sa BAG patru foi portret intr-un cadru landscape. Nu intra.
Trei intra — cu marginile de stanga si de dreapta iesind putin din cadru, exact ca in
macheta, unde desenele curg in afara ecranului. Deci: trei foi, la inaltimea panzei,
intr-un rand, centrate. Nimic nu se suprapune si nimic nu e taiat pe dinauntru — singurele
taieturi sunt marginile cadrului, care oricum se citesc ca margine de ecran.

⚠️ Ordinea nu conteaza pentru efect: dezvaluirea e o bara de scanner care se calculeaza
din pozitia pe ecran (vezi shaderul scrim-ului). Aici conteaza doar asezarea.
"""
import os
import sys
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "source", "assets", "models", "papers_images")
OUT_DIR = os.path.join(ROOT, "web", "public", "textures")

# Alese dupa ce s-a citit ce scrie pe scrim-ul din macheta: sectiunea prin switch cu
# "SMD-LED" si textul german, diagramele encoderului "Output A/B", si keycap-ul cu
# "SECTION A-A SCALE 2:1". Toate trei se vad acolo.
# (fisier, scara proprie). ⚠️ Scarile DIFERA intre foi, si nu din intamplare: in macheta
# blocul cu "Output A / Output B" e vizibil mai mic decat sectiunea prin switch. Cu toate
# foile la aceeasi inaltime, 38.jpg iesea prea mare si trag ea ochiul in locul coloanei.
SHEETS = [("11.png", 1.00), ("38.jpg", 0.78), ("34.jpg", 0.92)]
W, H = 2048, 1280
GAP = 30              # spatiul dintre foi
BLEED = 1.06          # foile sunt cu atat mai inalte decat panza, ca sa iasa si sus/jos


def ink_crop(im, thr=200, pad=6):
    """Decupeaza la cutia de cerneala. Scanurile au margini albe late si inegale;
    fara decupare, foile ar iesi mici si cu benzi goale intre ele."""
    m = im < thr
    ys, xs = np.where(m)
    if not len(xs):
        return im
    return im[max(0, ys.min() - pad):ys.max() + pad,
              max(0, xs.min() - pad):xs.max() + pad]


def build_collage():
    """Aseaza foile intr-un rand, la inaltimea panzei, centrate pe orizontala.

    Intoarce panza si harta de proprietar (cine a pus cerneala in fiecare pixel — vezi
    nota din make_order_texture).
    """
    scaled = []
    for name, sc in SHEETS:
        im = cv2.imread(os.path.join(SRC, name), cv2.IMREAD_GRAYSCALE)
        if im is None:
            raise SystemExit("lipseste " + name)
        c = ink_crop(im)
        hh = max(1, int(H * BLEED * sc))
        scaled.append(cv2.resize(c, (max(1, int(hh * c.shape[1] / c.shape[0])), hh),
                                 interpolation=cv2.INTER_AREA))
    total = sum(im.shape[1] for im in scaled) + GAP * (len(scaled) - 1)
    x = (W - total) // 2          # negativ = iese simetric in stanga si in dreapta

    canvas = np.full((H, W), 255, np.uint8)
    owner = np.full((H, W), -1, np.int8)
    for k, im in enumerate(scaled):
        h, w = im.shape
        y = (H - h) // 2          # fiecare foaie centrata pe verticala, are alta inaltime
        sx0, dx0 = max(0, -x), max(0, x)
        sy0, dy0 = max(0, -y), max(0, y)
        ww = min(w - sx0, W - dx0)
        hgt = min(h - sy0, H - dy0)
        if ww > 0 and hgt > 0:
            canvas[dy0:dy0 + hgt, dx0:dx0 + ww] = im[sy0:sy0 + hgt, sx0:sx0 + ww]
            owner[dy0:dy0 + hgt, dx0:dx0 + ww] = k
        print("  %-8s %4dx%-4d la (%d,%d)" % (SHEETS[k][0], w, h, x, y))
        x += w + GAP
    print("  latime totala %d pe panza de %d -> iese %d px de fiecare parte"
          % (total, W, (total - W) // 2))
    return canvas, owner


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    from make_order_texture import build, preview

    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(OUT_DIR, "_collage_tmp.png")
    out = os.path.join(OUT_DIR, "scrim_sheet.png")
    print("compun fundalul:")
    canvas, owner = build_collage()
    cv2.imwrite(tmp, canvas)
    o, a = build(tmp, out, owner=owner)
    preview(o, a, out.replace(".png", "_prev.png"))
    os.remove(tmp)
