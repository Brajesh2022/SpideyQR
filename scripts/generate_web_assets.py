import os, base64, math
import cv2, numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

WORK = "/home/antigravity/work_spiderman"
OUT = "/home/antigravity/SpideyQR/public/assets"
INIT_OUT = os.path.join(OUT, "initials")
os.makedirs(INIT_OUT, exist_ok=True)

# ------------------------------------------------------------------
# 1) Build base-clean.webp (1280x2600)
#    Clean plate (MARVEL removed, PETER PARKER erased, left monogram cleaned)
#    + v4 dot-matrix Spider-Man: BND PVR INOX ticket
#    + v4 clean I ❤️ PAISA enamel pin
#    + LAB-L harmony pass
# ------------------------------------------------------------------
clean = np.array(Image.open(os.path.join(WORK, "03_clean_plates_v3.png")).convert("RGB"))
H, W = clean.shape[:2]

# Apply exact v3 LAB-L contrast harmony pass first
lab = cv2.cvtColor(clean, cv2.COLOR_RGB2LAB)
L, a, b = cv2.split(lab)
x = np.arange(256, dtype=np.float32) / 255.0
lut = np.clip((x + 0.022 * np.sin(2 * np.pi * x - np.pi)) * 255.0, 0, 255).astype(np.uint8)
wall = cv2.cvtColor(cv2.merge([lut[L], a, b]), cv2.COLOR_LAB2RGB)

# Also extract clean circular I ❤️ MUSIC pin (from the graded wall BEFORE stamping I ❤️ PAISA!)
cx_p, cy_p, r_p = 870.9, 1326.3, 81.2
pad = 96
x0_p, y0_p = int(round(cx_p - pad)), int(round(cy_p - pad))
x1_p, y1_p = x0_p + 2 * pad, y0_p + 2 * pad
pin_crop = wall[y0_p:y1_p, x0_p:x1_p].copy()
yy, xx = np.ogrid[:2*pad, :2*pad]
dist_p = np.hypot(xx - (cx_p - x0_p), yy - (cy_p - y0_p))
pin_alpha = np.clip((r_p + 1.2 - dist_p) / 2.2, 0.0, 1.0)
pin_alpha = cv2.GaussianBlur(pin_alpha.astype(np.float32), (0, 0), 0.7)
pin_music_rgba = np.dstack([pin_crop, np.clip(pin_alpha * 255.0, 0, 255).astype(np.uint8)])
Image.fromarray(pin_music_rgba, "RGBA").save(os.path.join(OUT, "pin-music.webp"), "WEBP", quality=92, method=6)

# Composite v4 dot-matrix Spider-Man: BND ticket
ticket_dot_u8 = np.array(Image.open(os.path.join(WORK, "09g_ticket_dot_v2_flat.png")).convert("RGB"))
th, tw = ticket_dot_u8.shape[:2]
TL = np.array([830.5, 810.5], dtype=np.float32)
TR = np.array([1080.5, 888.0], dtype=np.float32)
vec_top = TR - TL
top_len = np.linalg.norm(vec_top)
u_right = vec_top / top_len
u_down = np.array([-u_right[1], u_right[0]], dtype=np.float32)
ticket_len_px = top_len * (tw / th)
BL = TL + u_down * ticket_len_px
BR = TR + u_down * ticket_len_px

src_pts = np.array([[tw-1, 0], [tw-1, th-1], [0, th-1], [0, 0]], dtype=np.float32)
dst_pts = np.array([TL, TR, BR, BL], dtype=np.float32)
M = cv2.getPerspectiveTransform(src_pts, dst_pts)
warped = cv2.warpPerspective(ticket_dot_u8, M, (W, H), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
rng = np.random.default_rng(2026)
warped_f = cv2.GaussianBlur(warped.astype(np.float32), (0, 0), 0.30)
warped_f = np.clip(warped_f + rng.normal(0, 2.2, size=(H, W, 1)).astype(np.float32), 0, 255)

rx0, ry0, rx1, ry1 = 720, 790, 1110, 1160
poly_roi = (dst_pts - np.array([rx0, ry0])).astype(np.int32)
poly_mask = np.zeros((ry1 - ry0, rx1 - rx0), dtype=np.uint8)
cv2.fillConvexPoly(poly_mask, poly_roi, 255)

tmask = np.array(Image.open(os.path.join(WORK, "07b_ticket_mask_qa.png")))
tmask = cv2.morphologyEx(tmask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 9)))
tmask = cv2.bitwise_and(tmask, poly_mask)

