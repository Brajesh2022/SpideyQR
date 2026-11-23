import qrcode from 'qrcode-generator';
import type { PinStyle } from './assetLoader';
import { verifyCanvasQrScannable } from './qrDecoder';

export const CANVAS_W = 1280;
export const CANVAS_H = 2600;

export interface RenderOptions {
  name: string;
  upiId: string;
  upiUri: string;
  pinStyle: PinStyle;
  baseImage: HTMLImageElement;
  initialImage: HTMLImageElement;
  musicPinImage: HTMLImageElement | null;
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  qrVerified: boolean;
  upiLineCount: number;
  nameLineCount: number;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Draw realistic merrowed overlock embroidered stitches around ANY rounded rectangle
 * with uniform stitch density regardless of dynamic patch width!
 */
function drawMerrowedBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
  step = 6.0,
  length = 11.8
): void {
  const pts: Array<[number, number, number, number]> = [];
  const nTop = Math.max(2, Math.floor((w - 2 * rx) / step));
  for (let i = 0; i <= nTop; i++) {
    pts.push([x + rx + ((w - 2 * rx) * i) / nTop, y, 0, -1]);
  }
  const nArc = Math.max(4, Math.floor(((Math.PI / 2) * rx) / step));
  for (let i = 1; i < nArc; i++) {
    const a = -Math.PI / 2 + ((Math.PI / 2) * i) / nArc;
    pts.push([x + w - rx + rx * Math.cos(a), y + rx + rx * Math.sin(a), Math.cos(a), Math.sin(a)]);
  }
  const nSide = Math.max(2, Math.floor((h - 2 * rx) / step));
  for (let i = 0; i <= nSide; i++) {
    pts.push([x + w, y + rx + ((h - 2 * rx) * i) / nSide, 1, 0]);
  }
  for (let i = 1; i < nArc; i++) {
    const a = ((Math.PI / 2) * i) / nArc;
    pts.push([
      x + w - rx + rx * Math.cos(a),
      y + h - rx + rx * Math.sin(a),
      Math.cos(a),
      Math.sin(a),
    ]);
  }
  for (let i = 0; i <= nTop; i++) {
    pts.push([x + w - rx - ((w - 2 * rx) * i) / nTop, y + h, 0, 1]);
  }
  for (let i = 1; i < nArc; i++) {
    const a = Math.PI / 2 + ((Math.PI / 2) * i) / nArc;
    pts.push([x + rx + rx * Math.cos(a), y + h - rx + rx * Math.sin(a), Math.cos(a), Math.sin(a)]);
  }
  for (let i = 0; i <= nSide; i++) {
    pts.push([x, y + h - rx - ((h - 2 * rx) * i) / nSide, -1, 0]);
  }
  for (let i = 1; i < nArc; i++) {
    const a = Math.PI + ((Math.PI / 2) * i) / nArc;
    pts.push([x + rx + rx * Math.cos(a), y + rx + rx * Math.sin(a), Math.cos(a), Math.sin(a)]);
  }

  ctx.save();
  ctx.lineCap = 'round';
  for (const [px, py, nx, ny] of pts) {
    const tx = -ny;
    const ty = nx;
    const x1 = px - nx * (length * 0.52) - tx * 1.4;
    const y1 = py - ny * (length * 0.52) - ty * 1.4;
    const x2 = px + nx * (length * 0.48) + tx * 1.4;
    const y2 = py + ny * (length * 0.48) + ty * 1.4;

    ctx.strokeStyle = 'rgba(105, 13, 17, 0.62)';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(214, 40, 48, 0.94)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function createRedTwillPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const tile = document.createElement('canvas');
  tile.width = 12;
  tile.height = 12;
  const tctx = tile.getContext('2d');
  if (!tctx) return '#a91a21';
  tctx.fillStyle = '#a91a21';
  tctx.fillRect(0, 0, 12, 12);
  tctx.strokeStyle = 'rgba(130, 16, 22, 0.55)';
  tctx.lineWidth = 2.2;
  tctx.beginPath();
  tctx.moveTo(-2, 14);
  tctx.lineTo(14, -2);
  tctx.moveTo(-2, 6);
  tctx.lineTo(6, -2);
  tctx.moveTo(6, 14);
  tctx.lineTo(14, 6);
  tctx.stroke();
  tctx.strokeStyle = 'rgba(205, 42, 49, 0.30)';
  tctx.lineWidth = 1.4;
  tctx.beginPath();
  tctx.moveTo(-2, 10);
  tctx.lineTo(10, -2);
  tctx.moveTo(2, 14);
  tctx.lineTo(14, 2);
  tctx.stroke();
  return ctx.createPattern(tile, 'repeat') || '#a91a21';
}

function createCreamCanvasPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const tile = document.createElement('canvas');
  tile.width = 8;
  tile.height = 8;
  const tctx = tile.getContext('2d');
  if (!tctx) return '#f5f1e6';
  tctx.fillStyle = '#f5f1e6';
  tctx.fillRect(0, 0, 8, 8);
  tctx.strokeStyle = 'rgba(232, 225, 210, 0.52)';
  tctx.lineWidth = 1;
  tctx.beginPath();
  tctx.moveTo(0, 0.5);
  tctx.lineTo(8, 0.5);
  tctx.moveTo(0.5, 0);
  tctx.lineTo(0.5, 8);
  tctx.stroke();
  return ctx.createPattern(tile, 'repeat') || '#f5f1e6';
}

function createCreamSatinPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const tile = document.createElement('canvas');
  tile.width = 4;
  tile.height = 4;
  const tctx = tile.getContext('2d');
  if (!tctx) return '#eae5da';
  tctx.fillStyle = '#eae5da';
  tctx.fillRect(0, 0, 4, 4);
  tctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  tctx.fillRect(0, 0, 4, 1);
  tctx.fillStyle = 'rgba(195, 187, 170, 0.45)';
  tctx.fillRect(0, 2, 4, 1);
  return ctx.createPattern(tile, 'repeat') || '#eae5da';
}

/**
 * Dynamically renders the crimson embroidered UPI ID patch at top center (642, 150), tilted -2.4 deg.
 * Automatically adapts width (380..880px), font size, and 2-line split right before `@bank` for very long IDs.
 */
function drawDynamicUpiPatch(ctx: CanvasRenderingContext2D, upiId: string): number {
  const text = upiId.trim();
  const minPatchW = 360;
  const maxPatchW = 860;
  const horizPad = 62;
  const fontFamily = "'SpideyCondensed', 'Oswald', 'Arial Narrow', sans-serif";

  // Try single-line sizing first
  let lines: string[] = [text];
  let fontSize = 64;
  let patchW = minPatchW;
  let patchH = 114;

  const measure = (str: string, sz: number) => {
    ctx.font = `700 ${sz}px ${fontFamily}`;
    return ctx.measureText(str).width;
  };

  let singleW = measure(text, fontSize);
  if (singleW + horizPad * 2 <= maxPatchW) {
    patchW = Math.max(minPatchW, Math.ceil(singleW + horizPad * 2));
  } else {
    // Shrink smoothly down to 42px before considering 2-line wrap
    let fitted = false;
    for (let sz = 62; sz >= 42; sz -= 2) {
      const w = measure(text, sz);
      if (w + horizPad * 2 <= maxPatchW) {
        fontSize = sz;
        patchW = Math.max(minPatchW, Math.ceil(w + horizPad * 2));
        fitted = true;
        break;
      }
    }

    if (!fitted) {
      // Very long UPI ID -> split cleanly right before `@bank`!
      const atIdx = text.indexOf('@');
      if (atIdx > 2 && atIdx < text.length - 1) {
        lines = [text.slice(0, atIdx), text.slice(atIdx)];
      } else {
        const mid = Math.ceil(text.length / 2);
        lines = [text.slice(0, mid), text.slice(mid)];
      }
      patchH = 136;
      fontSize = 44;
      while (fontSize > 28) {
        const maxLineW = Math.max(measure(lines[0], fontSize), measure(lines[1], fontSize));
        if (maxLineW + horizPad * 2 <= maxPatchW) break;
        fontSize -= 2;
      }
      const maxLineW = Math.max(measure(lines[0], fontSize), measure(lines[1], fontSize));
      patchW = Math.min(maxPatchW, Math.max(minPatchW + 60, Math.ceil(maxLineW + horizPad * 2)));
    }
  }

  ctx.save();
  ctx.translate(642, 150);
  ctx.rotate((-2.4 * Math.PI) / 180);

  const x = -patchW / 2;
  const y = -patchH / 2;

  // Ambient + contact drop shadow onto denim
  ctx.save();
  ctx.shadowColor = 'rgba(4, 9, 18, 0.66)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 6;
  drawRoundedRectPath(ctx, x - 5, y - 5, patchW + 10, patchH + 10, 14);
  ctx.fillStyle = '#8b1218';
  ctx.fill();
  ctx.restore();

  // Woven crimson twill fabric fill
  drawRoundedRectPath(ctx, x, y, patchW, patchH, 10);
  ctx.fillStyle = createRedTwillPattern(ctx);
  ctx.fill();

  // Subtle top-to-bottom fabric lighting sheen
  const sheen = ctx.createLinearGradient(0, y, 0, y + patchH);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.13)');
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.20)');
  drawRoundedRectPath(ctx, x, y, patchW, patchH, 10);
  ctx.fillStyle = sheen;
  ctx.fill();

  // Inner stitch trough
  drawRoundedRectPath(ctx, x + 8, y + 8, patchW - 16, patchH - 16, 6);
  ctx.strokeStyle = 'rgba(99, 12, 16, 0.50)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Merrowed perimeter stitches
  drawMerrowedBorder(ctx, x, y, patchW, patchH, 10, 5.8, 11.4);

  // Satin-stitched cream UPI ID lettering
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  const satinFill = createCreamSatinPattern(ctx);

  const drawEmbroideredLine = (line: string, ly: number) => {
    ctx.save();
    ctx.shadowColor = 'rgba(71, 7, 10, 0.75)';
    ctx.shadowBlur = 2.4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2.4;
    ctx.fillStyle = satinFill;
    ctx.fillText(line, 0, ly);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 0.7;
    ctx.strokeText(line, 0, ly - 1);
  };

  if (lines.length === 1) {
    drawEmbroideredLine(lines[0], 2);
  } else {
    const gap = fontSize * 0.54;
    drawEmbroideredLine(lines[0], -gap);
    drawEmbroideredLine(lines[1], gap + 2);
  }

  ctx.restore();
  return lines.length;
}

