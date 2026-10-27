"""
Body-shape morph targets (shape keys) for Kenney Mini Characters: `muscle`, `fat` and `thin`.

Each vertex moves away from (or towards) the axis of the bone that mostly carries it, measured in the rest pose:
the torso around a vertical line (the belly pushes forward for `fat`, the chest widens for `muscle`), the arms
and legs around their own length. The head is left alone. In the app the keys are blended with
morphTargetInfluences: muscle / 4, fat = build / 2 when build > 0, thin = -build / 2 when build < 0.
"""
from mathutils import Vector

# per key: (torso side, torso depth, belly push forward, arm girth, leg girth)
KEYS = {
    "muscle": (1.28, 1.12, 0.0, 1.4, 1.15),
    "fat": (1.32, 1.38, 0.35, 1.12, 1.3),
    "thin": (0.84, 0.86, 0.0, 0.72, 0.8),
}
FRONT = Vector((0, -1, 0))  # glTF characters face -Y once imported into Blender


def dominant_bone(obj, v):
    best = max(v.groups, key=lambda g: g.weight, default=None)
    return obj.vertex_groups[best.group].name if best else None


def add_body_keys(obj, rig):
    """Add muscle / fat / thin shape keys to a skinned mesh of a Kenney character (rest-pose coordinates)."""
    to_rig = rig.matrix_world.inverted() @ obj.matrix_world
    from_rig = to_rig.inverted()
    bones = rig.data.bones
    pts = [to_rig @ v.co for v in obj.data.vertices]
    owner = [dominant_bone(obj, v) for v in obj.data.vertices]

    # each limb's axis: from its bone head towards the middle of the vertices it carries
    axes = {}
    for name in ("arm-left", "arm-right", "leg-left", "leg-right"):
        mine = [p for p, b in zip(pts, owner) if b == name]
        if not mine:
            continue
        head = bones[name].head_local
        mid = sum(mine, Vector()) / len(mine)
        axes[name] = (head, (mid - head).normalized())
    torso = [p for p, b in zip(pts, owner) if b == "torso"]
    t_mid = sum(torso, Vector()) / len(torso) if torso else Vector()
    t_lo = min(p.z for p in torso) if torso else 0
    t_hi = max(p.z for p in torso) if torso else 1

    if not obj.data.shape_keys:
        obj.shape_key_add(name="Basis")
    for key, (side, depth, belly, arm, leg) in KEYS.items():
        sk = obj.shape_key_add(name=key, from_mix=False)
        for i, (p, b) in enumerate(zip(pts, owner)):
            q = p.copy()
            if b == "torso":
                h = (p.z - t_lo) / max(t_hi - t_lo, 1e-6)  # 0 at the hips, 1 at the shoulders
                d = p - t_mid
                if key == "muscle":  # a V: wide chest, waist barely changes
                    sx, sy = 1 + (side - 1) * h, 1 + (depth - 1) * h
                elif key == "fat":  # widest at the belly, a little lower than the middle
                    bump = max(0.0, 1 - abs(h - 0.35) / 0.65)
                    sx, sy = 1 + (side - 1) * bump, 1 + (depth - 1) * bump
                    q += FRONT * belly * bump * (t_hi - t_lo) * (0.5 if d.dot(FRONT) > 0 else 0.1)
                else:
                    sx, sy = side, depth
                q.x = t_mid.x + d.x * sx
                q.y = t_mid.y + d.y * sy + (q.y - p.y)
            elif b in axes:
                head, a = axes[b]
                along = (p - head).dot(a)
                foot = head + a * along
                k = arm if b.startswith("arm") else leg
                if b.startswith("leg"):  # keep the soles flat on the floor
                    q = Vector((foot.x + (p.x - foot.x) * k, foot.y + (p.y - foot.y) * k, p.z))
                else:
                    q = foot + (p - foot) * k
            sk.data[i].co = from_rig @ q
        sk.value = 0.0
    return obj.data.shape_keys.key_blocks


def set_body(obj, muscle, build):
    keys = obj.data.shape_keys.key_blocks
    keys["muscle"].value = max(0, min(4, muscle)) / 4
    keys["fat"].value = max(0, build) / 2
    keys["thin"].value = max(0, -build) / 2
