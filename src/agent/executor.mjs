// ─────────────────────────────────────────────────────────────
// Tool executor — eksekusi tool call dari model & return result
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const MAX_OUTPUT = 50000; // batas output per tool

/**
 * Eksekusi satu tool call.
 * @param {string} name nama tool
 * @param {object} args argumen dari model (sudah di-parse)
 * @param {string} cwd working directory
 * @returns {string} hasil eksekusi (string)
 */
export function executeTool(name, args, cwd = process.cwd()) {
  try {
    switch (name) {
      case "read_file":
        return readFile(args.path, cwd);
      case "write_file":
        return writeFile(args.path, args.content, cwd);
      case "edit_file":
        return editFile(args.path, args.old_string, args.new_string, cwd);
      case "list_files":
        return listFiles(args.path || cwd, cwd);
      case "search_files":
        return searchFiles(args.pattern, args.path || cwd, cwd);
      case "run_command":
        return runCommand(args.command, cwd);
      default:
        return `Error: tool "${name}" tidak dikenal.`;
    }
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

function truncate(s, max = MAX_OUTPUT) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (output dipotong, total ${s.length} chars)`;
}

function resolvePath(p, cwd) {
  if (path.isAbsolute(p)) return p;
  return path.resolve(cwd, p);
}

function readFile(filePath, cwd) {
  const full = resolvePath(filePath, cwd);
  if (!fs.existsSync(full)) return `Error: file tidak ditemukan: ${full}`;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) return `Error: itu direktori, bukan file: ${full}`;
  const content = fs.readFileSync(full, "utf8");
  return truncate(content) || "(file kosong)";
}

function writeFile(filePath, content, cwd) {
  const full = resolvePath(filePath, cwd);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content || "");
  return `File ditulis: ${full} (${(content || "").length} bytes)`;
}

function editFile(filePath, oldString, newString, cwd) {
  const full = resolvePath(filePath, cwd);
  if (!fs.existsSync(full)) return `Error: file tidak ditemukan: ${full}`;
  const content = fs.readFileSync(full, "utf8");
  if (!content.includes(oldString)) return `Error: old_string tidak ditemukan di ${full}`;
  const count = content.split(oldString).length - 1;
  if (count > 1) return `Error: old_string muncul ${count}x — harus unique. Beri konteks lebih spesifik.`;
  const updated = content.replace(oldString, newString);
  fs.writeFileSync(full, updated);
  return `File diedit: ${full}`;
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
  try {
    // pakai grep -rn untuk kecepatan
    const result = execSync(`grep -rn --include="*" "${pattern.replace(/"/g, '\\"')}" "${full}" 2>/dev/null || true`, {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024 * 5,
    });
    if (!result.trim()) return `Tidak ada hasil untuk pattern "${pattern}" di ${full}`;
    return truncate(result);
  } catch (e) {
    return `Error pencarian: ${e.message}`;
  }
}

function runCommand(command, cwd) {
  try {
    const result = execSync(command, {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 5,
      cwd,
      stderr: "pipe",
    });
    let output = result || "";
    // juga tangkap stderr
    try {
      const errResult = execSync(command + " 2>&1 1>/dev/null || true", {
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 5,
        cwd,
      });
      if (errResult) output += (output ? "\n--- stderr ---\n" : "") + errResult;
    } catch {}
    return truncate(output) || "(command selesai, tidak ada output)";
  } catch (e) {
    const output = (e.stdout || "") + (e.stderr ? "\n--- stderr ---\n" + e.stderr : "");
    return truncate(output || e.message);
  }
}
