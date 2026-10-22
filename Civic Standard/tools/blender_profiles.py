"""The SPECIFICATIONS drawing (Product CMS.pdf, 719–952 × 5919–6216): each product in line, orthographic, as Figma
draws the bench from its left end. Freestyle draws the outlines and the creases, no faces; a bin or a planter is
drawn from the front, where its slats show (its end is a plain panel).
--plan: the configurator's technical drawing (Configurator.pdf, 30–331 × 560–716): from above, the front and the
right end, laid out as Figma's bench (0.1044 px a millimetre), any product fitted to the same box.

blender -b --factory-startup -y --python tools/blender_profiles.py -- <out dir> [ids…] [--plan]
→ <id>-profile.png (black lines on transparent, PX_PER_MM), <id>-profile.json (the drawing's size in mm);
  with --plan <id>-plan-top|front|side.png and <id>-plan.json
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1 :]
out = Path(args[0])
out.mkdir(parents=True, exist_ok=True)
STUDIO = Path(r'C:\ATWWW\Civic Standard\DEVELOPER_STUDIO_2026-10-20\DEVELOPER_STUDIO_2026-10-20')
catalogue = {p['id']: p for p in json.loads((STUDIO / 'catalog' / 'produse_shop.json').read_text(encoding='utf-8'))['products']}
PLAN = '--plan' in args
args = [a for a in args if a != '--plan']
PRODUCTS = args[1:] or list(catalogue)
FRONT_VIEW = ('Litter and Recycling Bins', 'Planters')
PX_PER_MM = 2.0
# Figma's bench: 297 px for its 755 mm, a line of about 1.2 px; the page fits other products in the same box
FIGMA_SCALE = 297 / 755
BOX = (690, 297)
LINE_FIGMA_PX = 1.2
# the plan: the front 208.8 px for the bench's 2 m; the views 31.4 px apart across, 19 px up; the whole in 301 × 157
PLAN_SCALE = 208.8 / 2000
PLAN_GAP = (31.4, 19.0)
PLAN_BOX = (301.3, 156.5)
PLAN_LINE_FIGMA_PX = 0.7
MARGIN = 6

# the factory scene, emptied; only Freestyle's lines are rendered
scene = bpy.context.scene
for obj in list(scene.objects):
    bpy.data.objects.remove(obj)
scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.render.use_freestyle = True
scene.render.line_thickness_mode = 'ABSOLUTE'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
layer = scene.view_layers[0]
layer.use_solid = False
settings = layer.freestyle_settings
settings.crease_angle = math.radians(140)
lineset = settings.linesets[0] if settings.linesets else settings.linesets.new('lines')
lineset.select_by_visibility = True
lineset.visibility = 'VISIBLE'
for edge in ('silhouette', 'border', 'crease', 'external_contour'):
    setattr(lineset, f'select_{edge}', True)
for edge in ('contour', 'suggestive_contour', 'ridge_valley', 'material_boundary', 'edge_mark'):
    setattr(lineset, f'select_{edge}', False)
style = lineset.linestyle
style.color = (0, 0, 0)
style.caps = 'ROUND'
style.chaining = 'PLAIN'

camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
camera.data.type = 'ORTHO'
scene.collection.objects.link(camera)
scene.camera = camera

for pid in PRODUCTS:
    with bpy.data.libraries.load(str(STUDIO / 'PRODUSE_STUDIO_FARA_BG.blend')) as (source, target):
        target.scenes = [f'UF09_01_PACK_{pid}']
    objects = [o for o in target.scenes[0].objects if o.type == 'MESH' and 'CATCHER' not in o.name]
    for obj in objects:
        scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    low = Vector([min(c[i] for c in corners) for i in range(3)])
    high = Vector([max(c[i] for c in corners) for i in range(3)])
    middle = (low + high) / 2
    size = high - low
    def draw(name, location, rotation, width_mm, height_mm, depth, scale, line):
        """Freestyle's lines of the product seen from `location`, `width_mm` × `height_mm` with a margin."""
        camera.location = location
        camera.rotation_euler = rotation
        camera.data.ortho_scale = (max(width_mm, height_mm) + 2 * MARGIN) / 1000
        camera.data.clip_end = depth + 10
        scene.render.resolution_x = round((width_mm + 2 * MARGIN) * PX_PER_MM)
        scene.render.resolution_y = round((height_mm + 2 * MARGIN) * PX_PER_MM)
        # the line as thick on screen for every product, whatever its scale
        style.thickness = line / scale * PX_PER_MM
        scene.render.filepath = str(out / f'{pid}-{name}.png')
        bpy.ops.render.render(write_still=True)

    L, D, H = size.x * 1000, size.y * 1000, size.z * 1000
    end_view = ((low.x - 5, middle.y, middle.z), (math.pi / 2, 0, -math.pi / 2))
    if PLAN:
        scale = min(PLAN_SCALE, (PLAN_BOX[0] - PLAN_GAP[0]) / (L + D), (PLAN_BOX[1] - PLAN_GAP[1]) / (D + H))
        # from above: the front at the foot; from the front (−Y); the right end (+X): the front on the left
        draw('plan-top', (middle.x, middle.y, high.z + 5), (0, 0, 0), L, D, size.z, scale, PLAN_LINE_FIGMA_PX)
        draw('plan-front', (middle.x, low.y - 5, middle.z), (math.pi / 2, 0, 0), L, H, size.y, scale, PLAN_LINE_FIGMA_PX)
        draw('plan-side', (high.x + 5, middle.y, middle.z), (math.pi / 2, 0, math.pi / 2), D, H, size.x, scale, PLAN_LINE_FIGMA_PX)
        (out / f'{pid}-plan.json').write_text(
            json.dumps({'id': pid, 'mm': [round(L, 1), round(D, 1), round(H, 1)], 'margin': MARGIN}), newline='\n'
        )
        print('PLAN', pid, round(L), round(D), round(H))
    else:
        front = catalogue[pid]['category'] in FRONT_VIEW
        if front:
            # from the front (−Y) looking along +Y
            view, (width_mm, depth) = ((middle.x, low.y - 5, middle.z), (math.pi / 2, 0, 0)), (L, size.y)
        else:
            # from the left end (−X) along +X: the front (−Y) on the right, as Figma's bench
            view, (width_mm, depth) = end_view, (D, size.x)
        # the page's scale for this product
        scale = min(FIGMA_SCALE, BOX[0] / width_mm, BOX[1] / H)
        draw('profile', *view, width_mm, H, depth, scale, LINE_FIGMA_PX)
        (out / f'{pid}-profile.json').write_text(
            json.dumps({'id': pid, 'view': 'front' if front else 'end', 'mm': [round(width_mm, 1), round(H, 1)], 'margin': MARGIN}),
            newline='\n',
        )
        print('PROFILE', pid, 'front' if front else 'end', round(width_mm), round(H))
    for obj in objects:
        bpy.data.objects.remove(obj)
print('DONE')
