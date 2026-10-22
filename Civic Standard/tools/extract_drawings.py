"""Line drawings from the Figma PDF → SVG, path by path with their own fills (pymupdf).

python tools/extract_drawings.py
Each drawing: a rectangle of the page (Figma px) and the fills it is made of; the SVG's box is that rectangle.
"""
from pathlib import Path

import pymupdf

PDF = 'docs/reference/Civic Standard.pdf'
# The prefooter's drawings (Figma 10956–11726): line art in #DCDFDA; the bin's panel is filled with the page's
# #FAF9F6 so the rules behind it stop at its edge.
DRAWINGS = {
    'web/public/prefooter/benches.svg': ((329, 11030, 615, 11190), {'#dcdfda'}),
    'web/public/prefooter/bin.svg': ((1083, 11074, 1230, 11367), {'#dcdfda', '#faf9f6'}),
    'web/public/prefooter/chair.svg': ((28, 11395, 175, 11600), {'#dcdfda'}),
    # the social icons' glyphs, each in its 28 px square (the square itself is CSS)
    'web/public/prefooter/linkedin.svg': ((806.2, 11297.1, 834.3, 11325.1), {'#faf9f6'}),
    'web/public/prefooter/facebook.svg': ((837.3, 11297.1, 865.3, 11325.1), {'#faf9f6'}),
    'web/public/prefooter/instagram.svg': ((868.3, 11297.1, 896.3, 11325.1), {'#faf9f6'}),
    # the footer's wordmark (Figma 11726.7–11907.7), as drawn: its letters' tops run under the prefooter's edge
    'web/public/footer/wordmark.svg': ((0, 11726, 1440, 11866), {'#0e1f14'}),
}


def hex_of(colour):
    return '#' + ''.join(f'{round(c * 255):02x}' for c in colour) if colour else None


def path_data(drawing, x0, y0):
    out = []
    pen = None

    def move(p):
        nonlocal pen
        if pen is None or abs(pen[0] - p.x) > 1e-3 or abs(pen[1] - p.y) > 1e-3:
            out.append(f'M{p.x - x0:.2f} {p.y - y0:.2f}')

    for item in drawing['items']:
        kind = item[0]
        if kind == 'l':
            move(item[1])
            out.append(f'L{item[2].x - x0:.2f} {item[2].y - y0:.2f}')
            pen = (item[2].x, item[2].y)
        elif kind == 'c':
            move(item[1])
            c1, c2, end = item[2], item[3], item[4]
            out.append(f'C{c1.x - x0:.2f} {c1.y - y0:.2f} {c2.x - x0:.2f} {c2.y - y0:.2f} {end.x - x0:.2f} {end.y - y0:.2f}')
            pen = (end.x, end.y)
        elif kind == 're':
            r = item[1]
            out.append(f'M{r.x0 - x0:.2f} {r.y0 - y0:.2f}h{r.width:.2f}v{r.height:.2f}h{-r.width:.2f}Z')
            pen = None
        elif kind == 'qu':
            q = item[1]
            pts = [q.ul, q.ur, q.lr, q.ll]
            out.append('M' + 'L'.join(f'{p.x - x0:.2f} {p.y - y0:.2f}' for p in pts) + 'Z')
            pen = None
    if drawing.get('closePath'):
        out.append('Z')
    return ''.join(out)


page = pymupdf.open(PDF)[0]
drawings = page.get_drawings()
for out, ((x0, y0, x1, y1), fills) in DRAWINGS.items():
    box = pymupdf.Rect(x0, y0, x1, y1)
    paths = []
    for drawing in drawings:
        fill = hex_of(drawing.get('fill'))
        if fill in fills and box.contains(drawing['rect']):
            rule = ' fill-rule="evenodd"' if drawing.get('even_odd') else ''
            paths.append(f'<path fill="{fill}"{rule} d="{path_data(drawing, x0, y0)}"/>')
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {x1 - x0:g} {y1 - y0:g}">\n' + '\n'.join(paths) + '\n</svg>\n',
        encoding='utf8',
        newline='\n',
    )
    print(out, len(paths), 'paths')
