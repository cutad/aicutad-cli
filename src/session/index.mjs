// ─────────────────────────────────────────────────────────────
// Session management — simpan, muat, daftar, ekspor, impor percakapan
// Format: JSON di ~/.cutad/sessions/
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CONFIG_DIR } from "../constants.mjs";

const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");

/** Pastikan direktori sessions ada. */
function ensureDir() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/** Generate ID session unik. */
export function generateId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}

/**
 * Buat session baru.
 * @param {string} model model yang dipakai
 * @param {string} provider nama provider
 * @returns {object} objek session
 */
export function createSession(model, provider = "cutad") {
  return {
    id: generateId(),
    model,
    provider,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

/**
 * Simpan session ke disk.
 * @param {object} session objek session
 */
export function saveSession(session) {
  ensureDir();
  session.updatedAt = new Date().toISOString();
  const file = path.join(SESSIONS_DIR, `${session.id}.json`);
  fs.writeFileSync(file, JSON.stringify(session, null, 2));
  return session.id;
}

/**
 * Muat session dari disk berdasarkan ID.
 * @param {string} id
 * @returns {object|null}
 */
export function loadSession(id) {
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Daftar semua session tersimpan.
 * @returns {{id, model, createdAt, updatedAt, messageCount}[]}
 */
export function listSessions() {
  ensureDir();
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf8"));
        return {
          id: s.id,
          model: s.model,
          provider: s.provider,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages?.length || 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

/**
 * Hapus session berdasarkan ID.
 * @param {string} id
 */
export function deleteSession(id) {
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  try {
    fs.rmSync(file, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ekspor session ke file JSON (path absolut).
 * @param {string} id session ID
 * @param {string} outPath path output
 * @returns {boolean} sukses
 */
export function exportSession(id, outPath) {
  const session = loadSession(id);
  if (!session) return false;
  fs.writeFileSync(outPath, JSON.stringify(session, null, 2));
  return true;
}

/**
 * Impor session dari file JSON.
 * @param {string} inPath path input
 * @returns {string|null} session ID baru, atau null bila gagal
 */
export function importSession(inPath) {
  try {
    const session = JSON.parse(fs.readFileSync(inPath, "utf8"));
    if (!session.messages || !Array.isArray(session.messages)) return null;
    // beri ID baru supaya tidak konflik
    session.id = generateId();
    saveSession(session);
    return session.id;
  } catch {
    return null;
  }
}

/**
 * Tambah pesan ke session dan simpan otomatis.
 * @param {object} session objek session (mutasi in-place)
 * @param {{role, content}} message pesan baru
 * @returns {string} session ID
 */
export function appendMessage(session, message) {
  session.messages.push(message);
  return saveSession(session);
}

export { SESSIONS_DIR };
