// ─────────────────────────────────────────────────────────────
// Agent runner — CLI entrypoint untuk agentic loop (v2)
// Tampilan tool calls & results real-time, clean & polished
//
// Improvements:
// 1. Spinner saat menunggu model response (bukan blank)
// 2. Tool calls dengan icon + color + compact args
// 3. Tool results dengan preview + line count
// 4. Thinking text ditampilkan saat model berpikir
// 5. Summary bersih di akhir
// ─────────────────────────────────────────────────────────────
import pc from "picocolors";
import { readAuth, resolveBase } from "../config.mjs";
import { runAgentLoop } from "./loop.mjs";

// Tool styles (match TUI)
const TOOL_ICON = {
  read_file: "📖",
  write_file: "📝",
  edit_file: "✏️",
  list_files: "📂",
  search_files: "🔍",
  run_command: "⚡",
};

const TOOL_COLOR = {
  read_file: pc.blue,
  write_file: pc.green,
  edit_file: pc.yellow,
  list_files: pc.cyan,
  search_files: pc.magenta,
  run_command: pc.yellow,
};

/**
 * Jalankan agent dari CLI.
 * @param {string} task tugas dari user
 * @param {{model?, cwd?}} opts
 */
export async function runCliAgent(task, opts = {}) {
  const auth = readAuth();
  if (!auth.apiKey) {
    console.error(`\n  ${pc.red("Error")}  Belum login. Jalankan ${pc.cyan("aicutad login")} dulu.\n`);
    process.exit(1);
  }

  const { BASE_URL } = resolveBase([]);
  const model = opts.model || auth.model;
  const cwd = opts.cwd || process.cwd();

  if (!task || !task.trim()) {
    console.error(`\n  ${pc.red("Error")}  Tugas tidak boleh kosong.\n`);
    process.exit(1);
  }

  // Header
  console.log();
  console.log(`  ${pc.cyan(pc.bold("◆ AI CUTAD"))} ${pc.dim("agent mode")}`);
  console.log(`  ${pc.dim("model:")} ${pc.white(model)}  ${pc.dim("dir:")} ${pc.white(cwd)}`);
  console.log();
  console.log(`  ${pc.cyan("›")} ${pc.white(task)}`);
  console.log(`  ${pc.dim("─".repeat(60))}`);
  console.log();

  let spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let spinnerIdx = 0;
  let spinnerTimer = null;
  let lastSpinnerLine = "";

  function startSpinner(label) {
    stopSpinner();
    const cleanLabel = label || "menunggu respons";
    spinnerTimer = setInterval(() => {
      const frame = spinnerFrames[spinnerIdx % spinnerFrames.length];
      spinnerIdx++;
      lastSpinnerLine = `\r  ${pc.cyan(frame)} ${pc.dim(cleanLabel)}`;
      process.stdout.write(lastSpinnerLine + "\x1b[K");
    }, 80);
  }

  function stopSpinner() {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    if (lastSpinnerLine) {
      process.stdout.write("\r\x1b[2K"); // clear spinner line
      lastSpinnerLine = "";
    }
  }

  // Start initial spinner
  startSpinner("berpikir");

  const result = await runAgentLoop({
    baseUrl: BASE_URL,
    apiKey: auth.apiKey,
    model,
    task,
    cwd,

    onToolCall: (name, args) => {
      stopSpinner();
      const icon = TOOL_ICON[name] || "🔧";
      const color = TOOL_COLOR[name] || pc.yellow;
      const argStr = formatArgs(name, args);
      console.log(`  ${icon} ${pc.bold(color(name))}${argStr ? pc.dim(`(${argStr})`) : ""}`);
    },

    onToolResult: (name, result) => {
      const icon = TOOL_ICON[name] || "🔧";
      const color = TOOL_COLOR[name] || pc.green;
      const lines = result.split("\n").length;
      const preview = result.split("\n").slice(0, 2).join("\n");
      const truncated = result.length > 200 ? pc.dim(" …") : "";
      console.log(`  ${icon} ${color(name)} ${pc.green("✓")} ${pc.dim(`(${lines} baris)`)}`);
      if (preview.trim()) {
        console.log(`    ${pc.dim(preview.slice(0, 150))}${truncated}`);
      }
      console.log();
      // Restart spinner for next model call
      startSpinner("berpikir");
    },

    onThinking: (content) => {
      if (content && content.trim()) {
        stopSpinner();
        const text = content.trim().slice(0, 120);
        console.log(`  ${pc.cyan("✦")} ${pc.dim(text)}`);
        startSpinner("berpikir");
      }
    },

    onError: (msg) => {
      stopSpinner();
      console.error(`\n  ${pc.red("✗ Error")}  ${msg}\n`);
    },
  });

  stopSpinner();

  // Summary
  console.log(`  ${pc.dim("─".repeat(60))}`);
  console.log(`\n  ${pc.cyan(pc.bold("◆ AI CUTAD"))} ${pc.dim(`selesai · ${result.iterations} iterasi · ${result.toolCalls} tool calls`)}\n`);

  if (result.result) {
    console.log(`  ${result.result}\n`);
  }
}

/** Format argumen tool untuk display. */
function formatArgs(name, args) {
  switch (name) {
    case "read_file":
      return args.path || "";
    case "write_file":
      return `${args.path || ""}, ${args.content?.length || 0} bytes`;
    case "edit_file":
      return args.path || "";
    case "list_files":
      return args.path || ".";
    case "search_files":
      return `"${args.pattern || ""}" in ${args.path || "."}`;
    case "run_command":
      return args.command?.slice(0, 60) || "";
    default:
      return Object.keys(args).join(", ");
  }
}
