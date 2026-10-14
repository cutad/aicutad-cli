// ─────────────────────────────────────────────────────────────
// Tool executor — eksekusi tool call dari model & return result
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { browsePage, searchWeb, screenshotPage } from "./browser.mjs";
import { atomicWriteFileSync, sha256Short, isBinaryBuffer } from "../fs-utils.mjs";
import { snapshotBeforeWrite } from "./checkpoint.mjs";

const MAX_OUTPUT = 50000; // batas output per tool

// Command yang dianggap destruktif: diblokir kecuali user secara eksplisit
// mengizinkan lewat env CUTAD_ALLOW_DESTRUCTIVE=1 atau opsi allowDestructive.
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive.*--force|--force.*--recursive)\b/i,
  /\bmkfs\b/i,
  /\bdd\s+.*\bof=\/dev\//i,
  /\b(shutdown|reboot|poweroff|halt)\b/i,
  />\s*\/dev\/(sd|nvme|hd)/i,
  /\b(curl|wget)\b[^|]*\|\s*(bash|sh|zsh)\b/i,
  /\bchmod\s+(-R\s+)?777\s+\/(etc|usr|var|bin|sbin|boot)?\b/i,
  /:\(\)\s*\{.*\};\s*:/, // fork bomb
];

export function isDestructiveCommand(command = "") {
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(command));
}

/**
 * Eksekusi satu tool call.
 * @param {string} name nama tool
 * @param {object} args argumen dari model (sudah di-parse)
 * @param {string} cwd working directory
 * @returns {string} hasil eksekusi (string)
 */
function need(args, field, type = "string") {
  const v = args?.[field];
  if (v === undefined || v === null || (type === "string" && typeof v !== "string") || (type === "string" && v === "" && field !== "new_string" && field !== "content")) {
    return `Error: argumen "${field}" wajib berupa ${type} dan tidak boleh kosong. Model harus memanggil ulang tool dengan argumen yang benar.`;
  }
  if (type === "string" && typeof v !== "string") return `Error: argumen "${field}" harus string.`;
  return null;
}

