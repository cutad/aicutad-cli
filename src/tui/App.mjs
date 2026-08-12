// ─────────────────────────────────────────────────────────────
// TUI native — full-screen interactive agent interface
// Fitur: animated spinner, colored tool boxes, rounded borders,
//        color-coded messages, real-time tool progress
// ─────────────────────────────────────────────────────────────
import { chatCompletion, listModels } from "../api.mjs";
import { listAgents, getAgent, runAgent } from "../agent/index.mjs";
import { listSessions, saveSession, appendMessage, createSession } from "../session/index.mjs";

// ── Color palette ───────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  magenta: (s) => `\x1b[35m${s}\x1b[39m`,
  blue: (s) => `\x1b[34m${s}\x1b[39m`,
  white: (s) => `\x1b[37m${s}\x1b[39m`,
  bgCyan: (s) => `\x1b[46m\x1b[30m${s}\x1b[49m\x1b[39m`,
  bgGreen: (s) => `\x1b[42m\x1b[30m${s}\x1b[49m\x1b[39m`,
  bgYellow: (s) => `\x1b[43m\x1b[30m${s}\x1b[49m\x1b[39m`,
  bgRed: (s) => `\x1b[41m\x1b[30m${s}\x1b[49m\x1b[39m`,
  // true colors
  teal: (s) => `\x1b[38;5;38m${s}\x1b[39m`,
  orange: (s) => `\x1b[38;5;208m${s}\x1b[39m`,
  gray: (s) => `\x1b[38;5;240m${s}\x1b[39m`,
};

const ANSI = {
  clear: "\x1b[2J",
  clearBelow: "\x1b[J",
  home: "\x1b[H",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  altScreenEnter: "\x1b[?1049h",
  altScreenExit: "\x1b[?1049l",
  up: (n) => `\x1b[${n}A`,
};

// Spinner frames
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Tool icons & colors
const TOOL_STYLE = {
  read_file:    { icon: "📖", color: C.blue,    label: "Read File" },
  write_file:   { icon: "📝", color: C.green,   label: "Write File" },
  edit_file:    { icon: "✏️", color: C.yellow,  label: "Edit File" },
  list_files:   { icon: "📂", color: C.cyan,    label: "List Files" },
  search_files: { icon: "🔍", color: C.magenta, label: "Search" },
  run_command:  { icon: "⚡", color: C.orange,  label: "Run Command" },
};

const COMMANDS = [
  ["/help", "Tampilkan bantuan"],
  ["/models", "Daftar model"],
  ["/model <name>", "Ganti model"],
  ["/agents", "Daftar subagent"],
  ["/sessions", "Daftar session tersimpan"],
  ["/save", "Simpan session"],
  ["/clear", "Bersihkan layar"],
  ["/exit", "Keluar"],
];

/**
 * Start TUI full-screen.
 */
