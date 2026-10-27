"""
Export the 12 Kenney Mini Characters for the app: body-shape morph targets added, only the animations the game
uses, plus a transparent portrait thumbnail for the hero picker.

    blender -b -P art/export_heroes.py

Writes public/hero/<id>.glb and public/hero/<id>.png (id: male-a ... female-f).
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

ART = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ART)
from body_keys import add_body_keys  # noqa: E402

SRC = os.path.join(ART, "kenney", "Models", "GLB format")
OUT = os.path.join(os.path.dirname(ART), "public", "hero")
IDS = [f"{g}-{c}" for g in ("male", "female") for c in "abcdef"]
KEEP = {"idle", "walk", "sprint", "jump", "emote-yes"}


def load(cid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f"character-{cid}.glb"))
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for o in rig.children:
        if o.type == "MESH" and o.name.startswith("body"):
            add_body_keys(o, rig)
    for a in list(bpy.data.actions):
        short = a.name.split("_character-")[0]
        if short in KEEP:
            a.name = short
            a.use_fake_user = True
        else:
            bpy.data.actions.remove(a)
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions["idle"]
    return rig


def export(cid):
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{cid}.glb"),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_morph=True,
        export_morph_normal=False,
        export_def_bones=False,
        export_apply=False,
    )


def thumbnail(cid, rig):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.5
    scene.world = world
    for name, energy, loc in [("Key", 300, (-2, -4, 4)), ("Fill", 120, (3, -3, 2)), ("Rim", 150, (0, 4, 3))]:
        d = bpy.data.lights.new(name, "AREA")
        d.energy, d.size = energy, 3
        o = bpy.data.objects.new(name, d)
        scene.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.frame_set(1)
    bpy.context.view_layer.update()
    meshes = [o for o in rig.children if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    top = max(p.z for p in pts)
    bottom = min(p.z for p in pts)
    cam_d = bpy.data.cameras.new("Cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = (top - bottom) * 1.0  # head and shoulders, hats included
    cam = bpy.data.objects.new("Cam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    look = Vector((0, 0, top - (top - bottom) * 0.45))
    cam.location = look + Vector((math.sin(math.radians(20)) * 6, -math.cos(math.radians(20)) * 6, 0.4))
    cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, f"{cid}.png")
    bpy.ops.render.render(write_still=True)


os.makedirs(OUT, exist_ok=True)
for cid in IDS:
    rig = load(cid)
    export(cid)
    thumbnail(cid, rig)
    print("HERO", cid)
