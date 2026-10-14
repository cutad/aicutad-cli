// ─────────────────────────────────────────────────────────────
// Telemetry: MATI secara default (privacy-first, standar corporate).
// Aktif hanya bila CUTAD_TELEMETRY=1 DAN CUTAD_TELEMETRY_URL diset.
// Yang dikirim hanya metadata kasar (nama event, versi, OS, jumlah
// token) — TIDAK PERNAH prompt, isi file, path, atau API key.
// Kegagalan kirim diabaikan (fire-and-forget, tidak mengganggu CLI).
// ─────────────────────────────────────────────────────────────
import { VERSION } from "./version.mjs";
import { PROFILE } from "./constants.mjs";

export function isTelemetryEnabled(env = process.env) {
  return env.CUTAD_TELEMETRY === "1" && Boolean(env.CUTAD_TELEMETRY_URL);
}

export function trackEvent(event, data = {}, env = process.env) {
  if (!isTelemetryEnabled(env)) return false;
  try {
    const payload = {
      event,
      ts: new Date().toISOString(),
      version: VERSION,
      platform: process.platform,
      profile: PROFILE ? "custom" : "default",
      ...data,
    };
    // fire-and-forget
    fetch(env.CUTAD_TELEMETRY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
