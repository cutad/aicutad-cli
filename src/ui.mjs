// ─────────────────────────────────────────────────────────────
// UI toolkit — premium look untuk aicutad-cli
// Tema: gradient "teal → violet" (khas AI❖CUTAD, beda dari bynara)
// ─────────────────────────────────────────────────────────────
import pc from "picocolors";

export const PALETTE = {
  teal: "#2dd4bf",
  cyan: "#22d3ee",
  violet: "#a78bfa",
  purple: "#8b5cf6",
  magenta: "#e879f9",
  mint: "#6ee7b7",
};

/**
 * Render teks dengan gradient teal → violet.
 * @param {string} text
 * @param {{steps?: number}} [opts]
 */
export function gradient(text, opts = {}) {
  const steps = opts.steps ?? Math.max(4, text.length);
  const cols = [
    [45, 212, 191], // teal
    [34, 211, 238], // cyan
    [167, 139, 250], // violet
    [139, 92, 246], // purple
  ];
  const chars = [...text];
  return chars
    .map((ch, i) => {
      if (ch === " ") return ch;
      const t = Math.min(1, i / Math.max(1, steps - 1));
      const seg = Math.min(cols.length - 1, Math.floor(t * (cols.length - 1)));
      const [r1, g1, b1] = cols[seg];
      const [r2, g2, b2] = cols[Math.min(cols.length - 1, seg + 1)];
      const local = (t * (cols.length - 1)) - seg;
      const r = Math.round(r1 + (r2 - r1) * local);
      const g = Math.round(g1 + (g2 - g1) * local);
      const b = Math.round(b1 + (b2 - b1) * local);
      return `\x1b[38;2;${r};${g};${b}m${ch}\x1b[0m`;
    })
    .join("");
}

/**
 * Banner ASCII khas AI❖CUTAD.
 */
export function banner() {
  const lines = [
    "  █████╗     ██╗      ██████╗██╗   ██╗████████╗ █████╗ ██████╗ ",
    " ██╔══██╗    ██║     ██╔════╝██║   ██║╚══██╔══╝██╔══██╗██╔══██╗",
    " ███████║    ██║     ██║     ██║   ██║   ██║   ███████║██║  ██║",
    " ██╔══██║    ██║     ██║     ██║   ██║   ██║   ██╔══██║██║  ██║",
    " ██║  ██║    ███████╗╚██████╗╚██████╔╝   ██║   ██║  ██║██████╔╝",
    " ╚═╝  ╚═╝    ╚══════╝ ╚═════╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═════╝ ",
  ];
  return lines.map((l) => gradient(l)).join("\n");
}

/** Garis horizontal berpola. */
export function rule(char = "─", width = 64) {
  return pc.dim(char.repeat(width));
}

/** Hitung panjang karakter yang terlihat (abaikan kode ANSI). */
export function visibleLen(str) {
  // strip semua escape sequences: \x1b[...m dan sejenisnya
  return ("" + str).replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** Pad kanan sampai lebar karakter yang terlihat. */
export function padVisible(str, width) {
  const s = "" + str;
  const need = Math.max(0, width - visibleLen(s));
  return s + " ".repeat(need);
}

/** Panel dengan border (sejajar walau ada warna). */
export function panel(title, bodyLines, opts = {}) {
  const w = opts.width ?? 66;
  const inner = w - 4; // lebar kolom isi
  const out = [];
  if (title) {
    const tl = visibleLen(title);
    const dashes = Math.max(2, inner - tl - 7); // "│ ..." pengatur
    out.push(`┌${pc.cyan("─".repeat(4))} ${pc.bold(pc.magenta(title))} ${pc.cyan("─".repeat(dashes))}┐`);
  } else {
    out.push(`┌${pc.cyan("─".repeat(w - 2))}┐`);
  }
  const b = Array.isArray(bodyLines) ? bodyLines : [bodyLines];
  for (const line of b) {
    out.push(`${pc.cyan("│ ")}${padVisible(line, inner)}${pc.cyan(" │")}`);
  }
  out.push(`└${pc.cyan("─".repeat(w - 2))}┘`);
  return out.join("\n");
}

/** Pasangan label:nilai satu baris di dalam panel (di-pad rapi). */
export function row(label, value, labelW = 14) {
  const labelPad = padVisible(pc.dim(label), labelW);
  return `${labelPad} ${pc.white(value)}`;
}

/** Kunci sukses. */
export function ok(text) { return `${pc.bold(pc.green("✓"))} ${text}`; }
/** Kunci error. */
export function fail(text) { return `${pc.bold(pc.red("✗"))} ${text}`; }
/** Kunci info. */
export function info(text) { return `${pc.bold(pc.cyan("ℹ"))} ${text}`; }
/** Kunci aksi/arrow. */
export function arrow(text) { return `${pc.bold(pc.magenta("→"))} ${text}`; }

/** Tombol highlight untuk prompt ">/command". */
export function cmd(c) { return pc.bgCyan(pc.black(` ${c} `)); }

/** Nama CLI berwarna untuk dipakai di teks. */
export function brand(s = "AI❖CUTAD") {
  return gradient(s);
}

/**
 * Spinner sederhana selama async operation berjalan.
 * @returns {function(): Promise<string>} fungsi untuk menutup spinner
 */
export function spinner(label) {
  const frames = ["◐", "◓", "◑", "◒"];
  let i = 0;
  if (!process.stdout.isTTY) {
    console.log(info(`${label} …`));
    return async () => "";
  }
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${pc.cyan(frames[i % frames.length])} ${pc.dim(label)}`);
    i++;
  }, 90);
  const done = () => {
    return new Promise((res) => {
      clearInterval(timer);
      process.stdout.write("\r\x1b[2K");
      res(label);
    });
  };
  return done;
}

/** Warnai level/pentingnya. */
export function badge(text, kind = "violet") {
  const map = {
    violet: pc.bgViolet,
    cyan: pc.bgCyan,
    green: pc.bgGreen,
    red: pc.bgRed,
    yellow: pc.bgYellow,
  };
  const fn = map[kind] || pc.bgViolet;
  return fn(pc.black(` ${text} `));
}

/**
 * Klik masukan untuk model selector (bisa dipakai di TUI nanti).
 */
export function highlightSelected(label, selected) {
  return selected ? `${pc.bgCyan(pc.black(" ● "))} ${label}` : `${pc.dim(" ○ ")} ${label}`;
}

// Re-ekspor picocolors biar pemakai tinggal import dr sini
export { pc };
