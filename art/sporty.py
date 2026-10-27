"""
Turn KayKit's Rogue into a sporty hero: tee, shorts, bare hands and short sleeves, white sneakers, no cape.
Recolouring moves each face's UVs to another cell of the atlas (8 x 4 cells), so KayKit's gradient shading is
kept. A second variant puts the Mage's head (hat off) on the same body. Writes GLBs with all animations.

    blender -b -P art/sporty.py
"""
import math
import os

import bpy

ART = os.path.dirname(os.path.abspath(__file__))
KAYKIT = os.path.join(ART, "kaykit")
OUT = os.path.join(ART, "hero")
TEXTURE = os.path.join(OUT, "hero_texture.png")

SKIN, TEE, TRIM, SHORTS, WHITE = (0, 0), (3, 0), (3, 1), (3, 2), (3, 4)
DROP = ("Cape", "Sword", "Shield", "Crossbow", "Knife", "Dagger", "Staff", "Wand", "Spellbook", "Throwable", "Bow", "Axe", "Mug", "Icosphere", "Hat")


def cell_of(uvs):
    u = sum(p.x for p in uvs) / len(uvs)
    v = sum(p.y for p in uvs) / len(uvs)
    return min(int((1 - v) * 4), 3), min(int(u * 8), 7)


def remap(obj, rule):
    """rule(cell, world_centre) -> new cell or None to keep."""
    uv = obj.data.uv_layers.active.data
    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        r, c = cell_of([uv[i].uv for i in loops])
        new = rule((r, c), obj.matrix_world @ poly.center)
        if new is None or new == (r, c):
            continue
        du, dv = (new[1] - c) / 8, -(new[0] - r) / 4
        for i in loops:
            uv[i].uv.x += du
            uv[i].uv.y += dv


def body_rule(cell, p):
    if cell == (1, 0):  # tunic: a tee above the belt, shorts below it
        return TEE if p.z > 0.6 else SHORTS
    return {
        (1, 1): TRIM,  # neck scarf becomes a V collar
        (0, 5): SHORTS,  # belt and buckle blend into a high waistband
        (0, 3): SHORTS,
        (0, 6): TEE if p.z > 0.66 else SHORTS,  # shoulder straps / pouches
        (1, 7): SHORTS,
    }.get(cell)


def arm_rule(cell, p):
    """Long sleeves (bare skin showed the sleeve's ridges as stripes), a trim cuff, bare hands."""
    return {(2, 5): SKIN, (1, 1): TRIM, (1, 0): TEE, (0, 5): TEE}.get(cell)


def leg_rule(cell, p):
    if cell == (1, 7):
        return SHORTS if p.z > 0.4 else SKIN
    if cell == (2, 3):
        return WHITE  # boots -> sneakers
    return None


def build(head_from=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(KAYKIT, "Rogue.glb"))
    rig = bpy.data.objects["Rig"]
    for o in list(bpy.data.objects):
        if o.type == "MESH" and any(d in o.name for d in DROP):
            bpy.data.objects.remove(o, do_unlink=True)
    mat = bpy.data.materials["rogue_texture"]
    tex = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
    tex.image = bpy.data.images.load(TEXTURE)
    tex.image.name = "hero_texture"
    mat.name = "hero_texture"

    remap(bpy.data.objects["Rogue_Body"], body_rule)
    for side in ("Left", "Right"):
        arm = bpy.data.objects[f"Rogue_Arm{side}"]
        remap(arm, arm_rule)
        remap(bpy.data.objects[f"Rogue_Leg{side}"], leg_rule)

    if head_from:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(KAYKIT, f"{head_from}.glb"))
        new = [o for o in bpy.data.objects if o not in before]
        head = next(o for o in new if o.name.startswith(f"{head_from}_Head"))
        head.parent = rig
        for mod in head.modifiers:
            if mod.type == "ARMATURE":
                mod.object = rig
        for o in new:
            if o is not head:
                bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.objects.remove(bpy.data.objects["Rogue_Head"], do_unlink=True)
        head.name = "Hero_Head"
    else:
        bpy.data.objects["Rogue_Head"].name = "Hero_Head"
    for part in ("Body", "ArmLeft", "ArmRight", "LegLeft", "LegRight"):
        bpy.data.objects[f"Rogue_{part}"].name = f"Hero_{part}"
    return rig


def export(name):
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{name}.glb"),
        export_format="GLB",
        export_animations=True,
        export_apply=False,
    )


os.makedirs(OUT, exist_ok=True)
build()
export("hero_girl")
build(head_from="Mage")
export("hero_boy")
print("SPORTY done")
