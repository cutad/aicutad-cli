// ─────────────────────────────────────────────────────────────
// Utilitas file yang aman:
// - atomicWriteFileSync: tulis ke file temp di direktori yang sama,
//   fsync, lalu rename. Rename dalam 1 filesystem itu atomik, jadi
//   proses yang mati di tengah TIDAK meninggalkan file setengah jadi
//   atau korup. Ini dipakai untuk kode user, session, dan config.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function atomicWriteFileSync(file, content, opts = {}) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: opts.dirMode ?? 0o700 });
  const tmp = path.join(
    dir,
    `.${path.basename(file)}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`,
  );
  try {
    fs.writeFileSync(tmp, content, { mode: opts.mode ?? 0o600 });
    const fd = fs.openSync(tmp, "r");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
    if (opts.mode) {
      try { fs.chmodSync(file, opts.mode); } catch {}
    }
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw e;
  }
}

export function sha256Short(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export function isBinaryBuffer(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
