"""Cut a scene panorama into parallax layers at its true pixel size.

    python art/scene_layers.py <scene dir> [factor]

Reads <dir>/panorama.png and <dir>/depth.png (art/scene_depth.py), shrinks both by `factor` (default 4: the
generated art's pixels are about 4 screen pixels; box filter, so each block keeps its colour; a factor that isn't
whole, such as 2.6667 for art whose pixels are about 2.7 image pixels, rounds the size) and writes to
public/scenes/<scene>/:
- base.webp: the whole scene flat (shown on screens that skip parallax, and under reduced motion);
- layer-0.webp ... layer-4.webp: far (sky, mountains), forest, props (buildings, poles, near trees), ground
  (tracks and platform), front (the wall, plants and anything very near), each with transparency;
- with <dir>/panorama-night.png (the same picture drawn at night, lined up with the day one):
  night-0.webp ... and sprite-<id>-night.webp, cut along exactly the same lines as the day files;
- and art/scenes/<scene>/layers-preview.png, the layers tinted, for checking.

Above the ground line, layers come from depth bands; the ground line itself (where the platform starts) comes
from the scene's `ground` row. With a `horizon` row, everything between it and the ground line that the depth
bands would put in the far layer or the forest goes with the props instead, so only the sky and what stands on the
horizon trail behind on a lean (a sea split by depth would tear around the boats). Each layer's hidden parts are filled from its own neighbouring pixels a few pixels
in, so small parallax shifts never show holes.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

src = sys.argv[1]
factor = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0


def s(v: float) -> int:
    """A coordinate in the original art, in scene pixels."""
    return int(v // factor)


scene = os.path.basename(os.path.normpath(src))
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(src))))
out = os.path.join(root, "public", "scenes", scene)
os.makedirs(out, exist_ok=True)
cfg = json.load(open(os.path.join(src, "layers.json"), encoding="utf-8"))

pano = Image.open(os.path.join(src, "panorama.png")).convert("RGB")
if factor.is_integer():
    W, H = pano.width // int(factor), pano.height // int(factor)
else:
    W, H = round(pano.width / factor), round(pano.height / factor)
img = np.asarray(pano.resize((W, H), Image.BOX)).astype(np.uint8)
night_path = os.path.join(src, "panorama-night.png")
night = None
if os.path.exists(night_path):
    night_pano = Image.open(night_path).convert("RGB")
    if night_pano.size != pano.size:
        sys.exit(f"panorama-night.png is {night_pano.size}, the day panorama {pano.size}: they must line up")
    night = np.asarray(night_pano.resize((W, H), Image.BOX)).astype(np.uint8)
depth = np.asarray(Image.open(os.path.join(src, "depth.png")).resize((W, H), Image.BOX)).astype(np.float64) / 65535

rows = np.arange(H)[:, None].repeat(W, 1)
ground = s(cfg["ground"])  # first row of the tracks
front = s(cfg["front"])  # first row of the wall
t_forest, t_props, t_near = cfg["depth"]  # depth thresholds above the ground line

layer = np.zeros((H, W), dtype=np.int8)
above = rows < ground
layer[above & (depth >= t_forest)] = 1
layer[above & (depth >= t_props)] = 2
layer[above & (depth >= t_near)] = 4  # the big tree in front of the station
if "horizon" in cfg:
    layer[(rows >= s(cfg["horizon"])) & (rows < ground) & (layer < 2)] = 2
layer[(rows >= ground) & (rows < front)] = 3
layer[rows >= front] = 4
# where depth bands can't tell an object from the forest behind it (a bench, a tunnel mouth), boxes in the
# scene's layers.json (original pixels: x0, y0, x1, y1, layer) set the layer of everything above depth t_forest
for x0, y0, x1, y1, li in cfg.get("force", []):
    box = np.zeros((H, W), dtype=bool)
    box[s(y0) : s(y1), s(x0) : s(x1)] = True
    layer[box & (depth >= t_forest) & (rows < ground)] = li
# plants poking above the wall line and props standing on the ground stay with what they touch
names = ["far", "forest", "props", "ground", "front"]


def fill(rgb: np.ndarray, have: np.ndarray, steps: int) -> np.ndarray:
    """Grow the pixels a layer has into the pixels it doesn't, `steps` pixels deep (nearest colour wins)."""
    rgb = rgb.copy()
    have = have.copy()
    for _ in range(steps):
        grown = have.copy()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(have, dy, 0), dx, 1)
            take = sh & ~grown
            rgb[take] = np.roll(np.roll(rgb, dy, 0), dx, 1)[take]
            grown |= take
        have = grown
    return rgb, have


