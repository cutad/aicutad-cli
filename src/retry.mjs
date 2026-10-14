// Retry khusus error transient (HTTP 429/5xx, network putus, timeout).
// Error permanen (4xx lain, JSON rusak) langsung dilempar tanpa retry.
export function isTransientError(e) {
  const msg = String(e?.message || e);
  return /HTTP (429|5\d\d)/.test(msg)
    || e?.name === "AbortError"
    || /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket|network/i.test(msg);
}

export async function withRetry(fn, { attempts = 3, baseDelayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientError(e) || i === attempts - 1) throw e;
      const wait = baseDelayMs * 2 ** i + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
