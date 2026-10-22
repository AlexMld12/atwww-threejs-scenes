"""The product page's plaza (Product CMS.pdf, hero 1440 × 732): paving, a wall of concrete panels, a painted pillar and a
strip of grass, built here (the Figma render's scene is not in any package). Rendered without the product and without
the foliage, as two plates: what the sky lights and what the sun lights. three.js adds them back (scene/plaza): the
bench in 3D, its shadow and the leaves' moving shadow on the sun's plate.

blender -b --factory-startup -y --python tools/blender_plaza.py -- <out dir> [--preview]
→ plaza-sky.hdr, plaza-sun.hdr (the camera's plate), plaza-env.hdr (seen from the bench), plaza.json
With --build-only it only builds the place (tools/blender_gallery.py renders the products in it).
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1 :]
out = Path(args[0])
out.mkdir(parents=True, exist_ok=True)
PREVIEW = '--preview' in args
BUILD_ONLY = '--build-only' in args

# ── the frame: Figma's hero is 1440 × 732; the plate reaches past it for wider screens (up to 1720) and parallax ──
FRAME = (1440, 732)
PLATE = (1800, 805)  # Figma px around the same centre
SCALE = 0.5 if PREVIEW else 2  # plate px per Figma px
V_FOV = 30.0  # over the frame's 732 px
CAMERA = {'position': (0.98, -3.3, 1.3), 'target': (-0.1, 0.2, 0.47)}

# ── the place (metres; z up, the bench at the origin, its front towards −y) ──────────────────────────────────────
WALL_Y = 2.75
GRASS_W = 0.5
PANEL_W = 1.65
SLAB = (1.2, 1.8)
PILLAR = {'x': (-3.85, -3.15), 'y': (WALL_Y - 0.62, WALL_Y)}
SUN = {'towards': (-0.62, -0.52, 0.74), 'strength': 2.4, 'colour': (1.0, 0.94, 0.86), 'angle': 1.2}
SKY = {'horizon': (0.86, 0.87, 0.88), 'zenith': (0.62, 0.68, 0.78), 'strength': 0.45}


def srgb(hex_colour):
    c = [int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


for block in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for item in list(block):
        block.remove(item)
scene = bpy.context.scene


# ── materials ──────────────────────────────────────────────────────────────────────────────────────────────────────
class Nodes:
    def __init__(self, name):
        self.material = bpy.data.materials.new(name)
        self.material.use_nodes = True
        self.tree = self.material.node_tree
        self.tree.nodes.clear()
        self.bsdf = self.add('ShaderNodeBsdfPrincipled')
        output = self.add('ShaderNodeOutputMaterial')
        self.link(self.bsdf.outputs[0], output.inputs[0])

    def add(self, kind, **values):
        node = self.tree.nodes.new(kind)
        for key, value in values.items():
            if key in node.inputs:
                node.inputs[key].default_value = value
            else:
                setattr(node, key, value)
        return node

    def link(self, a, b):
        self.tree.links.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        node = self.add('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                node.inputs[i].default_value = v
            else:
                self.link(v, node.inputs[i])
        return node.outputs[0]

    def coords(self):
        xyz = self.add('ShaderNodeSeparateXYZ')
        self.link(self.add('ShaderNodeTexCoord').outputs['Object'], xyz.inputs[0])
        return xyz.outputs

    def joint(self, u, period, width):
        """1 on a joint every `period` metres along u, `width` wide, soft edged."""
        d = self.math('ABSOLUTE', self.math('SUBTRACT', self.math('FRACT', self.math('ADD', self.math('DIVIDE', u, period), 0.5)), 0.5))
        d = self.math('MULTIPLY', d, period)
        ramp = self.add('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
        ramp.inputs['From Min'].default_value = width * 0.5
        ramp.inputs['From Max'].default_value = width
        ramp.inputs['To Min'].default_value = 1
        ramp.inputs['To Max'].default_value = 0
        self.link(d, ramp.inputs['Value'])
        return ramp.outputs[0]

    def cell_noise(self, u, v, period_u, period_v):
        """One random value per slab / panel."""
        combine = self.add('ShaderNodeCombineXYZ')
        self.link(self.math('FLOOR', self.math('DIVIDE', u, period_u)), combine.inputs[0])
        if v is not None:
            self.link(self.math('FLOOR', self.math('DIVIDE', v, period_v)), combine.inputs[1])
        noise = self.add('ShaderNodeTexWhiteNoise', noise_dimensions='3D')
        self.link(combine.outputs[0], noise.inputs['Vector'])
        return noise.outputs['Value']

    def concrete(self, base, joint, cell, mottling=0.12, joint_dark=0.45, bump=0.25):
        """Concrete: cloudy tone, a tint per slab, dark joints sunk into the surface, a fine grain."""
        cloud = self.add('ShaderNodeTexNoise', noise_dimensions='3D')
        cloud.inputs['Scale'].default_value = 1.6
        cloud.inputs['Detail'].default_value = 8
        cloud.inputs['Roughness'].default_value = 0.62
        self.link(self.add('ShaderNodeTexCoord').outputs['Object'], cloud.inputs['Vector'])
        tone = self.math('ADD', 1 - mottling, self.math('MULTIPLY', cloud.outputs['Fac'], 2 * mottling))
        tone = self.math('MULTIPLY', tone, self.math('ADD', 0.94, self.math('MULTIPLY', cell, 0.12)))
        tone = self.math('MULTIPLY', tone, self.math('SUBTRACT', 1, self.math('MULTIPLY', joint, 1 - joint_dark)))
        colour = self.add('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        colour.inputs['Factor'].default_value = 1
        colour.inputs['A'].default_value = base
        value = self.add('ShaderNodeCombineColor')
        for i in range(3):
            self.link(tone, value.inputs[i])
        self.link(value.outputs[0], colour.inputs['B'])
        self.link(colour.outputs['Result'], self.bsdf.inputs['Base Color'])
        self.bsdf.inputs['Roughness'].default_value = 0.86
        grain = self.add('ShaderNodeTexNoise', noise_dimensions='3D')
        grain.inputs['Scale'].default_value = 240
        grain.inputs['Detail'].default_value = 4
        self.link(self.add('ShaderNodeTexCoord').outputs['Object'], grain.inputs['Vector'])
        height = self.math('SUBTRACT', self.math('MULTIPLY', grain.outputs['Fac'], 0.25), joint)
        bumped = self.add('ShaderNodeBump', invert=False)
        bumped.inputs['Strength'].default_value = bump
        bumped.inputs['Distance'].default_value = 0.004
        self.link(height, bumped.inputs['Height'])
        self.link(bumped.outputs[0], self.bsdf.inputs['Normal'])


def paving():
    n = Nodes('paving')
    x, y, _ = n.coords()
    joints = n.math('MAXIMUM', n.joint(x, SLAB[0], 0.007), n.joint(y, SLAB[1], 0.007))
    n.concrete(srgb('#c9c9c6'), joints, n.cell_noise(x, y, *SLAB), mottling=0.2)
    return n.material


def wall():
    n = Nodes('wall')
    x, _, z = n.coords()
    n.concrete(srgb('#bdbab3'), n.joint(x, PANEL_W, 0.012), n.cell_noise(x, None, PANEL_W, 1), mottling=0.22, joint_dark=0.3)
    return n.material


def pillar():
    n = Nodes('pillar')
    x, y, z = n.coords()
    zero = n.math('MULTIPLY', x, 0)
    n.concrete(srgb('#a3b2ae'), zero, n.cell_noise(z, None, 100, 1), mottling=0.06, bump=0.12)
    return n.material


def grass():
    n = Nodes('grass')
    info = n.add('ShaderNodeHairInfo')
    ramp = n.add('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb('#3f8417')
    ramp.color_ramp.elements[1].color = srgb('#9ccf3a')
    ramp.color_ramp.elements.new(0.55).color = srgb('#68b324')
    n.link(info.outputs['Random'], ramp.inputs[0])
    # darker at the root, where the blades shade each other
    shade = n.add('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    root = n.add('ShaderNodeMapRange')
    root.inputs['To Min'].default_value = 0.55
    n.link(info.outputs['Intercept'], root.inputs['Value'])
    n.link(ramp.outputs[0], shade.inputs['A'])
    tint = n.add('ShaderNodeCombineColor')
    for i in range(3):
        n.link(root.outputs[0], tint.inputs[i])
    n.link(tint.outputs[0], shade.inputs['B'])
    shade.inputs['Factor'].default_value = 1
    n.link(shade.outputs['Result'], n.bsdf.inputs['Base Color'])
    n.bsdf.inputs['Roughness'].default_value = 0.55
    n.bsdf.inputs['Subsurface Weight'].default_value = 0.0
    n.bsdf.inputs['Transmission Weight'].default_value = 0.15
    return n.material


# ── geometry ──────────────────────────────────────────────────────────────────────────────────────────────────────
def box(name, lo, hi, material):
    mesh = bpy.data.meshes.new(name)
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh.from_pydata(v, [], f)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj


proxies = []

floor_box = ((-14, -14, -0.2), (14, WALL_Y - GRASS_W, 0))
box('paving', *floor_box, paving())
proxies.append({'name': 'paving', 'min': floor_box[0], 'max': floor_box[1]})

soil_box = ((-14, WALL_Y - GRASS_W, -0.2), (14, WALL_Y, -0.005))
soil = box('soil', *soil_box, Nodes('soil').material)
soil.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb('#3b3a22')
proxies.append({'name': 'grass', 'min': soil_box[0], 'max': (14, WALL_Y, 0.06)})

wall_box = ((-14, WALL_Y, -0.2), (14, WALL_Y + 0.4, 8))
box('wall', *wall_box, wall())
proxies.append({'name': 'wall', 'min': wall_box[0], 'max': wall_box[1]})

pillar_box = ((PILLAR['x'][0], PILLAR['y'][0], -0.2), (PILLAR['x'][1], PILLAR['y'][1], 8))
box('pillar', *pillar_box, pillar())
proxies.append({'name': 'pillar', 'min': pillar_box[0], 'max': pillar_box[1]})

# the grass: hair on the strip's top face
strip = bpy.data.meshes.new('grass')
y0, y1 = WALL_Y - GRASS_W, WALL_Y
strip.from_pydata([(-9, y0, -0.005), (9, y0, -0.005), (9, y1, -0.005), (-9, y1, -0.005)], [], [(0, 1, 2, 3)])
strip.materials.append(grass())
lawn = bpy.data.objects.new('grass', strip)
scene.collection.objects.link(lawn)
modifier = lawn.modifiers.new('grass', 'PARTICLE_SYSTEM')
hair = modifier.particle_system.settings
hair.type = 'HAIR'
hair.count = 60000 if PREVIEW else 420000
hair.hair_length = 0.075
hair.length_random = 0.45
hair.hair_step = 4
hair.display_step = 3
hair.render_step = 4
hair.radius_scale = 0.0014
hair.root_radius = 1.0
hair.tip_radius = 0.0
hair.use_close_tip = True
modifier.particle_system.seed = 7

# ── light ────────────────────────────────────────────────────────────────────────────────────────────────────────
towards = Vector(SUN['towards']).normalized()
sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = SUN['strength']
sun_data.color = SUN['colour']
sun_data.angle = math.radians(SUN['angle'])
sun = bpy.data.objects.new('sun', sun_data)
sun.rotation_euler = (-towards).to_track_quat('-Z', 'Y').to_euler()
scene.collection.objects.link(sun)

world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
wt = world.node_tree
wt.nodes.clear()
coord = wt.nodes.new('ShaderNodeTexCoord')
split = wt.nodes.new('ShaderNodeSeparateXYZ')
ramp = wt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = SKY['horizon'] + (1,)
ramp.color_ramp.elements[1].position = 0.7
ramp.color_ramp.elements[1].color = SKY['zenith'] + (1,)
background = wt.nodes.new('ShaderNodeBackground')
background.inputs['Strength'].default_value = SKY['strength']
world_out = wt.nodes.new('ShaderNodeOutputWorld')
wt.links.new(coord.outputs['Generated'], split.inputs[0])
wt.links.new(split.outputs['Z'], ramp.inputs[0])
wt.links.new(ramp.outputs[0], background.inputs['Color'])
wt.links.new(background.outputs[0], world_out.inputs[0])

# ── camera: Figma's frame at the plate's middle ──────────────────────────────────────────────────────────────────
position, target = Vector(CAMERA['position']), Vector(CAMERA['target'])
cam_data = bpy.data.cameras.new('camera')
cam_data.sensor_fit = 'HORIZONTAL'
cam_data.sensor_width = 36
tan_v = math.tan(math.radians(V_FOV) / 2)
tan_plate_h = tan_v * PLATE[0] / FRAME[1]
cam_data.lens = cam_data.sensor_width / (2 * tan_plate_h)
cam_data.clip_start = 0.05
cam_data.clip_end = 200
camera = bpy.data.objects.new('camera', cam_data)
camera.matrix_world = Matrix.Translation(position) @ (target - position).to_track_quat('-Z', 'Y').to_matrix().to_4x4()
scene.collection.objects.link(camera)
scene.camera = camera

# ── render ───────────────────────────────────────────────────────────────────────────────────────────────────────
prefs = bpy.context.preferences.addons['cycles'].preferences
for kind in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(device.type == kind for device in prefs.devices):
            break
    except TypeError:
        pass
for device in prefs.devices:
    device.use = True

scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'
scene.cycles.samples = 48 if PREVIEW else 160
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_percentage = 100
settings = scene.render.image_settings
settings.file_format = 'HDR'  # float, scene-linear


def render(name, size, with_sun, with_sky):
    scene.render.resolution_x, scene.render.resolution_y = size
    sun.hide_render = not with_sun
    background.inputs['Strength'].default_value = SKY['strength'] if with_sky else 0.0
    scene.render.filepath = str(out / name)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name)


plate_size = (round(PLATE[0] * SCALE), round(PLATE[1] * SCALE))
if BUILD_ONLY:
    pass
elif PREVIEW:
    # the bench from the colleague's studio, only to frame the camera against Figma
    studio = Path(r'C:\ATWWW\Civic Standard\DEVELOPER_STUDIO_2026-10-20\DEVELOPER_STUDIO_2026-10-20\PRODUSE_STUDIO_FARA_BG.blend')
    with bpy.data.libraries.load(str(studio)) as (source, target):
        target.scenes = ['UF09_01_PACK_K7_armrests']
    for obj in target.scenes[0].objects:
        if obj.type == 'MESH' and 'CATCHER' not in obj.name:
            scene.collection.objects.link(obj)
    render('plaza-preview.hdr', plate_size, True, True)
else:
    render('plaza-sky.hdr', plate_size, False, True)
    render('plaza-sun.hdr', plate_size, True, False)
    # what the bench reflects: the plaza, lit by both, from the seat's middle (three's −Z = Blender's +Y)
    camera.data.type = 'PANO'
    camera.data.panorama_type = 'EQUIRECTANGULAR'
    camera.matrix_world = Matrix.Translation((0, 0, 0.45)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    scene.cycles.samples = 512
    render('plaza-env.hdr', (512, 256), True, True)

meta = {} if BUILD_ONLY else {
    'frame': FRAME,
    'plate': PLATE,
    'vFov': V_FOV,
    'camera': CAMERA,
    'sun': {**SUN, 'towards': list(towards)},
    'proxies': proxies,
}
if not BUILD_ONLY:
    (out / 'plaza.json').write_text(json.dumps(meta, indent=1), newline='\n')
    print('DONE')
