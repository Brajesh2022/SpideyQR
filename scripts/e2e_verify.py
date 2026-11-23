import os, json, threading, subprocess, tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image, ImageOps
import cv2, numpy as np, qrcode
from pyzbar.pyzbar import decode
from playwright.sync_api import sync_playwright

DIST_DIR = "/home/antigravity/SpideyQR/dist"
PUBLIC_SAMPLE = "/home/antigravity/SpideyQR/public/assets/sample-preview.webp"
QA_DIR = "/home/antigravity/work_spiderman/web_qa"
os.makedirs(QA_DIR, exist_ok=True)

# Generate a synthetic dark-mode inverted UPI QR for Peter Parker (pparker@empirebank)
qr_obj = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=4)
qr_obj.add_data("upi://pay?pa=pparker@empirebank&pn=Peter%20Parker")
qr_obj.make(fit=True)
qr_img = qr_obj.make_image(fill_color="#e5e5e5", back_color="#1c222d").convert("RGB")
SYNTH_QR = os.path.join(tempfile.gettempdir(), "peter_parker_dark_qr.png")
qr_img.save(SYNTH_QR)

mock_count = {"value": 98}

class MockCfPagesHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass
    def do_GET(self):
        if self.path.startswith("/api/count"):
            body = json.dumps({"count": mock_count["value"], "configured": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()
    def do_POST(self):
        if self.path.startswith("/api/count"):
            mock_count["value"] += 1
            body = json.dumps({"count": mock_count["value"], "configured": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

server = ThreadingHTTPServer(("127.0.0.1", 0), MockCfPagesHandler)
port = server.server_address[1]
t = threading.Thread(target=server.serve_forever, daemon=True)
t.start()
base_url = f"http://127.0.0.1:{port}/"

def verify_qr_file(path: str, expected_substr: str):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    pz = [r.data.decode("utf-8", "replace") for r in decode(im)]
    det = cv2.QRCodeDetector()
    cv_d, _, _ = det.detectAndDecode(np.array(im))
    zb = subprocess.run(["zbarimg", "-q", path], capture_output=True, text=True).stdout.strip()
    ok_pz = any(expected_substr in s for s in pz)
    ok_cv = expected_substr in (cv_d or "")
    ok_zb = expected_substr in zb
    print(f"  [{os.path.basename(path)}] {w}x{h} | pyzbar={ok_pz} | cv2={ok_cv} | zbarimg={ok_zb}")
    assert w == 1280 and h == 2600
    assert ok_pz and ok_cv and ok_zb

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/opt/ms-playwright"
console_errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])

    ctx = browser.new_context(viewport={"width": 1280, "height": 840}, accept_downloads=True)
    page = ctx.new_page()
    page.on("pageerror", lambda err: console_errors.append(str(err)))
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    page.goto(base_url, wait_until="networkidle")
    page.wait_for_timeout(1200)

    # Confirm zero personal info, zero READY pill, zero em dashes, zero lockscreen copy!
    body_text = page.locator("body").inner_text()
    assert "—" not in body_text, "Found forbidden em dash!"
    assert "lockscreen" not in body_text.lower(), "Found 'lockscreen'!"
    assert page.locator("#nameInput").get_attribute("placeholder") == "Peter Parker"
    assert page.locator("#upiInput").get_attribute("placeholder") == "pparker@empirebank"
    assert page.locator("#assetStatus").count() == 0, "READY pill should be removed!"
    assert "qrs generated" in body_text.lower()
    assert "sharam" in body_text.lower()

    # Upload dark-mode Peter Parker QR -> auto-fills BOTH pparker@empirebank AND Peter Parker!
    page.set_input_files("#qrFileInput", SYNTH_QR)
    page.wait_for_function("document.getElementById('upiInput').value === 'pparker@empirebank'", timeout=10000)
    assert page.locator("#nameInput").input_value() == "Peter Parker"
    page.click("#generateBtn")
    page.wait_for_selector("#postGenActions:not([hidden])", timeout=15000)

    with page.expect_download() as dl1:
        page.click("#downloadMainBtn")
    peter_png = os.path.join(QA_DIR, "v3_peter_parker.png")
    dl1.value.save_as(peter_png)
    verify_qr_file(peter_png, "upi://pay?pa=pparker@empirebank")

    # Save crisp 640x1300 WebP of Peter Parker (pparker@empirebank) as the official public sample-preview.webp!
    im_peter = Image.open(peter_png).convert("RGB").resize((640, 1300), Image.Resampling.LANCZOS)
    im_peter.save(PUBLIC_SAMPLE, "WEBP", quality=88, method=6)
    im_peter.save(os.path.join(DIST_DIR, "assets", "sample-preview.webp"), "WEBP", quality=88, method=6)
    print(f"Updated official sample-preview.webp with Peter Parker (pparker@empirebank): {os.path.getsize(PUBLIC_SAMPLE):,} bytes")

    # Capture clean desktop initial + generated dropdown screenshots (now showing Peter Parker!)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(QA_DIR, "v3_desktop_initial.png"))

    page.fill("#nameInput", "Peter Parker")
    page.fill("#upiInput", "pparker@empirebank")
    page.click("#generateBtn")
    page.wait_for_selector("#postGenActions:not([hidden])", timeout=15000)
    page.click(".split-dl[data-split='main'] .split-caret")
    page.wait_for_selector(".split-dl[data-split='main'] .format-menu:not([hidden])")
    page.screenshot(path=os.path.join(QA_DIR, "v3_desktop_dropdown.png"))

    # Test JPG download from dropdown
    with page.expect_download() as dl2:
        page.click(".split-dl[data-split='main'] .format-item[data-fmt='jpg']")
    peter_jpg = os.path.join(QA_DIR, "v3_peter_parker.jpg")
    dl2.value.save_as(peter_jpg)
    verify_qr_file(peter_jpg, "upi://pay?pa=pparker@empirebank")

    # Mobile flow (390 x 844) — full-bleed, ZERO box-inside-box!
    mock_count["value"] = 42
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
    mpage = mctx.new_page()
    mpage.on("pageerror", lambda err: console_errors.append(str(err)))
    mpage.goto(base_url, wait_until="networkidle")
    mpage.wait_for_timeout(1000)
    mpage.screenshot(path=os.path.join(QA_DIR, "v3_mobile_initial.png"), full_page=True)

    mpage.fill("#nameInput", "Peter Parker")
    mpage.fill("#upiInput", "pparker@empirebank")
    mpage.click("#generateBtn")
    mpage.wait_for_selector("#mobilePreviewDl:not([hidden])", timeout=15000)
    mpage.wait_for_timeout(700)
    scroll_y = mpage.evaluate("window.scrollY")
    print("Mobile auto-scroll Y:", scroll_y)
    assert scroll_y > 100

    # Open mobile bottom dropdown and verify it pops UPWARD strictly above the footer (zero clipping!)
    mpage.click(".split-dl[data-split='mobile'] .split-caret")
    mpage.wait_for_selector(".split-dl[data-split='mobile'] .format-menu:not([hidden])")
    menu_box = mpage.locator(".split-dl[data-split='mobile'] .format-menu").bounding_box()
    footer_box = mpage.locator(".footer").bounding_box()
    print("Mobile dropdown box:", menu_box, "Footer top:", footer_box["y"])
    assert menu_box["y"] + menu_box["height"] < footer_box["y"], "Mobile dropdown overlapped footer!"
    mpage.screenshot(path=os.path.join(QA_DIR, "v5_mobile_dropdown.png"), full_page=True)

    browser.close()

server.shutdown()
assert len(console_errors) == 0, f"Console errors: {console_errors}"
print("ALL V3 PRIVACY + FLAT MOBILE + PETER PARKER TESTS PASSED 100%!")
