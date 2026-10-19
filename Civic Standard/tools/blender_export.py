"""Exports the hero assets from Civic_standard_Intro-Animation.blend (scene "02 • Civic Standard — Image Tube").

blender -b -y Civic_standard_Intro-Animation.blend --python tools/blender_export.py -- <out dir>

Writes logo.glb, painting-1..7.png (cover-cropped to the 0.72 panel), studio.hdr and view-curve.npy
(the scene's view transform + look, sampled per channel). tools/prepare_assets.py turns them into web/public/hero.
"""
import sys

import bpy
import numpy as np

out = sys.argv[sys.argv.index('--') + 1]
scene = bpy.data.scenes['02 • Civic Standard — Image Tube']
scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()

# Logo: modifiers applied, only its own rotation baked in (the rig is rebuilt in code).
source = bpy.data.objects['CT LOGO • Clean extruded Civic Standard']
mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
mesh.transform(source.matrix_basis)
mesh.materials.clear()
mesh.materials.append(bpy.data.materials.new('glass'))
logo = bpy.data.objects.new('logo', mesh)
scene.collection.objects.link(logo)
bpy.ops.object.select_all(action='DESELECT')
logo.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=f'{out}/logo.glb',
    use_selection=True,
    export_format='GLB',
    export_texcoords=False,
    export_materials='PLACEHOLDER',
    export_animations=False,
)

# Paintings: the material does a centred cover fit on a 0.72 × 1 panel; crop once instead.
PANEL_ASPECT = 0.72
for slot in range(1, 8):
    image = bpy.data.materials[f'CT • Painting {slot:02}'].node_tree.nodes[f'CT_SLOT_{slot:02}'].image
    w, h = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    if w / h > PANEL_ASPECT:
        cw = round(h * PANEL_ASPECT)
        px = px[:, (w - cw) // 2 : (w - cw) // 2 + cw]
    else:
        ch = round(w / PANEL_ASPECT)
        px = px[(h - ch) // 2 : (h - ch) // 2 + ch]
    crop = bpy.data.images.new(f'painting-{slot}', px.shape[1], px.shape[0])
    crop.pixels.foreach_set(px.ravel())
    crop.filepath_raw = f'{out}/painting-{slot}.png'
    crop.file_format = 'PNG'
    crop.save()

# Glass reflections: the world shows this HDR to glossy rays only.
with open(f'{out}/studio.hdr', 'wb') as f:
    f.write(bpy.data.images['studio_small_03_1k.hdr'].packed_file.data)

# View transform + look: no cross-channel mixing, so a 1D curve on a log2 domain is enough.
N, LOG2_MIN, LOG2_MAX = 256, -12.0, 1.0
linear = 2.0 ** np.linspace(LOG2_MIN, LOG2_MAX, N)
ramp = np.ones((1, N, 4), np.float32)
ramp[0, :, :3] = linear[:, None]
probe = bpy.data.images.new('curve', N, 1, float_buffer=True)
probe.colorspace_settings.name = 'Linear Rec.709'
probe.pixels.foreach_set(ramp.ravel())
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '16'
probe.save_render(f'{out}/curve.png', scene=scene)
result = bpy.data.images.load(f'{out}/curve.png')
result.colorspace_settings.name = 'Non-Color'
display = np.array(result.pixels[:], np.float32).reshape(N, 4)[:, 0]
np.save(f'{out}/view-curve.npy', np.stack([linear, display]))
