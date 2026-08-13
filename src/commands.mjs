// ─────────────────────────────────────────────────────────────
// Command utama: login (wizard premium), status, logout
// First-run experience: animated boot → step-by-step setup → TUI
// ─────────────────────────────────────────────────────────────
import {
  writeAuth, readAuth, clearAuth, resolveBase, isAuthenticated,
} from "./config.mjs";
import { listModels } from "./api.mjs";
import { banner, subtitle, rule, panel, row, ok, fail, info, cmd, pc } from "./ui.mjs";
import { askHidden, askPlain, select, confirm } from "./prompt.mjs";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Animated spinner dengan label & optional colored frame. */
function animatedSpinner(label, opts = {}) {
  const color = opts.color || pc.cyan;
  const clean = label.replace(/\s*\.\.\.\s*$/, "");
  if (!process.stdout.isTTY) {
    console.log(`  ${pc.dim(clean)}`);
    return async () => {};
  }
  let i = 0;
  const timer = setInterval(() => {
    const frame = SPINNER_FRAMES[i % SPINNER_FRAMES.length];
    process.stdout.write(`\r  ${color(frame)} ${pc.dim(clean)}   `);
    i++;
  }, 80);
  const done = () => new Promise((res) => {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    res();
  });
  return done;
}

/** Boot animation — tampilkan banner baris demi baris dengan delay. */
async function bootAnimation() {
  const lines = banner().split("\n");
  for (const line of lines) {
    process.stdout.write(`\r${line}\n`);
    await sleep(35);
  }
  await sleep(100);
  process.stdout.write(`  ${subtitle()}\n`);
  await sleep(50);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Step indicator (e.g. "Step 1/4"). */
function stepIndicator(current, total) {
  return pc.dim(`[${pc.cyan(current)}/${pc.dim(total)}]`);
}

/** Progress bar mini. */
function miniProgress(current, total, width = 24) {
  const filled = Math.round((current / total) * width);
  const bar = pc.cyan("█".repeat(filled)) + pc.gray("░".repeat(width - filled));
  return `${bar} ${pc.dim(`${current}/${total}`)}`;
}

/** Welcome box — border box dengan welcome message. */
function welcomeBox() {
  const W = 52;
  const inner = W - 4;
  const top = `  ${pc.cyan("╭" + "─".repeat(inner + 2) + "╮")}`;
  const bot = `  ${pc.cyan("╰" + "─".repeat(inner + 2) + "╯")}`;
  const line = (text) => {
    const pad = inner - visibleLen(text);
    return `  ${pc.cyan("│")} ${text}${" ".repeat(Math.max(0, pad))} ${pc.cyan("│")}`;
  };
  console.log();
  console.log(top);
  console.log(line(""));
  console.log(line(`  ${pc.bold(pc.cyan("Selamat datang di AI CUTAD"))}`));
  console.log(line(`  ${pc.dim("AI Coding Agent CLI — v0.4.0")}`));
  console.log(line(""));
  console.log(line(`  ${pc.dim("Sebelum mulai, kita perlu menghubungkan")}`));
  console.log(line(`  ${pc.dim("CLI ke gateway AI kamu.")}`));
  console.log(line(""));
  console.log(line(`  ${pc.dim("Gateway:")} ${pc.cyan("https://ai.cutad.web.id")}`));
  console.log(line(""));
  console.log(bot);
  console.log();
}

function visibleLen(str) {
  return ("" + str).replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Wizard setup first-run — premium experience.
 * Step 1: API key (hidden input, masked)
 * Step 2: Validate key (animated spinner)
 * Step 3: Pick model (arrow-key selector)
 * Step 4: Save & confirm
 * Step 5: Launch TUI
 */
export async function login(argv = []) {
  const { BASE_URL } = resolveBase(argv);
  const site = BASE_URL.endsWith("/v1") ? BASE_URL.slice(0, -3) : BASE_URL;
  const TOTAL_STEPS = 4;

  // ── Boot animation ──
  if (process.stdout.isTTY) {
    await bootAnimation();
  } else {
    console.log(`\n${banner()}\n  ${subtitle()}\n`);
  }

  // ── Welcome box ──
  welcomeBox();

  // ── Step 1: API key ──
  console.log(`  ${stepIndicator(1, TOTAL_STEPS)} ${pc.bold("Hubungkan API Key")}\n`);
  const envKey = process.env.CUTAD_API_KEY?.trim();
  let apiKey = envKey;
  if (!apiKey) {
    console.log(`  ${pc.dim("Dapatkan API key dari gateway kamu.")}`);
    console.log(`  ${pc.dim("Input akan tersembunyi (••••••••).")}\n`);
    apiKey = await askHidden(`  ${pc.cyan("API key")}${pc.dim(":")}`);
  } else {
    console.log(`  ${info("API key dari env CUTAD_API_KEY")}`);
  }
  if (!apiKey?.trim()) {
    console.error(`\n  ${fail("API key tidak boleh kosong.")}\n`);
    process.exit(1);
  }

  // ── Step 2: Validate ──
  console.log(`\n  ${stepIndicator(2, TOTAL_STEPS)} ${pc.bold("Validasi Koneksi")}\n`);
  const stopSpin = animatedSpinner(`Menghubungi ${site}`, { color: pc.cyan });
  let models = [];
  try {
    models = await listModels(BASE_URL, apiKey);
    await stopSpin();
    console.log(`  ${ok(`Koneksi berhasil — ${pc.bold(String(models.length))} model tersedia`)}`);
  } catch (e) {
    await stopSpin();
    console.log(`\n  ${fail("Tidak bisa terhubung ke gateway.")}`);
    console.log(`     ${pc.dim(e.message)}\n`);
    const retry = await confirm(`  ${pc.cyan("Coba input ulang API key?")}`, true);
    if (retry) {
      console.log();
      return login(argv);
    }
    process.exit(1);
  }

  // ── Step 3: Pick model ──
  console.log(`\n  ${stepIndicator(3, TOTAL_STEPS)} ${pc.bold("Pilih Model Default")}\n`);
  const model = await pickModel(models, process.env.CUTAD_MODEL);

  // ── Step 4: Save ──
  console.log(`\n  ${stepIndicator(4, TOTAL_STEPS)} ${pc.bold("Simpan Konfigurasi")}\n`);
  writeAuth({ apiKey, baseUrl: BASE_URL, site, model });
  await sleep(200);
  console.log(`  ${ok("Konfigurasi tersimpan")}\n`);

  // ── Summary panel ──
  console.log(`  ${pc.cyan("╭" + "─".repeat(50) + "╮")}`);
  console.log(`  ${pc.cyan("│")}  ${pc.bold(pc.cyan("Setup Selesai"))}` + " ".repeat(50 - 2 - visibleLen(pc.bold("Setup Selesai")) - 2) + ` ${pc.cyan("│")}`);
  console.log(`  ${pc.cyan("├" + "─".repeat(50) + "┤")}`);
  const summary = [
    [`  ${pc.dim("API Key")}`, `${pc.green("valid")} ${pc.dim("••••" + apiKey.slice(-4))}`],
    [`  ${pc.dim("Model")}`, pc.bold(model)],
    [`  ${pc.dim("Gateway")}`, pc.cyan(site)],
    [`  ${pc.dim("Tersimpan")}`, pc.dim("~/.cutad/auth.json")],
  ];
  for (const [label, value] of summary) {
    const padLen = 50 - 2 - visibleLen(label) - visibleLen(value) - 1;
    console.log(`  ${pc.cyan("│")}${label} ${value}` + " ".repeat(Math.max(1, padLen)) + `${pc.cyan("│")}`);
  }
  console.log(`  ${pc.cyan("╰" + "─".repeat(50) + "╯")}`);

  // ── Progress bar ──
  console.log();
  for (let s = 0; s <= TOTAL_STEPS; s++) {
    process.stdout.write(`\r  ${miniProgress(s, TOTAL_STEPS)}`);
    await sleep(60);
  }
  console.log(`  ${pc.green("✓")}\n`);

  // ── Step 5: Launch ──
  const go = await confirm(`  ${pc.cyan(pc.bold("Langsung masuk ke AI CUTAD?"))}`);
  if (go) {
    console.log(`\n  ${pc.dim("Memulai agent interface...")}\n`);
    await sleep(300);
    const { startTUI } = await import("./tui/App.mjs");
    const { createSession } = await import("./session/index.mjs");
    const session = createSession(model, "cutad");
    return startTUI({
      baseUrl: BASE_URL,
      apiKey,
      model,
      provider: "cutad",
      session,
      systemPrompt: "Kamu adalah AI CUTAD, agent coding otonom. Jawab ringkas & praktis.",
    });
  }
  console.log(`\n  ${pc.dim("Mulai kapan saja dengan:")} ${cmd("aicutad")}\n`);
}

/** Pemilihan model default (interaktif / nomor / env override). */
async function pickModel(models, envModel) {
  const ids = models.map((m) => m.id);
  if (envModel && ids.includes(envModel)) {
    console.log(`  ${info(`Model dari env: ${pc.bold(envModel)}`)}`);
    return envModel;
  }
  console.log(`  ${pc.dim("Gunakan ↑/↓ untuk navigasi, Enter untuk pilih:")}\n`);
  const chosen = await select("  Pilih model", ids);
  return chosen || ids[0];
}

/** Status: tampilkan info login + jumlah model. */
export async function status(argv = []) {
  const auth = readAuth();
  const { BASE_URL } = resolveBase(argv);

  console.log(`\n${banner()}\n  ${subtitle()}\n${rule()}\n`);

  if (!isAuthenticated()) {
    console.log(panel("Status", [
      row("Gateway", pc.cyan(auth.baseUrl || BASE_URL)),
      row("Login", pc.yellow("belum login")),
      row("Saran", `${cmd("aicutad")}  untuk mulai`),
    ], { width: 60 }));
    console.log("");
    return;
  }

  const stopSpin = animatedSpinner("Memeriksa model", { color: pc.cyan });
  let models = [];
  try {
    models = await listModels(auth.baseUrl || BASE_URL, auth.apiKey);
    await stopSpin();
  } catch (e) {
    await stopSpin();
    console.log(`  ${fail("Tidak bisa menjangkau gateway. API key mungkin kedaluwarsa.")}\n`);
    return;
  }

  const cards = [
    row("Status", pc.green("aktif")),
    row("API key", pc.dim(maskKey(auth.apiKey))),
    row("Base URL", pc.cyan(auth.baseUrl || BASE_URL)),
  ];
  if (auth.model) cards.push(row("Model", pc.bold(auth.model)));
  if (models.length > 0) {
    cards.push(row("Tersedia", `${pc.bold(String(models.length))} model`));
  }

  console.log(panel("Status", cards, { width: 60 }));
  console.log("");
}

/** Logout: hapus auth lokal. */
export function logout() {
  clearAuth();
  console.log(`\n  ${ok("Kredensial lokal (~/.cutad) telah dihapus.")}\n`);
}

function maskKey(key = "") {
  if (key.length <= 10) return "****";
  return `${key.slice(0, 6)}${pc.dim("…")}${key.slice(-4)}`;
}
