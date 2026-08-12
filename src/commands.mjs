// Command utama: login (wizard), status, logout
import {
  writeAuth, readAuth, clearAuth, resolveBase, isAuthenticated,
} from "./config.mjs";
import { listModels } from "./api.mjs";
import { banner, subtitle, rule, panel, row, ok, fail, info, spinner, cmd, pc } from "./ui.mjs";
import { askHidden, askPlain, select, confirm } from "./prompt.mjs";

function header() {
  return `${banner()}\n  ${subtitle()}\n${rule()}`;
}

/**
 * Wizard setup pertama kali / login.
 * 1) minta API key (hidden)
 * 2) validasi key ke gateway
 * 3) pilih model default
 * 4) simpan auth
 * 5) tawarkan masuk ke chat
 */
export async function login(argv = []) {
  const { BASE_URL } = resolveBase(argv);
  const site = BASE_URL.endsWith("/v1") ? BASE_URL.slice(0, -3) : BASE_URL;

  console.log(`\n${header()}\n`);

  // 1) API key
  const envKey = process.env.CUTAD_API_KEY?.trim();
  let apiKey = envKey;
  if (!apiKey) {
    console.log(`  ${pc.dim("Masukkan API key dari gateway kamu (terlihat sebagai *).")}`);
    if (process.env.CUTAD_API_KEY) {
      apiKey = process.env.CUTAD_API_KEY.trim();
    } else {
      apiKey = await askHidden(`${pc.cyan("API key")}${pc.dim(":")}`);
    }
  }
  if (!apiKey) {
    console.error(`\n  ${fail("API key tidak boleh kosong. Coba lagi.")}\n`);
    process.exit(1);
  }

  // 2) Validasi dengan mengambil daftar model
  console.log(`\n  ${info(`Memvalidasi API key di ${pc.cyan(site)}`)}`);
  const stop = spinner("Menghubungi gateway ...");
  let models = [];
  try {
    models = await listModels(BASE_URL, apiKey);
    await stop();
  } catch (e) {
    await stop();
    console.log(`\n  ${fail("API key tidak valid atau tidak bisa terhubung ke gateway.")}`);
    console.log(`     ${pc.dim(e.message)}`);
    const retry = await confirm("\n  Coba input ulang API key?", true);
    if (retry) return login(argv);
    process.exit(1);
  }

  // 3) Pilihan model
  console.log(`\n  ${ok(`API key valid — ${pc.bold(String(models.length))} model ditemukan.`)}`);
  const model = await pickModel(models, process.env.CUTAD_MODEL);

  // 4) Simpan
  writeAuth({ apiKey, baseUrl: BASE_URL, site, model });

  console.log(`\n${panel("Setup selesai", [
    row("API key", ok(pc.dim("valid"))),
    row("Model", pc.bold(model)),
    row("Gateway", pc.cyan(site)),
    row("Disimpan", pc.dim("~/.cutad/auth.json")),
  ], { width: 60 })}\n`);

  // 5) Tawarkan chat
  const go = await confirm(`  ${pc.cyan("Langsung masuk mode chat?")}`);
  if (go) {
    const { chat } = await import("./chat.mjs");
    return chat("", argv);
  }
}

/** Pemilihan model default (interaktif / nomor / env override). */
async function pickModel(models, envModel) {
  const ids = models.map((m) => m.id);
  if (envModel && ids.includes(envModel)) {
    console.log(`\n  ${info(`Model default dari env: ${pc.bold(envModel)}`)}`);
    return envModel;
  }
  console.log(`\n  ${pc.dim("Pilih model default (pakai ↑/↓ lalu Enter):")}`);
  const chosen = await select("Model default", ids);
  return chosen || ids[0];
}

/** Status: tampilkan info login + jumlah model. */
export async function status(argv = []) {
  const auth = readAuth();
  const { BASE_URL } = resolveBase(argv);

  console.log(`\n${header()}\n`);

  if (!isAuthenticated()) {
    console.log(panel("Status", [
      row("Gateway", pc.cyan(auth.baseUrl || BASE_URL)),
      row("Login", pc.yellow("belum login")),
      row("Saran", `${cmd("aicutad login")}  untuk mulai`),
    ], { width: 60 }));
    console.log("");
    return;
  }

  const stop = spinner("Memeriksa model ...");
  let models = [];
  try {
    models = await listModels(auth.baseUrl || BASE_URL, auth.apiKey);
    await stop();
  } catch (e) {
    await stop();
    console.log(`\n  ${fail("Tidak bisa menjangkau gateway. API key mungkin kedaluwarsa.")}\n`);
    return;
  }

  const cards = [
    row("Status", pc.green("aktif")),
    row("API key", pc.dim(maskKey(auth.apiKey))),
    row("Base URL", pc.cyan(auth.baseUrl || BASE_URL)),
  ];
  if (auth.model) cards.push(row("Model", pc.bold(auth.model)));
  if (models.length > 0) {
    cards.push(row("Model", `${pc.bold(String(models.length))} tersedia`));
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
