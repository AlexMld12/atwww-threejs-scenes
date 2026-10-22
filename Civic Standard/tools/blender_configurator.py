"""The configurator's products, from the colleague's product studio (PRODUSE_STUDIO_FARA_BG.blend, one scene each):

  <id>.glb          the parts joined, one material per finish (named by its key); uv = the AO atlas; the parts'
                    metric coordinates (uf_material_coord) as the _COORD attribute, for the finish detail textures
  <id>-ao.png       ambient occlusion baked into that atlas (the shadow catcher included: contact with the ground)
  <id>-shadow.png   the studio's shadow on the ground, seen from above (alpha only)
  <id>.json         the scene's camera and four area lights, the bounds, the shadow's square, the default colours
  finish-*.png      the recycled plastic and galvanised zinc, baked flat (0.5 m square): colour and roughness

blender -b -y PRODUSE_STUDIO_FARA_BG.blend --python tools/blender_configurator.py -- <out dir> [ids…]
then tools/prepare_configurator.py. The .blend is never saved.
"""
import json
import math
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
AO_SIZE = 1024
AO_SAMPLES = 256
AO_DISTANCE = 0.25  # m: boards on the frame, the frame on the ground
SHADOW_PX_PER_M = 256
SHADOW_MARGIN = 0.6  # m around the product's footprint: the studio shadow is soft and long
SHADOW_SAMPLES = 256
TILE_M = 0.5
TILE_PX = 1024

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


def override(scene, obj, objects=None):
    objects = objects or [obj]
    return bpy.context.temp_override(
        scene=scene,
        view_layer=scene.view_layers[0],
        active_object=obj,
        object=obj,
        selected_objects=objects,
        selected_editable_objects=objects,
        edit_object=obj,
    )


def matrix_list(m):
    return [[round(v, 6) for v in row] for row in m]


