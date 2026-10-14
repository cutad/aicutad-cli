// Diff baris sederhana (LCS) untuk preview sebelum approval.
// Output dibatasi agar tidak membanjiri terminal / konteks model.
import fs from "node:fs";

function lcsDiff(oldLines, newLines, maxOut = 120) {
  const n = oldLines.length;
  const m = newLines.length;
  // Tabel LCS (ukuran dibatasi untuk file besar: fallback potong)
  if (n * m > 250000) {
    return [`... (file terlalu besar untuk diff, ${n} -> ${m} baris)`];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(`- ${oldLines[i]}`); i++; }
    else { out.push(`+ ${newLines[j]}`); j++; }
    if (out.length > maxOut) { out.push("... (diff dipotong)"); return out; }
  }
  while (i < n) { out.push(`- ${oldLines[i]}`); i++; }
  while (j < m) { out.push(`+ ${newLines[j]}`); j++; }
  return out.slice(0, maxOut);
}

/**
 * Buat preview teks untuk persetujuan user sebelum tool mutasi jalan.
 * @param {string} name nama tool
 * @param {object} args argumen tool
 * @param {string} cwd
 * @returns {string} preview
 */
export function buildApprovalPreview(name, args, cwd) {
  if (name === "run_command") {
    return `Jalankan command:\n  ${args.command}`;
  }
  if (name === "write_file") {
    const target = args.path || "?";
    let oldText = null;
    try {
      const full = args.path?.startsWith("/") ? args.path : `${cwd}/${args.path}`;
      if (fs.existsSync(full)) oldText = fs.readFileSync(full, "utf8");
    } catch {}
    const newLines = String(args.content || "").split("\n");
    if (oldText === null) {
      return `Buat file BARU: ${target} (${newLines.length} baris)\n${newLines.slice(0, 30).map((l) => `+ ${l}`).join("\n")}${newLines.length > 30 ? "\n... (dipotong)" : ""}`;
    }
    const diff = lcsDiff(oldText.split("\n"), newLines);
    return `Timpa file: ${target}\n${diff.join("\n") || "(tidak ada perubahan baris)"}`;
  }
  if (name === "edit_file") {
    const oldLines = String(args.old_string || "").split("\n").map((l) => `- ${l}`);
    const newLines = String(args.new_string || "").split("\n").map((l) => `+ ${l}`);
    return `Edit file: ${args.path || "?"}\n${[...oldLines, ...newLines].slice(0, 80).join("\n")}`;
  }
  return `${name}: ${JSON.stringify(args).slice(0, 300)}`;
}
