// ─────────────────────────────────────────────────────────────
// Agent runner — CLI entrypoint untuk agentic loop
// Tampilkan tool calls & results real-time di terminal
// ─────────────────────────────────────────────────────────────
import pc from "picocolors";
import { readAuth, resolveBase } from "../config.mjs";
import { runAgentLoop } from "./loop.mjs";

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

  console.log(`\n  ${pc.cyan(pc.bold("AI CUTAD"))} ${pc.dim("agent mode")}\n  ${pc.dim("model:")} ${pc.white(model)}  ${pc.dim("dir:")} ${pc.white(cwd)}\n`);
  console.log(`  ${pc.cyan("›")} ${pc.white(task)}\n`);
  console.log(pc.dim("  " + "─".repeat(60)) + "\n");

  const result = await runAgentLoop({
    baseUrl: BASE_URL,
    apiKey: auth.apiKey,
    model,
    task,
    cwd,

    onToolCall: (name, args) => {
      const argStr = formatArgs(name, args);
      console.log(`  ${pc.yellow("⚡ tool")}  ${pc.bold(name)}${argStr ? pc.dim(`(${argStr})`) : ""}`);
    },

    onToolResult: (name, result) => {
      const preview = result.split("\n").slice(0, 3).join("\n");
      const lines = result.split("\n").length;
      const truncated = result.length > 200 ? pc.dim(" …") : "";
      console.log(`  ${pc.green("✓ result")} ${pc.dim(`(${lines} baris)`)}`);
      if (preview) {
        console.log(pc.dim("    " + preview.slice(0, 150)) + truncated);
      }
      console.log();
    },

    onThinking: (content) => {
      if (content && content.trim()) {
        console.log(`  ${pc.cyan("✦ thinking")}  ${pc.dim(content.slice(0, 150))}`);
      }
    },

    onError: (msg) => {
      console.error(`\n  ${pc.red("✗ Error")}  ${msg}\n`);
    },
  });

  console.log(pc.dim("  " + "─".repeat(60)));
  console.log(`\n  ${pc.cyan(pc.bold("AI CUTAD"))} ${pc.dim(`selesai · ${result.iterations} iterasi · ${result.toolCalls} tool calls`)}\n`);

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
