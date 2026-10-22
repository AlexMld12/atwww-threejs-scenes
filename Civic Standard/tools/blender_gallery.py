"""The product page's gallery (Product CMS.pdf, THE BENCH: one wide picture, two tall ones): each product from the
colleague's studio, in the plaza (tools/blender_plaza.py), in its page's first colour. As the hero, without the
foliage and as two plates, sky and sun, plus each pixel's distance from the camera: three.js finds where the pixel is
and lays the leaves' live shadow on the sun's plate (scene/plaza/gallery.ts).

The SPEC SHEET's picture and the two cards under it (Plan a Full Row, Match the Square) are, in Figma, three crops of
one render: 'front' is that render, 'row' and 'square' its crops (the same camera, a narrower view shifted to them).

blender -b --factory-startup -y --python tools/blender_gallery.py -- <out dir> [ids…] [--views front,row,square]
→ <id>-<view>-sky.hdr, -sun.hdr, -distance.png (16 bit), <id>-gallery.json (the cameras)
"""
import json
import math
import runpy
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1 :]
only = None
if '--views' in args:
    at = args.index('--views')
    only = args[at + 1].split(',')
    del args[at : at + 2]
out = Path(args[0])
out.mkdir(parents=True, exist_ok=True)
TOOLS = Path(__file__).resolve().parent
STUDIO = Path(r'C:\ATWWW\Civic Standard\DEVELOPER_STUDIO_2026-10-20\DEVELOPER_STUDIO_2026-10-20')
catalogue = {p['id']: p for p in json.loads((STUDIO / 'catalog' / 'produse_shop.json').read_text(encoding='utf-8'))['products']}
PRODUCTS = args[1:] or list(catalogue)

# the plaza, built and set for rendering, nothing rendered
sys.argv = [sys.argv[0], '--', str(out), '--build-only']
plaza = runpy.run_path(str(TOOLS / 'blender_plaza.py'))
scene, sun, background, SKY = plaza['scene'], plaza['sun'], plaza['background'], plaza['SKY']
camera = scene.camera
srgb = plaza['srgb']

# Figma px (2× rendered); the wide one under the text, the two tall ones beneath it
VIEWS = {
    'wide': {'size': (1424, 801), 'fov': 28, 'towards': (0.5, -1, 0.3), 'fill': 0.8},
    'end': {'size': (708, 885), 'fov': 32, 'towards': (-0.25, -1, 0.42), 'fill': 0.92},
    'detail': {'size': (708, 885), 'fov': 34, 'towards': (0.22, -1, 0.1), 'fill': 1.0},
    # the fill across and up: Figma's bench takes 82 % of the width; a tall product stops at 74 % of the height
    'front': {'size': (1424, 801), 'fov': 46, 'towards': (0.4, -1, 0.2), 'fill': (0.82, 0.74), 'aim': 0.12},
    # crops of 'front' (u left → right, v top → bottom), measured: Figma lays the same image under all three
    'row': {'size': (708, 885), 'of': 'front', 'crop': ((8 + 608) / 3130, (716 + 608) / 3130, (7558 - 6890) / 2113, (8443 - 6890) / 2113)},
    'square': {'size': (708, 885), 'of': 'front', 'crop': ((724 + 2162) / 4379, (1432 + 2162) / 4379, (7558 - 6314) / 2956, (8443 - 6314) / 2956)},
}
# the front picture's own crop of that image, which the cards' crops are measured against, and the bench in it
# (Figma 180–1345 × 6945–7490): the crops are kept where they sit on the bench, so any product gets its own ends
FRONT_CROP = ((8 + 394) / 2280, (1432 + 394) / 2280, (6749 - 6279) / 1539, (7550 - 6279) / 1539)
FIGMA_BOX = ((180 - 8) / 1424, (1345 - 8) / 1424, (6945 - 6749) / 801, (7490 - 6749) / 801)
SCALE = 2
SAMPLES = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--samples=')), 128))
DISTANCE_MAX = 30.0  # metres: the 16-bit distance spans 0 → this

# the shop palette (components/configurator/content.ts); a galvanised product is shown sage, as Figma's render
PALETTE = {'Anthracite': '#383E42', 'Petrol': '#416772', 'Sage': '#7E9186', 'Warm White': '#F1ECE1', 'Accent Orange': '#F44611'}


def first_colour(product):
    name = product['current_finish']['name']
    return next((hex for key, hex in PALETTE.items() if key.lower().startswith(name.lower().split()[0])), PALETTE['Sage'])


