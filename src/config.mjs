// Load / simpan konfigurasi auth untuk Cutad CLI
import fs from "node:fs";
import path from "node:path";
import { AUTH_FILE, CONFIG_DIR, DEFAULT_BASE_URL, DEFAULT_SITE } from "./constants.mjs";
import { atomicWriteFileSync } from "./fs-utils.mjs";

/**
 * Membaca auth dari disk.
 * @returns {{apiKey?: string, baseUrl?: string, site?: string, model?: string}} objek auth (atau {} bila belum ada)
 */
export function readAuth() {
  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Menulis auth ke disk (membuat direktori bila perlu).
 */
export function writeAuth(auth) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const merged = { ...readAuth(), ...auth };
  // auth.json berisi API key: tulis ATOMIK dengan 0600.
  atomicWriteFileSync(AUTH_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
  try { fs.chmodSync(CONFIG_DIR, 0o700); } catch {}
}

/**
 * Menghapus seluruh auth.
 */
export function clearAuth() {
  try {
    fs.rmSync(AUTH_FILE, { force: true });
  } catch {}
}

/**
 * Resolve baseUrl dengan prioritas yang konsisten di semua perintah:
 * flag --base/-b > env CUTAD_BASE > baseUrl tersimpan di auth.json > default.
 * (Bug lama: chat/agent/TUI mengabaikan baseUrl custom dari login.)
 */
export function resolveBase(argv = []) {
  let idx = argv.indexOf("--base");
  let base = (idx >= 0 && argv[idx + 1]) ? argv[idx + 1] : undefined;
  if (!base) {
    idx = argv.indexOf("-b");
    base = (idx >= 0 && argv[idx + 1]) ? argv[idx + 1] : undefined;
  }
  if (!base) {
    // bentuk --base=<url>
    const eq = argv.find((a) => typeof a === "string" && a.startsWith("--base="));
    if (eq) base = eq.slice("--base=".length);
  }
  base = base ?? process.env.CUTAD_BASE ?? readAuth().baseUrl ?? DEFAULT_BASE_URL;
  base = String(base).replace(/\/+$/, ""); // hilangkan trailing slash
  const site = base.endsWith("/v1") ? base.slice(0, -3) : base;
  return { SITE: site, BASE_URL: base };
}

/** Cek apakah sudah login (ada apiKey). */
export function isAuthenticated() {
  const { apiKey } = readAuth();
  return Boolean(apiKey);
}

/**
 * Mendapatkan headers otorisasi untuk request.
 */
export function authHeaders(auth = readAuth()) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Cutad-CLI",
  };
  if (auth.apiKey) {
    headers.Authorization = `Bearer ${auth.apiKey}`;
  }
  return headers;
}

export {
  DEFAULT_SITE,
  DEFAULT_BASE_URL,
  AUTH_FILE,
};