def principled(name, colour, roughness, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*colour[:3], 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


# Each finish as the export carries it (three.js rebuilds the look from the key; these are only sane defaults).
FINISH = {
    'steel_painted': (None, 0.485, 0.0),
    'steel_galvanised': ((0.39, 0.424, 0.43), 0.40, 1.0),
    'steel_stainless': ((0.479, 0.521, 0.546), 0.30, 1.0),
    'plastic_recycled': ((0.067, 0.04, 0.032), 0.57, 0.0),
    'bucket': ((0.024, 0.024, 0.024), 0.55, 0.0),
    'ring_lacquer': (None, 0.35, 0.0),
    'soil': ((0.035, 0.024, 0.017), 0.95, 0.0),
}


def finish_material(obj, slot_material, cache):
    key = slot_material.name.removeprefix('UF_MAT_')
    colour, roughness, metallic = FINISH[key]
    own = obj.get('uf_color')
    if colour is None:
        colour = tuple(own) if own is not None else (0.0395, 0.0482, 0.0545)
    name = key if key != 'ring_lacquer' else f"ring_{obj.get('uf_stream', obj.name[-1])}"
    if key == 'bucket' and own is not None:
        colour = tuple(own)
    if name not in cache:
        cache[name] = principled(name, colour, roughness, metallic)
    return cache[name], key, colour


def hex_of(linear):
    def encode(c):
        c = max(0.0, min(1.0, c))
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

    return '#' + ''.join(f'{round(encode(c) * 255):02x}' for c in linear[:3])


def export_product(pid):
    scene = bpy.data.scenes[f'UF09_01_PACK_{pid}']
    scene.frame_set(1)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU'
    scene.use_nodes = False  # its compositor writes the catalogue layers
    parts = [o for o in scene.objects if o.type == 'MESH' and 'CATCHER' not in o.name]
    catcher = next(o for o in scene.objects if 'CATCHER' in o.name)
    colours = {}
    materials = {}

    copies = []
    for part in parts:
        copy = part.copy()
        copy.data = part.data.copy()
        scene.collection.objects.link(copy)
        copy.parent = None
        copy.matrix_world = part.matrix_world
        for slot in copy.material_slots:
            mat, key, colour = finish_material(part, slot.material, materials)
            slot.link = 'OBJECT'
            slot.material = mat
            colours.setdefault(mat.name, hex_of(colour))
        coord = copy.data.attributes.get('uf_material_coord')
        if coord:
            coord.name = '_COORD'
        part.hide_render = True
        copies.append(copy)

    joined = copies[0]
    with override(scene, joined, copies):
        bpy.ops.object.join()
    joined.name = pid
    mesh = joined.data
    for attr in [a.name for a in mesh.attributes if a.name not in ('_COORD', 'position', 'sharp_edge', 'sharp_face', 'custom_normal', 'material_index')]:
        if not mesh.attributes[attr].is_internal and attr not in [uv.name for uv in mesh.uv_layers]:
            mesh.attributes.remove(mesh.attributes[attr])
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.uv_layers.new(name='AO')

    # edit-mode operators only run in the file's own active scene (no window in background)
    home = bpy.context.scene
    # (the file's active scene may be this product's own: K6_1900)
    visiting = home is not scene
    if visiting:
        home.collection.objects.link(joined)
    bpy.context.view_layer.objects.active = joined
    joined.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=0.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    if visiting:
        home.collection.objects.unlink(joined)

    # AO into the atlas, every material writing into one image
    ao = bpy.data.images.new(f'{pid}-ao', AO_SIZE, AO_SIZE, float_buffer=True)
    ao.colorspace_settings.name = 'Non-Color'
    for slot in joined.material_slots:
        nodes = slot.material.node_tree.nodes
        node = nodes.new('ShaderNodeTexImage')
        node.image = ao
        nodes.active = node
    scene.cycles.samples = AO_SAMPLES
    scene.world.light_settings.distance = AO_DISTANCE
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    with override(scene, joined):
        bpy.ops.object.bake(type='AO')
    ao.filepath_raw = str(out / f'{pid}-ao.png')
    ao.file_format = 'PNG'
    ao.save()

    # the bounds, in Blender's z-up metres
    corners = [joined.matrix_world @ Vector(c) for c in joined.bound_box]
    lo = [min(c[i] for c in corners) for i in range(3)]
    hi = [max(c[i] for c in corners) for i in range(3)]

    # the ground shadow from above: the product casts it but is not seen
    joined.visible_camera = False
    joined.visible_glossy = False
    joined.visible_transmission = False
    joined.visible_diffuse = False
    centre = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0))
    size = max(hi[0] - lo[0], hi[1] - lo[1]) + 2 * SHADOW_MARGIN
    cam_data = bpy.data.cameras.new(f'{pid}-top')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size
    top = bpy.data.objects.new(f'{pid}-top', cam_data)
    scene.collection.objects.link(top)
    top.matrix_world = Matrix.Translation(centre + Vector((0, 0, 10)))
    catalogue_camera = scene.camera
    scene.camera = top
    pixels = round(size * SHADOW_PX_PER_M / 8) * 8
    scene.render.resolution_x = scene.render.resolution_y = pixels
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.cycles.samples = SHADOW_SAMPLES
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'
    scene.render.filepath = str(out / f'{pid}-shadow.png')
    bpy.ops.render.render(write_still=True, scene=scene.name)
    scene.camera = catalogue_camera
    joined.visible_camera = joined.visible_glossy = joined.visible_transmission = joined.visible_diffuse = True

    # the GLB: the joined mesh only, no images (three.js builds the finishes)
    for slot in joined.material_slots:
        nodes = slot.material.node_tree.nodes
        for node in [n for n in nodes if n.type == 'TEX_IMAGE']:
            nodes.remove(node)
    home = bpy.context.scene
    # (the file's active scene may be this product's own: K6_1900)
    visiting = home is not scene
    if visiting:
        home.collection.objects.link(joined)
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj == joined)
    bpy.ops.export_scene.gltf(
        filepath=str(out / f'{pid}.glb'),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_attributes=True,
        export_materials='EXPORT',
        export_image_format='NONE',
        export_cameras=False,
        export_lights=False,
    )
    if visiting:
        home.collection.objects.unlink(joined)

    for mat in materials.values():
        mat.name = f'{pid}:{mat.name}'  # the next product's finishes take the plain names

    lights = []
    for light in [o for o in scene.objects if o.type == 'LIGHT']:
        d = light.data
        lights.append({
            'name': light.name.rsplit('_', 1)[-1],
            'matrix': matrix_list(light.matrix_world),
            'size': [d.size, d.size_y if d.shape in ('RECTANGLE', 'ELLIPSE') else d.size],
            'power': d.energy,
            'color': list(d.color),
            'spread': d.spread,
        })
    camera = scene.camera
    meta = {
        'id': pid,
        'camera': {'matrix': matrix_list(camera.matrix_world), 'orthoScale': camera.data.ortho_scale},
        'lights': lights,
        'world': list(scene.world.node_tree.nodes['Background'].inputs['Color'].default_value)[:3]
        + [scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value],
        'bounds': [lo, hi],
        'shadow': {'centre': [centre.x, centre.y], 'size': size},
        'colours': colours,
        'exposure': scene.view_settings.exposure,
    }
    (out / f'{pid}.json').write_text(json.dumps(meta, indent=1))
    print('DONE', pid, round(size, 2), pixels)


