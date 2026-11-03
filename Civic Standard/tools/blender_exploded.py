"""The colleague's exploded views (SCENE_URBANE.blend, scenes UF10_04_EXPLODED_*): each piece is the assembled product's
geometry moved by its object's location, so that location is how far the piece flies out. Written per product, with
each piece's loose parts (their boxes, assembled), so tools/blender_configurator.py --assembly can find the same parts
in the studio's product and split it the same way.

blender -b -y SCENE_URBANE.blend --python tools/blender_exploded.py -- <exploded.json>
"""
import json
import sys
from collections import defaultdict

import bpy

out = sys.argv[sys.argv.index('--') + 1]
PRODUCTS = {'K4_1900': 'UF10_04_EXPLODED_K4_1900', 'K8_module': 'UF10_04_EXPLODED_K8_module'}


def loose_parts(mesh):
    """Each connected part's box (vertex islands joined through the edges)."""
    parent = list(range(len(mesh.vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for edge in mesh.edges:
        a, b = find(edge.vertices[0]), find(edge.vertices[1])
        if a != b:
            parent[a] = b
    groups = defaultdict(list)
    for v in mesh.vertices:
        groups[find(v.index)].append(v.co)
    return [
        [[round(min(c[i] for c in cos), 5) for i in range(3)], [round(max(c[i] for c in cos), 5) for i in range(3)]]
        for cos in groups.values()
    ]


result = {}
for pid, scene_name in PRODUCTS.items():
    scene = bpy.data.scenes[scene_name]
    pieces = []
    for obj in sorted(scene.objects, key=lambda o: o.name):
        if obj.type != 'MESH' or not obj.get('uf_exploded_component'):
            continue
        # the mesh is already where it sits assembled; the object only adds the offset (no rotation, no scale)
        assert obj.rotation_euler.to_quaternion().angle < 1e-6 and all(abs(s - 1) < 1e-6 for s in obj.scale), obj.name
        pieces.append({
            'name': obj.name.split('_piece_')[0].rsplit('_', 1)[-1] + '_' + obj.name.rsplit('_', 1)[-1],
            'role': obj.get('uf_mesh_role', ''),
            'offset': [round(v, 5) for v in obj.location],
            'parts': loose_parts(obj.data),
        })
    result[pid] = pieces
    print(pid, len(pieces), 'pieces', sum(len(p['parts']) for p in pieces), 'parts')

with open(out, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(result, f, indent=1)
