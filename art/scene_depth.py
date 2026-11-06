"""Relative depth for a scene panorama with Depth Anything V2 Small (Apache-2.0), locally.

    <ComfyUI python> -s art/scene_depth.py <panorama.png> <out_depth.png>

Runs on ComfyUI's ROCm PyTorch with its transformers; the model folder is C:\\Users\\super\\models\\
depth-anything-v2-small (weights only, safetensors). The whole panorama goes in at once (518 px tall, as the model
is trained), so depth is consistent across it. Output: 16-bit PNG at the panorama's size, larger = nearer.
"""
import sys

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

MODEL = r"C:\Users\super\models\depth-anything-v2-small"

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
w, h = img.size
H = 518
W = round(w * H / h / 14) * 14
proc = AutoImageProcessor.from_pretrained(MODEL)
model = AutoModelForDepthEstimation.from_pretrained(MODEL, use_safetensors=True).eval()
device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)
inputs = proc(images=img, return_tensors="pt", size={"height": H, "width": W}, do_resize=True, keep_aspect_ratio=False)
with torch.no_grad():
    pred = model(**{k: v.to(device) for k, v in inputs.items()}).predicted_depth  # (1, H, W)
pred = torch.nn.functional.interpolate(pred[:, None], size=(h, w), mode="bicubic", align_corners=False)[0, 0]
d = pred.float().cpu().numpy()
print("DEPTH", d.shape, "finite", bool(np.isfinite(d).all()), round(float(d.min()), 3), round(float(d.max()), 3))
d = (d - d.min()) / max(float(d.max() - d.min()), 1e-6)
Image.fromarray((d * 65535).astype(np.uint16)).save(out)
print("SAVED", out)
