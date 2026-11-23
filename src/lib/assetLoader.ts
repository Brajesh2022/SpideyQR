export type PinStyle = 'paisa' | 'music';

export interface LoadProgress {
  percent: number;
  stage: 'idle' | 'downloading' | 'ready' | 'error';
  label: string;
}

const CACHE_NAME = 'spideyqr-assets-v1';

const CORE_ASSETS = {
  baseClean: '/assets/base-clean.webp',
  handwritingFont: '/assets/fonts/handwriting.woff2',
  condensedFont: '/assets/fonts/condensed-bold.woff2',
  spideyFallback: '/assets/initials/SPIDEY.webp',
} as const;

type ProgressListener = (p: LoadProgress) => void;

class AssetLoader {
  private blobUrls = new Map<string, string>();
  private images = new Map<string, HTMLImageElement>();
  private inFlight = new Map<string, Promise<ArrayBuffer>>();
  private fontsLoaded = false;
  private corePromise: Promise<void> | null = null;
  private listeners = new Set<ProgressListener>();

  public progress: LoadProgress = {
    percent: 0,
    stage: 'idle',
    label: 'Initializing…',
  };

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    listener(this.progress);
    return () => this.listeners.delete(listener);
  }

  private emit(next: LoadProgress): void {
    this.progress = next;
    for (const fn of this.listeners) fn(next);
  }

  private async openCache(): Promise<Cache | null> {
    if (typeof caches === 'undefined') return null;
    try {
      return await caches.open(CACHE_NAME);
    } catch {
      return null;
    }
  }

  /**
   * Fetch a binary asset with Cache API persistence and optional byte progress callback.
   */
  private fetchCachedBuffer(
    url: string,
    onBytes?: (loaded: number, total: number) => void
  ): Promise<ArrayBuffer> {
    const existing = this.inFlight.get(url);
    if (existing) return existing;

    const task = (async () => {
      const cache = await this.openCache();
      if (cache) {
        const cached = await cache.match(url);
        if (cached && cached.ok) {
          const buf = await cached.arrayBuffer();
          onBytes?.(buf.byteLength, buf.byteLength);
          return buf;
        }
      }

      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);

      const totalHeader = Number(res.headers.get('content-length') || '0');
      let buf: ArrayBuffer;

      if (res.body && onBytes) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.byteLength;
            onBytes(loaded, totalHeader || loaded);
          }
        }
        const merged = new Uint8Array(loaded);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        buf = merged.buffer;
      } else {
        buf = await res.arrayBuffer();
        onBytes?.(buf.byteLength, buf.byteLength);
      }

      if (cache) {
        const contentType =
          res.headers.get('content-type') ||
          (url.endsWith('.webp')
            ? 'image/webp'
            : url.endsWith('.woff2')
              ? 'font/woff2'
              : 'application/octet-stream');
        cache
          .put(
            url,
            new Response(buf.slice(0), {
              headers: { 'Content-Type': contentType },
            })
          )
          .catch(() => {});
      }

      return buf;
    })().finally(() => {
      this.inFlight.delete(url);
    });

    this.inFlight.set(url, task);
    return task;
  }

  private async loadImageFromUrl(
    url: string,
    onBytes?: (loaded: number, total: number) => void
  ): Promise<HTMLImageElement> {
    const cachedImg = this.images.get(url);
    if (cachedImg) {
      onBytes?.(1, 1);
      return cachedImg;
    }

    const buf = await this.fetchCachedBuffer(url, onBytes);
    let objUrl = this.blobUrls.get(url);
    if (!objUrl) {
      const mime = url.endsWith('.webp') ? 'image/webp' : 'image/png';
      objUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
      this.blobUrls.set(url, objUrl);
    }

    const img = new Image();
    img.decoding = 'async';
    img.src = objUrl;
    await img.decode();
    this.images.set(url, img);
    return img;
  }

  private async ensureFonts(
    handBuf: ArrayBuffer,
    condBuf: ArrayBuffer
  ): Promise<void> {
    if (this.fontsLoaded) return;
    const handFace = new FontFace('SpideyHand', handBuf, {
      style: 'normal',
      weight: '400',
    });
    const condFace = new FontFace('SpideyCondensed', condBuf, {
      style: 'normal',
      weight: '700',
    });
    const [h, c] = await Promise.all([handFace.load(), condFace.load()]);
    document.fonts.add(h);
    document.fonts.add(c);
    await document.fonts.ready;
    this.fontsLoaded = true;
  }

  /**
   * Kick off silent background preloading immediately on page load.
   */
  startBackgroundPreload(): Promise<void> {
    if (this.corePromise) return this.corePromise;

    this.emit({ percent: 4, stage: 'downloading', label: 'Downloading assets…' });

    const weights = { base: 0.78, hand: 0.1, cond: 0.06, spidey: 0.06 };
    const frac = { base: 0, hand: 0, cond: 0, spidey: 0 };

    const updateProgress = () => {
      const pct = Math.min(
        99,
        Math.round(
          (frac.base * weights.base +
            frac.hand * weights.hand +
            frac.cond * weights.cond +
            frac.spidey * weights.spidey) *
            100
        )
      );
      this.emit({
        percent: Math.max(this.progress.percent, pct),
        stage: 'downloading',
        label: `Downloading assets (${Math.max(this.progress.percent, pct)}%)…`,
      });
    };

    this.corePromise = (async () => {
      try {
        const [, handBuf, condBuf] = await Promise.all([
          this.loadImageFromUrl(CORE_ASSETS.baseClean, (l, t) => {
            frac.base = t > 0 ? Math.min(1, l / t) : 0.5;
            updateProgress();
          }),
          this.fetchCachedBuffer(CORE_ASSETS.handwritingFont, (l, t) => {
            frac.hand = t > 0 ? Math.min(1, l / t) : 1;
            updateProgress();
          }),
          this.fetchCachedBuffer(CORE_ASSETS.condensedFont, (l, t) => {
            frac.cond = t > 0 ? Math.min(1, l / t) : 1;
            updateProgress();
          }),
          this.loadImageFromUrl(CORE_ASSETS.spideyFallback, (l, t) => {
            frac.spidey = t > 0 ? Math.min(1, l / t) : 1;
            updateProgress();
          }),
        ]);

        await this.ensureFonts(handBuf, condBuf);
        this.emit({ percent: 100, stage: 'ready', label: 'Assets cached locally' });
      } catch (err) {
        this.corePromise = null;
        this.emit({
          percent: 0,
          stage: 'error',
          label: 'Asset download failed. Retry on generate.',
        });
        throw err;
      }
    })();

    return this.corePromise;
  }

  /**
   * Resolve initial letter to its denim monogram patch URL (A–Z or SPIDEY fallback).
   */
  resolveInitialKey(name: string): string {
    const trimmed = name.trim();
    const match = trimmed.match(/[A-Za-z]/);
    return match ? match[0].toUpperCase() : 'SPIDEY';
  }

  prefetchInitial(name: string): void {
    const key = this.resolveInitialKey(name);
    const url = `/assets/initials/${key}.webp`;
    if (!this.images.has(url)) {
      this.loadImageFromUrl(url).catch(() => {});
    }
  }

  prefetchPinMusic(): void {
    const url = '/assets/pin-music.webp';
    if (!this.images.has(url)) {
      this.loadImageFromUrl(url).catch(() => {});
    }
  }

  /**
   * Guarantees core assets + user's initial monogram + optional pin asset are all ready & decoded.
   */
  async ensureAssetsForRender(
    name: string,
    pinStyle: PinStyle
  ): Promise<{
    baseImage: HTMLImageElement;
    initialImage: HTMLImageElement;
    musicPinImage: HTMLImageElement | null;
  }> {
    await this.startBackgroundPreload();

    const key = this.resolveInitialKey(name);
    const initialUrl = `/assets/initials/${key}.webp`;

    const [baseImage, initialImage, musicPinImage] = await Promise.all([
      this.loadImageFromUrl(CORE_ASSETS.baseClean),
      this.loadImageFromUrl(initialUrl).catch(() =>
        this.loadImageFromUrl(CORE_ASSETS.spideyFallback)
      ),
      pinStyle === 'music'
        ? this.loadImageFromUrl('/assets/pin-music.webp')
        : Promise.resolve(null),
    ]);

    return { baseImage, initialImage, musicPinImage };
  }
}

export const assetLoader = new AssetLoader();
