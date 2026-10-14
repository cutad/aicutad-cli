// ─────────────────────────────────────────────────────────────
// Policy enterprise untuk agent (tool governance).
//
// Dicari berurutan:
// 1. env CUTAD_POLICY_PATH (path file JSON eksplisit)
// 2. <cwd>/.aicutad/policy.json   (policy per-proyek, bisa di-commit)
// 3. ~/.cutad/policy.json         (policy global user/organisasi)
//
// Contoh policy.json:
// {
//   "workspaceOnly": true,
//   "allowedTools": ["read_file", "write_file", "edit_file", "list_files", "search_files"],
//   "deniedTools": ["run_command"],
//   "allowRunCommandInWorkspaceOnly": false,
//   "allowDestructive": false
// }
//
// Catatan keamanan workspaceOnly:
// - Path divalidasi terhadap REALPATH (symlink di dalam workspace yang
//   menunjuk keluar tetap ditolak).
// - run_command adalah shell bebas dan TIDAK bisa dikurung ke workspace,
//   jadi saat workspaceOnly aktif tool ini ditolak kecuali policy secara
//   eksplisit memberi "allowRunCommandInWorkspaceOnly": true.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./constants.mjs";

export function loadPolicy(cwd = process.cwd()) {
  const candidates = [];
  if (process.env.CUTAD_POLICY_PATH) candidates.push(process.env.CUTAD_POLICY_PATH);
  candidates.push(path.join(cwd, ".aicutad", "policy.json"));
  candidates.push(path.join(CONFIG_DIR, "policy.json"));
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object") return { ...parsed, _source: file };
    } catch {}
  }
  return null;
}

/** Resolusi path dengan realpath sedalam mungkin (anti symlink-escape). */
function resolveReal(target, cwd) {
  const full = path.isAbsolute(target) ? path.resolve(target) : path.resolve(cwd, target);
  try {
    return fs.realpathSync(full);
  } catch {
    // File belum ada (kasus write): realpath direktori induknya.
    try {
      const parent = fs.realpathSync(path.dirname(full));
      return path.join(parent, path.basename(full));
    } catch {
      return full;
    }
  }
}

function resolveRoot(cwd) {
  try { return fs.realpathSync(path.resolve(cwd)); } catch { return path.resolve(cwd); }
}

/**
 * Cek apakah tool boleh jalan menurut policy.
 * @returns {string|null} pesan error bila ditolak, null bila boleh
 */
export function checkToolPolicy(policy, name, args, cwd) {
  if (!policy) return null;
  if (Array.isArray(policy.deniedTools) && policy.deniedTools.includes(name)) {
    return `Error: tool "${name}" dilarang oleh policy (${policy._source || "policy"}).`;
  }
  if (Array.isArray(policy.allowedTools) && policy.allowedTools.length && !policy.allowedTools.includes(name)) {
    return `Error: tool "${name}" tidak ada di allowedTools policy (${policy._source || "policy"}).`;
  }
  if (policy.workspaceOnly) {
    // Shell bebas tidak bisa dikurung ke workspace -> tolak secara default.
    if (name === "run_command" && policy.allowRunCommandInWorkspaceOnly !== true) {
      return "Error: policy workspaceOnly menolak run_command (shell tidak bisa dibatasi ke workspace). Set \"allowRunCommandInWorkspaceOnly\": true di policy bila disengaja.";
    }
    if (["read_file", "write_file", "edit_file", "list_files", "search_files"].includes(name)) {
      const target = name === "search_files" || name === "list_files" ? (args?.path || cwd) : args?.path;
      if (target) {
        const full = resolveReal(target, cwd);
        const root = resolveRoot(cwd);
        if (full !== root && !full.startsWith(root + path.sep)) {
          return `Error: policy workspaceOnly melarang akses di luar workspace: ${full}`;
        }
      }
    }
  }
  return null;
}
