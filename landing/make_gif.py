"""
Assembles captured PNG frames into an optimised GIF.
Produces two files:
  demo_full.gif     — full animation, 640×360, 8fps  (~20MB, good for sharing)
  demo_linkedin.gif — highlight cut,  480×270, 8fps  (~4-5MB, fits LinkedIn 5MB limit)
"""
import os, sys
from pathlib import Path
from PIL import Image

FRAMES_DIR = Path(__file__).parent / "frames"
OUT_DIR    = Path(__file__).parent

FPS        = 8
FRAME_MS   = int(1000 / FPS)  # 125ms per frame

# ── Load frames ─────────────────────────────────────────────────
pngs = sorted(FRAMES_DIR.glob("frame_*.png"))
if not pngs:
    print("No frames found in ./frames/ — run capture_frames.js first.")
    sys.exit(1)

print(f"Loading {len(pngs)} frames…")
frames_raw = [Image.open(p) for p in pngs]
total = len(frames_raw)

# ── Helper: resize + quantise ────────────────────────────────────
def make_frames(imgs, size):
    out = []
    for i, img in enumerate(imgs):
        if i % 50 == 0:
            print(f"  processing {i}/{len(imgs)}", end="\r")
        r = img.resize(size, Image.LANCZOS).convert("RGB")
        out.append(r.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=1))
    print()
    return out

# ── FULL GIF (640×360) ──────────────────────────────────────────
print("Building full GIF (640×360)…")
full_frames = make_frames(frames_raw, (640, 360))
out_full = OUT_DIR / "demo_full.gif"
full_frames[0].save(
    out_full,
    format="GIF",
    save_all=True,
    append_images=full_frames[1:],
    duration=FRAME_MS,
    loop=0,
    optimize=True,
)
size_mb = out_full.stat().st_size / 1_000_000
print(f"  -> {out_full.name}  ({size_mb:.1f} MB)")

# ── LINKEDIN HIGHLIGHT (480×270, first 28s) ──────────────────────
# First 28 seconds = 28 * FPS frames
highlight_count = min(28 * FPS, total)
print(f"Building LinkedIn highlight GIF (480×270, first {highlight_count // FPS}s)…")
hi_frames = make_frames(frames_raw[:highlight_count], (480, 270))
out_li = OUT_DIR / "demo_linkedin.gif"
hi_frames[0].save(
    out_li,
    format="GIF",
    save_all=True,
    append_images=hi_frames[1:],
    duration=FRAME_MS,
    loop=0,
    optimize=True,
)
size_mb_li = out_li.stat().st_size / 1_000_000
print(f"  -> {out_li.name}  ({size_mb_li:.1f} MB)")
print("Done!")
