# -*- coding: utf-8 -*-
"""
Transforma o foaie de datasheet scanata intr-o TEXTURA DE ORDINE, pentru efectul de
"desen care se traseaza pe masura ce derulezi", pe scrim-ul din actul de pasi.

    python tools/make_order_texture.py <intrare.png|jpg> <iesire.png>

DE CE NU SVG
------------
Userul a cerut initial o varianta SVG, ca sa se poata anima trasarea cu
`stroke-dashoffset`. Masurat pe 11.png (1240x1754): vectorizarea da **1723 de contururi
cu 30.649 de puncte**, majoritatea din TEXT — fiecare litera devine cateva contururi
inchise. Un SVG de marimea aia, refacut in canvas la fiecare cadru, e mult mai scump
decat problema pe care o rezolva, iar literele "trasate pe contur" arata gresit: o litera
nu se scrie conturandu-i marginea.

In schimb, aceleasi imagini au ~1000 de componente conexe — fiecare linie, fiecare cota
si fiecare litera e deja un obiect separat, gratis. Deci se coace o singura textura in
care fiecare PIXEL stie cand ii vine randul, iar shaderul dezvaluie in ordine. Cost la
runtime: zero.

FORMATUL IESIRII (PNG, RGB)
---------------------------
    R = momentul aparitiei, 0..255 normalizat (0 = hartie goala)
    G = alfa liniei, adica cat de "tare" e trasatura (pastreaza antialiasingul)
    B = liber

⚠️ Textura TREBUIE incarcata cu `colorSpace = NoColorSpace` si FARA mipmap-uri: R si G
sunt DATE, nu culoare.

CUM SE ALEGE ORDINEA — trei niveluri
------------------------------------
Au fost necesare trei incercari; primele doua au fost respinse de user si fiecare
respingere a aratat exact ce lipsea.

1. **Benzi orizontale peste tot colajul** (prima). "Schemele apar random fara sens."
   Corect: o banda orizontala taie toate foile deodata, deci creionul desena o farama
   din foaia 1, apoi din 2, 3, 4, si inapoi la 1.
2. **Vecin-cel-mai-apropiat pe COMPONENTE, grupat pe foi** (a doua). "E ca si cum cineva
   s-ar apuca sa scrie o litera trasand doar o linie, dupa se apuca de altceva si revine
   la litera sa o continue." Tot corect, si din doua motive:
   · o litera sau o cota NU e o componenta, ci mai multe (punctul lui "i", linia de cota
     plus cele doua sageti plus cifra). Vecinul-cel-mai-apropiat le viziteaza in ordine
     aleatorie fata de sensul in care scrii;
   · distanta se masura intre CENTRE, ceea ce e gresit pentru linii lungi: centrul unei
     linii de 400 px poate fi mai aproape decat litera de langa creion.
3. **Ce e acum**, si care rezolva exact reclamatia:
   · **cuvinte** — imaginea se dilata orizontal, iar componentele conexe ale imaginii
     dilatate devin "cuvinte": literele unui cuvant se lipesc intre ele, linia de cota se
     lipeste de sagetile si de cifra ei. Creionul nu mai poate pleca din mijlocul unui
     cuvant;
   · **in cuvant** — componentele se scriu strict de la stanga la dreapta, ca la scris;
   · **in componenta** — pixelii primesc rang pe axa lunga, deci o linie de 400 px se
     TRASEAZA, nu apare dintr-o data;
   · **viteza constanta** — fiecare bucata costa proportional cu lungimea ei, deci
     creionul nu sta la fel de mult pe o virgula ca pe o linie de cota.
"""
import sys
import cv2
import numpy as np


