// ─────────────────────────────────────────────────────────────
// Checkpoint & rollback untuk mutasi file oleh agent.
//
// Sebelum file PERTAMA KALI diubah dalam satu sesi agent, versi
// aslinya disalin ke ~/.cutad/checkpoints/<id>/. Rollback
// mengembalikan semua file yang disentuh ke keadaan sebelum sesi:
// - file yang ada sebelumnya -> isi aslinya dipulihkan (atomik)
// - file yang dibuat baru oleh agent -> dihapus
//
// run_command tidak bisa di-checkpoint per-file (bisa mengubah apa
// saja); untuk itu ada blokir destruktif + approval.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG_DIR } from "../constants.mjs";
import { atomicWriteFileSync } from "../fs-utils.mjs";

const CHECKPOINTS_DIR = path.join(CONFIG_DIR, "checkpoints");

export function createCheckpoint(cwd) {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${crypto.randomBytes(2).toString("hex")}`;
  const dir = path.join(CHECKPOINTS_DIR, id);
  fs.mkdirSync(path.join(dir, "files"), { recursive: true, mode: 0o700 });
  const cp = { id, dir, cwd, createdAt: new Date().toISOString(), entries: {} };
  saveManifest(cp);
  return cp;
}

function saveManifest(cp) {
  atomicWriteFileSync(
    path.join(cp.dir, "manifest.json"),
    JSON.stringify({ id: cp.id, cwd: cp.cwd, createdAt: cp.createdAt, entries: cp.entries }, null, 2),
    { mode: 0o600 },
  );
}

function loadManifest(id) {
  try {
    const raw = fs.readFileSync(path.join(CHECKPOINTS_DIR, id, "manifest.json"), "utf8");
    const m = JSON.parse(raw);
    return { ...m, dir: path.join(CHECKPOINTS_DIR, id) };
  } catch {
    return null;
  }
}

/** Snapshot keadaan file SEBELUM diubah. Dipanggil sekali per file per checkpoint. */
export function snapshotBeforeWrite(cp, fullPath) {
  if (!cp) return;
  const key = fullPath;
  if (key in cp.entries) return; // hanya snapshot pertama
  const idx = Object.keys(cp.entries).length;
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const backupName = `${idx}.bak`;
    fs.copyFileSync(fullPath, path.join(cp.dir, "files", backupName));
    cp.entries[key] = { existed: true, backup: backupName };
  } else {
    cp.entries[key] = { existed: false };
  }
  saveManifest(cp);
}

export function listCheckpoints() {
  try {
    return fs.readdirSync(CHECKPOINTS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => loadManifest(e.name))
      .filter(Boolean)
      .map((m) => ({ id: m.id, cwd: m.cwd, createdAt: m.createdAt, files: Object.keys(m.entries).length }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch {
    return [];
  }
}

/** Pulihkan semua file ke keadaan saat checkpoint dibuat. */
export function restoreCheckpoint(id) {
  const cp = loadManifest(id);
  if (!cp) return { ok: false, error: `checkpoint tidak ditemukan: ${id}` };
  const restored = [];
  const removed = [];
  for (const [fullPath, entry] of Object.entries(cp.entries || {})) {
    try {
      if (entry.existed) {
        const data = fs.readFileSync(path.join(cp.dir, "files", entry.backup));
        atomicWriteFileSync(fullPath, data, { mode: 0o644, dirMode: 0o755 });
        restored.push(fullPath);
      } else if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { force: true });
        removed.push(fullPath);
      }
    } catch {}
  }
  return { ok: true, restored, removed };
}

export { CHECKPOINTS_DIR };
