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
//   "allowDestructive": false
// }
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
  if (policy.workspaceOnly && ["read_file", "write_file", "edit_file", "list_files", "search_files"].includes(name)) {
    const target = name === "search_files" || name === "list_files" ? (args?.path || cwd) : args?.path;
    if (target) {
      const full = path.isAbsolute(target) ? path.resolve(target) : path.resolve(cwd, target);
      const root = path.resolve(cwd);
      if (full !== root && !full.startsWith(root + path.sep)) {
        return `Error: policy workspaceOnly melarang akses di luar workspace: ${full}`;
      }
    }
  }
  return null;
}
