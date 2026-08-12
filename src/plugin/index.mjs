// ─────────────────────────────────────────────────────────────
// Plugin system — load external modules dynamically
// Plugin: modul ES yang export {name, description, setup(hooks)}
// Config di ~/.cutad/plugins.json
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CONFIG_DIR } from "../constants.mjs";

const PLUGINS_FILE = path.join(CONFIG_DIR, "plugins.json");

/** Baca config plugin. */
export function readPluginConfig() {
  try {
    return JSON.parse(fs.readFileSync(PLUGINS_FILE, "utf8"));
  } catch {
    return { plugins: [] };
  }
}

/** Simpan config plugin. */
export function writePluginConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PLUGINS_FILE, JSON.stringify(config, null, 2));
}

/**
 * Daftar plugin terdaftar.
 * @returns {{name, path, enabled}[]}
 */
export function listPlugins() {
  const { plugins } = readPluginConfig();
  return Array.isArray(plugins) ? plugins : [];
}

/**
 * Daftarkan plugin baru.
 * @param {string} name nama plugin
 * @param {string} pluginPath path absolut atau relatif
 */
export function registerPlugin(name, pluginPath) {
  const config = readPluginConfig();
  const existing = config.plugins.findIndex((p) => p.name === name);
  const entry = { name, path: path.resolve(pluginPath), enabled: true };
  if (existing >= 0) {
    config.plugins[existing] = entry;
  } else {
    config.plugins.push(entry);
  }
  writePluginConfig(config);
  return name;
}

/**
 * Hapus plugin.
 * @param {string} name
 */
export function unregisterPlugin(name) {
  const config = readPluginConfig();
  config.plugins = config.plugins.filter((p) => p.name !== name);
  writePluginConfig(config);
  return true;
}

/**
 * Enable/disable plugin.
 * @param {string} name
 * @param {boolean} enabled
 */
export function togglePlugin(name, enabled) {
  const config = readPluginConfig();
  const plugin = config.plugins.find((p) => p.name === name);
  if (!plugin) return false;
  plugin.enabled = enabled;
  writePluginConfig(config);
  return true;
}

/**
 * Muat semua plugin enabled & jalankan setup().
 * @param {object} hooks hook registry {onMessage, onCommand, onStartup, ...}
 * @returns {Promise<{name, instance}[]>}
 */
export async function loadPlugins(hooks = {}) {
  const plugins = listPlugins().filter((p) => p.enabled);
  const loaded = [];
  for (const plugin of plugins) {
    try {
      const mod = await import(pathToFileURL(plugin.path).href);
      const instance = mod.default || mod;
      if (typeof instance.setup === "function") {
        instance.setup(hooks);
      }
      loaded.push({ name: plugin.name, instance });
    } catch (e) {
      console.error(`Plugin gagal dimuat: ${plugin.name} — ${e.message}`);
    }
  }
  return loaded;
}

export { PLUGINS_FILE };
