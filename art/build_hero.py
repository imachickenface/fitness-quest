"""
Build the Fitness Quest hero in Blender, in the KayKit style: chunky bevelled forms, a big head,
stubby limbs, matte colours. Run headless:

    blender -b -P art/build_hero.py -- <out_dir>

Writes hero.blend and preview renders to <out_dir>. Body parts are kept as separate objects for now;
rigging, shape keys (muscle, belly) and the GLB export come after the look is approved.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.abspath("art/out")
os.makedirs(OUT, exist_ok=True)

LOOK = {
    "skin": (0.96, 0.74, 0.58),
    "hair": (0.36, 0.21, 0.12),
    "shirt": (0.13, 0.50, 0.92),
    "shorts": (0.16, 0.22, 0.42),
    "shoe": (0.95, 0.96, 0.97),
    "shoe_accent": (0.13, 0.50, 0.92),
    "sole": (0.62, 0.66, 0.72),
    "eye": (0.06, 0.05, 0.07),
    "brow": (0.24, 0.14, 0.08),
    "mouth": (0.55, 0.25, 0.22),
}

# ---------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgb, rough=0.75, spec=0.25, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Specular IOR Level"].default_value = spec
    p.inputs["Coat Weight"].default_value = coat
    return m


MATS = {}


def mat(key, **kw):
    if key not in MATS:
        MATS[key] = material(key, LOOK[key] if key in LOOK else kw.pop("rgb"), **kw)
    return MATS[key]


def finish(obj, m, smooth=True):
    obj.data.materials.append(m)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def link(obj, parent=None):
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def rounded_box(name, size, loc, m, bevel=0.3, segments=4, rot=(0, 0, 0), parent=None):
    """A box whose edges are rounded by `bevel` (fraction of the smallest side)."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.scale = size
    obj.location = loc
    obj.rotation_euler = Euler(rot)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = min(size) * bevel
    mod.segments = segments
    mod.limit_method = "NONE"
    mod.harden_normals = True
    return finish(obj, m)