export async function startTUI(config) {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY || !stdout.isTTY) {
    return fallbackREPL(config);
  }

  let messages = [];
  let input = "";
  let loading = false;
  let model = config.model || "";
  let status = "ready";
  let showHelp = false;
  let spinnerIdx = 0;
  let spinnerTimer = null;
  let toolCount = 0;
  let iterCount = 0;

  function addMessage(msg) {
    messages.push(msg);
    if (config.session) {
      appendMessage(config.session, msg);
    }
  }

  function startSpinner() {
    if (spinnerTimer) return;
    spinnerTimer = setInterval(() => {
      spinnerIdx = (spinnerIdx + 1) % SPINNER.length;
      render();
    }, 80);
  }

  function stopSpinner() {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
  }

  function render() {
    const W = stdout.columns || 80;
    const H = stdout.rows || 24;
    const lines = [];

    // ── Header bar ──
    lines.push(` ${C.bold(C.cyan("◆ AI CUTAD"))} ${C.gray("│")} ${C.dim("AI Coding Agent CLI")} ${C.gray("v0.3.0")}`);
    lines.push(` ${C.gray("─".repeat(W - 2))}`);

    // ── Help panel ──
    if (showHelp) {
      lines.push(` ${C.bold(C.cyan("Perintah tersedia"))}`);
      for (const [name, desc] of COMMANDS) {
        lines.push(`   ${C.cyan(name.padEnd(22))} ${C.gray(desc)}`);
      }
      lines.push("");
    }

    // ── Empty state ──
    if (messages.length === 0 && !loading) {
      lines.push("");
      lines.push(`   ${C.gray("┌─────────────────────────────────────────────┐")}`);
      lines.push(`   ${C.gray("│")}  ${C.dim("Ketik tugas atau pertanyaan, lalu Enter")}  ${C.gray("│")}`);
      lines.push(`   ${C.gray("│")}  ${C.cyan("Contoh:")} ${C.dim("\"buat file hello.js\"")}        ${C.gray("│")}`);
      lines.push(`   ${C.gray("│")}  ${C.cyan("Ketik")} ${C.bold("/help")} ${C.dim("untuk bantuan")}           ${C.gray("│")}`);
      lines.push(`   ${C.gray("└─────────────────────────────────────────────┘")}`);
      lines.push("");
    }

    // ── Messages ──
    const maxMsgLines = H - 7;
    const visible = messages.slice(-Math.max(5, Math.floor(maxMsgLines / 2)));
    for (const msg of visible) {
      if (msg.role === "user") {
        lines.push(` ${C.bold(C.cyan("┌─ you"))}`);
        const wrapped = wrapText(msg.content, W - 5);
        for (const line of wrapped) {
          lines.push(` ${C.cyan("│")} ${line}`);
        }
        lines.push(` ${C.cyan("└─")}`);
      } else if (msg.role === "tool_call") {
        // Tool call box (yellow border)
        const style = TOOL_STYLE[msg.toolName] || { icon: "🔧", color: C.yellow, label: msg.toolName };
        const argStr = msg.argsPreview || "";
        lines.push(` ${C.yellow("┌─")} ${style.icon} ${C.bold(C.yellow(style.label))} ${C.gray(argStr)}`);
        lines.push(` ${C.yellow("└─")} ${C.gray("menunggu eksekusi...")}`);
      } else if (msg.role === "tool_result") {
        // Tool result (green border)
        const style = TOOL_STYLE[msg.toolName] || { icon: "🔧", color: C.green, label: msg.toolName };
        const preview = msg.preview || "";
        lines.push(` ${C.green("┌─")} ${style.icon} ${C.bold(C.green(style.label))} ${C.gray("selesai")}`);
        const wrapped = wrapText(preview, W - 5);
        for (const line of wrapped.slice(0, 3)) {
          lines.push(` ${C.green("│")} ${C.dim(line)}`);
        }
        if (wrapped.length > 3) {
          lines.push(` ${C.green("│")} ${C.gray(`… +${wrapped.length - 3} baris lainnya`)}`);
        }
        lines.push(` ${C.green("└─")}`);
      } else if (msg.role === "assistant") {
        lines.push(` ${C.bold(C.green("┌─ AI CUTAD"))}`);
        const wrapped = wrapText(msg.content, W - 5);
        for (const line of wrapped) {
          lines.push(` ${C.green("│")} ${line}`);
        }
        lines.push(` ${C.green("└─")}`);
      }
    }

    // ── Loading / spinner ──
    if (loading) {
      const frame = SPINNER[spinnerIdx];
      let statusText = "menunggu respons";
      if (status === "agent") {
        if (toolCount > 0) {
          statusText = `bekerja · ${toolCount} tool · ${iterCount} iterasi`;
        } else {
          statusText = "berpikir";
        }
      }
      lines.push(` ${C.cyan(frame)} ${C.dim(statusText + "…")}`);
    }

    // ── Status bar ──
    lines.push(` ${C.gray("─".repeat(W - 2))}`);
    const statusIcon = loading ? C.yellow("●") : status === "error" ? C.red("●") : C.green("●");
    const statusLabel = loading ? C.yellow("bekerja") : status === "error" ? C.red("error") : C.green("ready");
    lines.push(` ${statusIcon} ${C.gray("│")} ${statusLabel} ${C.gray("│")} ${C.bold(model)} ${C.gray("│")} ${C.dim(`${messages.length} pesan`)} ${C.gray("│")} ${C.dim(config.provider || "cutad")}`);

    // ── Input ──
    lines.push(` ${C.bold(C.cyan("you ›"))} ${input}${C.gray("▎")}`);

    // Render — smooth (home + clear below, bukan clear-entire = no flicker)
    stdout.write(ANSI.home + ANSI.clearBelow);
    stdout.write(lines.join("\n") + "\n");
  }

  function wrapText(text, width) {
    const out = [];
    for (const para of text.split("\n")) {
      if (para.length <= width) { out.push(para); continue; }
      let remaining = para;
      while (remaining.length > width) {
        out.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      out.push(remaining);
    }
    return out;
  }

  function formatToolArgs(name, args) {
    if (name === "read_file") return args.path || "";
    if (name === "write_file") return `${args.path || ""}, ${args.content?.length || 0}b`;
    if (name === "edit_file") return args.path || "";
    if (name === "list_files") return args.path || ".";
    if (name === "search_files") return `"${args.pattern || ""}"`;
    if (name === "run_command") return (args.command || "").slice(0, 50);
    return Object.keys(args).join(", ");
  }

  function buildAgentTask(userMsg, history) {
    const recent = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n");
    if (recent) return `${userMsg}\n\n--- Konteks percakapan sebelumnya ---\n${recent}`;
    return userMsg;
  }

  async function handleSubmit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("/")) {
      input = "";
      await handleCommand(trimmed);
      render();
      return;
    }

    input = "";
    addMessage({ role: "user", content: trimmed });
    loading = true;
    status = "agent";
    toolCount = 0;
    iterCount = 0;
    startSpinner();
    render();

    const { runAgentLoop } = await import("../agent/loop.mjs");
    try {
      const result = await runAgentLoop({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: model || config.model,
        task: buildAgentTask(trimmed, messages),
        cwd: process.cwd(),
        onToolCall: (name, args) => {
          toolCount++;
          iterCount++;
          addMessage({ role: "tool_call", toolName: name, argsPreview: formatToolArgs(name, args) });
          render();
        },
        onToolResult: (name, result) => {
          const preview = result.split("\n").slice(0, 3).join("\n").slice(0, 200);
          addMessage({ role: "tool_result", toolName: name, preview });
          render();
        },
      });
      addMessage({ role: "assistant", content: result.result || "(selesai)" });
      status = "ready";
    } catch (e) {
      addMessage({ role: "assistant", content: `Error: ${e.message}` });
      status = "error";
    } finally {
      loading = false;
      stopSpinner();
      render();
    }
  }

  async function handleCommand(cmd) {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];

    switch (command) {
      case "/help":
        showHelp = !showHelp;
        break;
      case "/exit":
      case "/quit":
        cleanup();
        process.exit(0);
        break;
      case "/model":
        if (parts[1]) {
          model = parts[1];
          addMessage({ role: "assistant", content: `Model diganti ke ${parts[1]}` });
        }
        break;
      case "/agents": {
        const agents = listAgents();
        const list = agents.map((a) => `${a.name} — ${a.description}`).join("\n");
        addMessage({ role: "assistant", content: `Subagent tersedia:\n${list}` });
        break;
      }
      case "/models": {
        loading = true;
        startSpinner();
        render();
        try {
          const models = await listModels(config.baseUrl, config.apiKey);
          const list = models.map((m) => m.id).join("\n");
          addMessage({ role: "assistant", content: `Model tersedia:\n${list}` });
        } catch (e) {
          addMessage({ role: "assistant", content: `Error: ${e.message}` });
        } finally {
          loading = false;
          stopSpinner();
        }
        break;
      }
      case "/sessions": {
        const sessions = listSessions();
        if (sessions.length === 0) {
          addMessage({ role: "assistant", content: "Belum ada session tersimpan." });
        } else {
          const list = sessions.map((s) => `${s.id} | ${s.model} | ${s.messageCount} pesan`).join("\n");
          addMessage({ role: "assistant", content: `Session:\n${list}` });
        }
        break;
      }
      case "/save": {
        if (config.session) {
          saveSession(config.session);
          addMessage({ role: "assistant", content: `Session disimpan: ${config.session.id}` });
        } else {
          addMessage({ role: "assistant", content: "Tidak ada session aktif." });
        }
        break;
      }
      case "/clear":
        messages = [];
        showHelp = false;
        break;
      default:
        addMessage({ role: "assistant", content: `Perintah tidak dikenal: ${command}. Ketik /help` });
    }
  }

  function cleanup() {
    stopSpinner();
    stdout.write(ANSI.showCursor);
    stdout.write(ANSI.altScreenExit);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }

  // Setup — alternate buffer + raw mode
  stdout.write(ANSI.altScreenEnter);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(ANSI.hideCursor);
  render();

  const onData = (chunk) => {
    const str = chunk.toString();
    for (const ch of str) {
      if (ch === "\u0003") {
        cleanup();
        process.exit(130);
        return;
      }
      if (ch === "\r" || ch === "\n") {
        const text = input;
        input = "";
        render();
        handleSubmit(text).catch((e) => {
          addMessage({ role: "assistant", content: `Error: ${e.message}` });
          loading = false;
          stopSpinner();
          status = "error";
          render();
        });
        return;
      }
      if (ch === "\u007f" || ch === "\b") {
        input = input.slice(0, -1);
        render();
        continue;
      }
      if (ch === "\x1b") continue;
      if (ch >= " ") {
        input += ch;
        render();
      }
    }
  };

  stdin.on("data", onData);
  stdout.on("resize", render);

  return new Promise((resolve) => {
    process.on("exit", () => {
      cleanup();
      resolve();
    });
  });
}

/** Fallback REPL untuk non-TTY. */
async function fallbackREPL(config) {
  const { createInterface } = await import("node:readline");
  const pc = (await import("picocolors")).default;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let messages = [];

  console.log(`\n${pc.cyan(pc.bold("AI CUTAD"))} ${pc.dim("— Mode non-TUI")}\n`);

  const loop = () => {
    rl.question(`${pc.cyan("you")} ${pc.dim("›")} `, async (input) => {
      const msg = input.trim();
      if (!msg) return loop();
      if (["exit", "quit", "/exit"].includes(msg.toLowerCase())) {
        rl.close();
        return;
      }
      messages.push({ role: "user", content: msg });
      try {
        const content = await chatCompletion({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          messages: [
            { role: "system", content: config.systemPrompt || "Kamu adalah AI CUTAD." },
            ...messages,
          ],
        });
        messages.push({ role: "assistant", content });
        console.log(`\n${content}\n`);
      } catch (e) {
        console.error(`Error: ${e.message}`);
      }
      loop();
    });
  };
  loop();
}
