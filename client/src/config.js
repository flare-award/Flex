// API/Socket base URL is resolved in this order:
//  1. ?server=... query param       (handy for testing)
//  2. VITE_API_URL env at build     (set in CI for GH Pages deploys)
//  3. window.FLEX_API_URL set by index.html at runtime (if injected)
//  4. same-origin (dev / docker / single-host deploys)
export function resolveApiUrl() {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('server');
    if (q) return q.replace(/\/+$/, '');
  } catch {}
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.FLEX_API_URL) return window.FLEX_API_URL.replace(/\/+$/, '');
  return ''; // same origin
}

export const API_BASE = resolveApiUrl();
