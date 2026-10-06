"""Extrage din macheta Figma asset-urile GALERIEI (secțiunea 5) și ale lui ANCIENT WISDOM (6).

Galeria are trei rânduri de 420 (y 4259 → 5519), plăci de 705 × 400 la 10 px distanță.
Rândul 2 e decalat: placa din mijloc e VIDEOCLIPUL, cele laterale ies din cadru.

Ce iese în web/public/images/ și web/public/video/:
  gallery-1..6.webp   plăcile, în ordinea: r1 stânga, r1 dreapta, r2 stânga, r2 dreapta,
                      r3 stânga, r3 dreapta. 1410 × 800 (2× placa).
                      · cele care stau întregi pe pagină se RANDEAZĂ din PDF cu clip pe placă
                        → decupajul și rotația sunt exact ale Figma (r3 stânga e o imagine
                        rotită −90° în PDF; randarea o rezolvă fără să ghicim sensul);
                      · cele două laterale din r2 ies din pagină (x < 0, x > 1440), deci nu
                        se pot randa întregi: se decupează din imaginea originală, pe
                        fâșia verticală pe care o arată placa în machetă.
  video-poster.webp   primul cadru al videoclipului (până pornește video-ul)
  video/placeholder.mp4  ⚠️ PROVIZORIU — userul trimite videoclipul real. Generat din
                      imaginea plăcii din mijloc (xref 80, raftul cu produse): o mișcare
                      lentă de cameră (zoom 1 → 1.08 → 1, 8 s, 30 fps), dus-întors, deci
                      bucla nu are cusătură.

Rulare:  python tools/extract_gallery.py     (pymupdf, pillow; ffmpeg în PATH sau WinGet)
"""
import shutil
import subprocess
from io import BytesIO
from pathlib import Path
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "reference" / "Homepage.pdf"
IMG = ROOT / "web" / "public" / "images"
VID = ROOT / "web" / "public" / "video"
S = 2

doc = pymupdf.open(PDF)
page = doc[0]


def save(im, name, quality=82):
    out = IMG / name
    im.save(out, "WEBP", quality=quality, method=6)
    print(f"{name:20s} {im.width}x{im.height}  {out.stat().st_size // 1024} KB")


def xref_image(x):
    info = doc.extract_image(x)
    pix = pymupdf.Pixmap(doc, x)
    if info.get("smask"):
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, info["smask"]))
    return Image.open(BytesIO(pix.tobytes("png"))).convert("RGB")   # vezi extract_figma.py


def render(x0, y0, x1, y1):
    pix = page.get_pixmap(matrix=pymupdf.Matrix(S, S), clip=pymupdf.Rect(x0, y0, x1, y1))
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def strip(x, img_y0, img_y1, tile_y0, tile_y1):
    """Fâșia din imaginea originală pe care o arată placa (imaginea e pusă pe toată lățimea
    plăcii, deci se taie doar pe verticală)."""
    im = xref_image(x)
    h = img_y1 - img_y0
    a = round((tile_y0 - img_y0) / h * im.height)
    b = round((tile_y1 - img_y0) / h * im.height)
    return im.crop((0, a, im.width, b)).resize((705 * S, 400 * S), Image.LANCZOS)


IMG.mkdir(parents=True, exist_ok=True)
save(render(10, 4269, 715, 4669), "gallery-1.webp")
save(render(725, 4269, 1430, 4669), "gallery-2.webp")
save(strip(62, 4419, 5359, 4689, 5089), "gallery-3.webp")        # r2 stânga, xref 62
save(strip(86, 4651.7, 5126.3, 4689, 5089), "gallery-4.webp")    # r2 dreapta, xref 86
save(render(10, 5109, 715, 5509), "gallery-5.webp")
save(render(725, 5109, 1430, 5509), "gallery-6.webp")

# ---- videoclipul provizoriu ----
src = xref_image(80)                                              # 4000 × 2666
VID.mkdir(parents=True, exist_ok=True)
tmp = VID / "_src.png"
src.save(tmp)
ff = shutil.which("ffmpeg") or str(next(Path.home().glob(
    "AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/*/bin/ffmpeg.exe")))
FRAMES = 240                                                      # 8 s × 30 fps
vf = (f"scale=3840:-2,zoompan=z='1+0.08*(1-cos(2*PI*on/{FRAMES}))/2'"
      f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={FRAMES}:s=1920x1080:fps=30,"
      "format=yuv420p")
out = VID / "placeholder.mp4"
subprocess.run([ff, "-y", "-loglevel", "error", "-loop", "1", "-i", str(tmp), "-vf", vf,
                "-frames:v", str(FRAMES), "-c:v", "libx264", "-preset", "slow", "-crf", "24",
                "-movflags", "+faststart", "-an", str(out)], check=True)
tmp.unlink()
print(f"placeholder.mp4      1920x1080  {out.stat().st_size // 1024} KB")
poster = src.resize((1920, round(1920 * src.height / src.width)), Image.LANCZOS)
top = (poster.height - 1080) // 2
save(poster.crop((0, top, 1920, top + 1080)), "video-poster.webp", quality=78)
