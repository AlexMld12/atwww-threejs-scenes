"""What the products' metal reflects: each studio seen from the product's middle, without the product, as an
equirectangular HDR. In Cycles the shadow catcher is a real grey floor to reflected rays, lit by the four area
lights; those lights stay out of the picture (three.js draws them as RectAreaLights, they would count twice).

blender -b -y PRODUSE_STUDIO_FARA_BG.blend --python tools/blender_configurator_env.py -- <out dir> [ids…]
→ <id>-env.hdr (256 × 128)
"""
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1 :]
out = Path(args[0])
out.mkdir(parents=True, exist_ok=True)
PRODUCTS = args[1:] or [
    'K7_armrests', 'K7_noArmrests', 'K6_1400', 'K5_1400', 'K4_1400', 'G2_std', 'G6_std', 'G7_std', 'G8_std', 'G3_std',
    'K3_Q600', 'K3_R900', 'G1_std', 'K2_single',
    'K1_Q700', 'K1_Q950', 'K1_R1500',
]
SIZE = (256, 128)
SAMPLES = 512

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

for pid in PRODUCTS:
    scene = bpy.data.scenes[f'UF09_01_PACK_{pid}']
    scene.frame_set(1)
    scene.cycles.device = 'GPU'
    scene.use_nodes = False
    parts = [o for o in scene.objects if o.type == 'MESH' and 'CATCHER' not in o.name]
    catcher = next(o for o in scene.objects if 'CATCHER' in o.name)
    corners = [o.matrix_world @ Vector(c) for o in parts for c in o.bound_box]
    centre = Vector([(min(c[i] for c in corners) + max(c[i] for c in corners)) / 2 for i in range(3)])
    for part in parts:
        part.hide_render = True
    catcher.is_shadow_catcher = False

    data = bpy.data.cameras.new(f'{pid}-env')
    data.type = 'PANO'
    data.panorama_type = 'EQUIRECTANGULAR'
    camera = bpy.data.objects.new(f'{pid}-env', data)
    scene.collection.objects.link(camera)
    # looking along +Y with z up: three's equirect has −Z at its centre, which is Blender's +Y
    camera.matrix_world = Matrix.Translation(centre) @ Matrix.Rotation(1.5707963, 4, 'X')
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    settings = scene.render.image_settings
    settings.file_format = 'HDR'  # float: scene-linear, no view transform
    scene.render.filepath = str(out / f'{pid}-env.hdr')
    bpy.ops.render.render(write_still=True, scene=scene.name)
    print('ENV', pid)