/**
 * Draw the Collector's Spider-Man UPI QR Patch centered at (632, 496), tilted +1.1 deg.
 * Uses Error Correction Level H (30%) and crisp Spider-Man mask center medallion (<4.5% area).
 */
function drawSpiderManQrPatch(ctx: CanvasRenderingContext2D, upiUri: string): void {
  const qr = qrcode(0, 'H');
  qr.addData(upiUri);
  qr.make();
  const N = qr.getModuleCount();

  // Patch body dimensions (scaled to match exact 445x477 final footprint on 1280x2600 canvas)
  const PW = 446;
  const PH = 478;
  const QR_SIZE = 318;
  const MOD = QR_SIZE / N;
  const QR_X = -QR_SIZE / 2;
  const QR_Y = -PH / 2 + 41; // generous ~4+ module top quiet zone!

  ctx.save();
  ctx.translate(632, 496);
  ctx.rotate((1.1 * Math.PI) / 180);

  const x = -PW / 2;
  const y = -PH / 2;

  // Multi-layer realistic drop shadow onto denim
  ctx.save();
  ctx.shadowColor = 'rgba(5, 11, 20, 0.62)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 8;
  drawRoundedRectPath(ctx, x, y, PW, PH, 23);
  ctx.fillStyle = '#8b1218';
  ctx.fill();
  ctx.restore();

  // Woven cream canvas interior
  drawRoundedRectPath(ctx, x + 9, y + 9, PW - 18, PH - 18, 16);
  ctx.fillStyle = createCreamCanvasPattern(ctx);
  ctx.fill();

  const canvasLight = ctx.createLinearGradient(x, y, x + PW, y + PH);
  canvasLight.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  canvasLight.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
  canvasLight.addColorStop(1, 'rgba(27, 42, 64, 0.06)');
  drawRoundedRectPath(ctx, x + 9, y + 9, PW - 18, PH - 18, 16);
  ctx.fillStyle = canvasLight;
  ctx.fill();

  // Inner dark-indigo dashed stitch line
  ctx.save();
  drawRoundedRectPath(ctx, x + 18, y + 18, PW - 36, PH - 36, 12);
  ctx.strokeStyle = 'rgba(27, 52, 84, 0.70)';
  ctx.lineWidth = 2.0;
  ctx.setLineDash([8, 5.5]);
  ctx.stroke();
  ctx.restore();

  // Subtle stitched spiderweb corner flourishes (strictly outside 4-module quiet zone)
  ctx.save();
  ctx.strokeStyle = 'rgba(27, 52, 84, 0.28)';
  ctx.lineWidth = 1.2;
  // Top-left micro web
  const tlx = x + 23;
  const tly = y + 23;
  ctx.beginPath();
  ctx.moveTo(tlx, tly);
  ctx.lineTo(tlx + 26, tly);
  ctx.moveTo(tlx, tly);
  ctx.lineTo(tlx, tly + 26);
  ctx.moveTo(tlx, tly);
  ctx.lineTo(tlx + 19, tly + 19);
  ctx.moveTo(tlx + 12, tly);
  ctx.quadraticCurveTo(tlx + 10, tly + 10, tlx, tly + 12);
  ctx.moveTo(tlx + 22, tly);
  ctx.quadraticCurveTo(tlx + 18, tly + 18, tlx, tly + 22);
  // Top-right micro web
  const trx = x + PW - 23;
  ctx.moveTo(trx, tly);
  ctx.lineTo(trx - 26, tly);
  ctx.moveTo(trx, tly);
  ctx.lineTo(trx, tly + 26);
  ctx.moveTo(trx, tly);
  ctx.lineTo(trx - 19, tly + 19);
  ctx.moveTo(trx - 12, tly);
  ctx.quadraticCurveTo(trx - 10, tly + 10, trx, tly + 12);
  ctx.moveTo(trx - 22, tly);
  ctx.quadraticCurveTo(trx - 18, tly + 18, trx, tly + 22);
  ctx.stroke();
  ctx.restore();

  // Merrowed crimson embroidered outer edge
  drawMerrowedBorder(ctx, x + 3, y + 3, PW - 6, PH - 6, 20, 5.8, 11.2);

  // Finder patterns (3 corners)
  const drawFinder = (fr: number, fc: number) => {
    const fx = QR_X + fc * MOD;
    const fy = QR_Y + fr * MOD;
    drawRoundedRectPath(ctx, fx, fy, 7 * MOD, 7 * MOD, MOD * 0.85);
    ctx.fillStyle = '#0f1b2e';
    ctx.fill();
    drawRoundedRectPath(ctx, fx + MOD, fy + MOD, 5 * MOD, 5 * MOD, MOD * 0.5);
    ctx.fillStyle = '#f5f1e6';
    ctx.fill();
    drawRoundedRectPath(ctx, fx + 2 * MOD, fy + 2 * MOD, 3 * MOD, 3 * MOD, MOD * 0.45);
    ctx.fillStyle = '#a8171e';
    ctx.fill();
  };
  drawFinder(0, 0);
  drawFinder(0, N - 7);
  drawFinder(N - 7, 0);

  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);

  // Center medallion radius strictly bounded (< 19.5% of QR width -> < 3.8% area, huge Level-H margin!)
  const medR = Math.min(31, QR_SIZE * 0.097);
  const medRMod = medR / MOD;
  const centerMod = (N - 1) / 2;

  // QR data modules
  ctx.fillStyle = '#0f1b2e';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!qr.isDark(r, c) || isFinder(r, c)) continue;
      if (Math.hypot(r - centerMod, c - centerMod) < medRMod + 0.55) continue;
      const mx = QR_X + c * MOD;
      const my = QR_Y + r * MOD;
      drawRoundedRectPath(ctx, mx, my, MOD + 0.25, MOD + 0.25, MOD * 0.22);
      ctx.fill();
    }
  }

  // Center Spider-Man Mask Medallion
  const mcx = 0;
  const mcy = QR_Y + QR_SIZE / 2;
  ctx.save();
  ctx.translate(mcx, mcy);

  // Cream cushion halo
  ctx.beginPath();
  ctx.arc(0, 0, medR + 4.2, 0, Math.PI * 2);
  ctx.fillStyle = '#f5f1e6';
  ctx.fill();

  // Dark outline ring
  ctx.beginPath();
  ctx.arc(0, 0, medR + 0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#0f1b2e';
  ctx.fill();

  // Crimson face radial gradient
  const grad = ctx.createRadialGradient(-medR * 0.18, -medR * 0.22, 2, 0, 0, medR);
  grad.addColorStop(0, '#e3262e');
  grad.addColorStop(0.65, '#be171e');
  grad.addColorStop(1, '#870e14');
  ctx.beginPath();
  ctx.arc(0, 0, medR - 2.0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Spiderweb radial spokes & rings
  ctx.strokeStyle = 'rgba(21, 7, 9, 0.82)';
  ctx.lineWidth = 1.15;
  const webR = medR - 2.2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * webR, Math.sin(ang) * webR);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, medR * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, medR * 0.68, 0, Math.PI * 2);
  ctx.stroke();

  // Iconic Spider-Man Eyes (scaled proportionally to medR / 35)
  const es = medR / 35.0;
  ctx.save();
  ctx.scale(es, es);
  const drawEye = (sign: 1 | -1) => {
    ctx.save();
    ctx.scale(sign, 1);
    ctx.beginPath();
    ctx.moveTo(4.2, 1.8);
    ctx.bezierCurveTo(6.2, -7.5, 18.5, -12.5, 24.5, -5.8);
    ctx.bezierCurveTo(25.8, 3.2, 16.8, 11.2, 5.2, 6.8);
    ctx.closePath();
    ctx.fillStyle = '#0d1117';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(6.8, 2.2);
    ctx.bezierCurveTo(8.2, -4.2, 16.8, -8.2, 21.2, -3.8);
    ctx.bezierCurveTo(22.0, 2.0, 15.6, 7.5, 7.5, 4.8);
    ctx.closePath();
    ctx.fillStyle = '#faf8f2';
    ctx.fill();
    ctx.restore();
  };
  drawEye(-1);
  drawEye(1);
  ctx.restore();
  ctx.restore();

  // Dashed crimson divider + bottom UPI caption strictly below quiet zone
  const divY = QR_Y + QR_SIZE + 36;
  ctx.save();
  ctx.strokeStyle = 'rgba(181, 29, 36, 0.52)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4.5, 3.5]);
  ctx.beginPath();
  ctx.moveTo(-168, divY);
  ctx.lineTo(168, divY);
  ctx.stroke();
  ctx.restore();

  const capY = divY + 32;
  ctx.font = "700 22px 'SpideyCondensed', 'Oswald', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const leftTxt = '₹ ';
  const midTxt = 'SCAN TO PAY';
  const dotTxt = '  •  ';
  const rightTxt = 'ANY UPI APP';
  const wL = ctx.measureText(leftTxt).width;
  const wM = ctx.measureText(midTxt).width;
  const wD = ctx.measureText(dotTxt).width;
  const wR = ctx.measureText(rightTxt).width;
  const totalCapW = wL + wM + wD + wR;
  let curX = -totalCapW / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#b51d24';
  ctx.fillText(leftTxt, curX, capY);
  curX += wL;
  ctx.fillStyle = '#132640';
  ctx.fillText(midTxt, curX, capY);
  curX += wM;
  ctx.fillStyle = '#b51d24';
  ctx.fillText(dotTxt, curX, capY);
  curX += wD;
  ctx.fillStyle = '#132640';
  ctx.fillText(rightTxt, curX, capY);

  ctx.restore();
}

