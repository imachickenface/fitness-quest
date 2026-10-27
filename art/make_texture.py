"""Paint the hero's extra colours into unused cells of the KayKit rogue atlas (8 x 4 cells of 128 x 256 px), copying
the shading of the tunic cell so new colours keep KayKit's gradient look.

    python art/make_texture.py
"""
from pathlib import Path

from PIL import Image

ART = Path(__file__).parent
SRC = Image.open(ART / "kaykit" / "rogue_texture.png").convert("RGB")
CW, CH = 128, 256
TEMPLATE = (1, 0)  # row, col: the tunic

# row 3 holds bright test gradients the characters never use
NEW = {
    (3, 0): (31, 142, 241),  # tee
    (3, 1): (22, 100, 180),  # tee trim and collar
    (3, 2): (47, 62, 117),  # shorts
    (3, 4): (240, 243, 247),  # sneakers and waistband
}


def cell(img, r, c):
    return img.crop((c * CW, r * CH, (c + 1) * CW, (r + 1) * CH))


def main():
    tpl = cell(SRC, *TEMPLATE)
    lum = [0.299 * r + 0.587 * g + 0.114 * b for r, g, b in tpl.get_flattened_data()]
    mid = sorted(lum)[len(lum) // 2]
    out = SRC.copy()
    for (r, c), rgb in NEW.items():
        px = Image.new("RGB", (CW, CH))
        px.putdata([tuple(min(255, int(ch * (0.55 + 0.45 * l / mid))) for ch in rgb) for l in lum])
        out.paste(px, (c * CW, r * CH))
    out.save(ART / "hero" / "hero_texture.png")
    print("wrote", ART / "hero" / "hero_texture.png")


main()