def lathe(name, rings, m, n=14, parent=None, loc=(0, 0, 0), cap_top=True, cap_bottom=True):
    """A closed surface through rings of (z, half-width x, half-depth y)."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    loops = []
    for z, rx, ry in rings:
        loops.append(
            [bm.verts.new((rx * math.cos(2 * math.pi * i / n), ry * math.sin(2 * math.pi * i / n), z)) for i in range(n)]
        )
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(loops[0])))
    if cap_top:
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.location = loc
    sub = obj.modifiers.new("smooth", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 2
    return finish(obj, m)


def ellipsoid(name, radii, loc, m, parent=None, segments=24, rings=12, rot=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.scale = radii
    obj.location = loc
    obj.rotation_euler = Euler(rot)
    return finish(obj, m)


def cylinder(name, r, depth, loc, m, parent=None, rot=(0, 0, 0), verts=16, bevel=0.35):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.location = loc
    obj.rotation_euler = Euler(rot)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = r * bevel
    mod.segments = 3
    mod.limit_method = "ANGLE"
    mod.harden_normals = True
    return finish(obj, m)


# ---------------------------------------------------------------- the hero


def build(muscle=1, build=0):
    """muscle 0..4 and build -2..2 only nudge proportions here; shape keys replace this later."""
    hero = link(bpy.data.objects.new("Hero", None))
    fat = max(build, 0)
    thin = max(-build, 0)

    # boots: big, rounded, slightly forward
    for s in (-1, 1):
        x = s * 0.115
        rounded_box(f"Shoe.{s}", (0.2, 0.3, 0.15), (x, -0.035, 0.085), mat("shoe", rough=0.45, coat=0.3), bevel=0.45, parent=hero)
        rounded_box(f"Sole.{s}", (0.21, 0.31, 0.05), (x, -0.035, 0.025), mat("sole"), bevel=0.4, parent=hero)
        rounded_box(f"Stripe.{s}", (0.205, 0.12, 0.035), (x, -0.02, 0.11), mat("shoe_accent"), bevel=0.4, parent=hero)
        leg_r = 0.07 + 0.012 * fat - 0.01 * thin + (0.01 if muscle >= 2 else 0)
        cylinder(f"Leg.{s}", leg_r, 0.3, (x, 0, 0.29), mat("skin", rough=0.6), parent=hero)

    # shorts and tee: one smooth barrel each, bulging with build
    hip = 0.23 + 0.03 * fat - 0.015 * thin
    lathe("Shorts", [(0.36, hip * 0.95, hip * 0.8), (0.42, hip + 0.01, hip * 0.86), (0.56, hip, hip * 0.86)], mat("shorts", rough=0.85), parent=hero)
    sh = 0.27 + 0.03 * muscle - 0.02 * thin
    chest = 0.26 + 0.025 * muscle + 0.02 * fat
    belly = 0.24 + 0.05 * fat - 0.015 * thin - 0.01 * max(muscle - 2, 0)
    lathe(
        "Tee",
        [
            (0.5, hip + 0.015, hip * 0.88),
            (0.6, belly + 0.01, belly * 0.85 + 0.03 * fat),
            (0.72, belly, belly * 0.84 + 0.03 * fat),
            (0.82, chest, chest * 0.78),
            (0.91, sh, sh * 0.7),
            (0.97, sh * 0.62, sh * 0.5),
        ],
        mat("shirt", rough=0.85),
        parent=hero,
    )
    cylinder("Neck", 0.08, 0.1, (0, 0, 0.97), mat("skin"), parent=hero)

    # arms in a relaxed A-pose: sleeve, arm, mitten hand
    arm_r = 0.06 + 0.014 * muscle + 0.012 * fat - 0.01 * thin
    for s in (-1, 1):
        pivot = link(bpy.data.objects.new(f"Shoulder.{s}", None), hero)
        pivot.location = (s * (sh - 0.04), 0, 0.89)
        pivot.rotation_euler = Euler((0, -s * math.radians(24 + 6 * fat + 2 * muscle), 0))  # swing outward
        ellipsoid(f"Delt.{s}", (arm_r * 1.45, arm_r * 1.35, arm_r * 1.35), (0, 0, 0), mat("shirt"), parent=pivot)
        cylinder(f"Sleeve.{s}", arm_r * 1.32, 0.13, (0, 0, -0.07), mat("shirt"), parent=pivot)
        cylinder(f"Arm.{s}", arm_r, 0.27, (0, 0, -0.2), mat("skin", rough=0.6), parent=pivot)
        if muscle >= 2:
            ellipsoid(f"Bicep.{s}", (arm_r * 1.12, arm_r * 1.2, arm_r * 1.6), (0, -arm_r * 0.25, -0.17), mat("skin"), parent=pivot)
        rounded_box(f"Hand.{s}", (arm_r * 1.9, arm_r * 1.7, arm_r * 2.0), (0, 0, -0.36), mat("skin"), bevel=0.45, parent=pivot)

    # head: a big rounded block, slightly wider than tall
    head = link(bpy.data.objects.new("HeadPivot", None), hero)
    head.location = (0, 0, 1.25 - 0.03 * thin)
    head.rotation_euler = Euler((math.radians(4 * thin), 0, 0))
    rounded_box("Head", (0.64 + 0.04 * fat, 0.58, 0.6), (0, 0, 0), mat("skin", rough=0.6), bevel=0.42, segments=6, parent=head)
    if fat >= 2:
        for s in (-1, 1):
            ellipsoid(f"Cheek.{s}", (0.1, 0.07, 0.08), (s * 0.24, -0.22, -0.16), mat("skin"), parent=head)
    for s in (-1, 1):
        rounded_box(f"Ear.{s}", (0.06, 0.1, 0.13), (s * 0.33, 0.02, -0.02), mat("skin"), bevel=0.45, parent=head)
        # eyes: small glossy ovals with a highlight
        ellipsoid(f"Eye.{s}", (0.04, 0.02, 0.06 if thin == 0 else 0.035), (s * 0.12, -0.278, -0.02), mat("eye", rough=0.15, coat=1.0), parent=head)
        ellipsoid(f"Glint.{s}", (0.013, 0.008, 0.016), (s * 0.12 + 0.014, -0.297, 0.005), mat("glint", rgb=(1, 1, 1), rough=0.2), parent=head)
        tilt = -0.25 if thin else 0.12
        rounded_box(f"Brow.{s}", (0.1, 0.025, 0.024), (s * 0.12, -0.275, 0.08 - 0.015 * thin), mat("brow"), bevel=0.4, rot=(0, s * tilt, 0), parent=head)
        if thin == 0:
            ellipsoid(f"Blush.{s}", (0.045, 0.01, 0.025), (s * 0.2, -0.282, -0.1), mat("blush", rgb=(1.0, 0.55, 0.5), rough=0.9), parent=head)
    ellipsoid("Nose", (0.035, 0.03, 0.03), (0, -0.29, -0.08), mat("skin"), parent=head)
    if thin:
        rounded_box("Mouth", (0.06, 0.012, 0.012), (0, -0.282, -0.16), mat("mouth"), bevel=0.4, parent=head)
    else:
        smile = bpy.data.meshes.new("Smile")
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, segments=16, radius=0.04)
        bm.to_mesh(smile)
        bm.free()
        s_obj = link(bpy.data.objects.new("Smile", smile), head)
        s_obj.location = (0, -0.281, -0.15)
        s_obj.rotation_euler = Euler((math.radians(90), 0, 0))
        s_obj.scale = (1, 0.55, 1)
        sol = s_obj.modifiers.new("thick", "SOLIDIFY")
        sol.thickness = 0.01
        s_obj.data.materials.append(mat("mouth"))

    # hair: a chunky cap with a side-swept fringe made of slabs
    hair = mat("hair", rough=0.55, coat=0.2)
    rounded_box("HairCap", (0.68, 0.6, 0.24), (0, 0.02, 0.21), hair, bevel=0.45, segments=4, parent=head)
    rounded_box("HairBack", (0.66, 0.22, 0.42), (0, 0.2, 0.04), hair, bevel=0.45, parent=head)
    for s in (-1, 1):
        rounded_box(f"Sideburn.{s}", (0.06, 0.2, 0.22), (s * 0.31, 0.06, 0.08), hair, bevel=0.45, parent=head)
    for i, (x, w, drop, rot) in enumerate([(-0.17, 0.26, 0.16, -0.32), (0.06, 0.24, 0.13, -0.22), (0.24, 0.2, 0.1, -0.12)]):
        rounded_box(f"Fringe.{i}", (w, 0.12, drop), (x, -0.24, 0.17), hair, bevel=0.45, rot=(0.25, rot, 0), parent=head)

    return hero


# ---------------------------------------------------------------- lights, camera, render


def stage():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.35
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1.0, 1.0, 1.0, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.world = world

    def light(name, kind, energy, loc, rot, size=2.0, color=(1, 1, 1)):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color
        if kind == "AREA":
            data.size = size
        obj = link(bpy.data.objects.new(name, data))
        obj.location = loc
        obj.rotation_euler = Euler(rot)
        return obj

    light("Key", "AREA", 320, (-2.2, -2.6, 3.2), (math.radians(50), 0, math.radians(-40)), size=2.5)
    light("Fill", "AREA", 90, (2.6, -2.2, 1.6), (math.radians(70), 0, math.radians(50)), size=3, color=(0.9, 0.95, 1))
    light("Rim", "AREA", 160, (0.5, 2.8, 2.6), (math.radians(-55), 0, math.radians(170)), size=2)

    floor = bpy.data.meshes.new("Floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    bm.to_mesh(floor)
    bm.free()
    f_obj = link(bpy.data.objects.new("Floor", floor))
    f_obj.data.materials.append(material("floor", (0.93, 0.95, 0.98), rough=1))

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 70
    cam = link(bpy.data.objects.new("Cam", cam_data))
    scene.camera = cam
    return cam


def aim(cam, loc, target=(0, 0, 0.85)):
    cam.location = loc
    direction = Vector(target) - Vector(loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def main():
    reset()
    cam = stage()
    variants = [("front", 1, 0), ("muscle4", 4, 0), ("build+2", 1, 2), ("build-2", 1, -2)]
    for name, m, b in variants:
        for obj in [o for o in bpy.data.objects if o.name.startswith(("Hero",)) or (o.parent and o.type != "CAMERA")]:
            pass
        # rebuild the hero for each variant
        for obj in list(bpy.data.objects):
            if obj.type in {"MESH", "EMPTY"} and obj.name not in {"Floor"}:
                bpy.data.objects.remove(obj, do_unlink=True)
        build(muscle=m, build=b)
        aim(cam, (1.5, -4.4, 1.35))
        bpy.context.scene.render.filepath = os.path.join(OUT, f"hero_{name}.png")
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "hero.blend"))


main()
