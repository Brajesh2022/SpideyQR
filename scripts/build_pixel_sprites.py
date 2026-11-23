"""
Generates 100% original, multi-shaded retro 16-bit pixel-art SVG sprites
inspired by Ned Leeds' Spidey Tracker aesthetic.
"""
import os, json
from playwright.sync_api import sync_playwright

PALETTE = {
    '.': None,
    'K': '#0c1017',  # Crisp pixel outline black
    'R': '#e02128',  # Spidey suit crimson mid
    'r': '#ff4d52',  # Crimson highlight
    'd': '#961117',  # Crimson shadow
    'B': '#1f74bd',  # Spidey suit blue mid
    'b': '#4cb0ff',  # Blue highlight
    'n': '#114375',  # Blue shadow
    'W': '#ffffff',  # Pure white eyes / web
    'g': '#cbd5e1',  # Subtle eye lower tint
}

def grid_to_paths(grid):
    by_color = {}
    for y, row in enumerate(grid):
        x = 0
        while x < len(row):
            ch = row[x]
            color = PALETTE.get(ch)
            if color is None:
                x += 1
                continue
            x2 = x + 1
            while x2 < len(row) and row[x2] == ch:
                x2 += 1
            w = x2 - x
            by_color.setdefault(color, []).append(f"M{x} {y}h{w}v1h-{w}z")
            x = x2
    return "".join(f'<path fill="{c}" d="{"".join(cmds)}"/>' for c, cmds in by_color.items())

# 1) HANGING UPSIDE-DOWN CHIBI SPIDER-MAN (22x26)
#    Cute round chibi upside-down head with BIG iconic white lenses, tucked knees gripping silk thread!
HANGING_GRID = [
    "........KKWWKK........",
    ".......KRRWWRRK.......",
    "......KrrKWWKddK......",
    "......KBBKWWKnnK......",
    ".....KBBbKWWKnBBK.....",
    ".....KBBbKWWKnBBK.....",
    ".....KBBKKKKKKBBK.....",
    "......KBBBBBBBBK......",
    ".....KBBbRRRRnBBK.....",
    "....KrrRBRRKRBRddK....",
    "....KRRRBRKKRBRRRK....",
    "....KddKBBrrBBKddK....",
    ".....KK.KBBBBK.KK.....",
    "......KKKKKKKKKK......",
    ".....KKrrRRRRddKK.....",
    "....KrrRRRRRRRRddK....",
    "...KrrRRRRRRRRRRddK...",
    "...KrKKKRRRRRRKKKdK...",
    "...KrKWWKKRRKKWWKdK...",
    "...KrKWWWKRRKWWWKdK...",
    "...KrKWWWKRRKWWWKdK...",
    "...KrKgWWKRRKWWgKdK...",
    "...KrrKKKRRRRKKKddK...",
    "....KrrRRRRRRRRddK....",
    ".....KKdRRRRRRdKK.....",
    ".......KKKKKKKK.......",
]

HANGING_BLINK = [
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "....KrrRRRRRRRRddK....",
    "...KrrRRRRRRRRRRddK...",
    "...KrKKKKRRRRKKKKdK...",
    "...KrrRRRRRRRRRRddK...",
    "...KrrRRRRRRRRRRddK...",
    "....KrrRRRRRRRRddK....",
    "......................",
    "......................",
    "......................",
]

# 2) CUTE CHIBI STANDING CORNER SPIDER-MAN (22x23)
CORNER_GRID = [
    ".......KKKKKKKK.......",
    ".....KKrrRRRRddKK.....",
    "....KrrRRRRRRRRddK....",
    "....KrrRRRRRRRRddK....",
    "...KrrKKRRRRRRKKddK...",
    "...KrKWWKKRRKKWWKdK...",
    "...KrKWWWKRRKWWWKdK...",
    "...KrKgWWKRRKWWgKdK...",
    "...KrrKKKRRRRKKKddK...",
    "....KrrRRRRRRRRddK....",
    ".....KKdRRRRRRdKK.....",
    "......KKKKKKKKKK......",
    "....KKbBBRRRRBBnKK....",
    "...KbbBBRRKKRRBBnnK...",
    "...KRRBBBRRRRBBBRRK...",
    "...KddKBBbRRnBBKddK...",
    "....KK.KBBBBBBK.KK....",
    "......KBBbKKnBBK......",
    "......KBBK..KBBK......",
    "......KRRK..KRRK......",
    ".....KrrRK..KRddK.....",
    ".....KRRdK..KdRRK.....",
    ".....KKKK....KKKK.....",
]

CORNER_BLINK = [
    "......................",
    "......................",
    "......................",
    "......................",
    "....KrrRRRRRRRRddK....",
    "...KrrRRRRRRRRRRddK...",
    "...KrKKKKRRRRKKKKdK...",
    "...KrrRRRRRRRRRRddK...",
    "....KrrRRRRRRRRddK....",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
    "......................",
]