occluders = ((poly_mask > 0) & (tmask == 0)).astype(np.uint8) * 255
dist_from_occ = cv2.distanceTransform(255 - occluders, cv2.DIST_L2, 5)
ao_shadow = np.clip(0.74 + 0.26 * np.clip(dist_from_occ / 14.0, 0.0, 1.0), 0.74, 1.0)[..., None]

warped_roi = np.clip(warped_f[ry0:ry1, rx0:rx1] * ao_shadow * 0.985, 0, 255)
alpha = cv2.GaussianBlur(tmask.astype(np.float32) / 255.0, (0, 0), 1.0)[..., None]

out = wall.copy().astype(np.float32)
out[ry0:ry1, rx0:rx1] = out[ry0:ry1, rx0:rx1] * (1.0 - alpha) + warped_roi * alpha

# Composite clean I ❤️ PAISA enamel pin onto base-clean.webp
wall_pil = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert("RGBA")
pin_img = Image.open(os.path.join(WORK, "09c_paisa_pin_clean.png")).convert("RGBA")
scale_p = 162.4 / 316.0
pin_res = pin_img.resize((int(round(pin_img.width * scale_p)), int(round(pin_img.height * scale_p))), Image.Resampling.LANCZOS)
parr = np.array(pin_res, dtype=np.float32)
prgb = cv2.GaussianBlur(parr[:, :, :3], (0, 0), 0.55)
prgb = np.clip(prgb + rng.normal(0, 2.2, size=prgb.shape[:2])[..., None], 0, 255)
palpha = cv2.GaussianBlur(parr[:, :, 3], (0, 0), 0.85)
pin_photo = Image.fromarray(np.dstack([prgb, palpha]).astype(np.uint8), "RGBA")
wall_pil.alpha_composite(pin_photo, dest=(int(round(cx_p - pin_photo.width/2)), int(round(cy_p - pin_photo.height/2))))

base_clean_rgb = wall_pil.convert("RGB")
base_clean_path = os.path.join(OUT, "base-clean.webp")
base_clean_rgb.save(base_clean_path, "WEBP", quality=90, method=6)
print(f"Saved base-clean.webp: {os.path.getsize(base_clean_path):,} bytes")

# ------------------------------------------------------------------
# 2) Generate ALL 26 bespoke stitched dark-indigo denim monogram patches
#    (A.webp – Z.webp) + SPIDEY.webp fallback!
#    Reuses ONE headless Chromium page for blazing-fast batch rendering (~4s total!)
# ------------------------------------------------------------------
with open(os.path.join(WORK, "assets", "dark_denim_swatch_v2.png"), "rb") as f:
    denim_b64 = base64.b64encode(f.read()).decode("ascii")

# For B, reuse our exact verified bespoke 04d_monogram_b_patch.png (with photo realism!)
b_src = Image.open(os.path.join(WORK, "04d_monogram_b_patch.png")).convert("RGBA")
b_arr = np.array(b_src, dtype=np.float32)
b_rgb = cv2.GaussianBlur(b_arr[:, :, :3], (0, 0), 0.45)
b_rgb = np.clip(b_rgb + rng.normal(0, 2.2, size=b_rgb.shape[:2])[..., None], 0, 255)
Image.fromarray(np.dstack([b_rgb, b_arr[:, :, 3]]).astype(np.uint8), "RGBA").save(
    os.path.join(INIT_OUT, "B.webp"), "WEBP", quality=90, method=6
)

