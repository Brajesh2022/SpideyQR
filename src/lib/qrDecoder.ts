import jsQR from 'jsqr';

export interface DecodedUpiQr {
  rawUri: string;
  upiId: string;
  payeeName: string;
}

const UPI_ID_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/;

export function isValidUpiId(upiId: string): boolean {
  return UPI_ID_REGEX.test(upiId.trim());
}

/**
 * Parse a decoded QR payload string. Accepts standard `upi://pay?...` URIs or bare UPI IDs.
 */
export function parseUpiPayload(raw: string): DecodedUpiQr | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  if (cleaned.toLowerCase().startsWith('upi://pay')) {
    try {
      const normalized = cleaned.replace(/^upi:\/\//i, 'https://');
      const url = new URL(normalized);
      const pa = (url.searchParams.get('pa') || '').trim();
      const pn = (url.searchParams.get('pn') || '').trim();
      if (!pa || !pa.includes('@')) return null;
      return {
        rawUri: cleaned,
        upiId: pa,
        payeeName: pn,
      };
    } catch {
      const m = cleaned.match(/[?&]pa=([^&]+)/i);
      if (m) {
        const pa = decodeURIComponent(m[1]).trim();
        const pm = cleaned.match(/[?&]pn=([^&]+)/i);
        const pn = pm ? decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim() : '';
        return { rawUri: cleaned, upiId: pa, payeeName: pn };
      }
      return null;
    }
  }

  if (isValidUpiId(cleaned)) {
    return {
      rawUri: `upi://pay?pa=${cleaned}`,
      upiId: cleaned,
      payeeName: '',
    };
  }

  return null;
}

/**
 * Build the final UPI URI to encode inside the Spider-Man QR patch.
 * If the user uploaded a QR and kept the same UPI ID, preserve their exact raw URI!
 */
export function buildFinalUpiUri(
  upiId: string,
  name: string,
  uploadedQr: DecodedUpiQr | null
): string {
  const cleanId = upiId.trim();
  if (
    uploadedQr &&
    uploadedQr.upiId.toLowerCase() === cleanId.toLowerCase()
  ) {
    return uploadedQr.rawUri;
  }
  const encodedPa = encodeURIComponent(cleanId).replace(/%40/g, '@');
  const cleanName = name.trim();
  if (cleanName) {
    return `upi://pay?pa=${encodedPa}&pn=${encodeURIComponent(cleanName)}`;
  }
  return `upi://pay?pa=${encodedPa}`;
}

function tryJsQrOnImageData(data: Uint8ClampedArray, w: number, h: number): string | null {
  const res = jsQR(data, w, h, { inversionAttempts: 'attemptBoth' });
  return res?.data || null;
}

/**
 * Run high-contrast thresholding (both normal & inverted) to rescue dark-mode translucent QRs
 * like FamPay, blurred WhatsApp screenshots, or patterned UPI cards.
 */
function tryThresholdPasses(src: Uint8ClampedArray, w: number, h: number): string | null {
  const out = new Uint8ClampedArray(src.length);

  // Compute luminance & test multiple thresholds (works great on light-on-dark FamPay QRs!)
  const thresholds = [150, 128, 175, 105];
  for (const th of thresholds) {
    // Inverted threshold: bright modules -> black (0), dark background -> white (255)
    for (let i = 0; i < src.length; i += 4) {
      const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
      const v = lum > th ? 0 : 255;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
    const r1 = jsQR(out, w, h, { inversionAttempts: 'dontInvert' });
    if (r1?.data) return r1.data;

    // Normal threshold: dark modules -> black (0), bright background -> white (255)
    for (let i = 0; i < src.length; i += 4) {
      const v = out[i] === 0 ? 255 : 0;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
    }
    const r2 = jsQR(out, w, h, { inversionAttempts: 'dontInvert' });
    if (r2?.data) return r2.data;
  }

  return null;
}

/**
 * Decode an uploaded UPI QR screenshot completely client-side.
 */
export async function decodeUpiQrFromFile(file: File): Promise<DecodedUpiQr> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();

    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.drawImage(img, 0, 0, w, h);
    const fullData = ctx.getImageData(0, 0, w, h);

    // Pass 1: Direct full-frame jsQR (normal + inverted)
    let raw = tryJsQrOnImageData(fullData.data, w, h);

    // Pass 2: Full-frame adaptive threshold (rescues translucent dark-mode FamPay cards!)
    if (!raw) {
      raw = tryThresholdPasses(fullData.data, w, h);
    }

    // Pass 3: Center crop (rescues tall full-screen phone screenshots!)
    if (!raw && h > w * 1.25) {
      const cx0 = Math.round(w * 0.06);
      const cy0 = Math.round(h * 0.16);
      const cw = Math.round(w * 0.88);
      const ch = Math.round(h * 0.58);
      const pad = 40;
      const c2 = document.createElement('canvas');
      c2.width = cw + pad * 2;
      c2.height = ch + pad * 2;
      const ctx2 = c2.getContext('2d', { willReadFrequently: true });
      if (ctx2) {
        ctx2.fillStyle = '#ffffff';
        ctx2.fillRect(0, 0, c2.width, c2.height);
        ctx2.drawImage(canvas, cx0, cy0, cw, ch, pad, pad, cw, ch);
        const sub = ctx2.getImageData(0, 0, c2.width, c2.height);
        raw =
          tryJsQrOnImageData(sub.data, c2.width, c2.height) ||
          tryThresholdPasses(sub.data, c2.width, c2.height);
      }
    }

    if (!raw) {
      throw new Error(
        'Could not detect a QR code in that image. Try a clearer screenshot or type your UPI ID.'
      );
    }

    const parsed = parseUpiPayload(raw);
    if (!parsed) {
      throw new Error(
        'That QR code does not look like a UPI payment QR (missing upi://pay or UPI ID).'
      );
    }

    return parsed;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Post-generation verification gate: decode the QR directly from the final rendered 1280x2600 canvas!
 */
export function verifyCanvasQrScannable(
  canvas: HTMLCanvasElement,
  expectedPayload: string
): boolean {
  // Crop generous region around the QR patch (centered at 632, 496)
  const rx = 340;
  const ry = 210;
  const rw = 584;
  const rh = 584;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const imgData = ctx.getImageData(rx, ry, rw, rh);
  const res = jsQR(imgData.data, rw, rh, { inversionAttempts: 'dontInvert' });
  return Boolean(res && res.data === expectedPayload);
}