# 3) HIGH-DETAIL 20x17 SPIDEY MASK ICON
MASK_GRID = [
    "......KKKKKKKK......",
    "....KKrrRRRRddKK....",
    "...KrrRRRRRRRRddK...",
    "..KrrRRdRRRRdRRddK..",
    "..KrRRRRRRRRRRRRdK..",
    ".KrrKKRRRRRRRRKKddK.",
    ".KrKWWKKRRRRKKWWKdK.",
    ".KrKWWWKRRRRKWWWKdK.",
    ".KrKWWWKRRRRKWWWKdK.",
    ".KrKgWWKKRRKKWWgKdK.",
    ".KrrKKWWKRRKWWKKddK.",
    "..KrrKKKRRRRKKKddK..",
    "..KrrrRRRRRRRRdddK..",
    "...KrrRRdRRdRRddK...",
    "....KrrRRRRRRddK....",
    ".....KKddddddKK.....",
    ".......KKKKKK.......",
]

# 4) BOLD RETRO 18x16 PIXEL SPIDER EMBLEM (connected crisp legs!)
SPIDER_GRID = [
    "...K..........K...",
    "..K............K..",
    "..K....KKKK....K..",
    "...K..KKKKKK..K...",
    "....KK.KKKK.KK....",
    ".KK...KKKKKK...KK.",
    "K..KK.KKKKKK.KK..K",
    "K....KKKKKKKK....K",
    "....KKKKKKKKKK....",
    ".KK..KKKKKKKK..KK.",
    "K..KK.KKKKKK.KK..K",
    "K....K.KKKK.K....K",
    "...KK..KKKK..KK...",
    "..K....KKKK....K..",
    "..K.....KK.....K..",
    "...K..........K...",
]

def build_svg(grid, blink_grid=None, cls="", w=None, h=None):
    rows, cols = len(grid), len(grid[0])
    base = grid_to_paths(grid)
    extra = f'<g class="spidey-blink">{grid_to_paths(blink_grid)}</g>' if blink_grid else ''
    c_attr = f' class="{cls}"' if cls else ''
    w_attr = f' width="{w}"' if w else ''
    h_attr = f' height="{h}"' if h else ''
    return f'<svg{c_attr} viewBox="0 0 {cols} {rows}"{w_attr}{h_attr} shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">{base}{extra}</svg>'

svgs = {
    "hanging": build_svg(HANGING_GRID, HANGING_BLINK, "pixel-spidey", 52, 62),
    "corner": build_svg(CORNER_GRID, CORNER_BLINK, "corner-spidey-svg", 56, 58),
    "mask_badge": build_svg(MASK_GRID, None, "", 30, 26),
    "mask_plaque": build_svg(MASK_GRID, None, "", 28, 24),
    "spider_badge": build_svg(SPIDER_GRID, None, "", 26, 23),
}

out_dir = "/home/antigravity/work_spiderman/pixel_qa"
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "sprites.json"), "w") as f:
    json.dump(svgs, f)

# Also write crisp favicon.svg
with open("/home/antigravity/SpideyQR/public/favicon.svg", "w") as f:
    f.write(build_svg(MASK_GRID, None, "", 64, 54))

print("SVG byte sizes:", {k: len(v) for k, v in svgs.items()})

qa_html = f"""<!DOCTYPE html>
<html><head><style>.spidey-blink{{opacity:0}}</style></head>
<body style="background:#1c212b;display:flex;gap:34px;align-items:center;justify-content:center;height:210px;margin:0;padding:24px;">
  <div style="text-align:center;color:#9eb0c7;font-family:monospace">
    <div style="background:#262c36;padding:16px 22px;border:3px solid #0b0f16;border-radius:12px">{svgs['hanging']}</div>
    <div style="margin-top:8px">Hanging Spidey</div>
  </div>
  <div style="text-align:center;color:#9eb0c7;font-family:monospace">
    <div style="background:#262c36;padding:16px 22px;border:3px solid #0b0f16;border-radius:12px">{svgs['corner']}</div>
    <div style="margin-top:8px">Corner Chibi</div>
  </div>
  <div style="text-align:center;color:#9eb0c7;font-family:monospace">
    <div style="background:#f59e0b;border:3px solid #0b0f16;border-radius:999px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;margin:0 auto">{svgs['mask_badge']}</div>
    <div style="margin-top:8px">Mask Badge</div>
  </div>
  <div style="text-align:center;color:#9eb0c7;font-family:monospace">
    <div style="background:#ffffff;border:3px solid #0b0f16;border-radius:10px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;margin:0 auto">{svgs['spider_badge']}</div>
    <div style="margin-top:8px">Spider Badge</div>
  </div>
</body></html>"""

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/opt/ms-playwright"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
    page = b.new_page(viewport={"width": 640, "height": 220})
    page.set_content(qa_html, wait_until="load")
    page.screenshot(path=os.path.join(out_dir, "sprites_qa_v3.png"))
    b.close()
print("Saved v3 compact pixel sprites!")