def _pen_path(pts, up_penalty=2.0):
    """Ordinea in care creionul viziteaza niste puncte: mereu la cel mai apropiat,
    pornind din stanga-sus. `up_penalty` face urcarea mai scumpa, altfel drumul
    zigzagheaza in sus si in jos prin acelasi paragraf si nu se citeste ca scriere."""
    if len(pts) <= 1:
        return list(range(len(pts)))
    xy = np.asarray(pts, dtype=np.float64)
    cur = int(np.argmin(xy[:, 0] + xy[:, 1]))
    left = np.ones(len(pts), bool)
    left[cur] = False
    out = [cur]
    for _ in range(len(pts) - 1):
        d = xy[left] - xy[cur]
        cost = np.hypot(d[:, 0], d[:, 1]) + up_penalty * np.maximum(0.0, -d[:, 1])
        k = int(np.flatnonzero(left)[int(np.argmin(cost))])
        left[k] = False
        out.append(k)
        cur = k
    return out


def build(src_path, out_path, thr=180, min_area=4, owner=None,
          word_kernel=(15, 3), up_penalty=2.0, strategy='rows'):
    im = cv2.imread(src_path, cv2.IMREAD_GRAYSCALE)
    if im is None:
        raise SystemExit("nu pot citi " + src_path)
    H, W = im.shape

    bw = (im < thr).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(bw, 8)
    keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_area]
    if not keep:
        raise SystemExit("nicio componenta peste %d px in %s" % (min_area, src_path))

    # ---- nivelul 1: "cuvinte", prin dilatare orizontala ----
    # Nucleul e lat si jos: lipeste literele de pe acelasi rand, dar NU randurile
    # intre ele. Daca iese prea lat, doua coloane de text se lipesc si creionul
    # traverseaza foaia la fiecare rand.
    ker = np.ones((word_kernel[1], word_kernel[0]), np.uint8)
    cn, clab, _, _ = cv2.connectedComponentsWithStats(cv2.dilate(bw, ker), 8)
    # eticheta de cuvant a fiecarei componente. Dilatarea doar creste, iar o componenta
    # ramane conexa in imaginea dilatata, deci toti pixelii ei cad in acelasi cuvant.
    m0 = lab > 0
    comp_word = np.zeros(n, np.int64)
    comp_word[lab[m0]] = clab[m0]

    # ⚠️ Foaia unei bucati se ia din harta de PROPRIETAR (cine a pus cerneala in
    # pixelul ala), nu dintr-un dreptunghi. La scara la care foile se suprapun,
    # dreptunghiul minte: cerneala foii 2 din zona comuna pica in tura foii 1.
    if owner is not None:
        comp_sheet = np.zeros(n, np.int64)
        comp_sheet[lab[m0]] = owner[m0].astype(np.int64)
        sheet_of = {i: int(comp_sheet[i]) for i in keep}
    else:
        sheet_of = {i: 0 for i in keep}

    # ---- gruparea componentelor pe cuvinte, si a cuvintelor pe foi ----
    words = {}
    for i in keep:
        words.setdefault((sheet_of[i], int(comp_word[i])), []).append(i)

    seq = []                                  # componentele, in ordinea de scriere
    for sheet in sorted(set(s for s, _ in words)):
        wk = [k for k in words if k[0] == sheet]
        # ancora unui cuvant: coltul lui stanga-sus, nu centrul — creionul intra in
        # cuvant pe stanga, deci de acolo se masoara distanta
        anchors = []
        for k in wk:
            xs = [stats[i, cv2.CC_STAT_LEFT] for i in words[k]]
            ys = [stats[i, cv2.CC_STAT_TOP] for i in words[k]]
            anchors.append((min(xs), min(ys)))
        if strategy == 'rows':
            # ---- rand cu rand, ca la scris ----
            # Inaltimea randului se ia din mediana inaltimii cuvintelor, nu dintr-o
            # constanta: pe o foaie de datasheet, randurile de text si randurile de
            # tabel au inaltimi diferite de la o foaie la alta.
            hs = [max(stats[i, cv2.CC_STAT_HEIGHT] for i in words[k]) for k in wk]
            band = max(6.0, float(np.median(hs)) * 1.15)
            ordr = sorted(range(len(wk)),
                          key=lambda j: (int(anchors[j][1] // band), anchors[j][0]))
        else:
            ordr = _pen_path(anchors, up_penalty)
        for j in ordr:
            # ---- nivelul 2: in cuvant, strict de la stanga la dreapta ----
            seq.extend(sorted(words[wk[j]], key=lambda i: (stats[i, cv2.CC_STAT_LEFT],
                                                           stats[i, cv2.CC_STAT_TOP])))

    # ---- nivelul 3: in componenta, rang pe axa lunga + viteza constanta ----
    # Costul unei bucati = intinderea ei, deci creionul nu sta la fel de mult pe o
    # virgula ca pe o linie de cota. `+6` e pretul minim al oricarei bucati, altfel
    # punctele si virgulele ar aparea toate in acelasi cadru.
    span = np.array([max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]) + 6.0
                     for i in seq])
    ends = np.cumsum(span)
    total = float(ends[-1])
    starts = ends - span

    order = np.zeros((H, W), np.float32)
    prev = None
    for k, i in enumerate(seq):
        x0 = stats[i, cv2.CC_STAT_LEFT]; y0 = stats[i, cv2.CC_STAT_TOP]
        w = stats[i, cv2.CC_STAT_WIDTH]; h = stats[i, cv2.CC_STAT_HEIGHT]
        sub = lab[y0:y0 + h, x0:x0 + w] == i
        ys, xs = np.nonzero(sub)
        horiz = w >= h
        t = (xs / max(w - 1, 1)) if horiz else (ys / max(h - 1, 1))
        # sensul: se intra prin capatul mai apropiat de unde a iesit creionul
        if prev is not None:
            near_end = (abs(prev[0] - (x0 + w)) < abs(prev[0] - x0)) if horiz \
                       else (abs(prev[1] - (y0 + h)) < abs(prev[1] - y0))
            if near_end:
                t = 1.0 - t
        order[y0:y0 + h, x0:x0 + w][sub] = (starts[k] + t * span[k]) / total
        prev = (x0 + (w if (horiz and t[-1] > 0.5) else 0),
                y0 + (0 if horiz else h))

    alpha = np.clip((255 - im).astype(np.float32) / 255.0 * 1.6, 0, 1)
    alpha[order == 0] = 0

    rgb = np.zeros((H, W, 3), np.uint8)       # cv2 scrie BGR, deci canalul 2 e R
    rgb[..., 2] = np.clip(order * 255, 0, 255).astype(np.uint8)
    rgb[..., 1] = (alpha * 255).astype(np.uint8)
    cv2.imwrite(out_path, rgb)
    print("%s -> %s\n  %d bucati in %d cuvinte, %dx%d"
          % (src_path, out_path, len(seq), len(words), W, H))
    return order, alpha


def preview(order, alpha, out_path, stages=(0.15, 0.3, 0.45, 0.6, 0.8, 1.0)):
    """Contact sheet cu stadiile de trasare, in verdele scenei — pentru verificare."""
    frames = []
    for p in stages:
        a = alpha * ((order <= p) & (order > 0))
        img = np.zeros(order.shape + (3,), np.uint8)
        for ch, (bg, fg) in enumerate(((14, 0x9d), (26, 0xff), (22, 0x5c))):
            img[..., ch] = (bg + a * (fg - bg)).astype(np.uint8)
        frames.append(cv2.resize(img, (430, 269), interpolation=cv2.INTER_AREA))
    cv2.imwrite(out_path, np.vstack([np.hstack(frames[:3]), np.hstack(frames[3:])]))
    print("  previzualizare: " + out_path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    o, a = build(sys.argv[1], sys.argv[2])
    preview(o, a, sys.argv[2].rsplit(".", 1)[0] + "_prev.png")