# moving parts (a bell): lifted out of the scene into their own sprite, and the scene filled behind them, so a
# swing never shows a second copy. Each part's box (original pixels) should hold the part and some background;
# a pixel is the part where it differs clearly from the background, estimated row by row from the box's edges.
cut_rgb = img.copy()
cut_night = None if night is None else night.copy()
cut_mask = np.zeros((H, W), dtype=bool)
for sp in cfg.get("sprites", []):
    x0, y0, x1, y1 = (s(v) for v in sp["box"])
    box = img[y0:y1, x0:x1].astype(np.float64)
    left, right = box[:, :1], box[:, -1:]
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    behind = left * (1 - t) + right * t
    diff = np.abs(box - behind).sum(2)
    warm = box[..., 0] >= box[..., 2]  # the part is warm (brass, wood, rope); the forest behind is blue-green
    if not sp.get("warm", True):
        # a part with cool bits (the chains of a sign) on a plain background: any clear difference counts
        warm = np.ones_like(warm)
    part = (diff > sp.get("threshold", 60)) & warm
    # take in the part's dark outline and shading: pixels next to it (a few steps out) that differ from the
    # background at all, whatever their colour
    for _ in range(3):
        grown = part | np.roll(part, 1, 0) | np.roll(part, -1, 0) | np.roll(part, 1, 1) | np.roll(part, -1, 1)
        part = grown & (diff > sp.get("threshold", 60) * 0.35)
    seed = (diff > sp.get("threshold", 60)) & warm
    # boxes (original pixels) that belong to the scene, not the part: the tip of a beam or brace that touches it
    for ex in sp.get("exclude", []):
        ex0, ey0, ex1, ey1 = (s(v) for v in ex)
        part[max(0, ey0 - y0):max(0, ey1 - y0), max(0, ex0 - x0):max(0, ex1 - x0)] = False
    seed &= part
    # keep only what is joined to the part's largest warm piece (drops background specks next to it)
    keep = np.zeros_like(part)
    ys, xs = np.nonzero(seed)
    if len(ys):
        stack = [(int(y), int(x)) for y, x in zip(ys, xs)]
        while stack:
            y, x = stack.pop()
            if 0 <= y < part.shape[0] and 0 <= x < part.shape[1] and part[y, x] and not keep[y, x]:
                keep[y, x] = True
                stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
        # warm seeds can be specks too: keep the component holding the most seed pixels
        labels = np.zeros(part.shape, dtype=np.int32)
        n = 0
        for y0_, x0_ in zip(*np.nonzero(keep)):
            if labels[y0_, x0_]:
                continue
            n += 1
            stack = [(int(y0_), int(x0_))]
            while stack:
                y, x = stack.pop()
                if 0 <= y < part.shape[0] and 0 <= x < part.shape[1] and keep[y, x] and not labels[y, x]:
                    labels[y, x] = n
                    stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
        counts = [(int((seed & (labels == k)).sum()), k) for k in range(1, n + 1)]
        part = labels == max(counts)[1]
        # prune thin non-warm spurs (background bits hanging off the rope): ends with one neighbour, a few times
        for _ in range(4):
            nb = (np.roll(part, 1, 0).astype(int) + np.roll(part, -1, 0) + np.roll(part, 1, 1) + np.roll(part, -1, 1))
            part &= ~((nb <= 1) & ~warm)
        # an outline pixel sits right next to the part's warm body; non-warm pixels further out are background
        body = part & warm
        near = body.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                near |= np.roll(np.roll(body, dy, 0), dx, 1)
        part &= warm | near
    else:
        part[:] = False
    sprite = np.dstack([img[y0:y1, x0:x1], np.where(part, 255, 0).astype(np.uint8)])
    Image.fromarray(sprite, "RGBA").save(os.path.join(out, f"sprite-{sp['id']}.webp"), lossless=True)
    # fill behind the part by diffusion from the pixels around it (smooth, no streaks)
    fillv = np.where(part[..., None], behind, box)
    for _ in range(300):
        avg = (np.roll(fillv, 1, 0) + np.roll(fillv, -1, 0) + np.roll(fillv, 1, 1) + np.roll(fillv, -1, 1)) / 4
        fillv = np.where(part[..., None], avg, box)
    region = cut_rgb[y0:y1, x0:x1]
    region[part] = fillv.round().astype(np.uint8)[part]
    cut_mask[y0:y1, x0:x1] |= part
    if cut_night is not None:
        # the night picture: the same part, cut along the same outline, and filled behind the same way
        nbox = night[y0:y1, x0:x1].astype(np.float64)
        sprite_n = np.dstack([night[y0:y1, x0:x1], np.where(part, 255, 0).astype(np.uint8)])
        Image.fromarray(sprite_n, "RGBA").save(os.path.join(out, f"sprite-{sp['id']}-night.webp"), lossless=True)
        nfill = np.where(part[..., None], nbox[:, :1] * (1 - t) + nbox[:, -1:] * t, nbox)
        for _ in range(300):
            avg = (np.roll(nfill, 1, 0) + np.roll(nfill, -1, 0) + np.roll(nfill, 1, 1) + np.roll(nfill, -1, 1)) / 4
            nfill = np.where(part[..., None], avg, nbox)
        cut_night[y0:y1, x0:x1][part] = nfill.round().astype(np.uint8)[part]
    print(f"sprite {sp['id']}: {int(part.sum())} px at {x0},{y0}")
