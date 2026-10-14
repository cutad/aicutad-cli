// ─────────────────────────────────────────────────────────────
// doctor — diagnostik lingkungan aicutad-cli.
//
// Memeriksa: versi Node, direktori config & izinnya, status login,
// base URL, keterjangkauan gateway (lewati dengan --offline),
// validitas policy, dan ketersediaan Chromium untuk tools browser.
// Keluaran teks untuk manusia atau --json untuk skrip/CI.
// Exit code 1 bila ada pemeriksaan wajib yang gagal.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, PROFILE } from "./constants.mjs";
import { readAuth, resolveBase, isAuthenticated } from "./config.mjs";
import { listModels } from "./api.mjs";
import { VERSION } from "./version.mjs";

const MIN_NODE = [22, 12, 0];

function nodeVersionOk(version = process.versions.node) {
  const parts = String(version).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (parts[i] > MIN_NODE[i]) return true;
    if (parts[i] < MIN_NODE[i]) return false;
  }
  return true;
}

function dirModeOk(dir) {
  try {
    const mode = fs.statSync(dir).mode & 0o777;
    return { exists: true, mode: "0" + mode.toString(8), ok: (mode & 0o077) === 0 };
  } catch {
    return { exists: false, mode: null, ok: false };
  }
}

function findChromium() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  // Chromium bawaan puppeteer (cache ~/.cache/puppeteer)
  try {
    const cache = path.join(process.env.HOME || "", ".cache", "puppeteer");
    if (fs.existsSync(cache)) return "puppeteer-cache";
  } catch {}
  return null;
}

/**
 * Kumpulkan hasil diagnostik.
 * @param {{offline?: boolean}} opts
 * @returns {Promise<{ok: boolean, checks: object[]}>}
 */
export async function runDoctor(opts = {}) {
  const checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });

  add("node", "Node.js >= 22.12", nodeVersionOk() ? "ok" : "fail", `v${process.versions.node}`);
  add("version", "Versi aicutad-cli", "ok", VERSION);

  const dir = dirModeOk(CONFIG_DIR);
  if (!dir.exists) {
    add("config-dir", "Direktori config", "warn", `${CONFIG_DIR} belum dibuat (akan dibuat saat login)${PROFILE ? ` (profile: ${PROFILE})` : ""}`);
  } else {
    add("config-dir", "Direktori config", dir.ok ? "ok" : "warn", `${CONFIG_DIR} mode ${dir.mode}${dir.ok ? "" : " (sebaiknya 0700)"}${PROFILE ? ` (profile: ${PROFILE})` : ""}`);
  }

  const auth = readAuth();
  const { BASE_URL } = resolveBase(opts.argv || []);
  if (isAuthenticated()) {
    const masked = auth.apiKey.length > 10 ? `${auth.apiKey.slice(0, 6)}...${auth.apiKey.slice(-4)}` : "****";
    add("auth", "Kredensial tersimpan", "ok", `apiKey ${masked}`);
  } else {
    add("auth", "Kredensial tersimpan", "warn", "belum login (jalankan: aicutad login)");
  }
  add("base-url", "Base URL gateway", "ok", auth.baseUrl || BASE_URL);

  if (opts.offline) {
    add("gateway", "Gateway terjangkau", "skip", "dilewati (--offline)");
  } else if (!isAuthenticated()) {
    add("gateway", "Gateway terjangkau", "skip", "tidak ada API key untuk diuji");
  } else {
    try {
      const models = await listModels(auth.baseUrl || BASE_URL, auth.apiKey);
      add("gateway", "Gateway terjangkau", "ok", `${models.length} model tersedia`);
    } catch (e) {
      add("gateway", "Gateway terjangkau", "fail", e.message.slice(0, 160));
    }
  }

  // Policy: bila ada file, JSON-nya harus valid.
  const policyCandidates = [
    process.env.CUTAD_POLICY_PATH,
    path.join(process.cwd(), ".aicutad", "policy.json"),
    path.join(CONFIG_DIR, "policy.json"),
  ].filter(Boolean);
  const policyFile = policyCandidates.find((f) => fs.existsSync(f));
  if (!policyFile) {
    add("policy", "File policy", "ok", "tidak ada (mode default)");
  } else {
    try {
      JSON.parse(fs.readFileSync(policyFile, "utf8"));
      add("policy", "File policy", "ok", policyFile);
    } catch (e) {
      add("policy", "File policy", "fail", `${policyFile}: JSON tidak valid (${e.message.slice(0, 80)})`);
    }
  }

  const chromium = findChromium();
  add("chromium", "Chromium (tools browser)", chromium ? "ok" : "warn", chromium || "tidak ditemukan (browse/screenshot tidak tersedia)");

  const ok = checks.every((c) => c.status !== "fail");
  return { ok, checks };
}

const ICON = { ok: "OK  ", warn: "WARN", fail: "FAIL", skip: "SKIP" };

export async function doctor(argv = []) {
  const jsonMode = argv.includes("--json");
  const offline = argv.includes("--offline");
  const rest = argv.filter((a) => a !== "--json" && a !== "--offline");
  const { ok, checks } = await runDoctor({ offline, argv: rest });
  if (jsonMode) {
    console.log(JSON.stringify({ ok, version: VERSION, checks }, null, 2));
  } else {
    console.log("\naicutad doctor - diagnostik lingkungan\n");
    for (const c of checks) {
      console.log(`  [${ICON[c.status] || c.status}] ${c.label}: ${c.detail}`);
    }
    console.log(ok ? "\n  Hasil: sehat (tidak ada kegagalan wajib).\n" : "\n  Hasil: ada kegagalan - perbaiki item FAIL di atas.\n");
  }
  if (!ok) process.exitCode = 1;
  return ok;
}

export { nodeVersionOk, MIN_NODE };
