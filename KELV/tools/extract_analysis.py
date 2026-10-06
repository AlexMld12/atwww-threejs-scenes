r"""Pagina Skin Analysis: iconițele vectoriale, scoase direct din machetă (doar dev).

Machetele (export Figma, câte un PDF pe ecran) stau în docs/reference/skin-analysis/
(ignorat de git; originalele în C:\ATWWW\KELV\Skin Analysis\).

  · public/images/sa-kit.svg — punctele K1/K2/K3 din raport (END V1, 61.76 × 61.76):
    trei straturi (puncte închise, inel portocaliu, miez portocaliu), copiate ca trasee.
  · public/images/sa-why.svg — cercul cu „?" din butonul „Why we ask" (001, 16 × 16).

De ce SVG din trasee, nu PNG: iconițele sunt mici și se scalează cu clamp(); un raster
ar ieși moale peste 1720 px sau la DPR fracționar.
"""
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "docs/reference/skin-analysis"
OUT = ROOT / "web/public/images"


def hexc(c):
    return "#%02x%02x%02x" % tuple(round(v * 255) for v in c)


def path_d(items, ox, oy):
    d, cur = [], None
    for it in items:
        if it[0] == "l":
            a, b = it[1], it[2]
            if cur is None or abs(cur.x - a.x) > 1e-3 or abs(cur.y - a.y) > 1e-3:
                d.append(f"M{a.x - ox:.3f} {a.y - oy:.3f}")
            d.append(f"L{b.x - ox:.3f} {b.y - oy:.3f}")
            cur = b
        elif it[0] == "c":
            a, c1, c2, b = it[1], it[2], it[3], it[4]
            if cur is None or abs(cur.x - a.x) > 1e-3 or abs(cur.y - a.y) > 1e-3:
                d.append(f"M{a.x - ox:.3f} {a.y - oy:.3f}")
            d.append(f"C{c1.x - ox:.3f} {c1.y - oy:.3f} {c2.x - ox:.3f} {c2.y - oy:.3f} {b.x - ox:.3f} {b.y - oy:.3f}")
            cur = b
        elif it[0] == "re":
            r = it[1]
            d.append(f"M{r.x0 - ox:.3f} {r.y0 - oy:.3f}H{r.x1 - ox:.3f}V{r.y1 - oy:.3f}H{r.x0 - ox:.3f}Z")
            cur = None
    return "".join(d)


def export(pdf, box, name, color_vars=None):
    page = pymupdf.open(REF / pdf)[0]
    box = pymupdf.Rect(box)
    paths = []
    for dr in page.get_drawings():
        if dr.get("fill") is None or not box.contains(dr["rect"]):
            continue
        fill = hexc(dr["fill"])
        if color_vars and fill in color_vars:
            fill = color_vars[fill]
        paths.append(f'<path fill="{fill}" fill-rule="evenodd" d="{path_d(dr["items"], box.x0, box.y0)}"/>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {box.width:.3f} {box.height:.3f}">'
           + "".join(paths) + "</svg>\n")
    (OUT / name).write_text(svg, encoding="utf-8")
    print(name, len(paths), "trasee")


if __name__ == "__main__":
    # punctele: cutia exactă a celor trei straturi (vezi get_drawings în END V1)
    export("END V1.pdf", (723.99, 321.607, 785.775, 383.392), "sa-kit.svg")
    # „?": cercul (444, 409, 16 × 16) + semnul din el; culoarea = currentColor
    export("001.pdf", (444.0, 409.0, 460.0, 425.0), "sa-why.svg")
