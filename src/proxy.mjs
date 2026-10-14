// ─────────────────────────────────────────────────────────────
// Dukungan proxy corporate (HTTP_PROXY / HTTPS_PROXY / NO_PROXY)
// memakai undici EnvHttpProxyAgent sebagai global dispatcher,
// sehingga semua fetch (gateway, telemetry) melewati proxy.
// Tanpa env proxy, fungsi ini tidak melakukan apa-apa.
// ─────────────────────────────────────────────────────────────
let initialized = false;

export function hasProxyEnv(env = process.env) {
  return Boolean(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy);
}

export async function initProxy(env = process.env) {
  if (initialized) return true;
  if (!hasProxyEnv(env)) return false;
  try {
    const { EnvHttpProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new EnvHttpProxyAgent());
    initialized = true;
    return true;
  } catch {
    return false;
  }
}
