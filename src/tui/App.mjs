// ─────────────────────────────────────────────────────────────
// TUI native — full-screen interface tanpa React/Ink
// Pakai terminal control codes manual (ANSI) + raw stdin.
// Lebih reliable, tidak butuh bundling.
// ─────────────────────────────────────────────────────────────
import { chatCompletion, listModels } from "../api.mjs";
import { listAgents, getAgent, runAgent } from "../agent/index.mjs";
import { listSessions, saveSession, appendMessage, createSession } from "../session/index.mjs";

const ANSI = {
  clear: "\x1b[2J",
  clearLine: "\x1b[2K",
  home: "\x1b[H",
  clearFromCursor: "\x1b[J",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  save: "\x1b[s",
  restore: "\x1b[u",
  up: (n) => `\x1b[${n}A`,
  down: (n) => `\x1b[${n}B`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

const COMMANDS = [
  ["/help", "Tampilkan bantuan"],
  ["/models", "Daftar model"],
  ["/model <name>", "Ganti model"],
  ["/agents", "Daftar subagent"],
  ["/agent <name> <task>", "Delegasi ke subagent"],
  ["/sessions", "Daftar session tersimpan"],
  ["/save", "Simpan session"],
  ["/clear", "Bersihkan layar"],
  ["/exit", "Keluar"],
];

/**
 * Start TUI full-screen.
 * @param {{baseUrl, apiKey, model, provider, session, systemPrompt}} config
 */
export async function startTUI(config) {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY || !stdout.isTTY) {
    // fallback ke REPL non-TUI
    return fallbackREPL(config);
  }

  let messages = [];
  let input = "";
  let loading = false;
  let model = config.model || "";
  let status = "ready";
  let showHelp = false;

  // Simpan pesan ke session
  function addMessage(msg) {
    messages.push(msg);
    if (config.session) {
      appendMessage(config.session, msg);
    }
  }

  function render() {
    const W = stdout.columns || 80;
    const H = stdout.rows || 24;
    const lines = [];

    // Header
    lines.push(` ${ANSI.bold(ANSI.cyan("AI CUTAD"))}${ANSI.dim(" — AI Coding Agent CLI")}`);

    // Chat area
    if (showHelp) {
      lines.push(ANSI.cyan(" Perintah:"));
      for (const [name, desc] of COMMANDS) {
        lines.push(`  ${ANSI.cyan(name.padEnd(24))}${ANSI.dim(desc)}`);
      }
      lines.push("");
    }

    if (messages.length === 0 && !loading) {
      lines.push(ANSI.dim(" Ketik pesan atau /help untuk bantuan."));
    }

    const visible = messages.slice(-Math.max(5, H - 8));
    for (const msg of visible) {
      if (msg.role === "user") {
        lines.push(` ${ANSI.bold(ANSI.cyan("you"))}${ANSI.dim(" › ")}${msg.content}`);
      } else if (msg.role === "system") {
        lines.push(ANSI.dim(` [${msg.content}]`));
      } else {
        lines.push(` ${ANSI.bold(ANSI.cyan("AI CUTAD"))}`);
        // wrap content
        const wrapped = wrapText(msg.content, W - 2);
        for (const line of wrapped) lines.push(` ${line}`);
      }
    }

    if (loading) {
      lines.push(` ${ANSI.cyan("⠋")} ${ANSI.dim("menunggu respons…")}`);
    }

    // Status bar
    lines.push(ANSI.dim("─".repeat(W)));
    lines.push(ANSI.dim(` ${ANSI.cyan("AI CUTAD")} │ ${ANSI.bold(model)} │ ${config.provider || "cutad"} │ ${messages.length} pesan │ ${status}`));

    // Input line
    lines.push(` ${ANSI.bold(ANSI.cyan("you ›"))} ${input}${ANSI.dim("█")}`);

    // Render: clear screen & write
    stdout.write(ANSI.clear + ANSI.home);
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

  async function handleSubmit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Command?
    if (trimmed.startsWith("/")) {
      input = "";
      await handleCommand(trimmed);
      render();
      return;
    }

    // Normal chat
    input = "";
    addMessage({ role: "user", content: trimmed });
    loading = true;
    status = "thinking";
    render();

    try {
      const history = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
      const content = await chatCompletion({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: model || config.model,
        messages: [
          { role: "system", content: config.systemPrompt || "Kamu adalah AI CUTAD, asisten AI coding." },
          ...history,
          { role: "user", content: trimmed },
        ],
      });
      addMessage({ role: "assistant", content });
      status = "ready";
    } catch (e) {
      addMessage({ role: "assistant", content: `Error: ${e.message}` });
      status = "error";
    } finally {
      loading = false;
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
          addMessage({ role: "system", content: `Model diganti ke ${parts[1]}` });
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
        render();
        try {
          const models = await listModels(config.baseUrl, config.apiKey);
          const list = models.map((m) => m.id).join("\n");
          addMessage({ role: "assistant", content: `Model tersedia:\n${list}` });
        } catch (e) {
          addMessage({ role: "assistant", content: `Error: ${e.message}` });
        } finally {
          loading = false;
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
          addMessage({ role: "system", content: `Session disimpan: ${config.session.id}` });
        } else {
          addMessage({ role: "system", content: "Tidak ada session aktif." });
        }
        break;
      }
      case "/clear":
        messages = [];
        showHelp = false;
        break;
      default:
        if (command === "/agent" && parts.length >= 2) {
          // Cek apakah parts[1] adalah nama subagent atau bagian dari task
          const possibleAgent = parts[1];
          const agent = getAgent(possibleAgent);

          if (agent && parts.length >= 3) {
            // /agent cutad-search "riset X" → subagent delegate
            const task = parts.slice(2).join(" ");
            loading = true;
            addMessage({ role: "user", content: `[delegate → ${possibleAgent}] ${task}` });
            render();
            try {
              const result = await runAgent(agent, task, {
                baseUrl: config.baseUrl,
                apiKey: config.apiKey,
                model: model || config.model,
              });
              addMessage({ role: "assistant", content: result });
            } catch (e) {
              addMessage({ role: "assistant", content: `Agent error: ${e.message}` });
            } finally {
              loading = false;
            }
          } else {
            // /agent <task> → agentic loop (baca/tulis file, run command)
            const task = parts.slice(1).join(" ");
            loading = true;
            status = "agent";
            addMessage({ role: "user", content: `[agent] ${task}` });
            render();

            const { runAgentLoop } = await import("../agent/loop.mjs");
            try {
              const result = await runAgentLoop({
                baseUrl: config.baseUrl,
                apiKey: config.apiKey,
                model: model || config.model,
                task,
                cwd: process.cwd(),
                onToolCall: (name, args) => {
                  addMessage({ role: "system", content: `⚡ ${name}(${Object.keys(args).join(", ")})` });
                  render();
                },
                onToolResult: (name, result) => {
                  const preview = result.split("\n").slice(0, 2).join(" ");
                  addMessage({ role: "system", content: `✓ ${name}: ${preview.slice(0, 100)}` });
                  render();
                },
              });
              addMessage({ role: "assistant", content: result.result || "(selesai)" });
            } catch (e) {
              addMessage({ role: "assistant", content: `Agent error: ${e.message}` });
            } finally {
              loading = false;
              status = "ready";
            }
          }
        } else {
          addMessage({ role: "system", content: `Perintah tidak dikenal: ${command}. Ketik /help` });
        }
    }
  }

  function cleanup() {
    stdout.write(ANSI.showCursor);
    stdout.write(ANSI.clear + ANSI.home);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }

  // Setup raw mode
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(ANSI.hideCursor);
  render();

  // Input handler
  const onData = (chunk) => {
    const str = chunk.toString();
    // Ctrl+C
    if (str === "\u0003") {
      cleanup();
      process.exit(130);
      return;
    }
    // Enter
    if (str === "\r" || str === "\n") {
      handleSubmit(input);
      return;
    }
    // Backspace
    if (str === "\u007f" || str === "\b") {
      input = input.slice(0, -1);
      render();
      return;
    }
    // Arrow keys (ignore)
    if (str === "\x1b[A" || str === "\x1b[B" || str === "\x1b[C" || str === "\x1b[D") return;
    // Regular char
    if (str.length === 1 && str >= " ") {
      input += str;
      render();
      return;
    }
    // Multi-char (paste)
    if (str.length > 1 && !str.startsWith("\x1b")) {
      input += str;
      render();
      return;
    }
  };

  stdin.on("data", onData);

  // Handle resize
  stdout.on("resize", render);

  // Keep process alive
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
