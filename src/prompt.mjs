// ─────────────────────────────────────────────────────────────
// Prompt interaktif — masked input & arrow-key selector
// Dibangun manual (tanpa dependency) biar terasa seperti CLI perusahaan.
// ─────────────────────────────────────────────────────────────
import { createInterface } from "node:readline";
import pc from "picocolors";

const isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/**
 * Input dengan karakter tersembunyi (untuk API key).
 * Fallback: input polos bila bukan TTY.
 * @param {string} label
 * @returns {Promise<string>}
 */
export function askHidden(label) {
  if (!isTTY()) {
    return askPlain(label);
  }
  process.stdout.write(`${label} `);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";
  return new Promise((resolve) => {
    process.stdin.on("data", function onData(chunk) {
      const str = chunk.toString();
      for (const ch of str) {
        if (ch === "\n" || ch === "\r") {
          process.stdin.setRawMode(false);
          rl.write("\n");
          process.stdin.removeListener("data", onData);
          rl.close();
          resolve(value);
          return;
        }
        if (ch === "\u0003") { // Ctrl+C
          process.stdin.setRawMode(false);
          rl.write("\n");
          process.stdin.removeListener("data", onData);
          rl.close();
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") { // backspace
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        } else {
          value += ch;
          process.stdout.write("*");
        }
      }
    });
  });
}

/** Input polos satu baris. */
export function askPlain(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Pilihan dari daftar pakai arrow key ↑/↓ dan Enter.
 * Non-TTY => prompt nomor.
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
    process.stdout.write(`\n${label}\n`);
    const render = () => {
      const lines = choices.map((c, i) => {
        const mark = i === idx ? pc.bgCyan(pc.black(" > ")) : "   ";
        const text = i === idx ? pc.cyan(c) : pc.white(c);
        return `  ${mark} ${text}`;
      });
      const height = choices.length + 1;
      // clear previous
      process.stdout.write(`\x1b[${height}A`);
      process.stdout.write(lines.join("\n") + "\n");
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    render();
    process.stdin.on("data", function onData(chunk) {
      const str = chunk.toString();
      if (str === "\u0003") { // Ctrl+C
        cleanup();
        process.exit(130);
      }
      if (str === "\r" || str === "\n") { // Enter
        cleanup();
        const chosen = choices[idx];
        process.stdout.write(`\x1b[${choices.length}A\x1b[J`);
        resolve(chosen);
        return;
      }
      // Escape sequences untuk arrow keys
      const kb = chunk.slice ? chunk : Buffer.from(str);
      if (kb.length === 3 && kb[0] === 27 && kb[1] === 91) {
        if (kb[2] === 65) idx = (idx - 1 + choices.length) % choices.length; // up
        else if (kb[2] === 66) idx = (idx + 1) % choices.length; // down
        render();
      } else if (kb[0] === 13) {
        // some terminals send \r only
      }
    });
    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
    }
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
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} ${pc.dim(hint)} `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "") return resolve(def);
      resolve(a === "y" || a === "yes");
    });
  });
}