/**
 * Splits a long multi-word name into the most visually balanced 2 lines.
 */
function splitNameBalanced(name: string): [string, string] | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ');
    const l2 = words.slice(i).join(' ');
    const diff = Math.abs(l1.length - l2.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
}

/**
 * Dynamically renders the user's name onto the "HELLO my name is" sticker
 * using authentic Sharpie handwriting blended via Multiply onto real sticker paper!
 * Never truncates: auto-scales single line OR wraps cleanly onto 2 lines for long names.
 */
function drawDynamicNameTag(ctx: CanvasRenderingContext2D, rawName: string): number {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) return 1;

  const boxW = 310;
  const boxH = 122;
  const fontFamily = "'SpideyHand', 'Permanent Marker', cursive";

  const measure = (str: string, sz: number) => {
    ctx.font = `400 ${sz}px ${fontFamily}`;
    return ctx.measureText(str).width;
  };

  let lines: string[] = [name];
  let fontSize = 54;
  let scaleX = 1.0;

  // Step 1: Try fitting on 1 line down to comfortable floor (34px)
  let singleFit = false;
  for (let sz = 54; sz >= 34; sz -= 1) {
    if (measure(name, sz) <= boxW) {
      fontSize = sz;
      singleFit = true;
      break;
    }
  }

  // Step 2: If still too wide, try balanced 2-line wrap (for multi-word names!)
  if (!singleFit) {
    const split = splitNameBalanced(name);
    if (split) {
      lines = [split[0], split[1]];
      fontSize = 44;
      while (fontSize > 22) {
        const mw = Math.max(measure(lines[0], fontSize), measure(lines[1], fontSize));
        if (mw <= boxW && fontSize * 2.25 <= boxH) break;
        fontSize -= 1;
      }
      const mw = Math.max(measure(lines[0], fontSize), measure(lines[1], fontSize));
      if (mw > boxW) scaleX = Math.max(0.76, boxW / mw);
    } else {
      // Single very long word with no spaces: smoothly scale down + gentle condense
      fontSize = 33;
      while (fontSize > 20 && measure(name, fontSize) * 0.85 > boxW) {
        fontSize -= 1;
      }
      const w = measure(name, fontSize);
      if (w > boxW) scaleX = Math.max(0.76, boxW / w);
    }
  }

  ctx.save();
  ctx.translate(325, 1889);
  ctx.rotate((-3.25 * Math.PI) / 180);
  ctx.scale(scaleX, 1.0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(26, 28, 32, 0.90)';
  ctx.font = `400 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (lines.length === 1) {
    ctx.fillText(lines[0], 0, 2);
  } else {
    const dy = fontSize * 0.56;
    ctx.fillText(lines[0], 0, -dy);
    ctx.fillText(lines[1], 0, dy + 2);
  }
  ctx.restore();
  return lines.length;
}

/**
 * Full deterministic 1280x2600 wallpaper compositor + client-side QR scannability verification.
 */
export function renderSpideyWallpaper(opts: RenderOptions): RenderResult {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not initialize 2D canvas');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1) Base clean denim collage (includes dot-matrix BND ticket & clean I ❤️ PAISA pin)
  ctx.drawImage(opts.baseImage, 0, 0, CANVAS_W, CANVAS_H);

  // 2) Optional pocket pin swap to I ❤️ MUSIC
  if (opts.pinStyle === 'music' && opts.musicPinImage) {
    const cx = 870.9;
    const cy = 1326.3;
    ctx.drawImage(
      opts.musicPinImage,
      Math.round(cx - opts.musicPinImage.width / 2),
      Math.round(cy - opts.musicPinImage.height / 2)
    );
  }

  // 3) Stitched dark-indigo denim initial monogram patch (left vertical stitch seam)
  ctx.save();
  ctx.translate(138, 488);
  ctx.rotate((-7.2 * Math.PI) / 180);
  const iw = opts.initialImage.width * 0.95;
  const ih = opts.initialImage.height * 0.95;
  ctx.drawImage(opts.initialImage, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();

  // 4) Collector's Spider-Man UPI QR Patch
  drawSpiderManQrPatch(ctx, opts.upiUri);

  // 5) Dynamic Crimson Embroidered UPI ID Patch
  const upiLineCount = drawDynamicUpiPatch(ctx, opts.upiId);

  // 6) Dynamic Hand-Written Name Tag
  const nameLineCount = drawDynamicNameTag(ctx, opts.name);

  // 7) Mandatory self-verification gate (confirm generated canvas QR decodes cleanly!)
  const qrVerified = verifyCanvasQrScannable(canvas, opts.upiUri);

  return {
    canvas,
    qrVerified,
    upiLineCount,
    nameLineCount,
  };
}
