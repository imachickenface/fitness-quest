"""Stitch generated scene panels into one panorama, joining each pair along the least visible seam.

    python art/stitch_panorama.py <out.png> <panel1> <panel2> [<panel3> ...]

Generated panels never line up exactly, and a later panel may repeat the start of the one before it. For each
join the script slides the next panel left until its start best matches the end of the previous one (searching
how far to skip and how wide to overlap), then cuts through the overlap along the vertical path where the two
differ least (dynamic programming, one column step per row), feathering a few pixels either side of the cut.
"""
import sys

import numpy as np
from PIL import Image

OVERLAP = 192  # width the cut can wander in
FEATHER = 4  # pixels blended each side of the cut


def best_offset(a: np.ndarray, b: np.ndarray, w: int) -> int:
    """Where panel b should start (its column `s`) so that b[:, s-w:s] best matches a's last w columns."""
    tail = a[:, -w:]
    best, best_s = None, w
    for s in range(w, b.shape[1] // 2 + w, 8):
        cost = np.abs(tail - b[:, s - w : s]).sum(2).mean()
        if best is None or cost < best:
            best, best_s = cost, s
    print(f"  join at column {best_s} of the next panel, mean difference {best:.1f}")
    return best_s


def seam(cost: np.ndarray) -> np.ndarray:
    """For each row, the column of the cheapest top-to-bottom path through `cost` (moving at most 1 column a row)."""
    h, w = cost.shape
    acc = cost.astype(np.float64).copy()
    back = np.zeros((h, w), dtype=np.int64)
    for y in range(1, h):
        prev = acc[y - 1]
        left = np.r_[np.inf, prev[:-1]]
        right = np.r_[prev[1:], np.inf]
        stack = np.vstack([left, prev, right])
        k = stack.argmin(0)
        back[y] = np.arange(w) + k - 1
        acc[y] += stack[k, np.arange(w)]
    path = np.zeros(h, dtype=np.int64)
    path[-1] = int(acc[-1].argmin())
    for y in range(h - 1, 0, -1):
        path[y - 1] = back[y, path[y]]
    return path


def join(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    w = OVERLAP
    s = best_offset(a, b, w)
    ov_a, ov_b = a[:, -w:].astype(np.float64), b[:, s - w : s].astype(np.float64)
    cut = seam(np.abs(ov_a - ov_b).sum(2))
    x = np.arange(w)[None, :]
    # 0 left of the cut (panel a), 1 right of it (panel b), a short ramp across it
    t = np.clip((x - cut[:, None] + FEATHER) / (2 * FEATHER), 0, 1)[..., None]
    mid = (ov_a * (1 - t) + ov_b * t).round().astype(a.dtype)
    return np.concatenate([a[:, :-w], mid, b[:, s:]], axis=1)


def main() -> None:
    out, paths = sys.argv[1], sys.argv[2:]
    panels = [np.asarray(Image.open(p).convert("RGB")).astype(np.int16) for p in paths]
    pano = panels[0]
    for i, p in enumerate(panels[1:], 2):
        print(f"panel {i}:")
        pano = join(pano, p)
    Image.fromarray(pano.astype(np.uint8)).save(out)
    print("PANORAMA", out, pano.shape[1], "x", pano.shape[0])


if __name__ == "__main__":
    main()
