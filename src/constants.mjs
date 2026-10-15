// ─────────────────────────────────────────────────────────────
// Konfigurasi enterprise:
// - Profile: CUTAD_PROFILE=<name> memisahkan config ke
//   ~/.cutad/profiles/<name>/ (tanpa profile: ~/.cutad/).
//   Cocok untuk memisahkan kredensial kerja vs pribadi/corporate.
// - Semua modul membaca CONFIG_DIR dari sini, jadi profile berlaku
//   konsisten untuk auth, sesi, checkpoint, audit log, dan policy.
// ─────────────────────────────────────────────────────────────
import os from "node:os";
import path from "node:path";

function sanitizeProfile(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

export const PROFILE = sanitizeProfile(process.env.CUTAD_PROFILE);

const BASE_DIR = path.join(os.homedir(), ".cutad");

// Direktori konfigurasi aktif (memperhitungkan profile)
export const CONFIG_DIR = PROFILE
  ? path.join(BASE_DIR, "profiles", PROFILE)
  : BASE_DIR;

// File yang menyimpan auth (apiKey + baseUrl)
export const AUTH_FILE = path.join(CONFIG_DIR, "auth.json");

// Base gateway default (OpenAI-compatible)
export const DEFAULT_SITE = "https://ai.cutad.web.id";
export const DEFAULT_BASE_URL = `${DEFAULT_SITE}/v1`;

// Timeout default (ms)
export const REQUEST_TIMEOUT_MS = 120_000;

// Konstanta model fallback
export const DEFAULT_MAX_TOKENS = 32_000;
export const DEFAULT_CONTEXT_WINDOW = 128_000;

// Batas iterasi agentic loop.
// Prioritas: opsi eksplisit pemanggil > env CUTAD_MAX_ITERATIONS > default.
export const DEFAULT_MAX_ITERATIONS = 100;
export const MAX_ITERATIONS_LIMIT = 1000;

/** Resolusi batas iterasi: selalu integer valid dalam [1, 1000]. */
export function resolveMaxIterations(value, env = process.env) {
  const raw = value ?? env?.CUTAD_MAX_ITERATIONS ?? DEFAULT_MAX_ITERATIONS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return DEFAULT_MAX_ITERATIONS;
  return Math.min(MAX_ITERATIONS_LIMIT, Math.max(1, n));
}
