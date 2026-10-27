"""Shrink the hero picker thumbnails (run after export_heroes.py): 160 px, 96-colour palette with alpha.

    python art/compress_thumbs.py
"""
from pathlib import Path

from PIL import Image

for f in (Path(__file__).parent.parent / "public" / "hero").glob("*.png"):
    im = Image.open(f).convert("RGBA").resize((160, 160), Image.LANCZOS)
    im.quantize(colors=96, method=Image.Quantize.FASTOCTREE).save(f, optimize=True)
    print(f.name, f.stat().st_size)