# Template for crisp varsity dark-indigo stitched denim letter patches (A–Z)
# Chunky bold letter silhouette filled with real dark-indigo denim twill,
# dark navy merrowed backing, authentic golden-cream embroidered blanket-stitch border,
# subtle embroidered gold-thread Spider-Man eye/accent mark, and soft drop shadow!
def make_letter_html(letter: str) -> str:
    # Slightly tune font-size for wide letters (M, W) vs narrow letters (I, J)
    fsize = 248
    sx = 1.0
    if letter in ("M", "W"):
        fsize = 224
        sx = 0.88
    elif letter in ("Q", "G", "O"):
        fsize = 236
        sx = 0.96
    elif letter == "I":
        fsize = 250
        sx = 1.15

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html, body {{ width:260px; height:320px; background:transparent; overflow:hidden; }}
</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="260" height="320" viewBox="0 0 260 320">
  <defs>
    <pattern id="realDenim" width="260" height="320" patternUnits="userSpaceOnUse">
      <image href="data:image/png;base64,{denim_b64}" x="0" y="0" width="260" height="320" preserveAspectRatio="xMidYMid slice"/>
    </pattern>

    <filter id="patchShadow" x="-20%" y="-15%" width="145%" height="138%">
      <feDropShadow dx="4" dy="8" stdDeviation="6.5" flood-color="#040a14" flood-opacity="0.68"/>
      <feDropShadow dx="1" dy="2" stdDeviation="2.0" flood-color="#03070d" flood-opacity="0.45"/>
    </filter>

    <filter id="threadRough" x="-6%" y="-6%" width="112%" height="112%">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="{ord(letter)}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.15" xChannelSelector="R" yChannelSelector="G"/>
    </filter>

    <!-- Chunky embroidered varsity letter text definition -->
    <g id="glyph" transform="translate(130, 246) scale({sx}, 1.06)">
      <text x="0" y="0" text-anchor="middle"
            font-family="'Liberation Sans', 'DejaVu Sans', sans-serif"
            font-weight="900" font-size="{fsize}">{letter}</text>
    </g>
  </defs>

  <g filter="url(#patchShadow)">
    <!-- Thick dark-navy denim patch backing (expands letter into chunky patch silhouette!) -->
    <use href="#glyph" fill="#0d1d35" stroke="#0c182c" stroke-width="34" stroke-linejoin="round" stroke-linecap="round"/>
    <!-- Real dark-indigo denim fill (thick padded letter body) -->
    <use href="#glyph" fill="url(#realDenim)" stroke="url(#realDenim)" stroke-width="24" stroke-linejoin="round" stroke-linecap="round"/>

    <!-- Subtle inner edge shadow bevel -->
    <use href="#glyph" fill="none" stroke="#081222" stroke-width="26" stroke-linejoin="round" stroke-linecap="round" opacity="0.28"/>

    <!-- Outer dark stitch groove + golden-cream embroidered blanket-stitch perimeter -->
    <use href="#glyph" fill="none" stroke="#18273e" stroke-width="24" stroke-linejoin="round" stroke-linecap="round" opacity="0.50"/>
    <!-- Inset golden-cream embroidered stitch running right along the patch rim -->
    <use href="#glyph" fill="none" stroke="#e4d6a8" stroke-width="18.5" stroke-linejoin="round" stroke-linecap="round"
         stroke-dasharray="3.2 4.6" filter="url(#threadRough)"/>
    <!-- Re-fill inner denim cleanly so only the crisp perimeter blanket stitch shows! -->
    <use href="#glyph" fill="url(#realDenim)" stroke="url(#realDenim)" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>

    <!-- Subtle decorative golden embroidered inner accent stitching -->
    <use href="#glyph" fill="none" stroke="#dfd2a6" stroke-width="2.4" stroke-dasharray="6.5 5" stroke-linejoin="round" opacity="0.68" filter="url(#threadRough)"/>
  </g>
