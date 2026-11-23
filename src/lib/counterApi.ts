export interface CountResponse {
  count: number;
  configured: boolean;
}

const LOCAL_FALLBACK_KEY = 'spideyqr_local_dev_count';

function getLocalFallbackCount(): number {
  try {
    return Number(localStorage.getItem(LOCAL_FALLBACK_KEY) || '0') || 0;
  } catch {
    return 0;
  }
}

function setLocalFallbackCount(v: number): void {
  try {
    localStorage.setItem(LOCAL_FALLBACK_KEY, String(v));
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchGeneratedCount(): Promise<CountResponse> {
  try {
    const res = await fetch('/api/count', { cache: 'no-store' });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = (await res.json()) as CountResponse;
      if (typeof data.count === 'number') {
        return data;
      }
    }
  } catch {
    // Running under Vite dev without Cloudflare Pages Functions
  }
  return { count: getLocalFallbackCount(), configured: false };
}

export async function incrementGeneratedCount(): Promise<CountResponse> {
  try {
    const res = await fetch('/api/count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = (await res.json()) as CountResponse;
      if (typeof data.count === 'number' && data.configured) {
        return data;
      }
    }
  } catch {
    // Fallback when local vite dev has no D1 bound
  }
  const next = getLocalFallbackCount() + 1;
  setLocalFallbackCount(next);
  return { count: next, configured: false };
}
