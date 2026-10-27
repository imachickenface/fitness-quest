"""Print the structure of a glTF character: meshes, bones, animations. blender -b -P art/inspect_glb.py -- file.glb"""
import sys

import bpy

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
for o in bpy.data.objects:
    extra = ""
    if o.type == "MESH":
        extra = f"verts={len(o.data.vertices)} mats={[m.name for m in o.data.materials]} parent_bone={o.parent_bone!r} groups={len(o.vertex_groups)}"
    print(f"OBJ {o.type:8} {o.name:28} parent={o.parent.name if o.parent else None} {extra}")
arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
if arm:
    print("BONES", len(arm.data.bones), [b.name for b in arm.data.bones])
print("ACTIONS", len(bpy.data.actions), sorted(a.name for a in bpy.data.actions))
