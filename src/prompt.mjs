// ─────────────────────────────────────────────────────────────
// Prompt interaktif — masked input & arrow-key selector
// Dibangun manual (tanpa dependency ekstra).
//
// Prinsip penting (biar tidak ada bug):
//  - Handler stdin disimpan ke VARIABEL di scope yang SAMA dgn `cleanup`,
//    supaya `removeListener` benar-benar bisa melepasnya.
//  - Raw mode stdin diatur lewat satu helper enter/exit yang konsisten.
//  - Non-TTY (CI / pipe) memakai input nomor/index polos.
// ─────────────────────────────────────────────────────────────
import { createInterface } from "node:readline";
import pc from "picocolors";

const stdin = process.stdin;
const stdout = process.stdout;

const isTTY = () => Boolean(stdin.isTTY && stdout.isTTY);

/** Aktifkan raw mode + resume stdin, kembalikan fungsi pemulihan. */
function enterRaw() {
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
}

/** Nonaktifkan raw mode + pause stdin. */
function exitRaw() {
  if (stdin.isTTY) stdin.setRawMode(false);
  stdin.pause();
}

/**
 * Input satu baris (polos, tanpa masking).
 */
export function askPlain(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Input dengan karakter tersembunyi (untuk API key).
 * Fallback ke input polos bila bukan TTY.
 * @param {string} label
 * @returns {Promise<string>}
 */
export function askHidden(label) {
  if (!isTTY()) {
    return askPlain(label);
  }
  return new Promise((resolve) => {
    let value = "";
    stdout.write(`${label} `);
    enterRaw();

    const onData = (chunk) => {
      const str = chunk.toString();
      for (const ch of str) {
        if (ch === "\n" || ch === "\r") {
          stdout.write("\n");
          cleanup();
          resolve(value);
          return;
        }
        if (ch === "\u0003") { // Ctrl+C
          stdout.write("\n");
          cleanup();
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") { // backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (ch >= " ") { // abaikan karakter kontrol lain
          value += ch;
          stdout.write("*");
        }
      }
    };

    function cleanup() {
      exitRaw();
      stdin.removeListener("data", onData);
    }

    stdin.on("data", onData);
  });
}

/**
 * Pilihan dari daftar memakai arrow key ↑/↓ dan Enter.
 * Non-TTY => pilihan lewat nomor.
 *
 * Render glitch-free:
 * - clearEOL per baris (tidak ada residue teks lama)
 * - \r reset ke kolom 0 sebelum tiap baris
 * - Tidak pakai bgCyan (meninggalkan residue ANSI)
 * - Single-write: seluruh list dibangun sebagai 1 string
 *
 * @param {string} label
 * @param {string[]} choices
 * @returns {Promise<string|null>} pilihan yang dipilih
 */
export function select(label, choices) {
  if (!isTTY()) {
    return selectByNumber(label, choices);
  }
  return new Promise((resolve) => {
    let idx = 0;
    const lineCount = choices.length;
    const clearEOL = "\x1b[K";

    // Print label + leave space for list
    stdout.write(`\n${label}\n`);

    function renderList() {
      // Move cursor up to first list line
      stdout.write(`\x1b[${lineCount}A`);
      // Build all lines in ONE string — single write
      let frame = "";
      for (let i = 0; i < choices.length; i++) {
        const selected = i === idx;
        const marker = selected ? pc.cyan("\u25B8") : " ";
        const text = selected ? pc.bold(pc.cyan(choices[i])) : pc.dim(choices[i]);
        // \r resets to col 0, clearEOL removes leftover, then content
        frame += "\r" + clearEOL + `  ${marker} ${text}` + "\n";
      }
      stdout.write(frame);
    }

    enterRaw();
    renderList();

    const onData = (chunk) => {
      const str = chunk.toString();
      if (str === "\u0003") { // Ctrl+C
        stdout.write("\x1b[?25h");
        cleanup();
        process.exit(130);
      }
      if (str === "\r" || str === "\n") { // Enter
        cleanup();
        // Clear the list area
        stdout.write(`\x1b[${lineCount}A`);
        for (let i = 0; i < lineCount; i++) {
          stdout.write("\r" + clearEOL + "\n");
        }
        // Move back up and show selection
        stdout.write(`\x1b[${lineCount}A`);
        stdout.write("\r" + clearEOL + `  ${pc.green("\u2713")} ${pc.bold(choices[idx])}` + "\n");
        resolve(choices[idx]);
        return;
      }
      // Escape sequence: ESC [ A/B (arrow up/down)
      if (str.length === 3 && str.charCodeAt(0) === 27 && str.charCodeAt(1) === 91) {
        const code = str.charCodeAt(2);
        if (code === 65) idx = (idx - 1 + choices.length) % choices.length; // up
        else if (code === 66) idx = (idx + 1) % choices.length; // down
        else return;
        renderList();
      }
    };

    function cleanup() {
      exitRaw();
      stdin.removeListener("data", onData);
    }

    stdin.on("data", onData);
  });
}

/** Seleksi lewat nomor (saat stdin di-pipe / CI). */
async function selectByNumber(label, choices) {
  console.log(`\n${label}`);
  choices.forEach((c, i) => console.log(`  ${pc.cyan(String(i + 1))}. ${c}`));
  const ans = await askPlain(`Pilih (1-${choices.length})`);
  const n = parseInt(ans, 10);
  if (Number.isNaN(n) || n < 1 || n > choices.length) return choices[0] || null;
  return choices[n - 1];
}

/**
 * Konfirmasi ya/tidak.
 * @param {string} question
 * @param {boolean} [def=true]
 */
export function confirm(question, def = true) {
  const hint = def ? "(Y/n)" : "(y/N)";
  return new Promise((resolve) => {
    if (!isTTY()) { resolve(def); return; }
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(`${question} ${pc.dim(hint)} `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "") return resolve(def);
      resolve(a === "y" || a === "yes");
    });
  });
}
