"""THE DETAILS cards: close-ups in the colleague's product studio (scene K7_armrests: its lights, world and materials),
through a perspective camera of our own. Transparent film; the card colour is set by the site. The .blend is never saved.

blender -b -y PRODUSE_STUDIO_FARA_BG.blend --python tools/blender_details.py -- <out dir>
then: board.png / corner.png → web/public/details/*.webp (quality 90)
"""
import sys

import bpy
import mathutils

out = sys.argv[sys.argv.index('--') + 1]

# Board detail: the seat boards' ends, in section. Frame corner: the galvanised armrest bend.
SHOTS = [
    {'name': 'board', 'loc': (-1.4, -0.62, 0.66), 'target': (-0.98, -0.08, 0.43)},
    {'name': 'corner', 'loc': (1.3, -0.82, 0.92), 'target': (0.98, -0.27, 0.64)},
]
LENS = 70
F_STOP = 5.6
SIZE = (760, 918)  # 2 × the 380 × 459 card
SAMPLES = 192  # as the catalogue renders

prefs = bpy.context.preferences.addons['cycles'].preferences
for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(device.type == kind for device in prefs.devices):
            break
    except TypeError:
        pass
for device in prefs.devices:
    device.use = True

scene = bpy.data.scenes['UF09_01_PACK_K7_armrests']
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.render.resolution_x, scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.use_nodes = False  # its compositor would write the catalogue layers

for shot in SHOTS:
    data = bpy.data.cameras.new(shot['name'])
    data.lens = LENS
    camera = bpy.data.objects.new(shot['name'], data)
    scene.collection.objects.link(camera)
    loc, target = mathutils.Vector(shot['loc']), mathutils.Vector(shot['target'])
    camera.location = loc
    camera.rotation_euler = (target - loc).to_track_quat('-Z', 'Y').to_euler()
    data.dof.use_dof = True
    data.dof.focus_distance = (target - loc).length
    data.dof.aperture_fstop = F_STOP
    scene.camera = camera
    scene.render.filepath = f"{out}/{shot['name']}.png"
    bpy.ops.render.render(write_still=True, scene=scene.name)
