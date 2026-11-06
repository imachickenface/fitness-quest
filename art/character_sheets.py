"""Cut the owner's character sheets into sprite strips at the scenes' pixel size.

    python art/character_sheets.py [height=44] [preview.png]

Reads art/characters/walk-sheet.webp (one row per character, 8 walk frames facing right, in 192-px cells) and
art/characters/poses-sheet.webp (row 1: standing, row 2: an emote; one 512-px column per character), both with
transparent backgrounds. The generated art has no clean pixel grid and the two sheets are drawn at different
sizes, so each figure is scaled so a standing character is `height` scene pixels tall, each pixel taking its
source block's most common colour, alpha cut to on/off. Specks are dropped; an emote's marks stay with their figure.

Writes public/characters/<id>.webp, one strip: walk frames 0-7, then stand, then emote; every frame is the same
size, feet on the bottom row and the body centred, so the engine draws any frame at the same anchor. Also writes
public/characters/characters.json with each strip's frame size.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "characters")
height = int(sys.argv[1]) if len(sys.argv) > 1 else 44
preview_path = sys.argv[2] if len(sys.argv) > 2 else None

# rows of the walk sheet and columns of the poses sheet, in the same order
CHARACTERS = [
    {"id": "jacket", "name": "Jacket", "emote": "cheer"},
    {"id": "hoodie", "name": "Hoodie", "emote": "tired"},
    {"id": "tee", "name": "Tee", "emote": "huff"},
]


def load(name: str) -> np.ndarray:
    return np.array(Image.open(os.path.join(HERE, "characters", name)).convert("RGBA"))



def rows_of(alpha: np.ndarray) -> list[tuple[int, int]]:
    """Bands of rows holding anything opaque, top to bottom."""
    on = (alpha > 128).any(1)
    out, start = [], None
    for y, v in enumerate(on):
        if v and start is None:
            start = y
        if not v and start is not None:
            if y - start > 30:
                out.append((start, y))
            start = None
    if start is not None:
        out.append((start, len(on)))
    return out


def shrink(fig: np.ndarray, nw: int, nh: int) -> np.ndarray:
    """Scale an RGBA figure down to nw x nh: each output pixel takes the most common colour of its source block
    (colours binned coarsely, then averaged within the winning bin), so edges and small details such as eyes stay
    crisp instead of blending into their neighbours. A block at least half transparent stays transparent."""
    h, w = fig.shape[:2]
    out = np.zeros((nh, nw, 4), dtype=np.uint8)
    q = (fig[..., :3] // 24).astype(np.int64)
    key = q[..., 0] * 10000 + q[..., 1] * 100 + q[..., 2]
    for y in range(nh):
        ys = slice(int(y * h / nh), max(int(y * h / nh) + 1, int((y + 1) * h / nh)))
        for x in range(nw):
            xs = slice(int(x * w / nw), max(int(x * w / nw) + 1, int((x + 1) * w / nw)))
            block = fig[ys, xs]
            opaque = block[..., 3] > 128
            if opaque.mean() < 0.5:
                continue
            k = key[ys, xs][opaque]
            vals, counts = np.unique(k, return_counts=True)
            out[y, x, :3] = block[..., :3][opaque][k == vals[counts.argmax()]].mean(0)
            out[y, x, 3] = 255
    return out


def components(alpha: np.ndarray) -> list[tuple[int, int, int, int, int, np.ndarray]]:
    """Connected opaque pieces of a sheet band: (x0, y0, x1, y1, size, mask)."""
    on = alpha > 128
    seen = np.zeros_like(on)
    out = []
    for y0, x0 in zip(*np.nonzero(on)):
        if seen[y0, x0]:
            continue
        stack = [(int(y0), int(x0))]
        seen[y0, x0] = True
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < on.shape[0] and 0 <= nx < on.shape[1] and on[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        ys = np.array([p[0] for p in pts])
        xs = np.array([p[1] for p in pts])
        mask = np.zeros_like(on)
        mask[ys, xs] = True
        out.append((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1, len(pts), mask))
    return out


def figures(band: np.ndarray, centres: list[float]) -> list[tuple[np.ndarray, float]]:
    """Split a sheet band into its figures, one per cell centre, left to right. Big pieces are figures; small
    pieces (a strand of hair, an emote's marks) join the figure nearest them; specks are dropped. Returns each
    figure cropped to its pieces, and the cell centre's column within that crop."""
    parts = components(band[..., 3])
    biggest = max(p[4] for p in parts)
    bodies = sorted((p for p in parts if p[4] > biggest * 0.2), key=lambda p: p[0])
    assert len(bodies) == len(centres), (len(bodies), len(centres))
    groups = [[b] for b in bodies]
    for p in parts:
        if p[4] > biggest * 0.2 or p[4] < 40:
            continue
        gap = [max(b[0] - p[2], p[0] - b[2], 0) for b in bodies]
        groups[int(np.argmin(gap))].append(p)
    out = []
    for g, centre in zip(groups, centres):
        x0, y0 = min(p[0] for p in g), min(p[1] for p in g)
        x1, y1 = max(p[2] for p in g), max(p[3] for p in g)
        mask = np.zeros(band.shape[:2], dtype=bool)
        for p in g:
            mask |= p[5]
        fig = band.copy()
        fig[..., 3] = np.where(mask, fig[..., 3], 0)
        out.append((fig[y0:y1, x0:x1], centre - x0))
    return out


def place(sprite: np.ndarray, anchor_x: float, fw: int, fh: int) -> np.ndarray:
    """Put a sprite in an fw x fh frame: its bottom on the last row, its anchor column on the frame's centre."""
    frame = np.zeros((fh, fw, 4), dtype=np.uint8)
    h, w = sprite.shape[:2]
    x0 = int(round(fw / 2 - anchor_x))
    y0 = fh - h
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    cw, ch = min(w - sx0, fw - dx0), min(h - sy0, fh - dy0)
    frame[dy0 : dy0 + ch, dx0 : dx0 + cw] = sprite[sy0 : sy0 + ch, sx0 : sx0 + cw]
    return frame


def scaled(fig: np.ndarray, centre: float, scale: float) -> tuple[np.ndarray, float]:
    nw, nh = max(1, round(fig.shape[1] * scale)), max(1, round(fig.shape[0] * scale))
    return shrink(fig, nw, nh), centre * nw / fig.shape[1]


walk = load("walk-sheet.webp")
poses = load("poses-sheet.webp")
walk_rows = rows_of(walk[..., 3])
pose_rows = rows_of(poses[..., 3])
assert len(walk_rows) == 3 and len(pose_rows) == 2, (walk_rows, pose_rows)
pose_centres = [256 + 512 * i for i in range(3)]
standing = figures(poses[pose_rows[0][0] : pose_rows[0][1]], pose_centres)
emotes = figures(poses[pose_rows[1][0] : pose_rows[1][1]], pose_centres)
os.makedirs(OUT, exist_ok=True)
manifest = []
previews = []
for i, ch in enumerate(CHARACTERS):
    walking = figures(walk[walk_rows[i][0] : walk_rows[i][1]], [96 + 192 * k for k in range(8)])
    # the standing figure sets its sheet's scale; on the walk sheet the tallest frame (legs passing) does
    pose_scale = height / standing[i][0].shape[0]
    walk_scale = height / max(f.shape[0] for f, _ in walking)
    parts = [scaled(f, c, walk_scale) for f, c in walking]
    parts.append(scaled(*standing[i], pose_scale))
    parts.append(scaled(*emotes[i], pose_scale))
    # one frame size for all: wide enough for every sprite around its anchor
    half = max(max(a, s.shape[1] - a) for s, a in parts)
    fw = int(np.ceil(half)) * 2 + 2
    fh = max(s.shape[0] for s, _ in parts)
    frames = [place(s, a, fw, fh) for s, a in parts]
    strip = np.concatenate(frames, axis=1)
    Image.fromarray(strip, "RGBA").save(os.path.join(OUT, f"{ch['id']}.webp"), lossless=True)
    manifest.append(
        {
            "id": ch["id"],
            "name": ch["name"],
            "src": f"{ch['id']}.webp",
            "frameWidth": fw,
            "frameHeight": fh,
            "walk": list(range(8)),
            "stand": 8,
            "emote": {"frame": 9, "kind": ch["emote"]},
        }
    )
    previews.append(strip)
    print(f"{ch['id']}: frames {fw}x{fh}, walk scale {walk_scale:.3f}, pose scale {pose_scale:.3f}")

with open(os.path.join(OUT, "characters.json"), "w", encoding="utf-8") as f:
    json.dump({"v": 1, "characters": manifest}, f, indent=2)
    f.write("\n")

if preview_path:
    w = max(p.shape[1] for p in previews)
    sheet = np.zeros((sum(p.shape[0] for p in previews), w, 4), dtype=np.uint8)
    y = 0
    for p in previews:
        sheet[y : y + p.shape[0], : p.shape[1]] = p
        y += p.shape[0]
    big = Image.fromarray(sheet, "RGBA").resize((w * 6, sheet.shape[0] * 6), Image.NEAREST)
    bg = Image.new("RGBA", big.size, (60, 70, 90, 255))
    bg.alpha_composite(big)
    bg.save(preview_path)
