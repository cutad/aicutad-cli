#!/usr/bin/env node
// aicutad CLI — entrypoint utama (versi dari package.json via src/version.mjs)
import { Command } from "commander";
import { createRequire } from "node:module";
import { isAuthenticated } from "../src/config.mjs";
import { initProxy } from "../src/proxy.mjs";

await initProxy();

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name("aicutad")
  .description("aicutad-cli - AI coding agent CLI (gateway ai.cutad.web.id)")
  .version(pkg.version, "-v, --version", "tampilkan versi")
  .addHelpText("after", `
Contoh:
  aicutad                         Buka TUI (atau wizard bila belum login)
  aicutad login                   Setup API key & model
  aicutad agent "perbaiki bug X"  Jalankan agent otonom
  aicutad agent -y "tulis tes"    Agent tanpa prompt persetujuan
  aicutad chat "halo"             Chat satu kali (streaming)
  aicutad status --json           Status dalam JSON (untuk skrip/CI)
  aicutad resume <session-id>     Lanjutkan sesi tersimpan
  aicutad rollback --list         Daftar checkpoint agent

Lingkungan:
  CUTAD_PROFILE=<name>   Profile config terpisah (~/.cutad/profiles/<name>)
  CUTAD_BASE=<url>       Override base URL gateway
  NO_COLOR=1             Nonaktifkan warna
`);

// │ login — setup wizard (hidden input, validasi, pilih model)      │
program
  .command("login")
  .description("Setup wizard: masukkan API key, validasi, pilih model")
  .option("-b, --base <url>", "Base URL gateway")
  .action((opts) => import("../src/commands.mjs").then((m) => m.login(buildArgv(opts))));

// │ status — info login + model                                       │
program
  .command("status")
  .description("Status login + daftar model")
  .option("-b, --base <url>", "Base URL gateway")
  .option("--json", "Keluarkan JSON (untuk skrip/CI)")
  .action((opts) => import("../src/commands.mjs").then((m) => m.status(buildArgv(opts))));

// │ logout — hapus kredensial                                         │
program
  .command("logout")
  .description("Hapus kredensial lokal")
  .action(() => import("../src/commands.mjs").then((m) => m.logout()));

// │ models — daftar model                                             │
program
  .command("models")
  .description("Daftar model dari gateway")
  .option("-b, --base <url>", "Base URL gateway")
  .option("--json", "Keluarkan JSON (untuk skrip/CI)")
  .action((opts) => import("../src/models.mjs").then((m) => m.models(buildArgv(opts))));

// │ chat — kirim pesan / mode interaktif / TUI                        │
program
  .command("chat [prompt...]")
  .description("Kirim pesan ke model (kosongkan untuk TUI)")
  .option("-b, --base <url>", "Base URL gateway")
  .option("-m, --model <model>", "Model yang dipakai")
  .option("--tui", "Pakai TUI full-screen (native ANSI)")
  .action((prompt, opts) => {
    const promptText = Array.isArray(prompt) ? prompt.join(" ") : (prompt || "");
    return import("../src/chat.mjs").then((m) => m.chat(promptText, buildArgv(opts), opts.tui));
  });

// │ agents — daftar / jalankan subagent                               │
program
  .command("agents")
  .description("Daftar subagent tersedia")
  .action(() => import("../src/agent/index.mjs").then((m) => {
    const agents = m.listAgents();
    agents.forEach((a) => console.log(`  ${a.name.padEnd(20)} ${a.description}`));
  }));

// │ agent — jalankan agentic loop (baca/tulis file, run command)     │
program
  .command("agent <task...>")
  .description("Jalankan agent otonom: baca/tulis file, run command, selesaikan tugas")
  .option("-m, --model <model>", "Model yang dipakai")
  .option("-d, --dir <path>", "Working directory (default: cwd)")
  .option("-y, --yes", "Setujui semua aksi tanpa prompt approval")
  .option("--no-checkpoint", "Nonaktifkan checkpoint/rollback untuk sesi ini")
  .action((task, opts) => {
    const taskText = Array.isArray(task) ? task.join(" ") : task;
    return import("../src/agent/run.mjs").then((m) => m.runCliAgent(taskText, {
      model: opts.model,
      cwd: opts.dir,
      yes: opts.yes,
      checkpoint: opts.checkpoint,
    }));
  });

