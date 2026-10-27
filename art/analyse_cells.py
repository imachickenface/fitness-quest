"""Which texture-atlas cells (8 x 4 grid) each mesh of a KayKit character uses, with face counts and height ranges.
blender -b -P art/analyse_cells.py -- file.glb"""
import collections
import sys

import bpy

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
for o in sorted((o for o in bpy.data.objects if o.type == "MESH" and o.data.uv_layers), key=lambda o: o.name):
    uv = o.data.uv_layers.active.data
    cells = collections.defaultdict(list)
    for p in o.data.polygons:
        us = [uv[i].uv for i in p.loop_indices]
        u = sum(x.x for x in us) / len(us)
        v = sum(x.y for x in us) / len(us)
        col, row = min(int(u * 8), 7), min(int((1 - v) * 4), 3)
        z = (o.matrix_world @ p.center).z
        cells[(row, col)].append(z)
    desc = ", ".join(f"r{r}c{c}:{len(zs)}f z{min(zs):.2f}-{max(zs):.2f}" for (r, c), zs in sorted(cells.items()))
    print(f"CELLS {o.name}: {desc}")
