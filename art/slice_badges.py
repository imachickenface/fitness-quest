"""Cut the owner's badge sheet (4 columns x 5 rows, transparent background) into one image per title.

Usage: python art/slice_badges.py <sheet.webp>
Writes public/badges/<title id>.webp (160 x 160, centred, transparent), in TITLE_IDS order, row by row.
"""
import sys
from pathlib import Path

from PIL import Image

# the sheet's order, row by row, matched to src/contract.ts TITLE_IDS
IDS = [
    "novice", "apprentice", "adventurer", "veteran",
    "champion", "legend", "steady", "unbreakable",
    "relentless", "first_sweat", "regular", "iron_devotee",
    "gym_rat", "road_runner", "quester", "hero_of_the_realm",
    "silver_lifter", "gold_lifter", "diamond_lifter", "titan",
]
SIZE = 160
OUT = Path(__file__).resolve().parent.parent / "public" / "badges"


def blobs(mask: Image.Image, scale: int = 4) -> list[tuple[int, int, int, int]]:
    """Bounding boxes of the separate shapes in a mask (found on a 1/scale copy), small specks dropped and
    shapes whose boxes overlap merged."""
    small = mask.resize((mask.width // scale, mask.height // scale), Image.NEAREST)
    w, h = small.size
    px = small.load()
    seen = bytearray(w * h)
    boxes = []
    for y0 in range(h):
        for x0 in range(w):
            if not px[x0, y0] or seen[y0 * w + x0]:
                continue
            stack = [(x0, y0)]
            seen[y0 * w + x0] = 1
            x1 = x2 = x0
            y1 = y2 = y0
            n = 0
            while stack:
                x, y = stack.pop()
                n += 1
                x1, x2, y1, y2 = min(x1, x), max(x2, x), min(y1, y), max(y2, y)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny] and not seen[ny * w + nx]:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            if n > 40:
                boxes.append([x1, y1, x2, y2])
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]:
                    boxes[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    del boxes[j]
                    merged = True
                    break
            if merged:
                break
    return [(x1 * scale, y1 * scale, (x2 + 1) * scale, (y2 + 1) * scale) for x1, y1, x2, y2 in boxes]


def main() -> None:
    sheet = Image.open(sys.argv[1]).convert("RGBA")
    mask = sheet.getchannel("A").point(lambda v: 255 if v > 24 else 0)
    boxes = blobs(mask)
    if len(boxes) != len(IDS):
        raise SystemExit(f"found {len(boxes)} badges, expected {len(IDS)}")
    # rows by centre height (a gap of a fifth of the sheet), then left to right
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows = [boxes[i : i + 4] for i in range(0, len(boxes), 4)]
    ordered = [b for row in rows for b in sorted(row, key=lambda b: b[0])]
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (x1, y1, x2, y2) in zip(IDS, ordered):
        cell = sheet.crop((max(0, x1 - 2), max(0, y1 - 2), x2 + 2, y2 + 2))
        badge = cell.crop(cell.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox())
        side = max(badge.size)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(badge, ((side - badge.width) // 2, (side - badge.height) // 2))
        square = square.resize((SIZE, SIZE), Image.LANCZOS)
        path = OUT / f"{name}.webp"
        square.save(path, "WEBP", quality=88, method=6)
        print(f"{name:18} {badge.size} -> {path.name} {path.stat().st_size} B")


if __name__ == "__main__":
    main()