// │ rollback — pulihkan file dari checkpoint agent                  │
program
  .command("rollback [id]")
  .description("Pulihkan file dari checkpoint agent (--list untuk daftar)")
  .option("--list", "Daftar checkpoint tersimpan")
  .action((id, opts) => import("../src/agent/checkpoint.mjs").then((m) => {
    if (opts.list || !id) {
      const list = m.listCheckpoints();
      if (!list.length) { console.log("  Belum ada checkpoint."); return; }
      list.forEach((c) => console.log(`  ${c.id}  ${c.files} file  ${c.cwd}  ${c.createdAt}`));
      return;
    }
    const r = m.restoreCheckpoint(id);
    if (!r.ok) { console.error(`  Error: ${r.error}`); process.exitCode = 1; return; }
    console.log(`  Rollback selesai: ${r.restored.length} file dipulihkan, ${r.removed.length} file baru dihapus.`);
    [...r.restored, ...r.removed].forEach((f) => console.log(`   - ${f}`));
  }));

// │ sessions — daftar session tersimpan                                │
program
  .command("sessions")
  .description("Daftar session tersimpan")
  .option("--load <id>", "Muat session berdasarkan ID")
  .option("--delete <id>", "Hapus session")
  .option("--export <spec...>", "Ekspor session: --export <id> <path>")
  .option("--json", "Keluarkan JSON (untuk skrip/CI)")
  .action((opts) => {
    import("../src/session/index.mjs").then((m) => {
      if (opts.delete) {
        m.deleteSession(opts.delete);
        console.log(`  Session ${opts.delete} dihapus.`);
        return;
      }
      if (opts.load) {
        const s = m.loadSession(opts.load);
        if (!s) { console.error(`  Error: session tidak ditemukan: ${opts.load}`); process.exitCode = 1; return; }
        console.log(JSON.stringify(s, null, 2));
        return;
      }
      if (opts.export) {
        const [id, outPath] = Array.isArray(opts.export) ? opts.export : [opts.export];
        if (!id || !outPath) {
          console.error("  Error: pakai --export <id> <path>");
          process.exitCode = 1;
          return;
        }
        const okExport = m.exportSession(id, outPath);
        if (!okExport) { console.error(`  Error: session tidak ditemukan: ${id}`); process.exitCode = 1; return; }
        console.log(`  Session ${id} diekspor ke ${outPath}`);
        return;
      }
      const sessions = m.listSessions();
      if (opts.json) { console.log(JSON.stringify(sessions, null, 2)); return; }
      if (sessions.length === 0) {
        console.log("  Belum ada session.");
        return;
      }
      sessions.forEach((s) => console.log(`  ${s.id}  ${String(s.model || "-").padEnd(30)} ${s.messageCount} pesan  ${s.updatedAt}`));
    });
  });

// │ mcp — kelola MCP server                                            │
program
  .command("mcp")
  .description("Kelola MCP (Model Context Protocol) server")
  .option("--list", "Daftar MCP server")
  .option("--add <name>", "Tambah MCP server (wajib --command)")
  .option("--command <command>", "Command MCP server (untuk --add)")
  .option("--args <args...>", "Argumen MCP server (untuk --add)")
  .option("--remove <name>", "Hapus MCP server")
  .option("--connect <name>", "Connect & list tools")
  .option("--json", "Keluarkan JSON (untuk skrip/CI)")
  .action((opts) => import("../src/mcp/index.mjs").then(async (m) => {
    if (opts.add) {
      if (!opts.command) {
        console.error("  Error: --add wajib disertai --command <command>. Contoh: aicutad mcp --add fs --command npx --args -y @modelcontextprotocol/server-filesystem /tmp");
        process.exitCode = 1;
        return;
      }
      m.addMcpServer(opts.add, { command: opts.command, args: opts.args || [] });
      console.log(`  MCP server ${opts.add} ditambahkan: ${opts.command} ${(opts.args || []).join(" ")}`);
      return;
    }
    if (opts.remove) { m.removeMcpServer(opts.remove); console.log(`  MCP server ${opts.remove} dihapus.`); return; }
    if (opts.connect) {
      try {
        const { tools } = await m.connectMcpServer(opts.connect);
        console.log(`  Tools di ${opts.connect} (${tools.length}):`);
        tools.forEach((t) => console.log(`   • ${t.name}: ${t.description?.slice(0, 60) || ""}`));
      } catch (e) { console.error(`  Error: ${e.message}`); }
      return;
    }
    const servers = m.listMcpServers();
    if (opts.json) { console.log(JSON.stringify(servers, null, 2)); return; }
    if (servers.length === 0) { console.log("  Belum ada MCP server."); return; }
    servers.forEach((s) => console.log(`  ${s.name.padEnd(20)} ${s.command} ${(s.args||[]).join(" ")} ${s.enabled ? "✓" : "✗"}`));
  }));

