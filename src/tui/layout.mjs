// ─────────────────────────────────────────────────────────────
// Design system & layout untuk UI terminal.
//
// Prinsip corporate:
// - Satu warna aksen, teks sebagai label utama (bukan emoji).
// - Hormati NO_COLOR dan CUTAD_NO_ANIMATION / CUTAD_REDUCED_MOTION.
// - Responsif: terminal kecil masuk mode compact, bukan rusak.
// ─────────────────────────────────────────────────────────────

export function isColorEnabled(env = process.env, stream = process.stdout) {
  if (env.NO_COLOR !== undefined) return false;
  if (env.TERM === "dumb") return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return true;
  return Boolean(stream?.isTTY);
}

export function isReducedMotion(env = process.env) {
  return env.CUTAD_NO_ANIMATION !== undefined
    || env.CUTAD_REDUCED_MOTION !== undefined
    || env.TERM === "dumb";
}

/** Terapkan fungsi warna hanya bila warna diizinkan. */
export function paint(enabled, fn, text) {
  return enabled ? fn(text) : String(text);
}

/** Keputusan layout berdasarkan ukuran terminal. */
export function getLayout(width = 80, height = 24) {
  const W = Math.max(20, Number(width) || 80);
  const H = Math.max(8, Number(height) || 24);
  const compact = W < 72 || H < 16;
  const veryNarrow = W < 44;
  return {
    width: W,
    height: H,
    compact,
    veryNarrow,
    // Konten tidak pernah melebihi lebar terminal
    contentWidth: Math.max(16, W - 2),
    // Modal: maksimal 76 kolom, tapi selalu muat di layar
    modalWidth: Math.max(20, Math.min(76, W - 4)),
    // Di compact, header dipangkas jadi satu baris esensial
    headerLines: compact ? 1 : 2,
    // Batas panjang label model agar tidak mendorong jam/status keluar
    modelMaxLength: veryNarrow ? 14 : compact ? 24 : 48,
    showHints: !compact,
    showClock: W >= 52,
  };
}

export function truncateText(text, max) {
  const s = String(text ?? "");
  if (max <= 1 || s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
