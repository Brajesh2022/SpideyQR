import { assetLoader, type PinStyle } from './lib/assetLoader';
import {
  buildFinalUpiUri,
  decodeUpiQrFromFile,
  isValidUpiId,
  type DecodedUpiQr,
} from './lib/qrDecoder';
import { renderSpideyWallpaper } from './lib/compositor';
import { fetchGeneratedCount, incrementGeneratedCount } from './lib/counterApi';

type DownloadFormat = 'png' | 'jpg';

// DOM references
const form = document.getElementById('generatorForm') as HTMLFormElement;
const nameInput = document.getElementById('nameInput') as HTMLInputElement;
const upiInput = document.getElementById('upiInput') as HTMLInputElement;
const qrFileInput = document.getElementById('qrFileInput') as HTMLInputElement;
const uploadQrBtn = document.getElementById('uploadQrBtn') as HTMLButtonElement;
const nameHint = document.getElementById('nameHint') as HTMLSpanElement;
const decodedPill = document.getElementById('decodedPill') as HTMLSpanElement;
const errorMsg = document.getElementById('errorMsg') as HTMLParagraphElement;
const generateBtn = document.getElementById('generateBtn') as HTMLButtonElement;
const generateLabel = document.getElementById('generateLabel') as HTMLSpanElement;
const generateProgress = document.getElementById('generateProgress') as HTMLSpanElement;
const postGenActions = document.getElementById('postGenActions') as HTMLDivElement;
const regenTextBtn = document.getElementById('regenTextBtn') as HTMLButtonElement;
const previewSection = document.getElementById('previewSection') as HTMLDivElement;
const previewImg = document.getElementById('previewImg') as HTMLImageElement;
const mobilePreviewDl = document.getElementById('mobilePreviewDl') as HTMLDivElement;
const busyOverlay = document.getElementById('busyOverlay') as HTMLDivElement;
const busyText = document.getElementById('busyText') as HTMLSpanElement;
const hangingSpidey = document.getElementById('hangingSpidey') as HTMLDivElement;
const counterText = document.getElementById('counterText') as HTMLParagraphElement;
const shareSiteBtn = document.getElementById('shareSiteBtn') as HTMLButtonElement;
const pinButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.pin-opt')
);
const splitContainers = Array.from(
  document.querySelectorAll<HTMLDivElement>('.split-dl')
);

let pinStyle: PinStyle = 'paisa';
let selectedFormat: DownloadFormat = 'png';
let uploadedQr: DecodedUpiQr | null = null;
let lastCanvas: HTMLCanvasElement | null = null;
let lastPreviewObjectUrl: string | null = null;
let lastFileSlug = 'SpideyQR';
let isBusy = false;
let hasGeneratedOnce = false;
let isDirty = true;

function showError(msg: string | null): void {
  if (!msg) {
    errorMsg.hidden = true;
    errorMsg.textContent = '';
  } else {
    errorMsg.hidden = false;
    errorMsg.textContent = msg;
  }
}

function renderCounter(count: number): void {
  if (count < 100) {
    counterText.textContent =
      'Itna kam hai ki dikhane me sharam aa rha hai... jra share kr do yr';
  } else {
    counterText.innerHTML = `<strong>${count.toLocaleString('en-IN')}+</strong> Spider-Man UPI QRs`;
  }
}

function closeAllMenus(): void {
  for (const container of splitContainers) {
    const menu = container.querySelector<HTMLDivElement>('.format-menu');
    const caret = container.querySelector<HTMLButtonElement>('.split-caret');
    if (menu) menu.hidden = true;
    if (caret) caret.setAttribute('aria-expanded', 'false');
  }
}

function syncFormatLabels(): void {
  const label = selectedFormat === 'png' ? 'Download PNG' : 'Download JPG';
  for (const container of splitContainers) {
    const lbl = container.querySelector<HTMLSpanElement>('.dl-label');
    if (lbl) lbl.textContent = label;
    const items = container.querySelectorAll<HTMLButtonElement>('.format-item');
    items.forEach((item) => {
      item.classList.toggle('is-selected', item.dataset.fmt === selectedFormat);
    });
  }
}

/**
 * Controls the exact UX rule:
 * - Before generating OR once any input is modified (isDirty): show Generate/Regenerate CTA, hide Download!
 * - Right after generating while details are unmodified: hide CTA, show single Split Download + subtle text Regenerate!
 */
