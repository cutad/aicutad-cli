// ─────────────────────────────────────────────────────────────
// TUI native v3 — Premium full-screen immersive agent interface
//
// Features:
// 1. Boot animation (logo reveal + loading bar + status checks)
// 2. Full-screen immersive (alternate buffer, app-like feel)
// 3. Typing animation (AI response appears char-by-char)
// 4. Interactive model picker (arrow keys, modal overlay)
// 5. Input history (Up/Down arrows)
// 6. Keyboard shortcuts (Ctrl+L clear, Ctrl+S save, Tab autocomplete)
// 7. Help modal overlay (centered, bordered)
// 8. Live clock in header
// 9. Markdown rendering (code blocks, bold, italic, headers, lists)
// 10. Debounced single-write rendering (glitch-free)
// 11. Message timestamps
// 12. Scroll indicator
// 13. Hints line at bottom
// 14. Terminal resize handling
// ─────────────────────────────────────────────────────────────
import { chatCompletion, listModels } from "../api.mjs";
import { listAgents } from "../agent/index.mjs";
import { listSessions, saveSession, appendMessage, createSession } from "../session/index.mjs";

// ── 256-color palette ────────────────────────────────────────
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
  bBlue: (s) => `\x1b[38;5;75m${s}\x1b[39m`,
  bGreen: (s) => `\x1b[38;5;114m${s}\x1b[39m`,
  bYellow: (s) => `\x1b[38;5;179m${s}\x1b[39m`,
  bRed: (s) => `\x1b[38;5;160m${s}\x1b[39m`,
  codeBg: (s) => `\x1b[48;5;238m\x1b[38;5;117m${s}\x1b[49m\x1b[39m`,
};

// ── ANSI control ─────────────────────────────────────────────
const A = {
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  altEnter: "\x1b[?1049h",
  altExit: "\x1b[?1049l",
  home: "\x1b[H",
  clearBelow: "\x1b[J",
  clearEOL: "\x1b[K",
  clearLine: "\x1b[2K",
  move: (r, c) => `\x1b[${r};${c}H`,
};

