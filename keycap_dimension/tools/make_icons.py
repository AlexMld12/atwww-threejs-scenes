# Iconitele site-ului (favicon + webclip), generate din web/src/assets/switch-closed.svg
# -- acelasi switch inchis din preloader si de pe 404.
# Scrie fav.svg/fav.html (contur gros, colturi rotunjite: ramane lizibil la 16-32 px) si
# clip.svg/clip.html (contur subtire, fara colturi: iOS si Android isi pun singure masca).
# Rasterizarea PNG s-a facut cu Chrome headless (Page.captureScreenshot pe fundal
# transparent) la 16/32/64 si 180/192/512; favicon.ico = containerul ICO cu PNG-ul de 32.
# Rezultatele sunt in web/public/: favicon.svg, favicon.ico, apple-touch-icon.png,
# icon-192.png, icon-512.png, site.webmanifest.
import re, sys
src = open(r'C:/ATWWW/ATWWW Three.js scenes/keycap_dimension/web/src/assets/switch-closed.svg', encoding='utf8').read()
paths = ''.join(re.findall(r'<path[^>]*/>', src))
def icon(stroke, pad, radius, bg='#051b1c', col='#ffffff'):
    # viewBox original 73.11 84.78 753.78 826.41 -> patrat centrat
    x0, y0, w, h = 73.11, 84.78, 753.78, 826.41
    side = max(w, h) * (1 + 2 * pad)
    cx, cy = x0 + w / 2, y0 + h / 2
    vb = f'{cx - side/2:.2f} {cy - side/2:.2f} {side:.2f} {side:.2f}'
    r = side * radius
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
            f'<rect x="{cx - side/2:.2f}" y="{cy - side/2:.2f}" width="{side:.2f}" height="{side:.2f}" rx="{r:.2f}" fill="{bg}"/>'
            f'<g fill="none" stroke="{col}" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round">{paths}</g></svg>')
for name, stroke, pad, rad in [('fav', 34, 0.10, 0.22), ('clip', 14, 0.16, 0)]:
    s = icon(stroke, pad, rad)
    open(name + '.svg', 'w', encoding='utf8').write(s)
    open(name + '.html', 'w', encoding='utf8').write(
        '<html><body style="margin:0;background:transparent">' + s.replace('<svg ', '<svg width="100%" height="100%" style="display:block;position:fixed;inset:0" ') + '</body></html>')