// │ audit — lihat audit log eksekusi tool (compliance)               │
program
  .command("audit")
  .description("Lihat audit log eksekusi tool (~/.cutad/audit.log)")
  .option("--limit <n>", "Jumlah entri terakhir", "50")
  .option("--json", "Keluarkan JSON (untuk skrip/CI)")
  .action((opts) => import("../src/audit-log.mjs").then((m) => {
    const entries = m.readAuditLog(Number(opts.limit) || 50);
    if (opts.json) { console.log(JSON.stringify(entries, null, 2)); return; }
    if (!entries.length) { console.log("  Audit log kosong."); return; }
    entries.forEach((e) => console.log(`  ${e.ts}  ${String(e.tool).padEnd(14)} ${e.ok ? "ok " : "ERR"}  ${JSON.stringify(e.args)}`));
  }));

// │ resume — lanjutkan sesi tersimpan di TUI                         │
program
  .command("resume <id>")
  .description("Lanjutkan session tersimpan (TUI dengan riwayat sesi itu)")
  .action(async (id) => {
    if (!isAuthenticated()) {
      const { login } = await import("../src/commands.mjs");
      return login([]);
    }
    const { readAuth, resolveBase } = await import("../src/config.mjs");
    const { loadSession } = await import("../src/session/index.mjs");
    const session = loadSession(id);
    if (!session) { console.error(`  Error: session tidak ditemukan: ${id}`); process.exitCode = 1; return; }
    const auth = readAuth();
    const { BASE_URL } = resolveBase([]);
    const { startTUI } = await import("../src/tui/App.mjs");
    return startTUI({
      baseUrl: BASE_URL,
      apiKey: auth.apiKey,
      model: session.model || auth.model,
      provider: session.provider || "cutad",
      session,
      systemPrompt: "Kamu adalah aicutad-cli, asisten AI coding. Jawab ringkas, praktis, sertakan contoh kode bila relevan.",
    });
  });

// │ Tanpa sub-command:                                                │
// │ - belum login → wizard                                            │
// │ - sudah login → TUI full-screen                                   │
program.action(async () => {
  if (!isAuthenticated()) {
    const { login } = await import("../src/commands.mjs");
    return login([]);
  }
  // Launch TUI
  const { readAuth, resolveBase } = await import("../src/config.mjs");
  const auth = readAuth();
  const { BASE_URL } = resolveBase([]);
  const { createSession } = await import("../src/session/index.mjs");
  const session = createSession(auth.model, "cutad");
  const { startTUI } = await import("../src/tui/App.mjs");
  return startTUI({
    baseUrl: BASE_URL,
    apiKey: auth.apiKey,
    model: auth.model,
    provider: "cutad",
    session,
    systemPrompt: "Kamu adalah aicutad-cli, asisten AI coding. Jawab ringkas, praktis, sertakan contoh kode bila relevan.",
  });
});

// Tolak sub-command tidak dikenal secara eksplisit. Tanpa ini,
// commander meneruskan kata asing ke handler root dan TUI terbuka
// diam-diam (exit 0) - perilaku yang tidak bisa diterima corporate.
const KNOWN_COMMANDS = new Set(["login", "status", "logout", "models", "chat", "agents", "agent", "sessions", "mcp", "rollback", "audit", "resume", "help"]);
const firstArg = process.argv[2];
if (firstArg && !firstArg.startsWith("-") && !KNOWN_COMMANDS.has(firstArg)) {
  console.error(`  Error: perintah tidak dikenal: ${firstArg}. Jalankan 'aicutad --help'.`);
  process.exit(1);
}

program.parseAsync(process.argv);

function buildArgv(opts) {
  const args = ["node", "aicutad"];
  if (opts?.base) args.push("--base", opts.base);
  if (opts?.model) args.push("--model", opts.model);
  if (opts?.json) args.push("--json");
  return args;
}