img = cut_rgb
night = cut_night
# the flat scene, without the lifted parts (they are drawn from their sprites)
Image.fromarray(img).save(os.path.join(out, "base.webp"), lossless=True)
preview = np.zeros_like(img)
tints = [(120, 120, 255), (80, 200, 120), (255, 200, 80), (200, 120, 255), (255, 90, 90)]
for i, name in enumerate(names):
    mine = layer == i
    behind_me = layer > i  # nearer layers cover this one: fill under them a little
    rgb, have = fill(img, mine, 10)
    alpha = np.where(mine, 255, np.where(have & behind_me, 255, 0)).astype(np.uint8)
    if i == 0:
        # the far layer is the backdrop: no holes at all
        rgb, have = fill(img, mine, max(W, H))
        alpha[:] = 255
    rgba = np.dstack([rgb, alpha])
    Image.fromarray(rgba, "RGBA").save(os.path.join(out, f"layer-{i}.webp"), lossless=True)
    if night is not None:
        # the same cut and the same filling under nearer layers, from the night picture
        rgb_n, _ = fill(night, mine, max(W, H) if i == 0 else 10)
        Image.fromarray(np.dstack([rgb_n, alpha]), "RGBA").save(os.path.join(out, f"night-{i}.webp"), lossless=True)
    preview[mine] = (img[mine] * 0.5 + np.array(tints[i]) * 0.5).astype(np.uint8)
    print(f"layer {i} {name:7} {int(mine.sum()):6} px")
Image.fromarray(preview).resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(src, "layers-preview.png"))
print("SCENE", scene, W, "x", H, "->", out)