function syncActionVisibility(): void {
  closeAllMenus();
  if (!isBusy && lastCanvas && !isDirty) {
    generateBtn.hidden = true;
    postGenActions.hidden = false;
    mobilePreviewDl.hidden = false;
  } else {
    generateBtn.hidden = false;
    postGenActions.hidden = true;
    mobilePreviewDl.hidden = true;
    if (!isBusy) {
      generateLabel.textContent = hasGeneratedOnce
        ? 'Regenerate Spidey QR'
        : 'Generate Spidey QR';
    }
  }
}

function markDirty(): void {
  if (!isDirty && hasGeneratedOnce) {
    isDirty = true;
    syncActionVisibility();
  }
}

function setBusyState(active: boolean, label?: string, pct?: number): void {
  isBusy = active;
  generateBtn.disabled = active;
  busyOverlay.hidden = !active;
  hangingSpidey.classList.toggle('is-active', active);

  if (active) {
    generateBtn.hidden = false;
    postGenActions.hidden = true;
    mobilePreviewDl.hidden = true;
    if (label) {
      generateLabel.textContent = label;
      busyText.textContent = label;
    }
    generateProgress.style.width = typeof pct === 'number' ? `${pct}%` : '0%';
  } else {
    generateProgress.style.width = '0%';
    syncActionVisibility();
  }
}

function sanitizeFilename(name: string): string {
  const clean = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  return clean ? `${clean}_SpideyQR` : 'SpideyQR';
}

function triggerDownload(format: DownloadFormat): void {
  if (!lastCanvas) return;
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';
  const quality = format === 'jpg' ? 0.96 : undefined;

  lastCanvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lastFileSlug}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    mime,
    quality
  );
}

// ------------------------------------------------------------------
// 1) Background Asset Preloading IMMEDIATELY on page open
// ------------------------------------------------------------------
assetLoader.subscribe((p) => {
  if (p.stage === 'downloading' && isBusy) {
    generateLabel.textContent = `Downloading assets (${p.percent}%)...`;
    busyText.textContent = `Downloading assets (${p.percent}%)...`;
    generateProgress.style.width = `${Math.max(10, p.percent * 0.7)}%`;
  }
});

assetLoader.startBackgroundPreload().catch(() => {});
fetchGeneratedCount().then(({ count }) => renderCounter(count));

// ------------------------------------------------------------------
// 2) Input Listeners + Dirty Tracking + On-Demand Initial Prefetch
// ------------------------------------------------------------------
nameInput.addEventListener('input', () => {
  const val = nameInput.value.trim();
  nameHint.hidden = val.length <= 26;
  if (val.length > 0) assetLoader.prefetchInitial(val);
  showError(null);
  markDirty();
});

upiInput.addEventListener('input', () => {
  if (
    uploadedQr &&
    upiInput.value.trim().toLowerCase() !== uploadedQr.upiId.toLowerCase()
  ) {
    decodedPill.hidden = true;
  }
  showError(null);
  markDirty();
});

for (const btn of pinButtons) {
  btn.addEventListener('click', () => {
    const next = (btn.dataset.pin as PinStyle) || 'paisa';
    if (next === pinStyle) return;
    pinStyle = next;
    for (const b of pinButtons) {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    }
    if (pinStyle === 'music') assetLoader.prefetchPinMusic();
    markDirty();
  });
}

// Inline Upload QR
uploadQrBtn.addEventListener('click', () => qrFileInput.click());

qrFileInput.addEventListener('change', async () => {
  const file = qrFileInput.files?.[0];
  if (!file) return;
  showError(null);
  const origLabel = uploadQrBtn.querySelector('span');
  if (origLabel) origLabel.textContent = 'Scanning...';
  uploadQrBtn.disabled = true;

  try {
    const decoded = await decodeUpiQrFromFile(file);
    uploadedQr = decoded;
    upiInput.value = decoded.upiId;
    decodedPill.hidden = false;
    decodedPill.textContent = 'QR scanned ✓';

    if (!nameInput.value.trim() && decoded.payeeName) {
      nameInput.value = decoded.payeeName;
      assetLoader.prefetchInitial(decoded.payeeName);
      nameHint.hidden = decoded.payeeName.length <= 26;
    }
    markDirty();
  } catch (err) {
    decodedPill.hidden = true;
    showError(err instanceof Error ? err.message : 'Could not read QR code.');
  } finally {
    if (origLabel) origLabel.textContent = 'Upload QR';
    uploadQrBtn.disabled = false;
    qrFileInput.value = '';
  }
});