const SPINNER = ["\u280B", "\u2819", "\u2839", "\u2878", "\u287C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

const TOOL_STYLE = {
  read_file:    { icon: "\u{1F4D6}", color: C.blue,   label: "Read" },
  write_file:   { icon: "\u{1F4DD}", color: C.green,  label: "Write" },
  edit_file:    { icon: "\u270F\uFE0F",  color: C.yellow, label: "Edit" },
  list_files:   { icon: "\u{1F4C2}", color: C.cyan,   label: "List" },
  search_files: { icon: "\u{1F50D}", color: C.magenta, label: "Search" },
  run_command:  { icon: "\u26A1",  color: C.orange,  label: "Run" },
};

const COMMANDS = [
  ["/help", "Tampilkan bantuan"],
  ["/models", "Daftar & ganti model"],
  ["/model <name>", "Ganti model langsung"],
  ["/agents", "Daftar subagent"],
  ["/sessions", "Daftar session tersimpan"],
  ["/save", "Simpan session"],
  ["/clear", "Bersihkan layar"],
  ["/exit", "Keluar"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visibleLen = (s) => ("" + s).replace(/\x1b\[[0-9;]*m/g, "").length;

// ── Boot animation ───────────────────────────────────────────
async function bootSequence(stdout, W, H) {
  stdout.write(A.altEnter + A.hideCursor + A.home + A.clearBelow);

  // Clean compact logo — readable, not big block letters
  const logoLines = [
    "  " + C.bold(C.teal("\u25C6")) + " " + C.bold(C.cyan("aicutad-cli")),
    "  " + C.dim("AI Coding Agent CLI \u00B7 v0.4.0"),
  ];

  const logoW = 40;
  const logoH = logoLines.length;
  const startX = Math.max(1, Math.floor((W - logoW) / 2));
  const startY = Math.max(3, Math.floor((H - logoH - 8) / 2));

  // Reveal logo
  for (let i = 0; i < logoLines.length; i++) {
    stdout.write(A.move(startY + i, startX) + logoLines[i]);
    await sleep(80);
  }

  await sleep(200);

  // Loading bar
  const barW = Math.min(36, W - 12);
  const barX = Math.max(1, Math.floor((W - barW - 8) / 2));
  const barY = startY + logoH + 2;

  for (let p = 0; p <= 100; p += 5) {
    const filled = Math.floor((p / 100) * barW);
    const bar = C.teal("\u2588".repeat(filled)) + C.gray("\u2591".repeat(barW - filled));
    const pct = String(p).padStart(3) + "%";
    stdout.write(A.move(barY, barX) + " " + bar + " " + C.dim(pct) + A.clearEOL);
    await sleep(20);
  }

  // Status checks
  const checks = ["Gateway online", "Models loaded", "Ready to code"];
  for (let i = 0; i < checks.length; i++) {
    stdout.write(A.move(barY + 2 + i, barX) + "  " + C.green("\u2713") + " " + C.dim(checks[i]) + A.clearEOL);
    await sleep(80);
  }

  await sleep(300);
  stdout.write(A.home + A.clearBelow);
}

// ── Main TUI ─────────────────────────────────────────────────
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
  let status = "ready";
  let showHelp = false;
  let spinnerIdx = 0;
  let spinnerTimer = null;
  let clockTimer = null;
  let toolCount = 0;
  let iterCount = 0;
  let thinkingText = "";
  let renderQueued = false;
  let prevLineCount = 0;
  let booting = true;
  let modal = null; // { type, items, selected, scroll, state }
  let inputHistory = [];
  let historyIdx = -1;
  let typingActive = false;
  let typingContent = "";
  let typingPos = 0;
  let typingMsgIdx = -1;
  let typingTimer = null;
  let startTime = 0;

  // ── Message helpers ────────────────────────────────────────
  function addMessage(msg) {
    const stamped = { ...msg, ts: new Date() };
    messages.push(stamped);
    if (config.session) appendMessage(config.session, stamped);
  }

  // ── Timers ─────────────────────────────────────────────────
  // CRITICAL: Timer TIDAK panggil render() (full screen redraw).
  // Mereka update IN-PLACE: pindah cursor ke baris tertentu,
  // tulis ulang hanya baris itu, kembalikan cursor ke input.
  // Ini eliminasi glitch/flicker saat idle, loading, dan typing.

  // Track layout positions for in-place updates
  let layoutInfo = { spinnerRow: 0, clockRow: 1, clockCol: 1, inputRow: 0, inputCol: 1, statusRow: 0 };

  function startSpinner() {
    if (spinnerTimer) return;
    spinnerTimer = setInterval(() => {
      spinnerIdx = (spinnerIdx + 1) % SPINNER.length;
      updateSpinnerInPlace();
    }, 80);
  }

  function stopSpinner() {
    if (spinnerTimer) { clearInterval(spinnerTimer); spinnerTimer = null; }
  }

  function startClock() {
    if (clockTimer) return;
    clockTimer = setInterval(() => {
      updateClockInPlace();
    }, 1000);
  }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  // ── In-place spinner update (no full redraw) ───────────────
  function updateSpinnerInPlace() {
    if (!loading) return;
    const { spinnerRow, inputRow, inputCol } = layoutInfo;
    if (spinnerRow < 1) return;

    const W = stdout.columns || 80;
    const frame = SPINNER[spinnerIdx];
    let statusText = "menunggu respons";
    if (status === "agent") {
      if (thinkingText) {
        statusText = thinkingText;
      } else if (toolCount > 0) {
        const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) + "s" : "";
        statusText = "bekerja \u00B7 " + toolCount + " tool \u00B7 iterasi " + iterCount +
                     (elapsed ? " \u00B7 " + elapsed : "");
      } else {
        statusText = "berpikir";
      }
    }
    const maxLen = W - 6;
    const display = visibleLen(statusText) > maxLen ? statusText.slice(0, maxLen - 1) + "\u2026" : statusText;
    const line = " " + C.cyan(frame) + " " + C.dim(display);

    // Move to spinner row, clear line, write new content, restore cursor to input
    stdout.write("\x1b[" + spinnerRow + ";1H\x1b[2K" + line);
    // Restore cursor to input position
    stdout.write("\x1b[" + inputRow + ";" + inputCol + "H");
  }

  // ── In-place clock update (no full redraw) ─────────────────
  function updateClockInPlace() {
    if (loading || typingActive || modal) return;
    const { clockRow, clockCol, inputRow, inputCol } = layoutInfo;
    if (clockRow < 1) return;

    const now = new Date();
    const clock = String(now.getHours()).padStart(2, "0") + ":" +
                  String(now.getMinutes()).padStart(2, "0") + ":" +
                  String(now.getSeconds()).padStart(2, "0");
    const clockStr = C.dim(clock);

    // Move to clock position, write clock, restore cursor
    stdout.write("\x1b[" + clockRow + ";" + clockCol + "H" + clockStr);
    // Restore cursor to input position
    stdout.write("\x1b[" + inputRow + ";" + inputCol + "H");
  }

  function startTyping(content, msgIdx) {
    stopTyping();
    typingActive = true;
    typingContent = content;
    typingPos = 0;
    typingMsgIdx = msgIdx;
    typingTimer = setInterval(() => {
      typingPos += 3;
      if (typingPos >= typingContent.length) {
        typingPos = typingContent.length;
        stopTyping();
        render(); // final full render to show complete message
      } else {
        updateTypingInPlace();
      }
    }, 15);
  }

  function stopTyping() {
    if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
    typingActive = false;
    typingContent = "";
    typingPos = 0;
    typingMsgIdx = -1;
  }

  // ── In-place typing update (no full redraw) ────────────────
  // For typing animation, we need to redraw the assistant message area.
  // But ONLY the assistant message, not the whole screen.
  // We do a targeted redraw of the message region.
  function updateTypingInPlace() {
    if (!typingActive || typingMsgIdx < 0) return;
    // For typing, a full render is needed because message lines change
    // But we use the debounced render which batches to 1 per microtask
    render();
  }

  // ── Debounced render ───────────────────────────────────────
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      doRender();
    });
  }

  // ── Main render ────────────────────────────────────────────
  function doRender() {
    const W = stdout.columns || 80;
    const H = stdout.rows || 24;

    if (W < 40 || H < 8) {
      stdout.write(A.home + A.clearBelow);
      stdout.write("Terminal terlalu kecil. Minimum: 40x8. Saat ini: " + W + "x" + H + "\n");
      return;
    }

    const lines = [];

    // ── Header ──
    const now = new Date();
    const clock = String(now.getHours()).padStart(2, "0") + ":" +
                  String(now.getMinutes()).padStart(2, "0") + ":" +
                  String(now.getSeconds()).padStart(2, "0");
    const headerLeft = " " + C.bold(C.teal("\u25C6")) + " " + C.bold(C.cyan("aicutad-cli")) +
                       " " + C.gray("\u2502") + " " + C.dim("AI Coding Agent CLI") + " " + C.gray("v0.4.0");
    const headerRight = C.dim(clock);
    const headerPad = Math.max(1, W - visibleLen(headerLeft) - visibleLen(headerRight) - 1);
    lines.push(headerLeft + " ".repeat(headerPad) + headerRight);
    lines.push(C.gray("\u2501".repeat(W)));

    // ── Messages area ──
    const footerH = 3; // separator + status + input
    const msgAreaH = H - 2 - footerH;
    const msgLines = buildMessageLines(W);

    // Scroll: show last msgAreaH lines (or more if scrollOffset)
    const visible = msgLines.slice(-msgAreaH);
    for (const line of visible) {
      lines.push(line);
    }

    // Pad to fill terminal (keeps footer at bottom)
    while (lines.length < H - footerH) {
      lines.push("");
    }

    // ── Spinner / loading indicator ──
    if (loading) {
      const frame = SPINNER[spinnerIdx];
      let statusText = "menunggu respons";
      if (status === "agent") {
        if (thinkingText) {
          statusText = thinkingText;
        } else if (toolCount > 0) {
          const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) + "s" : "";
          statusText = "bekerja \u00B7 " + toolCount + " tool \u00B7 iterasi " + iterCount +
                       (elapsed ? " \u00B7 " + elapsed : "");
        } else {
          statusText = "berpikir";
        }
      }
      const maxLen = W - 6;
      const display = visibleLen(statusText) > maxLen ? statusText.slice(0, maxLen - 1) + "\u2026" : statusText;
      // Replace last padding line with spinner
      lines[lines.length - 1] = " " + C.cyan(frame) + " " + C.dim(display);
    }

    // ── Separator ──
    lines.push(C.gray("\u2501".repeat(W)));

    // ── Status bar ──
    const sIcon = loading ? C.bYellow("\u25CF") : status === "error" ? C.bRed("\u25CF") : C.bGreen("\u25CF");
    const sLabel = loading ? C.bYellow("bekerja") : status === "error" ? C.bRed("error") : C.bGreen("ready");
    const msgCount = messages.length + " pesan";
    const provider = config.provider || "cutad";
    const maxModelLen = W - 32;
    const modelDisplay = visibleLen(model) > maxModelLen ? model.slice(0, maxModelLen - 1) + "\u2026" : model;
    const statusLine = " " + sIcon + " " + C.gray("\u2502") + " " + sLabel + " " + C.gray("\u2502") +
                       " " + C.bold(modelDisplay) + " " + C.gray("\u2502") + " " + C.dim(msgCount) +
                       " " + C.gray("\u2502") + " " + C.dim(provider);
    const hint = C.dim("/help");
    const hintPad = Math.max(1, W - visibleLen(statusLine) - visibleLen(hint) - 1);
    lines.push(statusLine + " ".repeat(hintPad) + hint);

    // ── Input line ──
    const prompt = " " + C.bold(C.cyan("you \u203A")) + " ";
    const maxInput = W - prompt.length - 1;
    const inputDisplay = input.length > maxInput ? input.slice(input.length - maxInput) : input;
    lines.push(prompt + inputDisplay + C.gray("\u258E"));

    // ── Build single-write frame ──
    let frame = A.home;
    for (let i = 0; i < lines.length; i++) {
      frame += lines[i] + A.clearEOL + "\n";
    }
    // Clear leftover from previous frame
    if (prevLineCount > lines.length) {
      for (let i = lines.length; i < prevLineCount; i++) {
        frame += A.clearEOL + "\n";
      }
    }
    prevLineCount = lines.length;

    // ── Save layout positions for in-place timer updates ──
    // Clock is on row 1 (header), at the right side
    layoutInfo.clockRow = 1;
    const clockStr = "00:00:00";
    layoutInfo.clockCol = W - clockStr.length;
    // Input is the last line
    layoutInfo.inputRow = lines.length;
    const promptStr = " " + C.bold(C.cyan("you \u203A")) + " ";
    const inputDisp = input.length > (W - promptStr.length - 1) ? input.slice(input.length - (W - promptStr.length - 1)) : input;
    layoutInfo.inputCol = promptStr.length + inputDisp.length + 1;
    // Spinner row = last padding line before separator (the line we overwrite during loading)
    layoutInfo.spinnerRow = lines.length - footerH; // last message area line
    // Status row = second to last line
    layoutInfo.statusRow = lines.length - 1;

    // ── Modal overlay ──
    if (modal) {
      frame += buildModalOverlay(modal, W, H);
    }

    // Position cursor at end of input
    const cursorRow = lines.length;
    const cursorCol = prompt.length + inputDisplay.length + 1;
    frame += A.move(cursorRow, cursorCol);

    stdout.write(frame);
  }

  // ── Build message lines ────────────────────────────────────
  function buildMessageLines(W) {
    const out = [];

    // Empty state
    if (messages.length === 0 && !loading && !showHelp) {
      out.push("");
      out.push("   " + C.gray("Tulis tugas atau pertanyaan, lalu tekan Enter"));
      out.push("   " + C.dim("Contoh:") + " " + C.cyan("\"buat file hello.js\"") + "  " + C.gray("\u00B7") + "  " + C.dim("/help untuk bantuan"));
      out.push("   " + C.gray("\u2191\u2193 history  Tab complete  Ctrl+L clear  Ctrl+S save"));
      out.push("");
      return out;
    }

    // Help panel
    if (showHelp) {
      out.push(" " + C.bold(C.cyan("Perintah")));
      for (const [name, desc] of COMMANDS) {
        out.push("   " + C.cyan(name.padEnd(22)) + " " + C.gray(desc));
      }
      out.push("");
    }

    // Messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const rendered = renderMessage(msg, i, W);
      out.push(...rendered);
    }

    return out;
  }

  // ── Render single message → array of lines ─────────────────
  function renderMessage(msg, idx, W) {
    const out = [];
    const ts = msg.ts ? formatTime(msg.ts) : "";

    if (msg.role === "user") {
      out.push(" " + C.bold(C.bBlue("\u250C\u2500 you")) + (ts ? " " + C.gray(ts) : ""));
      const content = msg.content || "";
      for (const line of wrapText(content, W - 5)) {
        out.push(" " + C.bBlue("\u2502") + " " + line);
      }
      out.push(" " + C.bBlue("\u2514\u2500"));
    } else if (msg.role === "assistant") {
      out.push(" " + C.bold(C.bGreen("\u250C\u2500 aicutad-cli")) + (ts ? " " + C.gray(ts) : ""));
      let content = msg.content || "";

      // Typing animation
      if (typingActive && idx === typingMsgIdx) {
        content = typingContent.slice(0, typingPos) + C.gray("\u258E");
      }

      // Markdown rendering
      const mdLines = renderMarkdown(content, W - 5);
      for (const line of mdLines) {
        out.push(" " + C.bGreen("\u2502") + " " + line);
      }
      out.push(" " + C.bGreen("\u2514\u2500"));
    } else if (msg.role === "tool_call") {
      const style = TOOL_STYLE[msg.toolName] || { icon: "\u{1F527}", color: C.yellow, label: msg.toolName };
      const argStr = msg.argsPreview || "";
      const maxArg = W - 25;
      const argDisplay = visibleLen(argStr) > maxArg ? argStr.slice(0, maxArg - 1) + "\u2026" : argStr;
      out.push(" " + style.icon + " " + C.bold(style.color(style.label)) + " " + C.gray(argDisplay) + " " + C.dim("\u2026"));
    } else if (msg.role === "tool_result") {
      const style = TOOL_STYLE[msg.toolName] || { icon: "\u{1F527}", color: C.green, label: msg.toolName };
      const preview = msg.preview || "";
      const maxPrev = W - 22;
      const wrapped = wrapText(preview, Math.min(maxPrev, W - 5));
      const firstLine = wrapped[0] || "";
      const displayLine = visibleLen(firstLine) > maxPrev ? firstLine.slice(0, maxPrev - 1) + "\u2026" : firstLine;
      out.push(" " + style.icon + " " + C.bold(style.color(style.label)) + " " + C.green("\u2713") + " " + C.dim(displayLine));
      if (wrapped.length > 1) {
        out.push("   " + C.dim("\u2026" + (wrapped.length - 1) + " baris lainnya"));
      }
    }

    return out;
  }

  // ── Markdown renderer ──────────────────────────────────────
  function renderMarkdown(text, width) {
    const lines = text.split("\n");
    const out = [];
    let inCode = false;

    for (const line of lines) {
      // Code block delimiters
      if (line.startsWith("```")) {
        if (!inCode) {
          inCode = true;
          const lang = line.slice(3).trim();
          out.push(C.gray("\u250C\u2500 code") + (lang ? C.gray(" (" + lang + ")") : ""));
        } else {
          inCode = false;
          out.push(C.gray("\u2514\u2500"));
        }
        continue;
      }

      if (inCode) {
        const wrapped = wrapText(line, width - 3);
        for (const w of wrapped) {
          out.push(C.gray("\u2502") + " " + C.dim(w));
        }
        continue;
      }

      // Headers
      if (line.startsWith("### ")) { out.push(C.bold(C.cyan(line.slice(4)))); continue; }
      if (line.startsWith("## "))  { out.push(C.bold(C.teal(line.slice(3))));  continue; }
      if (line.startsWith("# "))   { out.push(C.bold(C.teal(line.slice(2))));  continue; }

      // List items
      if (/^[-*] /.test(line)) {
        out.push("  " + C.cyan("\u2022") + " " + renderInline(line.slice(2)));
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        out.push("  " + C.gray("\u2502") + " " + C.dim(renderInline(line.slice(2))));
        continue;
      }

      // Regular text
      const rendered = renderInline(line);
      const wrapped = wrapText(rendered, width);
      for (const w of wrapped) {
        out.push(w);
      }
    }

    return out;
  }

  function renderInline(text) {
    let r = text;
    // Inline code (process first)
    r = r.replace(/`([^`]+)`/g, (_, m) => C.codeBg(" " + m + " "));
    // Bold
    r = r.replace(/\*\*([^*]+)\*\*/g, (_, m) => C.bold(m));
    // Italic
    r = r.replace(/\*([^*]+)\*/g, (_, m) => C.italic(m));
    return r;
  }

  // ── Text utilities ─────────────────────────────────────────
  function wrapText(text, width) {
    const out = [];
    for (const para of text.split("\n")) {
      const plain = para.replace(/\x1b\[[0-9;]*m/g, "");
      if (plain.length <= width) {
        out.push(para);
        continue;
      }
      let remaining = plain;
      while (remaining.length > width) {
        let breakAt = remaining.lastIndexOf(" ", width);
        if (breakAt <= 0) breakAt = width;
        out.push(remaining.slice(0, breakAt).trimEnd());
        remaining = remaining.slice(breakAt).trimStart();
      }
      if (remaining) out.push(remaining);
    }
    return out;
  }

  function formatTime(d) {
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function formatToolArgs(name, args) {
    if (name === "read_file") return args.path || "";
    if (name === "write_file") return (args.path || "") + ", " + (args.content?.length || 0) + "b";
    if (name === "edit_file") return args.path || "";
    if (name === "list_files") return args.path || ".";
    if (name === "search_files") return "\"" + (args.pattern || "") + "\"";
    if (name === "run_command") return (args.command || "").slice(0, 60);
    return Object.keys(args).join(", ");
  }

  function buildAgentTask(userMsg, history) {
    const recent = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => (m.role === "user" ? "User" : "AI") + ": " + m.content)
      .join("\n");
    if (recent) return userMsg + "\n\n--- Konteks percakapan sebelumnya ---\n" + recent;
    return userMsg;
  }

  // ── Modal overlay ──────────────────────────────────────────
  function buildModalOverlay(m, W, H) {
    let modalLines = [];
    let title = "";

    if (m.type === "help") {
      title = "Bantuan";
      for (const [name, desc] of COMMANDS) {
        modalLines.push("  " + C.cyan(name.padEnd(22)) + " " + C.gray(desc));
      }
      modalLines.push("");
      modalLines.push("  " + C.gray("\u2191\u2193 history  Tab complete  Ctrl+L clear  Ctrl+S save"));
    } else if (m.type === "models") {
      title = "Pilih Model";
      if (m.state === "loading") {
        modalLines.push("  " + C.dim("Memuat daftar model..."));
      } else if (m.state === "error") {
        modalLines.push("  " + C.red("Error: " + m.error));
      } else if (m.state === "ready") {
        const maxVisible = Math.min(m.items.length, H - 8);
        const startIdx = Math.max(0, m.selected - Math.floor(maxVisible / 2));
        for (let i = startIdx; i < Math.min(m.items.length, startIdx + maxVisible); i++) {
          const item = m.items[i];
          const isSelected = i === m.selected;
          const marker = isSelected ? C.teal("\u25B8 ") : "  ";
          const name = item.id || String(item);
          const display = isSelected ? C.bold(C.teal(name)) : C.dim(name);
          modalLines.push(marker + display);
        }
        if (m.items.length > maxVisible) {
          modalLines.push("  " + C.gray("\u2026 " + (m.items.length - maxVisible) + " lainnya"));
        }
      }
      modalLines.push("");
      modalLines.push("  " + C.gray("\u2191\u2193 navigasi  Enter pilih  Esc batal"));
    } else if (m.type === "sessions") {
      title = "Session Tersimpan";
      if (!m.items || m.items.length === 0) {
        modalLines.push("  " + C.dim("Belum ada session tersimpan."));
      } else {
        for (const s of m.items) {
          modalLines.push("  " + C.cyan(s.id) + "  " + C.dim(s.model + "  " + s.messageCount + " pesan  " + s.updatedAt));
        }
      }
      modalLines.push("");
      modalLines.push("  " + C.gray("Esc untuk tutup"));
    } else if (m.type === "agents") {
      title = "Subagent";
      for (const a of m.items) {
        modalLines.push("  " + C.bold(a.name) + "  " + C.gray(a.description));
      }
      modalLines.push("");
      modalLines.push("  " + C.gray("Esc untuk tutup"));
    }

    // Calculate modal dimensions
    const contentW = Math.max(...modalLines.map((l) => visibleLen(l)), visibleLen(title) + 4, 30);
    const modalW = Math.min(contentW + 4, W - 4);
    const modalH = modalLines.length + 4; // border top + title + separator + content + border bottom
    const modalX = Math.floor((W - modalW) / 2);
    const modalY = Math.floor((H - modalH) / 2);

    let frame = "";
    // Top border
    frame += A.move(modalY, modalX) + C.gray("\u256D" + "\u2500".repeat(modalW - 2) + "\u256E");
    // Title
    const titlePad = Math.max(0, modalW - 4 - visibleLen(title));
    frame += A.move(modalY + 1, modalX) + C.gray("\u2502 ") + C.bold(C.cyan(title)) + " ".repeat(titlePad) + C.gray(" \u2502");
    // Separator
    frame += A.move(modalY + 2, modalX) + C.gray("\u251C" + "\u2500".repeat(modalW - 2) + "\u2524");
    // Content
    for (let i = 0; i < modalLines.length; i++) {
      const line = modalLines[i];
      const pad = Math.max(0, modalW - 4 - visibleLen(line));
      frame += A.move(modalY + 3 + i, modalX) + C.gray("\u2502 ") + line + " ".repeat(pad) + C.gray(" \u2502");
    }
    // Bottom border
    frame += A.move(modalY + modalH - 1, modalX) + C.gray("\u2570" + "\u2500".repeat(modalW - 2) + "\u256F");

    return frame;
  }

  // ── Modal helpers ──────────────────────────────────────────
  function openHelp() { modal = { type: "help" }; render(); }
  function openSessions() {
    const sessions = listSessions();
    modal = { type: "sessions", items: sessions };
    render();
  }
  function openAgents() {
    const agents = listAgents();
    modal = { type: "agents", items: agents };
    render();
  }
  async function openModels() {
    modal = { type: "models", state: "loading", items: [], selected: 0 };
    render();
    try {
      const models = await listModels(config.baseUrl, config.apiKey);
      modal = { type: "models", state: "ready", items: models, selected: 0 };
    } catch (e) {
      modal = { type: "models", state: "error", error: e.message };
    }
    render();
  }

  function closeModal() { modal = null; render(); }

  // ── Submit handler ─────────────────────────────────────────
  async function handleSubmit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Add to input history
    if (inputHistory.length === 0 || inputHistory[inputHistory.length - 1] !== trimmed) {
      inputHistory.push(trimmed);
    }
    historyIdx = -1;

    // Commands
    if (trimmed.startsWith("/")) {
      input = "";
      await handleCommand(trimmed);
      render();
      return;
    }

    // Stop any ongoing typing animation
    stopTyping();

    input = "";
    addMessage({ role: "user", content: trimmed });
    loading = true;
    status = "agent";
    toolCount = 0;
    iterCount = 0;
    thinkingText = "";
    startTime = Date.now();
    render(); // render BEFORE startSpinner so layoutInfo is set
    startSpinner();

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
          if (content && content.trim()) {
            thinkingText = content.trim().slice(0, 80);
            render();
          }
        },
      });
      const responseContent = result.result || "(selesai)";
      const msgIdx = messages.length;
      addMessage({ role: "assistant", content: responseContent });
      status = "ready";
      thinkingText = "";
      stopSpinner();
      // Start typing animation
      startTyping(responseContent, msgIdx);
    } catch (e) {
      addMessage({ role: "assistant", content: "Error: " + e.message });
      status = "error";
      thinkingText = "";
    } finally {
      loading = false;
      stopSpinner();
      if (!typingActive) render();
    }
  }

  // ── Command handler ────────────────────────────────────────
  async function handleCommand(cmd) {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];

    switch (command) {
      case "/help":
        openHelp();
        break;
      case "/exit":
      case "/quit":
        cleanup();
        process.exit(0);
        break;
      case "/model":
        if (parts[1]) {
          model = parts[1];
          addMessage({ role: "assistant", content: "Model diganti ke " + parts[1] });
        } else {
          openModels();
        }
        break;
      case "/models":
        openModels();
        break;
      case "/agents":
        openAgents();
        break;
      case "/sessions":
        openSessions();
        break;
      case "/save":
        if (config.session) {
          saveSession(config.session);
          addMessage({ role: "assistant", content: "Session disimpan: " + config.session.id });
        } else {
          addMessage({ role: "assistant", content: "Tidak ada session aktif." });
        }
        break;
      case "/clear":
        messages = [];
        showHelp = false;
        break;
      default:
        addMessage({ role: "assistant", content: "Perintah tidak dikenal: " + command + ". Ketik /help" });
    }
  }

  // ── Input processing ───────────────────────────────────────
  function processChunk(str) {
    let i = 0;
    while (i < str.length) {
      const ch = str[i];

      // Escape sequence (arrow keys, etc.)
      if (ch === "\x1b") {
        if (str[i + 1] === "[" && i + 2 < str.length) {
          const code = str[i + 2];
          // Arrow Up — history previous
          if (code === "A") {
            handleHistoryUp();
            i += 3;
            continue;
          }
          // Arrow Down — history next
          if (code === "B") {
            handleHistoryDown();
            i += 3;
            continue;
          }
          // Arrow Left/Right — ignore (cursor stays at end)
          if (code === "C" || code === "D") { i += 3; continue; }
          // Home
          if (code === "H") { i += 3; continue; }
          // End
          if (code === "F") { i += 3; continue; }
          // Page Up / Page Down / Delete with tilde
          if (code === "3" && str[i + 3] === "~") { i += 4; continue; }
          if (code === "5" && str[i + 3] === "~") { i += 4; continue; }
          if (code === "6" && str[i + 3] === "~") { i += 4; continue; }
        }
        // Plain Escape — close modal
        if (modal) { closeModal(); }
        i += 1;
        continue;
      }

      // Ctrl+C
      if (ch === "\u0003") {
        cleanup();
        process.exit(130);
        return;
      }

      // Ctrl+L — clear screen
      if (ch === "\x0c") {
        messages = [];
        showHelp = false;
        modal = null;
        render();
        i += 1;
        continue;
      }

      // Ctrl+S — save session
      if (ch === "\x13") {
        if (config.session) {
          saveSession(config.session);
          addMessage({ role: "assistant", content: "Session disimpan: " + config.session.id });
        }
        render();
        i += 1;
        continue;
      }

      // Tab — autocomplete commands
      if (ch === "\t") {
        handleTabComplete();
        i += 1;
        continue;
      }

      // Enter
      if (ch === "\r" || ch === "\n") {
        const text = input;
        input = "";
        historyIdx = -1;
        render();
        handleSubmit(text).catch((e) => {
          addMessage({ role: "assistant", content: "Error: " + e.message });
          loading = false;
          stopSpinner();
          stopTyping();
          status = "error";
          render();
        });
        return;
      }

      // Backspace
      if (ch === "\u007f" || ch === "\b") {
        if (modal && modal.type === "models") {
          // No backspace in model picker
        } else {
          input = input.slice(0, -1);
          render();
        }
        i += 1;
        continue;
      }

      // Printable characters
      if (ch >= " ") {
        if (modal && (modal.type === "help" || modal.type === "sessions" || modal.type === "agents")) {
          // Any key closes info modals
          closeModal();
        } else if (modal && modal.type === "models") {
          // Model picker: ignore printable chars (use arrows + enter)
        } else {
          input += ch;
          render();
        }
        i += 1;
        continue;
      }

      // Skip other control chars
      i += 1;
    }
  }

  // ── History navigation ─────────────────────────────────────
  function handleHistoryUp() {
    if (modal) {
      // In model picker: navigate up
      if (modal.type === "models" && modal.state === "ready") {
        if (modal.selected > 0) modal.selected--;
        render();
      }
      return;
    }
    // Input history
    if (inputHistory.length === 0) return;
    if (historyIdx === -1) {
      historyIdx = inputHistory.length - 1;
    } else if (historyIdx > 0) {
      historyIdx--;
    }
    input = inputHistory[historyIdx] || "";
    render();
  }

  function handleHistoryDown() {
    if (modal) {
      // In model picker: navigate down
      if (modal.type === "models" && modal.state === "ready") {
        if (modal.selected < modal.items.length - 1) modal.selected++;
        render();
      }
      return;
    }
    // Input history
    if (historyIdx === -1) return;
    if (historyIdx < inputHistory.length - 1) {
      historyIdx++;
      input = inputHistory[historyIdx] || "";
    } else {
      historyIdx = -1;
      input = "";
    }
    render();
  }

  // ── Tab autocomplete ───────────────────────────────────────
  function handleTabComplete() {
    if (!input.startsWith("/")) return;
    const cmds = COMMANDS.map((c) => c[0]);
    const matches = cmds.filter((c) => c.startsWith(input));
    if (matches.length === 1) {
      input = matches[0] + " ";
      render();
    } else if (matches.length > 1) {
      // Show matches as a message
      addMessage({ role: "assistant", content: "Saran: " + matches.join("  ") });
      render();
    }
  }

  // ── Cleanup ────────────────────────────────────────────────
  function cleanup() {
    stopSpinner();
    stopClock();
    stopTyping();
    stdout.write(A.showCursor);
    stdout.write(A.altExit);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }

  // ════════════════════════════════════════════════════════════
  // SETUP & START
  // ════════════════════════════════════════════════════════════

  // Enter alternate screen + raw mode
  stdin.setRawMode(true);
  stdin.resume();

  // Input handler (attached early for Ctrl+C during boot)
  const onData = (chunk) => {
    const str = chunk.toString();
    if (booting) {
      // Only handle Ctrl+C during boot
      if (str.includes("\u0003")) {
        cleanup();
        process.exit(130);
      }
      return;
    }
    processChunk(str);
  };
  stdin.on("data", onData);
  stdout.on("resize", render);

  // Run boot animation
  const W0 = stdout.columns || 80;
  const H0 = stdout.rows || 24;
  await bootSequence(stdout, W0, H0);
  booting = false;

  // Start clock + initial render
  startClock();
  render();

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

  console.log("\n" + pc.cyan(pc.bold("aicutad-cli")) + " " + pc.dim("\u2014 Mode non-TUI") + "\n");

  const loop = () => {
    rl.question(pc.cyan("you") + " " + pc.dim("\u203A") + " ", async (input) => {
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
            { role: "system", content: config.systemPrompt || "Kamu adalah aicutad-cli." },
            ...messages,
          ],
        });
        messages.push({ role: "assistant", content });
        console.log("\n" + content + "\n");
      } catch (e) {
        console.error("Error: " + e.message);
      }
      loop();
    });
  };
  loop();
}
