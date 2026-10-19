"""Renders the leaf-lit wall of the hero (Light Wrangler gobo) in two layers for web/public/hero.

blender -b -y Civic_standard_Intro-Animation.blend --python tools/blender_backdrop.py -- <gobo texture> <out dir>

The gobo texture comes from Light Wrangler's cache (it is licensed for renders only: never commit it). Only the wall
and its gobo light are rendered, over 1.2 × the camera frame, twice: with the leaves and with a blank gobo. The site
multiplies the light (`backdrop-light.png`, linear / GAIN, sRGB-encoded) by the leaves' shadow
(`backdrop-leaves.png`, lit / unlit remapped from LEAVES_MIN…1), so the shadow can sway while the light stays put.
"""
import sys

import bpy
import numpy as np

gobo_texture, out = sys.argv[sys.argv.index('--') + 1 :]
COVER = 1.2
GAIN = 1.2
LEAVES_MIN = 0.8
WIDTH, HEIGHT = 2880, 1700

# The gobo as it was rendered for Figma (30 × 25 light, centred), made sharper and softer on the hot spot.
GOBO = {'size': 30.0, 'size_y': 25.0, 'spread': 0.012, 'energy': 700.0}
# The texture ends inside a wide screen: its shadow fades in / out over these columns (share of the render's width)
# instead of stopping in a straight line. Scaling it to the wall or mirroring it past its edge looked worse.
FADE_LEFT = (0.085, 0.13)
FADE_RIGHT = (0.70, 0.93)

scene = bpy.data.scenes['02 • Civic Standard — Image Tube']
scene.frame_set(1)

palm = bpy.data.images['overlapping_palm_fronds_1_still_gobo_texture.webp']
palm.filepath = gobo_texture
palm.reload()

projector = bpy.data.objects['CT LW • Foliage projector']
projector.location.x = 0
projector.location.z = 0
for key, value in GOBO.items():
    setattr(projector.data, key, value)

tube = scene.view_layers[0].layer_collection.children['CT • Image tube animation']
tube.children['CT • 02 • Orbiting paintings'].exclude = True
tube.children['CT • 03 • Civic Standard extruded logo'].exclude = True

scene.camera.data.lens /= COVER
scene.render.resolution_x = round(WIDTH * COVER)
scene.render.resolution_y = round(HEIGHT * COVER)
scene.render.resolution_percentage = 100
scene.cycles.samples = 512
scene.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type != 'CPU'
scene.cycles.device = 'GPU'
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '32'


def render(name):
    scene.render.filepath = f'{out}/{name}.exr'
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(f'{out}/{name}.exr')
    return np.array(image.pixels[:], np.float32).reshape(image.size[1], image.size[0], 4)[..., :3]


def save_png(name, rgb):
    rgba = np.concatenate([rgb, np.ones_like(rgb[..., :1])], axis=2)
    image = bpy.data.images.new(name, rgb.shape[1], rgb.shape[0])
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = f'{out}/{name}.png'
    image.file_format = 'PNG'
    image.save()


lit = render('lit')
blank = bpy.data.images.new('blank gobo', 8, 8)
blank.pixels.foreach_set(np.ones(8 * 8 * 4, np.float32))
for group in bpy.data.node_groups:
    for node in group.nodes:
        if getattr(node, 'image', None) == palm:
            node.image = blank
light = render('light')

v = np.clip(light / GAIN, 0, 1)
save_png('backdrop-light', np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055))
shadow = np.clip(lit.mean(2) / np.maximum(light.mean(2), 1e-6), LEAVES_MIN, 1)
x = np.linspace(0, 1, shadow.shape[1])
fade_in = np.clip((x - FADE_LEFT[0]) / (FADE_LEFT[1] - FADE_LEFT[0]), 0, 1)
fade_out = np.clip((x - FADE_RIGHT[0]) / (FADE_RIGHT[1] - FADE_RIGHT[0]), 0, 1)
keep = fade_in**2 * (3 - 2 * fade_in) * (1 - fade_out**2 * (3 - 2 * fade_out))
shadow = 1 - (1 - shadow) * keep
leaves = (shadow - LEAVES_MIN) / (1 - LEAVES_MIN)
save_png('backdrop-leaves', np.repeat(leaves[..., None], 3, axis=2))
print('leaves shadow range', float(shadow.min()), float(np.percentile(shadow, 1)), 'light max', float(light.max()))