// ------------------------------------------------------------------
// 3) Split Download Buttons + Format Dropdown Wiring (Main & Mobile)
// ------------------------------------------------------------------
for (const container of splitContainers) {
  const mainBtn = container.querySelector<HTMLButtonElement>('.split-main');
  const caretBtn = container.querySelector<HTMLButtonElement>('.split-caret');
  const menu = container.querySelector<HTMLDivElement>('.format-menu');
  const items = container.querySelectorAll<HTMLButtonElement>('.format-item');

  mainBtn?.addEventListener('click', () => {
    closeAllMenus();
    triggerDownload(selectedFormat);
  });

  caretBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu) return;
    const willOpen = menu.hidden;
    closeAllMenus();
    menu.hidden = !willOpen;
    caretBtn.setAttribute('aria-expanded', String(willOpen));
  });

  items.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const fmt = (item.dataset.fmt as DownloadFormat) || 'png';
      selectedFormat = fmt;
      syncFormatLabels();
      closeAllMenus();
      triggerDownload(selectedFormat);
    });
  });
}

document.addEventListener('click', () => closeAllMenus());

// ------------------------------------------------------------------
// 4) Generate / Regenerate Core Flow
// ------------------------------------------------------------------
async function runGeneration(): Promise<void> {
  if (isBusy) return;
  showError(null);

  const name = nameInput.value.trim();
  const upiId = upiInput.value.trim();

  if (!name) {
    showError('Enter your name for the sticker and denim initial.');
    nameInput.focus();
    return;
  }

  if (!upiId || !isValidUpiId(upiId)) {
    showError('Enter a valid UPI ID (like yourname@upi) or upload a UPI QR screenshot.');
    upiInput.focus();
    return;
  }

  const upiUri = buildFinalUpiUri(upiId, name, uploadedQr);

  try {
    const initialPct = assetLoader.progress.stage === 'ready' ? 75 : assetLoader.progress.percent;
    setBusyState(
      true,
      assetLoader.progress.stage === 'ready'
        ? 'Loading initial patch...'
        : `Downloading assets (${assetLoader.progress.percent}%)...`,
      Math.max(15, initialPct * 0.7)
    );

    const { baseImage, initialImage, musicPinImage } =
      await assetLoader.ensureAssetsForRender(name, pinStyle);

    setBusyState(true, 'Stitching patches...', 82);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const result = renderSpideyWallpaper({
      name,
      upiId,
      upiUri,
      pinStyle,
      baseImage,
      initialImage,
      musicPinImage,
    });

    setBusyState(true, 'Verifying QR...', 95);
    await new Promise((r) => setTimeout(r, 80));

    if (!result.qrVerified) {
      throw new Error(
        'Generated QR failed scan verification. Please check your UPI ID and try again.'
      );
    }

    lastCanvas = result.canvas;
    lastFileSlug = sanitizeFilename(name);
    hasGeneratedOnce = true;
    isDirty = false;

    const previewBlob = await new Promise<Blob | null>((resolve) =>
      result.canvas.toBlob(resolve, 'image/webp', 0.9)
    );
    if (previewBlob) {
      if (lastPreviewObjectUrl) URL.revokeObjectURL(lastPreviewObjectUrl);
      lastPreviewObjectUrl = URL.createObjectURL(previewBlob);
      previewImg.src = lastPreviewObjectUrl;
    }

    incrementGeneratedCount().then(({ count }) => renderCounter(count));

    setBusyState(false);

    // On phones: smoothly scroll user right down to the generated preview + mobile Download button!
    if (window.innerWidth <= 840) {
      requestAnimationFrame(() => {
        previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Something went wrong while generating.');
    setBusyState(false);
  }
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  runGeneration();
});

regenTextBtn.addEventListener('click', () => {
  runGeneration();
});

// ------------------------------------------------------------------
// 5) Share Button
// ------------------------------------------------------------------
shareSiteBtn.addEventListener('click', async () => {
  const shareData = {
    title: 'SpideyQR | Spider-Man Themed UPI QR',
    text: 'Make your own custom Spider-Man themed UPI QR in 5 seconds!',
    url: window.location.href,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
  } catch {
    return;
  }
  try {
    await navigator.clipboard.writeText(window.location.href);
    const old = shareSiteBtn.textContent;
    shareSiteBtn.textContent = 'COPIED ✓';
    setTimeout(() => {
      shareSiteBtn.textContent = old || 'Share';
    }, 1800);
  } catch {
    // ignore clipboard errors
  }
});

syncFormatLabels();
syncActionVisibility();
