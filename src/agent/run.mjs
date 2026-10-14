// ─────────────────────────────────────────────────────────────
// Agent runner v2 — CLI entrypoint untuk agentic loop
// Terminal output: boot header, animated spinner,
// colored tool calls, thinking indicator, clean summary
//
// Features:
// 1. Boot header dengan ASCII brand + model info
// 2. Animated spinner (braille dots) saat menunggu model
// 3. Tool calls dengan icon + color + compact args
// 4. Tool results dengan preview + line count
// 5. Thinking text ditampilkan saat model berpikir
// 6. Progress indicator (iterasi count, tool count, elapsed time)
// 7. Clean summary box di akhir
// ─────────────────────────────────────────────────────────────
import pc from "picocolors";
import { readAuth, resolveBase } from "../config.mjs";
import { runAgentLoop } from "./loop.mjs";
import { VERSION } from "../version.mjs";
import { createInterface } from "node:readline";

// Label teks, bukan emoji (konsisten di semua terminal)
const TOOL_ICON = {
  read_file: "read",
  write_file: "write",
  edit_file: "edit",
  list_files: "list",
  search_files: "search",
  run_command: "run",
  browse_page: "browse",
  web_search: "web",
  screenshot: "shot",
};

const TOOL_COLOR = {
  read_file: pc.blue,
  write_file: pc.green,
  edit_file: pc.yellow,
  list_files: pc.cyan,
  search_files: pc.magenta,
  run_command: pc.yellow,
};

