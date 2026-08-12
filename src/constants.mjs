// Konstanta global untuk Cutad CLI
import os from "node:os";
import path from "node:path";

// Direktori konfigurasi default: ~/.cutad
export const CONFIG_DIR = path.join(os.homedir(), ".cutad");

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
