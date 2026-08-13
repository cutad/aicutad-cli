// ─────────────────────────────────────────────────────────────
// TUI native — full-screen interactive agent interface (v2)
// Rewrite: glitch-free rendering, fixed layout, polished UX
//
// Key fixes:
// 1. Debounced render — batch multiple render() calls per microtask
// 2. Single-write frame — entire screen in ONE stdout.write() (no partial flicker)
// 3. Fixed layout regions — header (top) + messages (middle) + footer (bottom)
// 4. Spinner inline in status bar — no extra line, no full redraw for spinner
// 5. Cursor positioning — cursor stays at input position after render
// 6. onThinking callback — show model thinking as transient status
// 7. Proper line-based message truncation — not by message count
// 8. Compact tool display — inline, not big boxes
// ─────────────────────────────────────────────────────────────
import { chatCompletion, listModels } from "../api.mjs";
import { listAgents } from "../agent/index.mjs";
import { listSessions, saveSession, appendMessage, createSession } from "../session/index.mjs";

// ── Color palette (256-color, konsisten) ─────────────────────
const C = {
  reset: "\x1b[0m",
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  italic: (s) => `\x1b[3m${s}\x1b[23m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  magenta: (s) => `\x1b[35m${s}\x1b[39m`,
  blue: (s) => `\x1b[34m${s}\x1b[39m`,
  white: (s) => `\x1b[37m${s}\x1b[39m`,
  gray: (s) => `\x1b[38;5;240m${s}\x1b[39m`,
  teal: (s) => `\x1b[38;5;38m${s}\x1b[39m`,
  orange: (s) => `\x1b[38;5;208m${s}\x1b[39m`,
  brightGreen: (s) => `\x1b[38;5;114m${s}\x1b[39m`,
  brightBlue: (s) => `\x1b[38;5;75m${s}\x1b[39m`,
  brightYellow: (s) => `\x1b[38;5;179m${s}\x1b[39m`,
};

// ── ANSI control codes ───────────────────────────────────────
const ANSI = {
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  altScreenEnter: "\x1b[?1049h",
  altScreenExit: "\x1b[?1049l",
  home: "\x1b[H",
  clearBelow: "\x1b[J",
  clearLine: "\x1b[2K",
  clearEOL: "\x1b[K",
  up: (n) => `\x1b[${n}A`,
  down: (n) => `\x1b[${n}B`,
  right: (n) => `\x1b[${n}C`,
  left: (n) => `\x1b[${n}D`,
  saveCursor: "\x1b7",
  restoreCursor: "\x1b8",
  moveTo: (row, col) => `\x1b[${row};${col}H`,
};

// ── Spinner frames (braille dots — smooth) ──────────────────
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ── Tool styles ──────────────────────────────────────────────
const TOOL_STYLE = {
  read_file:    { icon: "📖", color: C.blue,        label: "Read" },
  write_file:   { icon: "📝", color: C.green,       label: "Write" },
  edit_file:    { icon: "✏️",  color: C.yellow,      label: "Edit" },
  list_files:   { icon: "📂", color: C.cyan,        label: "List" },
  search_files: { icon: "🔍", color: C.magenta,     label: "Search" },
  run_command:  { icon: "⚡", color: C.orange,      label: "Run" },
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

  // ── State ──────────────────────────────────────────────────
  let messages = [];
  let input = "";
  let loading = false;
  let model = config.model || "";
  let status = "ready"; // ready | agent | error
  let showHelp = false;
  let spinnerIdx = 0;
  let spinnerTimer = null;
  let toolCount = 0;
  let iterCount = 0;
  let thinkingText = "";
  let renderQueued = false;
  let prevLineCount = 0;

  // ── Message management ─────────────────────────────────────
  function addMessage(msg) {
    messages.push(msg);
    if (config.session) {
      appendMessage(config.session, msg);
    }
  }

  // ── Spinner ────────────────────────────────────────────────
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

  // ── Debounced render ───────────────────────────────────────
  // Batch multiple render() calls into 1 per microtask.
  // This prevents double-render when onToolCall + spinner fire same tick.
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      doRender();
    });
  }

  // ── Actual render — single-write frame ─────────────────────
  function doRender() {
    const W = stdout.columns || 80;
    const H = stdout.rows || 24;

    // Layout: header (2) + messages (H-6) + status (1) + separator (1) + input (1) + padding (1)
    const headerLines = 2;
    const footerLines = 4; // status + separator + input + padding
    const msgAreaHeight = Math.max(3, H - headerLines - footerLines);

    const lines = [];

    // ── Header ──
    const headerText = ` ${C.bold(C.teal("◆"))} ${C.bold(C.cyan("AI CUTAD"))} ${C.gray("│")} ${C.dim("AI Coding Agent CLI")} ${C.gray("v0.3.0")}`;
    lines.push(padRight(headerText, W));
    lines.push(C.gray("─".repeat(W)));

    // ── Help panel (optional, takes from message area) ──
    if (showHelp) {
      lines.push(` ${C.bold(C.cyan("Perintah"))}`);
      for (const [name, desc] of COMMANDS) {
        lines.push(`   ${C.cyan(padRight(name, 20))} ${C.gray(desc)}`);
      }
      lines.push("");
    }

    // ── Empty state ──
    if (messages.length === 0 && !loading && !showHelp) {
      lines.push("");
      lines.push(`   ${C.gray("Tulis tugas atau pertanyaan, lalu tekan Enter")}`);
      lines.push(`   ${C.dim("Contoh:")} ${C.cyan("\"buat file hello.js\"")}  ${C.gray("·")}  ${C.dim("/help untuk bantuan")}`);
      lines.push("");
    }

    // ── Messages (line-based truncation) ──
    if (messages.length > 0 || loading) {
      // Build all message lines first
      const allMsgLines = [];
      for (const msg of messages) {
        const rendered = renderMessage(msg, W);
        allMsgLines.push(...rendered);
      }

      // Truncate from top to fit message area (minus help lines if shown)
      const availableHeight = msgAreaHeight - (showHelp ? COMMANDS.length + 3 : 0);
      const visible = allMsgLines.slice(-availableHeight);

      for (const line of visible) {
        lines.push(line);
      }
    }

    // ── Status / spinner line ──
    if (loading) {
      const frame = SPINNER[spinnerIdx];
      let statusText = "menunggu respons";
      if (status === "agent") {
        if (thinkingText) {
          statusText = thinkingText;
        } else if (toolCount > 0) {
          statusText = `bekerja · ${toolCount} tool · iterasi ${iterCount}`;
        } else {
          statusText = "berpikir";
        }
      }
      // Truncate status text to fit
      const maxStatusLen = W - 6;
      const displayStatus = statusText.length > maxStatusLen
        ? statusText.slice(0, maxStatusLen - 1) + "…"
        : statusText;
      lines.push(` ${C.cyan(frame)} ${C.dim(displayStatus)}`);
    } else {
      lines.push("");
    }

    // ── Separator ──
    lines.push(C.gray("─".repeat(W)));

    // ── Status bar ──
    const statusIcon = loading ? C.yellow("●") : status === "error" ? C.red("●") : C.green("●");
    const statusLabel = loading ? C.yellow("bekerja") : status === "error" ? C.red("error") : C.green("ready");
    const msgCount = `${messages.length} pesan`;
    const provider = config.provider || "cutad";
    // Truncate model name if too long
    const maxModelLen = W - 30;
    const modelDisplay = model.length > maxModelLen ? model.slice(0, maxModelLen - 1) + "…" : model;
    lines.push(` ${statusIcon} ${C.gray("│")} ${statusLabel} ${C.gray("│")} ${C.bold(modelDisplay)} ${C.gray("│")} ${C.dim(msgCount)} ${C.gray("│")} ${C.dim(provider)}`);

    // ── Input line ──
    const inputPrompt = ` ${C.bold(C.cyan("you ›"))} `;
    const inputDisplay = input.slice(0, W - inputPrompt.length - 1);
    lines.push(`${inputPrompt}${inputDisplay}${C.gray("▎")}`);

    // ── Single-write frame ──
    // Build entire frame as ONE string, write in ONE call.
    // This eliminates partial-write flicker.
    let frame = ANSI.home;
    for (let i = 0; i < lines.length; i++) {
      frame += lines[i] + "\x1b[K\n"; // clearEOL after each line
    }
    // Clear any remaining lines from previous frame
    if (prevLineCount > lines.length) {
      for (let i = lines.length; i < prevLineCount; i++) {
        frame += "\x1b[K\n";
      }
    }
    prevLineCount = lines.length;

    // Position cursor at end of input text
    const cursorRow = lines.length; // input line is last
    const cursorCol = inputPrompt.length + inputDisplay.length + 1;
    frame += ANSI.moveTo(cursorRow, cursorCol);

    stdout.write(frame);
  }

  // ── Render a single message → array of lines ───────────────
  function renderMessage(msg, W) {
    const out = [];

    if (msg.role === "user") {
      out.push(` ${C.bold(C.brightBlue("┌─ you"))}`);
      const wrapped = wrapText(msg.content, W - 5);
      for (const line of wrapped) {
        out.push(` ${C.brightBlue("│")} ${line}`);
      }
      out.push(` ${C.brightBlue("└─")}`);
    } else if (msg.role === "assistant") {
      out.push(` ${C.bold(C.brightGreen("┌─ AI CUTAD"))}`);
      const wrapped = wrapText(msg.content, W - 5);
      for (const line of wrapped) {
        out.push(` ${C.brightGreen("│")} ${line}`);
      }
      out.push(` ${C.brightGreen("└─")}`);
    } else if (msg.role === "tool_call") {
      const style = TOOL_STYLE[msg.toolName] || { icon: "🔧", color: C.yellow, label: msg.toolName };
      const argStr = msg.argsPreview || "";
      // Compact single-line tool call
      const maxArgLen = W - 25;
      const argDisplay = argStr.length > maxArgLen ? argStr.slice(0, maxArgLen - 1) + "…" : argStr;
      out.push(` ${style.icon} ${C.bold(style.color(style.label))} ${C.gray(argDisplay)} ${C.dim("…")}`);
    } else if (msg.role === "tool_result") {
      const style = TOOL_STYLE[msg.toolName] || { icon: "🔧", color: C.green, label: msg.toolName };
      const preview = msg.preview || "";
      // Compact: icon + label + ✓ + preview (1-2 lines max)
      const maxPreviewLen = W - 22;
      const wrapped = wrapText(preview, Math.min(maxPreviewLen, W - 5));
      const firstLine = wrapped[0] || "";
      const displayLine = firstLine.length > maxPreviewLen ? firstLine.slice(0, maxPreviewLen - 1) + "…" : firstLine;
      out.push(` ${style.icon} ${C.bold(style.color(style.label))} ${C.green("✓")} ${C.dim(displayLine)}`);
      if (wrapped.length > 1) {
        out.push(`   ${C.dim("…" + (wrapped.length - 1) + " baris lainnya")}`);
      }
    }

    return out;
  }

  // ── Text utilities ─────────────────────────────────────────
  function wrapText(text, width) {
    const out = [];
    for (const para of text.split("\n")) {
      if (para.length <= width) {
        out.push(para);
        continue;
      }
      // Word-aware wrapping
      let remaining = para;
      while (remaining.length > width) {
        // Try to break at last space within width
        let breakAt = remaining.lastIndexOf(" ", width);
        if (breakAt <= 0) breakAt = width;
        out.push(remaining.slice(0, breakAt).trimEnd());
        remaining = remaining.slice(breakAt).trimStart();
      }
      if (remaining) out.push(remaining);
    }
    return out;
  }

  function padRight(str, width) {
    // Calculate visible length (strip ANSI codes)
    const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
    const need = Math.max(0, width - visible.length);
    return str + " ".repeat(need);
  }

  function formatToolArgs(name, args) {
    if (name === "read_file") return args.path || "";
    if (name === "write_file") return `${args.path || ""}, ${args.content?.length || 0}b`;
    if (name === "edit_file") return args.path || "";
    if (name === "list_files") return args.path || ".";
    if (name === "search_files") return `"${args.pattern || ""}"`;
    if (name === "run_command") return (args.command || "").slice(0, 60);
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

  // ── Submit handler ─────────────────────────────────────────
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
    thinkingText = "";
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
          thinkingText = "";
          addMessage({ role: "tool_call", toolName: name, argsPreview: formatToolArgs(name, args) });
          render();
        },
        onToolResult: (name, result) => {
          const preview = result.split("\n").slice(0, 2).join(" ").slice(0, 150);
          addMessage({ role: "tool_result", toolName: name, preview });
          render();
        },
        onThinking: (content) => {
          // Show thinking as transient status text (not a message)
          if (content && content.trim()) {
            thinkingText = content.trim().slice(0, 80);
            render();
          }
        },
      });
      addMessage({ role: "assistant", content: result.result || "(selesai)" });
      status = "ready";
      thinkingText = "";
    } catch (e) {
      addMessage({ role: "assistant", content: `Error: ${e.message}` });
      status = "error";
      thinkingText = "";
    } finally {
      loading = false;
      stopSpinner();
      render();
    }
  }

  // ── Command handler ────────────────────────────────────────
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

  // ── Cleanup ────────────────────────────────────────────────
  function cleanup() {
    stopSpinner();
    stdout.write(ANSI.showCursor);
    stdout.write(ANSI.altScreenExit);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }

  // ── Setup: alternate buffer + raw mode ─────────────────────
  stdout.write(ANSI.altScreenEnter + ANSI.hideCursor);
  stdin.setRawMode(true);
  stdin.resume();
  render();

  // ── Input handler (per-character for raw mode) ─────────────
  const onData = (chunk) => {
    const str = chunk.toString();
    for (const ch of str) {
      if (ch === "\u0003") {
        // Ctrl+C
        cleanup();
        process.exit(130);
        return;
      }
      if (ch === "\r" || ch === "\n") {
        // Enter — submit
        const text = input;
        input = "";
        render();
        handleSubmit(text).catch((e) => {
          addMessage({ role: "assistant", content: `Error: ${e.message}` });
          loading = false;
          stopSpinner();
          status = "error";
          thinkingText = "";
          render();
        });
        return;
      }
      if (ch === "\u007f" || ch === "\b") {
        // Backspace
        input = input.slice(0, -1);
        render();
        continue;
      }
      if (ch === "\x1b") {
        // Escape — ignore escape sequences (arrow keys, etc)
        continue;
      }
      if (ch >= " ") {
        // Printable character
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
