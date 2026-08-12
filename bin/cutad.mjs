#!/usr/bin/env node
// Cutad CLI — entrypoint utama
import { Command } from "commander";
import { createRequire } from "node:module";
import { resolveBase } from "../src/config.mjs";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name("aicutad")
  .description("AI CUTAD — AI coding agent CLI (gateway ai.cutad.web.id)")
  .version(pkg.version, "-v, --version", "tampilkan versi");

program
  .command("login")
  .description("Masuk / simpan API key agar bisa memanggil model")
  .option("-b, --base <url>", "Base URL gateway (default: ai.cutad.web.id/v1)")
  .action((opts) => import("../src/commands.mjs").then((m) => m.login(buildArgv(opts))));

program
  .command("status")
  .description("Tampilkan status login + daftar model")
  .option("-b, --base <url>", "Base URL gateway")
  .action((opts) => import("../src/commands.mjs").then((m) => m.status(buildArgv(opts))));

program
  .command("logout")
  .description("Hapus kredensial lokal")
  .action(() => import("../src/commands.mjs").then((m) => m.logout()));

program
  .command("models")
  .description("Tampilkan daftar model dari gateway")
  .option("-b, --base <url>", "Base URL gateway")
  .action((opts) => import("../src/models.mjs").then((m) => m.models(buildArgv(opts))));

program
  .command("chat [prompt...]")
  .description("Kirim pesan ke model (kosongkan untuk mode interaktif)")
  .option("-b, --base <url>", "Base URL gateway")
  .option("-m, --model <model>", "Model yang dipakai (override default)")
  .action((prompt, opts) => {
    const promptText = Array.isArray(prompt) ? prompt.join(" ") : (prompt || "");
    return import("../src/chat.mjs").then((m) => m.chat(promptText, buildArgv(opts)));
  });

program.parseAsync(process.argv);

// Helper: ubah option commander menjadi bentuk argv yang dipakai modul
function buildArgv(opts) {
  const args = ["node", "cutad"];
  if (opts?.base) args.push("--base", opts.base);
  if (opts?.model) args.push("--model", opts.model);
  return args;
}