</svg>
</body>
</html>"""

def make_spidey_fallback_html() -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html, body {{ width:260px; height:320px; background:transparent; overflow:hidden; }}
</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="260" height="320" viewBox="0 0 260 320">
  <defs>
    <pattern id="realDenim" width="260" height="320" patternUnits="userSpaceOnUse">
      <image href="data:image/png;base64,{denim_b64}" x="0" y="0" width="260" height="320" preserveAspectRatio="xMidYMid slice"/>
    </pattern>
    <filter id="patchShadow" x="-20%" y="-15%" width="145%" height="138%">
      <feDropShadow dx="4" dy="8" stdDeviation="6.5" flood-color="#040a14" flood-opacity="0.68"/>
    </filter>
    <filter id="threadRough" x="-6%" y="-6%" width="112%" height="112%">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="99" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <g filter="url(#patchShadow)">
    <path d="M 130 42 C 192 42, 224 94, 220 162 C 216 232, 178 278, 130 278 C 82 278, 44 232, 40 162 C 36 94, 68 42, 130 42 Z"
          fill="#0d1d35" stroke="#0c182c" stroke-width="10"/>
    <path d="M 130 42 C 192 42, 224 94, 220 162 C 216 232, 178 278, 130 278 C 82 278, 44 232, 40 162 C 36 94, 68 42, 130 42 Z"
          fill="url(#realDenim)"/>
    <path d="M 130 42 C 192 42, 224 94, 220 162 C 216 232, 178 278, 130 278 C 82 278, 44 232, 40 162 C 36 94, 68 42, 130 42 Z"
          fill="none" stroke="#e4d6a8" stroke-width="5.2" stroke-dasharray="3.2 4.2" stroke-linecap="round" filter="url(#threadRough)"/>
    <!-- Stitched gold Spider-Man eyes -->
    <g transform="translate(130, 162)" fill="#d9cca0" fill-opacity="0.28" stroke="#e4d6a8" stroke-width="4.2" stroke-linejoin="round" filter="url(#threadRough)">
      <path d="M -12 6 C -16 -24, -52 -36, -68 -16 C -70 10, -44 34, -14 22 Z"/>
      <path d="M 12 6 C 16 -24, 52 -36, 68 -16 C 70 10, 44 34, 14 22 Z"/>
    </g>
  </g>
</svg>
</body>
</html>"""

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/opt/ms-playwright"
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 260, "height": 320}, device_scale_factor=1)
    for ch in "ACDEFGHIJKLMNOPQRSTUVWXYZ":
        page.set_content(make_letter_html(ch), wait_until="load")
        tmp_png = os.path.join(WORK, f"_init_{ch}.png")
        page.screenshot(path=tmp_png, omit_background=True)
        im = Image.open(tmp_png).convert("RGBA")
        arr = np.array(im, dtype=np.float32)
        rgb = cv2.GaussianBlur(arr[:, :, :3], (0, 0), 0.42)
        rgb = np.clip(rgb + rng.normal(0, 2.0, size=rgb.shape[:2])[..., None], 0, 255)
        Image.fromarray(np.dstack([rgb, arr[:, :, 3]]).astype(np.uint8), "RGBA").save(
            os.path.join(INIT_OUT, f"{ch}.webp"), "WEBP", quality=90, method=6
        )
        os.remove(tmp_png)

    # Render SPIDEY fallback
    page.set_content(make_spidey_fallback_html(), wait_until="load")
    tmp_png = os.path.join(WORK, "_init_SPIDEY.png")
    page.screenshot(path=tmp_png, omit_background=True)
    im = Image.open(tmp_png).convert("RGBA")
    arr = np.array(im, dtype=np.float32)
    rgb = cv2.GaussianBlur(arr[:, :, :3], (0, 0), 0.42)
    rgb = np.clip(rgb + rng.normal(0, 2.0, size=rgb.shape[:2])[..., None], 0, 255)
    Image.fromarray(np.dstack([rgb, arr[:, :, 3]]).astype(np.uint8), "RGBA").save(
        os.path.join(INIT_OUT, "SPIDEY.webp"), "WEBP", quality=90, method=6
    )
    os.remove(tmp_png)
    browser.close()

# Build contact sheet of all 27 denim monogram patches for visual QA!
cols, rows = 9, 3
cw, ch_p = 130, 160
sheet = Image.new("RGB", (cols * cw, rows * ch_p), (18, 34, 58))
keys = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + ["SPIDEY"]
for idx, k in enumerate(keys):
    im = Image.open(os.path.join(INIT_OUT, f"{k}.webp")).convert("RGBA").resize((cw, ch_p), Image.Resampling.LANCZOS)
    r, c = divmod(idx, cols)
    sheet.paste(im, (c * cw, r * ch_p), im)
sheet.save(os.path.join(WORK, "11_initials_sheet_qa.png"))

sizes = [os.path.getsize(os.path.join(INIT_OUT, f"{k}.webp")) for k in keys]
print(f"Generated 27 monogram WebPs! Avg size: {sum(sizes)//len(sizes):,} bytes, Total: {sum(sizes):,} bytes")
