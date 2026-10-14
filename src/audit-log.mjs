// ─────────────────────────────────────────────────────────────
// Audit log enterprise: setiap eksekusi tool dicatat JSONL ke
// ~/.cutad/audit.log (0600). Yang dicatat: waktu, tool, ringkasan
// argumen AMAN (path/command dipotong; ISI FILE & API KEY TIDAK
// PERNAH dicatat), dan status hasil. Untuk kebutuhan audit/compliance.
// Matikan dengan CUTAD_AUDIT_LOG=0.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, PROFILE } from "./constants.mjs";

const AUDIT_FILE = path.join(CONFIG_DIR, "audit.log");

export function isAuditEnabled() {
  return process.env.CUTAD_AUDIT_LOG !== "0";
}

// Pola rahasia yang TIDAK boleh masuk audit log walau muncul di command/query.
const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bcag_[A-Za-z0-9_-]{10,}\b/g,
  /\b(api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*[^\s"'&;]+/gi,
  /([?&](?:api[_-]?key|token|secret|password)=)[^&\s]+/gi,
];

export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, g1) => (g1 ? `${g1}[REDACTED]` : "[REDACTED]"));
  }
  return out;
}

function summarizeArgs(name, args = {}) {
  const safe = {};
  if (typeof args.path === "string") safe.path = args.path.slice(0, 200);
  if (typeof args.command === "string") safe.command = redactSecrets(args.command.slice(0, 200));
  if (typeof args.pattern === "string") safe.pattern = args.pattern.slice(0, 100);
  if (typeof args.query === "string") safe.query = redactSecrets(args.query.slice(0, 100));
  if (typeof args.url === "string") safe.url = redactSecrets(args.url.slice(0, 200));
  return safe;
}

export function logToolAudit({ name, args, cwd, ok, durationMs }) {
  if (!isAuditEnabled()) return;
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    const entry = {
      ts: new Date().toISOString(),
      profile: PROFILE || "default",
      tool: name,
      args: summarizeArgs(name, args),
      cwd,
      ok: Boolean(ok),
      durationMs: Math.round(durationMs || 0),
    };
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n", { mode: 0o600 });
    // Paksa 0600 juga untuk file lama yang terlanjur longgar.
    try { fs.chmodSync(AUDIT_FILE, 0o600); } catch {}
  } catch {}
}

export function readAuditLog(limit = 50) {
  try {
    const lines = fs.readFileSync(AUDIT_FILE, "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export { AUDIT_FILE };
