// ─────────────────────────────────────────────────────────────
// Provider system — multi-gateway config & switching
// Setiap provider: {name, baseUrl, apiKey, models[]}
// Disimpan di ~/.cutad/providers.json
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, DEFAULT_BASE_URL, DEFAULT_SITE } from "../constants.mjs";
import { listModels } from "../api.mjs";

const PROVIDERS_FILE = path.join(CONFIG_DIR, "providers.json");

function ensureDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

/**
 * Baca semua provider tersimpan.
 * @returns {{providers: object[], active: string}}
 */
export function readProviders() {
  try {
    const raw = fs.readFileSync(PROVIDERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      active: parsed.active || "",
    };
  } catch {
    return { providers: [], active: "" };
  }
}

/**
 * Simpan config provider.
 * @param {{providers: object[], active: string}} config
 */
export function writeProviders(config) {
  ensureDir();
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(config, null, 2));
}

/**
 * Tambah provider baru.
 * @param {{name, baseUrl, apiKey}} provider
 * @returns {string} nama provider
 */
export function addProvider(provider) {
  const { providers, active } = readProviders();
  // hindari duplikat nama
  const existing = providers.findIndex((p) => p.name === provider.name);
  if (existing >= 0) {
    providers[existing] = { ...providers[existing], ...provider };
  } else {
    providers.push(provider);
  }
  // auto-set active bila belum ada
  const newActive = active || provider.name;
  writeProviders({ providers, active: newActive });
  return provider.name;
}

/**
 * Hapus provider berdasarkan nama.
 * @param {string} name
 */
export function removeProvider(name) {
  const { providers, active } = readProviders();
  const filtered = providers.filter((p) => p.name !== name);
  const newActive = active === name ? (filtered[0]?.name || "") : active;
  writeProviders({ providers: filtered, active: newActive });
  return filtered.length;
}

/**
 * Set provider aktif.
 * @param {string} name
 */
export function setActiveProvider(name) {
  const { providers } = readProviders();
  if (!providers.some((p) => p.name === name)) return false;
  writeProviders({ providers, active: name });
  return true;
}

/**
 * Dapatkan provider aktif + kredensial.
 * Falls back ke auth.json lama bila tidak ada providers.json.
 * @returns {{name, baseUrl, apiKey, site}|null}
 */
export function getActiveProvider() {
  const { providers, active } = readProviders();
  if (providers.length === 0) {
    // fallback: baca auth.json lama
    try {
      const auth = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "auth.json"), "utf8"));
      if (auth.apiKey) {
        return {
          name: "cutad",
          baseUrl: auth.baseUrl || DEFAULT_BASE_URL,
          apiKey: auth.apiKey,
          site: auth.site || DEFAULT_SITE,
        };
      }
    } catch {}
    return null;
  }
  const found = providers.find((p) => p.name === active) || providers[0];
  return found || null;
}

/**
 * Validasi provider dengan mengambil daftar model.
 * @param {string} baseUrl
 * @param {string} apiKey
 * @returns {Promise<{id}[]>}
 */
export async function validateProvider(baseUrl, apiKey) {
  return listModels(baseUrl, apiKey);
}

/**
 * Sinkronkan provider aktif ke auth.json (compatibilitas mundur).
 */
export function syncToAuth() {
  const provider = getActiveProvider();
  if (!provider) return;
  const auth = {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    site: provider.site || (provider.baseUrl.endsWith("/v1") ? provider.baseUrl.slice(0, 3) : provider.baseUrl),
  };
  fs.writeFileSync(path.join(CONFIG_DIR, "auth.json"), JSON.stringify(auth, null, 2));
}

export { PROVIDERS_FILE };
