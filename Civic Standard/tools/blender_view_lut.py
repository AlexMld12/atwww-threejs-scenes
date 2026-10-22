"""The product studio's view transform (AgX, look High Contrast) as a 3D LUT: scene-linear Rec.709 in, display sRGB out.
AgX mixes the channels, so it cannot be a curve per channel as the hero's (tools/blender_export.py). The input is
log2-shaped over AgX's own range (0.18 · 2^-10 … 0.18 · 2^6.5); Blender's colour management applies the transform.

blender -b -y PRODUSE_STUDIO_FARA_BG.blend --python tools/blender_view_lut.py -- <out png>
The PNG: N tiles of N × N side by side (red across a tile, green down, blue from tile to tile), 16-bit.
"""
import math
import sys

import bpy
import numpy as np

out = sys.argv[sys.argv.index('--') + 1]
N = 48
LOG2_MIN = math.log2(0.18) - 10
LOG2_MAX = math.log2(0.18) + 6.5

scene = bpy.data.scenes['UF09_01_PACK_K7_armrests']
print('VIEW', scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure)

steps = 2 ** (LOG2_MIN + (LOG2_MAX - LOG2_MIN) * np.arange(N) / (N - 1))
r = np.tile(steps, (N, N, 1))  # [b, g, r]
g = np.tile(steps[None, :, None], (N, 1, N))
b = np.tile(steps[:, None, None], (1, N, N))
# image rows run bottom-up in Blender: row = g, column = b * N + r
rgba = np.zeros((N, N * N, 4), np.float32)
for k in range(N):
    rgba[:, k * N : (k + 1) * N, 0] = r[k]
    rgba[:, k * N : (k + 1) * N, 1] = g[k]
    rgba[:, k * N : (k + 1) * N, 2] = b[k]
rgba[..., 3] = 1

image = bpy.data.images.new('view-lut', N * N, N, float_buffer=True, alpha=False)
image.colorspace_settings.name = 'Linear Rec.709'
image.pixels.foreach_set(rgba.ravel())
settings = scene.render.image_settings
settings.file_format = 'PNG'
settings.color_mode = 'RGB'
settings.color_depth = '16'
image.save_render(out, scene=scene)
print('LUT', out, N, LOG2_MIN, LOG2_MAX)
