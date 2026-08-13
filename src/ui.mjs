// ─────────────────────────────────────────────────────────────
// UI toolkit — desain profesional & minimal untuk aicutad-cli
// Prinsip: bersih, konsisten, satu warna aksen (cyan), tanpa efek lebay.
// ─────────────────────────────────────────────────────────────
import pc from "picocolors";

// Aksen utama — satu warna biar profesional
export const ACCENT = pc.cyan;

/** Banner clean — "aicutad-cli" dengan aksen cyan. */
export function banner() {
  return pc.bold(ACCENT("aicutad-cli"));
}

/** Nama brand. */
export function brand(s = "aicutad-cli") {
  return pc.bold(ACCENT(s));
}

/** Nama panjng di bawah banner. */
export function subtitle() {
  return pc.dim("AI Coding Agent CLI");
}

/** Garis horizontal polos. */
export function rule(char = "─", width = 60) {
  return pc.dim(char.repeat(width));
}

/** Hitung panjang karakter yang terlihat (abaikan kode ANSI). */
export function visibleLen(str) {
  return ("" + str).replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** Pad kanan sampai lebar karakter yang terlihat. */
export function padVisible(str, width) {
  const s = "" + str;
  const need = Math.max(0, width - visibleLen(s));
  return s + " ".repeat(need);
}

/** Panel dengan border, rapi & netral. Baris panjang otomatis dipotong. */
export function panel(title, bodyLines, opts = {}) {
  const w = opts.width ?? 62;
  const inner = w - 4;
  const out = [];
  if (title) {
    const tl = visibleLen(title);
    const dashes = Math.max(1, inner - Math.min(tl, inner) - 7);
    out.push(`┌${ACCENT("─".repeat(4))} ${pc.bold(truncate(title, inner - 7, false))} ${ACCENT("─".repeat(dashes))}┐`);
  } else {
    out.push(`┌${ACCENT("─".repeat(w - 2))}┐`);
  }
  const b = Array.isArray(bodyLines) ? bodyLines : [bodyLines];
  for (const line of b) {
    out.push(`${ACCENT("│ ")}${padVisible(truncate(line, inner), inner)}${ACCENT(" │")}`);
  }
  out.push(`└${ACCENT("─".repeat(w - 2))}┘`);
  return out.join("\n");
}

/** Potong string agar tidak melebihi lebar karakter terlihat (tambahkan …). */
function truncate(str, max, removeAnsiPreserving = true) {
  const s = "" + str;
  if (visibleLen(s) <= max) return s;
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  let out = "";
  for (const ch of plain) {
    if (visibleLen(out + ch) > max - 1) break;
    out += ch;
  }
  return out + "…";
}

/** Pasangan label:nilai satu baris. */
export function row(label, value, labelW = 14) {
  const labelPad = padVisible(pc.dim(label), labelW);
  return `${labelPad} ${value}`;
}

/** Feedback single-line (tanpa emotikon aneh). */
export function ok(text) { return `${pc.green("OK")}  ${text}`; }
export function fail(text) { return `${pc.red("Error")}  ${text}`; }
export function warn(text) { return `${pc.yellow("Perhatian")}  ${text}`; }
export function info(text) { return `${pc.cyan("Info")}  ${text}`; }
export function arrow(text) { return `${pc.dim(">")}  ${text}`; }

/** Command ditampilkan sebagai kode. */
export function cmd(c) { return pc.cyan(c); }

/**
 * Spinner minimal. Lupa => animasi titik, tanpa frame berlebihan.
 */
export function spinner(label) {
  const clean = label.replace(/\s*\.\.\.\s*$/, "");
  if (!process.stdout.isTTY) {
    console.log(`${pc.dim(clean)}\n`);
    return async () => "";
  }
  const frames = ["•", "•", "•"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${pc.cyan("·")} ${clean}`);
    i++;
  }, 100);
  const done = () => new Promise((res) => {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    res(label);
  });
  return done;
}

export { pc };