const SPINNER = ["\u280B", "\u2819", "\u2839", "\u2878", "\u287C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

/**
 * Jalankan agent dari CLI.
 * @param {string} task tugas dari user
 * @param {{model?, cwd?}} opts
 */
export async function runCliAgent(task, opts = {}) {
  const auth = readAuth();
  if (!auth.apiKey) {
    console.error("\n  " + pc.red("Error") + "  Belum login. Jalankan " + pc.cyan("aicutad login") + " dulu.\n");
    process.exit(1);
  }

  const { BASE_URL } = resolveBase([]);
  const model = opts.model || auth.model;
  const cwd = opts.cwd || process.cwd();

  if (!task || !task.trim()) {
    console.error("\n  " + pc.red("Error") + "  Tugas tidak boleh kosong.\n");
    process.exit(1);
  }

  // ── Boot header ────────────────────────────────────────────
  console.log();
  console.log("  " + pc.bold(pc.cyan("aicutad-cli")) + " " + pc.dim(`agent mode \u00B7 v${VERSION}`));
  console.log("  " + pc.dim("model:") + " " + pc.white(model) + "  " + pc.dim("dir:") + " " + pc.white(cwd));
  console.log("  " + pc.dim("\u2501".repeat(60)));
  console.log();
  console.log("  " + pc.cyan("\u203A") + " " + pc.white(task));
  console.log("  " + pc.dim("\u2501".repeat(60)));
  console.log();

  // ── Spinner state ──────────────────────────────────────────
  let spinnerIdx = 0;
  let spinnerTimer = null;
  let lastSpinnerLabel = "";

  function startSpinner(label) {
    stopSpinner();
    lastSpinnerLabel = label || "menunggu respons";
    spinnerTimer = setInterval(() => {
      const frame = SPINNER[spinnerIdx % SPINNER.length];
      spinnerIdx++;
      process.stdout.write("\r  " + pc.cyan(frame) + " " + pc.dim(lastSpinnerLabel) + "\x1b[K");
    }, 80);
  }

  function stopSpinner() {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    process.stdout.write("\r\x1b[2K");
  }

  // Start initial spinner
  startSpinner("berpikir\u2026");

  const startTime = Date.now();

  // Simpan sesi sejak awal (atomik) agar kalau proses mati di tengah,
  // tugas & progres terakhir tetap bisa dilacak dari 'aicutad sessions'.
  let cliSession = null;
  try {
    const { createSession, appendMessage } = await import("../session/index.mjs");
    cliSession = createSession(model, "cutad-agent-cli");
    appendMessage(cliSession, { role: "user", content: task });
  } catch {}

  // ── Run agent loop ─────────────────────────────────────────
  // Approval interaktif (hanya TTY): tampilkan preview diff/command,
  // user menjawab y / n / a (setujui semua berikutnya). -y menonaktifkan.
  let approveAll = Boolean(opts.yes);
  const askApproval = (process.stdin.isTTY && process.stdout.isTTY && !opts.yes)
    ? async ({ name, preview }) => {
        if (approveAll) return true;
        stopSpinner();
        console.log("\n  " + pc.bold(pc.yellow("Persetujuan diperlukan")) + "  " + pc.dim(name));
        console.log(preview.split("\n").map((l) => "    " + l).join("\n"));
        const answer = await new Promise((resolve) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          rl.question("  Setujui? (y)es / (n)o / (a)ll  ", (a) => { rl.close(); resolve(String(a || "").trim().toLowerCase()); });
        });
        if (answer === "a" || answer === "all") { approveAll = true; return true; }
        return answer === "y" || answer === "yes";
      }
    : undefined;

  const result = await runAgentLoop({
    onApprove: askApproval,
    checkpoint: opts.checkpoint !== false,
    baseUrl: BASE_URL,
    apiKey: auth.apiKey,
    model,
    task,
    cwd,

    onToolCall: (name, args) => {
      stopSpinner();
      const icon = TOOL_ICON[name] || "tool";
      const color = TOOL_COLOR[name] || pc.yellow;
      const argStr = formatArgs(name, args);
      console.log("  " + icon + " " + pc.bold(color(name)) + (argStr ? pc.dim(" (" + argStr + ")") : ""));
    },

    onToolResult: (name, result) => {
      const icon = TOOL_ICON[name] || "tool";
      const color = TOOL_COLOR[name] || pc.green;
      const lines = result.split("\n").length;
      const preview = result.split("\n").slice(0, 2).join("\n");
      const truncated = result.length > 200 ? pc.dim(" \u2026") : "";
      console.log("  " + icon + " " + color(name) + " " + pc.green("\u2713") + " " + pc.dim("(" + lines + " baris)"));
      if (preview.trim()) {
        console.log("    " + pc.dim(preview.slice(0, 150)) + truncated);
      }
      console.log();
      startSpinner("berpikir\u2026");
    },

    onThinking: (content) => {
      if (content && content.trim()) {
        stopSpinner();
        const text = content.trim().slice(0, 120);
        console.log("  " + pc.cyan("\u2726") + " " + pc.dim(text));
        startSpinner("berpikir\u2026");
      }
    },

    onError: (msg) => {
      stopSpinner();
      console.error("\n  " + pc.red("\u2717 Error") + "  " + msg + "\n");
    },
  });

  stopSpinner();

  // Catat hasil akhir ke sesi (sukses maupun error)
  if (cliSession) {
    try {
      const { appendMessage } = await import("../session/index.mjs");
      appendMessage(cliSession, { role: "assistant", content: result.result || "" });
      console.log("  " + pc.dim(`sesi: ${cliSession.id}`));
    } catch {}
  }

  if (result.checkpointId) {
    console.log("  " + pc.dim(`checkpoint: ${result.checkpointId} (rollback: aicutad rollback ${result.checkpointId})`));
  }

  // ── Summary ────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + "s";
  console.log("  " + pc.dim("\u2501".repeat(60)));
  console.log();
  console.log("  " + pc.bold(pc.cyan("aicutad-cli")) + " " + pc.dim("selesai \u00B7 " + result.iterations + " iterasi \u00B7 " + result.toolCalls + " tools \u00B7 " + elapsed));
  if (result.costSummary) {
    console.log("  " + pc.dim("\u2501".repeat(60)));
    console.log("  " + pc.bold("Cost & Usage:"));
    console.log("    " + pc.dim(result.costSummary));
    console.log();
  }

  if (result.result) {
    // Print result with simple markdown rendering
    printResult(result.result);
  }
}

function printResult(text) {
  const lines = text.split("\n");
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        const lang = line.slice(3).trim();
        console.log("  " + pc.gray("\u250C\u2500 code") + (lang ? pc.gray(" (" + lang + ")") : ""));
      } else {
        inCode = false;
        console.log("  " + pc.gray("\u2514\u2500"));
      }
      continue;
    }
    if (inCode) {
      console.log("  " + pc.gray("\u2502") + " " + pc.dim(line));
      continue;
    }
    console.log("  " + line);
  }
  console.log();
}

/** Format argumen tool untuk display. */
function formatArgs(name, args) {
  switch (name) {
    case "read_file":
      return args.path || "";
    case "write_file":
      return (args.path || "") + ", " + (args.content?.length || 0) + " bytes";
    case "edit_file":
      return args.path || "";
    case "list_files":
      return args.path || ".";
    case "search_files":
      return "\"" + (args.pattern || "") + "\" in " + (args.path || ".");
    case "run_command":
      return (args.command || "").slice(0, 60) || "";
    case "browse_page":
      return args.url || "";
    case "web_search":
      return "\"" + (args.query || "") + "\"";
    case "screenshot":
      return (args.url || "") + (args.full_page ? " (full)" : "");
    default:
      return Object.keys(args).join(", ");
  }
}