# the distance from the camera, written raw: an emission override for the third render
distance = bpy.data.materials.new('distance')
distance.use_nodes = True
nt = distance.node_tree
nt.nodes.clear()
geometry = nt.nodes.new('ShaderNodeNewGeometry')
camera_at = nt.nodes.new('ShaderNodeCombineXYZ')
offset = nt.nodes.new('ShaderNodeVectorMath')
offset.operation = 'SUBTRACT'
length = nt.nodes.new('ShaderNodeVectorMath')
length.operation = 'LENGTH'
scale = nt.nodes.new('ShaderNodeMath')
scale.operation = 'DIVIDE'
scale.inputs[1].default_value = DISTANCE_MAX
emission = nt.nodes.new('ShaderNodeEmission')
material_out = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(geometry.outputs['Position'], offset.inputs[0])
nt.links.new(camera_at.outputs[0], offset.inputs[1])
nt.links.new(offset.outputs[0], length.inputs[0])
nt.links.new(length.outputs['Value'], scale.inputs[0])
nt.links.new(scale.outputs[0], emission.inputs['Color'])
nt.links.new(emission.outputs[0], material_out.inputs['Surface'])


def add_product(pid):
    with bpy.data.libraries.load(str(STUDIO / 'PRODUSE_STUDIO_FARA_BG.blend')) as (source, target):
        target.scenes = [f'UF09_01_PACK_{pid}']
        target.materials = ['UF_MAT_steel_painted']
    painted = target.materials[0]
    objects = [o for o in target.scenes[0].objects if o.type in ('MESH', 'EMPTY') and 'CATCHER' not in o.name]
    for obj in objects:
        scene.collection.objects.link(obj)
    colour = srgb(first_colour(catalogue[pid]))
    has_paint = any(s.material and s.material.name.startswith('UF_MAT_steel_painted') for o in objects for s in o.material_slots)
    for obj in objects:
        for slot in obj.material_slots:
            name = slot.material.name if slot.material else ''
            # the palette paints the frame; a galvanised product (K7) gets the studio's powder coat for it
            if name.startswith('UF_MAT_steel_galvanised') and not has_paint:
                slot.material = painted
                name = painted.name
            if name.startswith('UF_MAT_steel_painted'):
                surface = next(n for n in slot.material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                for link in list(surface.inputs['Base Color'].links):
                    slot.material.node_tree.links.remove(link)
                surface.inputs['Base Color'].default_value = colour
    corners = [o.matrix_world @ Vector(c) for o in objects if o.type == 'MESH' for c in o.bound_box]
    low = Vector([min(c[i] for c in corners) for i in range(3)])
    high = Vector([max(c[i] for c in corners) for i in range(3)])
    return objects, low, high


def box_corners(low, high):
    return [Vector((x, y, z)) for x in (low.x, high.x) for y in (low.y, high.y) for z in (low.z, high.z)]


def frame(view, target, region, size):
    """Places the camera along the view's direction, as near as lets `region` fill `fill` of the picture."""
    camera.data.sensor_fit = 'VERTICAL'
    camera.data.sensor_height = 24
    camera.data.lens = 12 / math.tan(math.radians(view['fov']) / 2)
    scene.render.resolution_x, scene.render.resolution_y = size
    towards = Vector(view['towards']).normalized()
    near, far = 0.3, 40.0
    for _ in range(40):
        d = (near + far) / 2
        position = target + towards * d
        camera.matrix_world = Matrix.Translation(position) @ (-towards).to_track_quat('-Z', 'Y').to_matrix().to_4x4()
        bpy.context.view_layer.update()
        points = [world_to_camera_view(scene, camera, c) for c in region]
        fill_x, fill_y = view['fill'] if isinstance(view['fill'], tuple) else (view['fill'],) * 2
        across = max(p.x for p in points) - min(p.x for p in points)
        up = max(p.y for p in points) - min(p.y for p in points)
        if across > fill_x or up > fill_y:
            near = d
        else:
            far = d
    camera.data.shift_x = camera.data.shift_y = 0.0
    # the region's box in the picture (u, v from the top left), for the crops
    points = [world_to_camera_view(scene, camera, c) for c in region]
    box = (min(p.x for p in points), max(p.x for p in points), 1 - max(p.y for p in points), 1 - min(p.y for p in points))
    return [list(row) for row in camera.matrix_world], box


def crop(view, front):
    """The front camera kept, narrowed and shifted to the crop; its centre in tan units of the view (for the shader).
    The crop sits on this product's box as Figma's sits on the bench: its middle at the same place in the box, its
    height the same share of the box's."""
    fu0, fu1, fv0, fv1 = FRONT_CROP
    u0, u1, v0, v1 = view['crop']
    # the crop within Figma's front picture, then in parts of its bench's box
    u0, u1 = (u0 - fu0) / (fu1 - fu0), (u1 - fu0) / (fu1 - fu0)
    v0, v1 = (v0 - fv0) / (fv1 - fv0), (v1 - fv0) / (fv1 - fv0)
    bu0, bu1, bv0, bv1 = FIGMA_BOX
    at_u = ((u0 + u1) / 2 - bu0) / (bu1 - bu0)
    at_v = ((v0 + v1) / 2 - bv0) / (bv1 - bv0)
    share = (v1 - v0) / (bv1 - bv0)
    # on this product's box
    pu0, pu1, pv0, pv1 = front['box']
    mid_u, mid_v = pu0 + at_u * (pu1 - pu0), pv0 + at_v * (pv1 - pv0)
    span_v = share * (pv1 - pv0)
    tan_y = math.tan(math.radians(front['vFov']) / 2)
    tan_x = tan_y * front['size'][0] / front['size'][1]
    half_y = span_v * tan_y
    centre = ((2 * mid_u - 1) * tan_x, (1 - 2 * mid_v) * tan_y)
    w, h = view['size']
    camera.data.sensor_fit = 'VERTICAL'
    camera.data.lens = 12 / half_y
    scene.render.resolution_x, scene.render.resolution_y = w * SCALE, h * SCALE
    # Blender's shift is in parts of the picture's larger side
    larger = 2 * half_y * max(w, h) / h
    camera.data.shift_x, camera.data.shift_y = centre[0] / larger, centre[1] / larger
    camera.matrix_world = Matrix(front['matrix'])
    bpy.context.view_layer.update()
    # check: the ray through the centre lands in the middle of the picture
    look = camera.matrix_world.to_3x3() @ Vector((centre[0], centre[1], -1.0))
    middle = world_to_camera_view(scene, camera, camera.matrix_world.translation + look * 5)
    print('CROP', view.get('name'), round(middle.x, 4), round(middle.y, 4))
    return math.degrees(2 * math.atan(half_y)), centre


def render(path, with_sun, with_sky, override=None):
    sun.hide_render = not with_sun
    background.inputs['Strength'].default_value = SKY['strength'] if with_sky else 0.0
    bpy.context.view_layer.material_override = override
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


settings = scene.render.image_settings
for pid in PRODUCTS:
    objects, low, high = add_product(pid)
    middle = (low + high) / 2
    length = high.x - low.x
    views = {}
    for name, view in VIEWS.items():
        if only and name not in only:
            continue
        size = (view['size'][0] * SCALE, view['size'][1] * SCALE)
        centre = None
        if 'of' in view:
            front = views[view['of']]
            vfov, centre = crop({**view, 'name': name}, front)
            matrix = front['matrix']
        elif name in ('wide', 'front'):
            # aimed above the middle by a share of the height: Figma's front picture has the product low in it
            target, region = middle + Vector((0, 0, view.get('aim', 0) * (high.z - low.z))), box_corners(low, high)
        elif name == 'end':
            # the left end, up to half its length (a short product: all of it)
            reach = min(length, max(0.5 * length, 0.9))
            part_high = Vector((low.x + reach, high.y, high.z))
            target, region = (low + part_high) / 2, box_corners(low, part_high)
        else:
            # close on the front edge, a little right of the middle, at two thirds of the height
            target = Vector((middle.x + 0.18 * length, low.y, low.z + 0.62 * (high.z - low.z)))
            half = Vector((0.32, 0.05, 0.32))
            region = box_corners(target - half, target + half)
        box = None
        if 'of' not in view:
            matrix, box = frame(view, target, region, size)
            vfov = view['fov']
        settings.file_format = 'HDR'
        scene.cycles.samples = SAMPLES
        scene.cycles.use_denoising = True
        scene.cycles.filter_width = 1.5
        scene.render.dither_intensity = 1
        render(out / f'{pid}-{name}-sky.hdr', False, True)
        render(out / f'{pid}-{name}-sun.hdr', True, False)
        # the distance: one sample, no filter (a pixel is one place), 16-bit (sRGB-encoded: tools undo it)
        camera_at.inputs[0].default_value, camera_at.inputs[1].default_value, camera_at.inputs[2].default_value = (
            camera.matrix_world.translation
        )
        settings.file_format = 'PNG'
        settings.color_mode = 'BW'
        settings.color_depth = '16'
        scene.cycles.samples = 1
        scene.cycles.use_denoising = False
        scene.cycles.filter_width = 0.01
        scene.render.dither_intensity = 0
        render(out / f'{pid}-{name}-distance.png', False, False, distance)
        settings.color_mode = 'RGB'
        views[name] = {'matrix': matrix, 'vFov': vfov, 'size': view['size'], 'box': box}
        if centre:
            views[name]['centre'] = [round(c, 6) for c in centre]
        print('RENDERED', pid, name)
    for view in views.values():
        view.pop('box')
    (out / f'{pid}-gallery.json').write_text(json.dumps({'id': pid, 'distanceMax': DISTANCE_MAX, 'views': views}, indent=1), newline='\n')
    for obj in objects:
        bpy.data.objects.remove(obj)
print('DONE')