export async function executeTool(name, args, cwd = process.cwd(), opts = {}) {
  if (!args || typeof args !== "object") return `Error: argumen tool "${name}" tidak valid (bukan object).`;
  if (args._parse_error) return `Error: argumen tool "${name}" bukan JSON valid: ${args._parse_error}. Panggil ulang dengan JSON yang benar.`;
  try {
    switch (name) {
      case "read_file": {
        const e = need(args, "path"); if (e) return e;
        return readFile(args, cwd);
      }
      case "write_file": {
        const e = need(args, "path") || (typeof args.content !== "string" ? 'Error: argumen "content" wajib berupa string (boleh kosong, tapi harus ada).' : null); if (e) return e;
        return writeFile(args.path, args.content, cwd, opts);
      }
      case "edit_file": {
        const e = need(args, "path") || need(args, "old_string") || (typeof args.new_string !== "string" ? 'Error: argumen "new_string" wajib berupa string.' : null); if (e) return e;
        return editFile(args.path, args.old_string, args.new_string, cwd, opts);
      }
      case "list_files":
        return listFiles(args.path || cwd, cwd);
      case "search_files":
        return searchFiles(args.pattern, args.path || cwd, cwd);
      case "run_command":
        return runCommand(args.command, cwd, opts);
      case "browse_page":
        return await browsePage(args.url, { wait: args.wait });
      case "web_search":
        return await searchWeb(args.query);
      case "screenshot":
        return await screenshotPage(args.url, { fullPage: args.full_page });
      default:
        return `Error: tool "${name}" tidak dikenal.`;
    }
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// Auto-verifikasi SETELAH tulis oleh SISTEM (bukan mengandalkan model):
// - .js/.mjs/.cjs  -> node --check
// - .json          -> JSON.parse
// - .py            -> python3 -m py_compile (bila python3 ada)
// Kegagalan dikembalikan sebagai Error di hasil tool agar agent loop
// memaksa model memperbaikinya di iterasi berikutnya.
export function verifyWrittenFile(full, content) {
  const ext = path.extname(full).toLowerCase();
  try {
    if ([".js", ".mjs", ".cjs"].includes(ext)) {
      const r = spawnSync(process.execPath, ["--check", full], { encoding: "utf8", timeout: 15000 });
      if (r.status !== 0) return `Error verifikasi syntax (node --check): ${(r.stderr || "syntax tidak valid").trim().slice(0, 800)}\nFile sudah ditulis tapi RUSAK secara syntax. Perbaiki sebelum lanjut.`;
      return "syntax OK (node --check)";
    }
    if (ext === ".json") {
      JSON.parse(content);
      return "JSON valid";
    }
    if (ext === ".py") {
      const r = spawnSync("python3", ["-m", "py_compile", full], { encoding: "utf8", timeout: 15000 });
      if (r.error) return null; // python3 tidak ada: lewati diam-diam
      if (r.status !== 0) return `Error verifikasi syntax (py_compile): ${(r.stderr || "").trim().slice(0, 800)}\nFile sudah ditulis tapi RUSAK secara syntax. Perbaiki sebelum lanjut.`;
      return "syntax OK (py_compile)";
    }
  } catch (e) {
    return `Error verifikasi: ${e.message}`;
  }
  return null;
}

function truncate(s, max = MAX_OUTPUT) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (output dipotong, total ${s.length} chars)`;
}

function resolvePath(p, cwd) {
  if (path.isAbsolute(p)) return p;
  return path.resolve(cwd, p);
}

function readFile(args, cwd) {
  const filePath = typeof args === "string" ? args : args.path;
  const full = resolvePath(filePath, cwd);
  if (!fs.existsSync(full)) return `Error: file tidak ditemukan: ${full}`;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) return `Error: itu direktori, bukan file: ${full}`;
  const buf = fs.readFileSync(full);
  if (isBinaryBuffer(buf)) return `Error: file biner (${stat.size} bytes), tidak bisa dibaca sebagai teks: ${full}`;
  const content = buf.toString("utf8");
  if (!content) return "(file kosong)";
  // Paginasi opsional: offset (1-based baris) & limit (jumlah baris)
  const offset = Number.isInteger(args?.offset) && args.offset > 0 ? args.offset : null;
  const limit = Number.isInteger(args?.limit) && args.limit > 0 ? Math.min(args.limit, 5000) : null;
  if (offset || limit) {
    const lines = content.split("\n");
    const start = (offset || 1) - 1;
    const sliced = lines.slice(start, limit ? start + limit : undefined);
    const note = `\n... (baris ${start + 1}-${start + sliced.length} dari ${lines.length} baris)`;
    return truncate(sliced.join("\n")) + note;
  }
  return truncate(content);
}

function writeFile(filePath, content, cwd, opts = {}) {
  if (typeof content !== "string") return 'Error: argumen "content" wajib berupa string.';
  if (content.includes("\0")) return "Error: content mengandung NUL byte, ditolak.";
  const full = resolvePath(filePath, cwd);
  snapshotBeforeWrite(opts.checkpoint, full);
  // Tulis ATOMIK (temp + rename): mati di tengah tidak merusak file lama.
  atomicWriteFileSync(full, content, { mode: 0o644, dirMode: 0o755 });
  // Verifikasi read-back: yang di disk harus persis yang diminta model.
  const back = fs.readFileSync(full, "utf8");
  if (back !== content) {
    return `Error: verifikasi gagal untuk ${full} (ditulis ${content.length} chars, terbaca ${back.length} chars). File mungkin tidak utuh, coba lagi.`;
  }
  const lines = content ? content.split("\n").length : 0;
  const verdict = verifyWrittenFile(full, content);
  return `File ditulis: ${full} (${Buffer.byteLength(content)} bytes, ${lines} baris, sha256:${sha256Short(content)}, terverifikasi)${verdict ? `\nVerifikasi: ${verdict}` : ""}`;
}

function editFile(filePath, oldString, newString, cwd, opts = {}) {
  const full = resolvePath(filePath, cwd);
  if (!fs.existsSync(full)) return `Error: file tidak ditemukan: ${full}`;
  const content = fs.readFileSync(full, "utf8");
  if (!content.includes(oldString)) return `Error: old_string tidak ditemukan di ${full}`;
  snapshotBeforeWrite(opts.checkpoint, full);
  const count = content.split(oldString).length - 1;
  if (count > 1) return `Error: old_string muncul ${count}x — harus unique. Beri konteks lebih spesifik.`;
  const updated = content.replace(oldString, newString);
  atomicWriteFileSync(full, updated, { mode: 0o644, dirMode: 0o755 });
  const back = fs.readFileSync(full, "utf8");
  if (back !== updated) return `Error: verifikasi gagal setelah edit ${full}. Coba baca ulang file.`;
  const verdict = verifyWrittenFile(full, updated);
  return `File diedit: ${full} (sha256:${sha256Short(updated)}, terverifikasi)${verdict ? `\nVerifikasi: ${verdict}` : ""}`;
}

function listFiles(dirPath, cwd) {
  const full = resolvePath(dirPath, cwd);
  if (!fs.existsSync(full)) return `Error: direktori tidak ditemukan: ${full}`;
  const entries = fs.readdirSync(full, { withFileTypes: true });
  if (entries.length === 0) return "(direktori kosong)";
  const lines = entries
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((e) => `${e.isDirectory() ? "dir/" : "file"}  ${e.name}`);
  return truncate(lines.join("\n"));
}

function searchFiles(pattern, dirPath, cwd) {
  const full = resolvePath(dirPath, cwd);
  if (!pattern) return "Error: pattern tidak boleh kosong.";
  if (!fs.existsSync(full)) return `Error: direktori tidak ditemukan: ${full}`;
  try {
    // PENTING: spawnSync dengan array argumen, TANPA shell.
    // Bug lama: execSync(`grep ... "${pattern}"`) -> $(...) / backtick di
    // pattern dieksekusi shell (command injection). Sekarang pattern
    // diteruskan sebagai satu argumen persis, tidak pernah di-parse shell.
    const result = spawnSync("grep", [
      "-rn",
      "--exclude-dir=node_modules",
      "--exclude-dir=.git",
      "--",
      String(pattern),
      full,
    ], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024 * 5,
    });
    // grep: status 1 = tidak ada match, status >=2 = error beneran.
    if (result.status && result.status >= 2) {
      return `Error pencarian: ${(result.stderr || "grep gagal").trim().slice(0, 500)}`;
    }
    const out = result.stdout || "";
    if (!out.trim()) return `Tidak ada hasil untuk pattern "${pattern}" di ${full}`;
    return truncate(out);
  } catch (e) {
    return `Error pencarian: ${e.message}`;
  }
}

function runCommand(command, cwd, opts = {}) {
  if (!command || !String(command).trim()) return "Error: command tidak boleh kosong.";
  const allowDestructive = opts.allowDestructive ?? (process.env.CUTAD_ALLOW_DESTRUCTIVE === "1");
  if (!allowDestructive && isDestructiveCommand(command)) {
    return "Error: command ditolak karena terdeteksi destruktif. Jika memang disengaja, jalankan dengan CUTAD_ALLOW_DESTRUCTIVE=1 atau konfirmasi eksplisit ke user dulu.";
  }
  try {
    const result = spawnSync("bash", ["-c", command], {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 5,
      cwd,
    });
    if (result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM") {
      const partial = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return `Error: command timeout setelah 60 detik dan dihentikan.${partial ? "\nOutput parsial:\n" + truncate(partial) : ""} Pecah command jadi lebih kecil atau jalankan di background.`;
    }
    let output = "";
    if (result.stdout) output += result.stdout;
    if (result.stderr) {
      output += (output ? "\n--- stderr ---\n" : "") + result.stderr;
    }
    if (result.status !== 0 && result.status !== null) {
      output += (output ? "\n" : "") + `(exit code: ${result.status})`;
    }
    return truncate(output) || `(command selesai, exit code: ${result.status ?? 0})`;
  } catch (e) {
    return `Error: ${e.message}`;
  }
}
