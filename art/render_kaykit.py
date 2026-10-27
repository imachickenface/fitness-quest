"""
Render KayKit characters in a pose, optionally with the game's body shape applied by bone scaling.

    blender -b -P art/render_kaykit.py -- <out.png> <spec> [<spec> ...]

A spec is `File.glb:muscle:build[:hide1,hide2]`, e.g. `Rogue.glb:4:0:Rogue_Cape`. Several specs are rendered
side by side. Body shape: muscle 0..4 thickens chest, arms and legs; build -2..2 widens or narrows the belly.
Children are counter-scaled so a parent's scale doesn't inflate the head or hands.
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from body_keys import add_body_keys, set_body  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :]
OUT, SPECS = args[0], args[1:]
KAYKIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kaykit")
POSE = "Idle_Rig"
WEAPONS = ("Sword", "Shield", "Axe", "Crossbow", "Staff", "Wand", "Knife", "Dagger", "Spellbook", "Mug", "Bow", "Throwable", "Icosphere")


def body_scales(muscle, build):
    """Desired world-space (side, along, front) scale per bone."""
    fat, thin = max(build, 0), max(-build, 0)
    chest = 1 + 0.07 * muscle + 0.05 * fat - 0.06 * thin
    return {
        "spine": (1 + 0.2 * fat - 0.07 * thin, 1, 1 + 0.32 * fat - 0.07 * thin),
        "chest": (chest, 1, chest - 0.02 * muscle),
        "upperarm.l": (1 + 0.16 * muscle + 0.1 * fat - 0.12 * thin, 1, 1 + 0.16 * muscle + 0.1 * fat - 0.12 * thin),
        "upperleg.l": (1 + 0.06 * muscle + 0.12 * fat - 0.1 * thin, 1, 1 + 0.06 * muscle + 0.12 * fat - 0.1 * thin),
        "head": (1, 1, 1),
        "hand.l": (1.05 + 0.03 * muscle, 1, 1.05 + 0.03 * muscle),
    }


def long_axis(rig, bone):
    """0, 1 or 2: the bone-local axis along which the vertices it mostly moves spread furthest."""
    rest = rig.data.bones[bone].matrix_local.inverted()
    lo, hi = [9e9] * 3, [-9e9] * 3
    for o in rig.children:
        if o.type != "MESH" or bone not in o.vertex_groups:
            continue
        gi = o.vertex_groups[bone].index
        for v in o.data.vertices:
            if any(g.group == gi and g.weight > 0.5 for g in v.groups):
                p = rest @ v.co
                for i in range(3):
                    lo[i], hi[i] = min(lo[i], p[i]), max(hi[i], p[i])
    spans = [hi[i] - lo[i] for i in range(3)]
    return spans.index(max(spans))


def up_axis(rig, bone):
    """The bone-local axis that points most nearly up in the rest pose (torso and stubby legs keep their height)."""
    m = rig.data.bones[bone].matrix_local
    return max(range(3), key=lambda i: abs(m.col[i].z))


def apply_body(rig, muscle, build):
    want = body_scales(muscle, build)
    if "torso" in rig.pose.bones:  # Kenney: morph targets, since uneven bone scaling skews rotated arms
        for o in rig.children:
            if o.type == "MESH" and o.name.startswith("body"):
                add_body_keys(o, rig)
                set_body(o, muscle, build)
        return
    for side in ("l", "r"):
        for k in ("upperarm", "upperleg", "hand"):
            want[f"{k}.{side}"] = want[f"{k}.l"]
    world = {}
    for pb in rig.pose.bones:  # parents come before children
        target = Vector(want.get(pb.name, world.get(pb.parent.name, (1, 1, 1)) if pb.parent else (1, 1, 1)))
        parent = Vector(world.get(pb.parent.name, (1, 1, 1))) if pb.parent else Vector((1, 1, 1))
        if pb.name in want or pb.name in ("head", "lowerarm.l", "lowerarm.r"):
            local = Vector((target.x / parent.x, target.y / parent.y, target.z / parent.z))
            pb.scale = local
            world[pb.name] = tuple(target)
        else:
            world[pb.name] = tuple(parent)
    # the head and hands keep their size whatever the torso does
    if build < 0:
        rig.pose.bones["head"].rotation_mode = "XYZ"
        rig.pose.bones["head"].rotation_euler = Euler((math.radians(10 * -build), 0, 0))


def load(spec, x):
    parts = spec.split(":")
    name, muscle, build = parts[0], int(parts[1]), int(parts[2])
    hide = set(parts[3].split(",")) if len(parts) > 3 and parts[3] else set()
    before = set(bpy.data.objects)
    path = os.path.join(os.path.dirname(KAYKIT), name) if "/" in name else os.path.join(KAYKIT, name)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in new if o.type == "ARMATURE")
    for o in new:
        if o.type == "MESH" and (o.name.split(".")[0] in hide or any(w in o.name for w in WEAPONS)):
            o.hide_render = True
    names = {b.name for b in rig.data.bones}
    action = next(a for a in bpy.data.actions if a.name == POSE or (a.name.startswith("idle_") and a.name.endswith(rig.name)))
    rig.animation_data_create()
    rig.animation_data.action = action
    bpy.context.scene.frame_set(1)
    # freeze the pose: copy the evaluated pose, then drop the action so it can't overwrite the body shape
    pose = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy()) for pb in rig.pose.bones}
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = pose[pb.name]
    apply_body(rig, muscle, build)
    bpy.context.view_layer.update()
    zs = [(o.matrix_world @ Vector(c)).z for o in new if o.type == "MESH" and not o.hide_render for c in o.bound_box]
    rig.scale *= 2.45 / (max(zs) - min(zs))  # same on-screen height whatever the pack's units
    rig.location.x = x
    rig.rotation_euler.z += math.radians(-15)  # a slight turn reads better than dead-on
    return rig


def stage(count):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 520 * count
    scene.render.resolution_y = 760
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -0.2
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    scene.world = world
    for name, energy, loc, rot, size in [
        ("Key", 900, (-4, -6, 7), (math.radians(45), 0, math.radians(-35)), 6),
        ("Fill", 300, (6, -5, 3), (math.radians(70), 0, math.radians(50)), 6),
        ("Rim", 500, (1, 6, 5), (math.radians(-55), 0, math.radians(170)), 4),
    ]:
        d = bpy.data.lights.new(name, "AREA")
        d.energy, d.size = energy, size
        o = bpy.data.objects.new(name, d)
        scene.collection.objects.link(o)
        o.location, o.rotation_euler = loc, Euler(rot)
    bpy.ops.mesh.primitive_plane_add(size=60)
    floor = bpy.context.active_object
    m = bpy.data.materials.new("floor")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (1, 1, 1, 1)
    floor.data.materials.append(m)
    cam_d = bpy.data.cameras.new("Cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = 2.7 * count * 1.05
    cam = bpy.data.objects.new("Cam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    spread = 2.7
    center = (count - 1) * spread / 2
    cam.location = (center, -12, 1.75)
    cam.rotation_euler = Euler((math.radians(86), 0, 0))
    return spread


bpy.ops.wm.read_factory_settings(use_empty=True)
spread = stage(len(SPECS))
for i, spec in enumerate(SPECS):
    load(spec, i * spread)
bpy.context.scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
