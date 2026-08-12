// Command utama: login, status, logout
import { createInterface } from "node:readline";
import {
  writeAuth, readAuth, clearAuth, resolveBase, isAuthenticated,
} from "./config.mjs";
import { listModels } from "./api.mjs";
import { banner, brand, rule, panel, row, ok, fail, info, arrow, spinner, pc } from "./ui.mjs";

/** Prompt interaktif sederhana. */
function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Login: minta API key (atau dari env CUTAD_API_KEY), lalu fetch daftar model utk validasi.
 */
export async function login(argv = []) {
  const { BASE_URL } = resolveBase(argv);
  const site = BASE_URL.endsWith("/v1") ? BASE_URL.slice(0, -3) : BASE_URL;

  console.log(`\n${banner()}`);
  console.log(`\n${brand()}  ${pc.dim("·")}  ${pc.white("AI Coding Agent CLI")}\n`);

  const envKey = process.env.CUTAD_API_KEY?.trim();
  const apiKey = envKey || (await ask(pc.cyan("  API Key:")));

  if (!apiKey) {
    console.error(`\n  ${fail("API Key wajib diisi (atau set env CUTAD_API_KEY).")}\n`);
    process.exit(1);
  }

  let model = process.env.CUTAD_MODEL?.trim()
    || (process.stdin.isTTY ? await ask(pc.cyan("  Model default (opsional):")) : undefined);

  // Simpan sementara untuk validasi
  writeAuth({ apiKey, baseUrl: BASE_URL, site, model: model || undefined });

  console.log(`\n  ${info(`Menghubungkan ke ${pc.white(site)} …`)}`);
  const stop = spinner("Mengambil daftar model dari gateway");
  let models = [];
  try {
    models = await listModels(BASE_URL, apiKey);
    await stop();
  } catch (e) {
    await stop();
    console.log(`\n  ${fail("Login tersimpan, tapi tidak bisa memvalidasi gateway:")}`);
    console.log(`     ${pc.red(e.message)}`);
    console.log(`     ${pc.dim(`(kamu bisa coba lagi nanti dengan \`${cmd_("models")}\`)`)}`);
  }

  if (models.length > 0) {
    if (!model) {
      model = models[0].id; // auto-pilih model pertama
      writeAuth({ model });
    }
    console.log(`\n${panel("Koneksi OK", [
      row("Gateway", pc.cyan(site)),
      row("Status", ok("terhubung")),
      row("Model", `${pc.bold(model)}  ${pc.dim(`(${models.length} tersedia)`)}`),
    ])}\n`);
  } else {
    console.log(`\n${panel("Selesai", [
      row("Auth tersimpan", pc.dim("~/.cutad/auth.json")),
      row("Base URL", pc.cyan(BASE_URL)),
      row("Catatan", pc.dim("gateway tidak membagikan daftar model")),
    ])}\n`);
  }

  console.log(`  ${arrow(`Mulai dengan \`${cmd_("chat")} "pesanmu"\``)}\n`);
}

/** Status: tampilkan info login + jumlah model. */
export async function status(argv = []) {
  const auth = readAuth();
  const { BASE_URL } = resolveBase(argv);

  console.log(`\n${brand()}`);
  console.log(`${rule()}\n`);

  if (!isAuthenticated()) {
    console.log(panel("Status", [
      row("Gateway", pc.cyan(auth.baseUrl || BASE_URL)),
      row("Login", fail("belum login")),
      row("Saran", `${cmd_("login")}  untuk mulai`),
    ]));
    console.log("");
    return;
  }

  const stop = spinner("Memeriksa model dari gateway");
  let models = [];
  try {
    models = await listModels(auth.baseUrl || BASE_URL, auth.apiKey);
    await stop();
  } catch (e) {
    await stop();
  }

  const cards = [
    row("Login", ok("aktif")),
    row("API key", pc.dim(maskKey(auth.apiKey))),
    row("Base URL", pc.cyan(auth.baseUrl || BASE_URL)),
  ];
  if (auth.model) cards.push(row("Model", pc.bold(auth.model)));
  if (models.length > 0) {
    const ids = models.slice(0, 4).map((m) => m.id).join(", ");
    cards.push(row("Model", `${pc.bold(models.length + " model")}  ${pc.dim(ids)}${models.length > 4 ? pc.dim(", …") : ""}`));
  } else if (models.length === 0 && isAuthenticated()) {
    cards.push(row("Model", pc.yellow("gagal fetch")));
  }

  console.log(panel("Status", cards));
  console.log("");
}

/** Logout: hapus auth lokal. */
export function logout() {
  clearAuth();
  console.log(`\n  ${ok("Kredensial lokal (~/.cutad) telah dihapus.")}${pc.dim(" ")}${pc.dim("Revoke key di dashboard bila perlu.")}`);
  console.log("");
}

function maskKey(key = "") {
  if (key.length <= 10) return "••••••";
  return `${key.slice(0, 6)}${pc.dim("…")}${key.slice(-4)}`;
}

// helper menampilkan command dengan styling tombol
function cmd_(c) {
  return pc.bgCyan(pc.black(` ${c} `));
}