def bake_finish(scene, material_name, key):
    """The finish on a flat 0.5 m square, its metric coordinates = its position (z = 0)."""
    h = TILE_M / 2
    mesh = bpy.data.meshes.new(f'finish-{key}')
    mesh.from_pydata([(-h, -h, -50), (h, -h, -50), (h, h, -50), (-h, h, -50)], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name='UVMap')
    for loop, corner in zip(mesh.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[loop.index].uv = corner
    plane = bpy.data.objects.new(f'finish-{key}', mesh)
    scene.collection.objects.link(plane)
    coord = plane.data.attributes.new('uf_material_coord', 'FLOAT_VECTOR', 'POINT')
    for i, v in enumerate(plane.data.vertices):
        coord.data[i].vector = (v.co.x + h, v.co.y + h, 0)
    side = plane.data.attributes.new('uf_extrusion_side', 'FLOAT', 'CORNER')
    for item in side.data:
        item.value = 1.0  # a moulded face, not a cut end
    material = bpy.data.materials[material_name].copy()
    plane.data.materials.append(material)
    surface = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    metallic = surface.inputs['Metallic'].default_value
    for kind, bake_type in (('colour', 'DIFFUSE'), ('roughness', 'ROUGHNESS')):
        image = bpy.data.images.new(f'finish-{key}-{kind}', TILE_PX, TILE_PX, float_buffer=True)
        if kind == 'roughness':
            image.colorspace_settings.name = 'Non-Color'
        # a metal has no diffuse colour: its base colour is baked as if it were not one
        surface.inputs['Metallic'].default_value = 0.0 if kind == 'colour' else metallic
        node = material.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        material.node_tree.nodes.active = node
        if bake_type == 'DIFFUSE':
            scene.render.bake.use_pass_direct = False
            scene.render.bake.use_pass_indirect = False
            scene.render.bake.use_pass_color = True
        scene.cycles.samples = 16
        scene.render.bake.margin = 0
        with override(scene, plane):
            bpy.ops.object.bake(type=bake_type)
        image.filepath_raw = str(out / f'finish-{key}-{kind}.png')
        image.file_format = 'PNG'
        image.save()
    print('FINISH', key)


for pid in PRODUCTS:
    export_product(pid)

finish_scene = bpy.data.scenes['UF09_01_PACK_K7_armrests']
bake_finish(finish_scene, 'UF_MAT_plastic_recycled', 'plastic')
bake_finish(finish_scene, 'UF_MAT_steel_galvanised', 'zinc')
