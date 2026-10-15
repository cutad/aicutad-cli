// ─────────────────────────────────────────────────────────────
// TUI native v3 - full-screen agent interface
//
// Features:
// 1. Boot animation (logo reveal + loading bar + status checks)
// 2. Full-screen (alternate buffer)
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
import { listSessions, saveSession, appendMessage } from "../session/index.mjs";
import { formatTokens } from "../agent/cost.mjs";
import { estimateMessageTokens } from "../agent/context.mjs";
import { VERSION } from "../version.mjs";
import { clearAuth } from "../config.mjs";
import { getLayout, isColorEnabled, isReducedMotion, truncateText } from "./layout.mjs";
import { createPasteParser, sanitizePastedText } from "./paste.mjs";
import { StringDecoder } from "node:string_decoder";

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
  pasteOn: "\x1b[?2004h",
  pasteOff: "\x1b[?2004l",
  home: "\x1b[H",
  clearBelow: "\x1b[J",
  clearEOL: "\x1b[K",
  clearLine: "\x1b[2K",
  move: (r, c) => `\x1b[${r};${c}H`,
};

// Hormati NO_COLOR / TERM=dumb: semua fungsi warna jadi identitas.
if (!isColorEnabled()) {
  for (const k of Object.keys(C)) {
    if (typeof C[k] === "function") C[k] = (s) => String(s);
  }
}

const SPINNER = ["\u280B", "\u2819", "\u2839", "\u2878", "\u287C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

// Label teks singkat, bukan emoji: konsisten & profesional di semua terminal.
const TOOL_STYLE = {
  read_file:    { icon: "read",   color: C.blue,   label: "Read" },
  write_file:   { icon: "write",  color: C.green,  label: "Write" },
  edit_file:    { icon: "edit",   color: C.yellow, label: "Edit" },
  list_files:   { icon: "list",   color: C.cyan,   label: "List" },
  search_files: { icon: "search", color: C.magenta, label: "Search" },
  run_command:  { icon: "run",    color: C.orange,  label: "Run" },
  browse_page:  { icon: "browse", color: C.blue,   label: "Browse" },
  web_search:   { icon: "web",    color: C.cyan,   label: "Web" },
  screenshot:   { icon: "shot",   color: C.magenta, label: "Shot" },
};

const COMMANDS = [
  ["/help", "Tampilkan bantuan"],
  ["/models", "Daftar & ganti model"],
  ["/model <name>", "Ganti model langsung"],
  ["/agents", "Daftar subagent"],
  ["/sessions", "Daftar session tersimpan"],
  ["/save", "Simpan session"],
  ["/clear", "Bersihkan layar"],
  ["/logout", "Hapus kredensial lokal & keluar"],
  ["/exit", "Keluar"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visibleLen = (s) => ("" + s).replace(/\x1b\[[0-9;]*m/g, "").length;
// Input bisa multi-baris (hasil paste). Untuk tampilan satu baris,
// newline digambar sebagai ⏎ agar frame tidak rusak.
const displayInputText = (s) => String(s ?? "").replace(/\n/g, "\u23CE").replace(/\t/g, "  ");

// ── Boot: splash statis singkat (profesional, tanpa animasi berlapis).
// Dihormati juga CUTAD_NO_ANIMATION / CUTAD_REDUCED_MOTION / TERM=dumb:
// tampil sebaris lalu langsung masuk aplikasi.
async function bootSequence(stdout, W, H) {
  stdout.write(A.altEnter + A.pasteOn + A.hideCursor + A.home + A.clearBelow);
  const title = "aicutad-cli";
  const meta = `v${VERSION} - Node ${process.version.replace("v", "")} - ${process.platform}/${process.arch}`;
  if (isReducedMotion() || W < 44 || H < 10) {
    stdout.write(A.move(1, 1) + C.bold(C.cyan(title)) + "  " + C.dim(meta) + A.clearEOL);
    return;
  }
  const winW = Math.min(56, W - 4);
  const winX = Math.max(1, Math.floor((W - winW) / 2));
  const winY = Math.max(1, Math.floor(H / 2) - 3);
  const line = (row, text) => stdout.write(A.move(row, winX) + text + A.clearEOL);
  line(winY, C.gray("-".repeat(winW)));
  line(winY + 1, C.bold(C.cyan(title)));
  line(winY + 2, C.dim("AI Coding Agent CLI"));
  line(winY + 3, C.dim(truncateText(meta, winW)));
  line(winY + 4, C.gray("-".repeat(winW)));
  // Jeda sangat singkat agar splash terbaca; bukan animasi.
  await sleep(120);
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
  // Resume: bila session membawa riwayat (dimuat dari disk), pakai itu
  // sebagai konteks awal. ts string -> Date agar renderer tidak crash.
  let messages = Array.isArray(config.session?.messages)
    ? config.session.messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ ...m, ts: m.ts ? new Date(m.ts) : new Date() }))
    : [];
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
  // Cost & context tracking state
  let costInfo = null;   // { totalTokens, costFormatted, calls }
  let ctxPercent = 0;    // context window usage percentage
  let prevLineCount = 0;
  let booting = true;
  let modal = null; // { type, items, selected, scroll, state }
  const inputHistory = [];
  let historyIdx = -1;
  let typingActive = false;
  let scrollOffset = 0;  // scroll up/down messages (0 = bottom/latest)
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
  const layoutInfo = { spinnerRow: 0, clockRow: 1, clockCol: 1, inputRow: 0, inputCol: 1, statusRow: 0 };

  function startSpinnerNoRender() {
    if (spinnerTimer) return;
    spinnerTimer = setInterval(() => {
      spinnerIdx = (spinnerIdx + 1) % SPINNER.length;
      updateSpinnerInPlace();
    }, 100);
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

  // ── In-place input update (no full redraw) ──────────────────
  // Saat user mengetik/backspace, hanya update baris input.
  // Tidak redraw seluruh screen = zero glitch.
  function updateInputInPlace() {
    const W = stdout.columns || 80;
    const { inputRow } = layoutInfo;
    if (inputRow < 1) { render(); return; } // fallback jika layout belum siap

    const prompt = " " + C.bold(C.cyan("you \u203A")) + " ";
    const maxInput = W - prompt.length - 1;
    const disp = displayInputText(input);
    const inputDisplay = disp.length > maxInput ? disp.slice(disp.length - maxInput) : disp;

    // Clear input line, write new content, position cursor
    stdout.write("\x1b[" + inputRow + ";1H\x1b[2K" + prompt + inputDisplay + " ");
    // Position cursor at end of input
    const cursorCol = prompt.length + inputDisplay.length + 1;
    stdout.write("\x1b[" + inputRow + ";" + cursorCol + "H");

    // Update layoutInfo untuk cursor position
    layoutInfo.inputCol = cursorCol;
  }

  // ── In-place spinner update (no full redraw) ───────────────
  function updateSpinnerInPlace() {
    if (!loading) return;
    // Jangan update in-place jika ada render queued — biarkan full render yang handle
    if (renderQueued) return;
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
  function updateTypingInPlace() {
    if (!typingActive || typingMsgIdx < 0) return;
    // Redraw hanya message area — butuh full render karena content berubah
    // Tapi pakai debounce, jadi maksimal 1 render per microtask
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
    const layout = getLayout(W, H);

    if (W < 40 || H < 8) {
      stdout.write(A.home + A.clearBelow);
      stdout.write("Terminal terlalu kecil. Minimum: 40x8. Saat ini: " + W + "x" + H + "\n");
      return;
    }

    const lines = [];

    // ── Header (samakan mockup docs/tui-corporate.png) ──
    // Non-compact: splash persisten 2 baris (brand + meta), separator,
    // baris judul + jam, separator. Compact: cukup baris judul + separator.
    const now = new Date();
    const clock = String(now.getHours()).padStart(2, "0") + ":" +
                  String(now.getMinutes()).padStart(2, "0") + ":" +
                  String(now.getSeconds()).padStart(2, "0");
    let titleRow = 1;
    if (layout.showSplash) {
      lines.push(" " + C.bold(C.cyan("aicutad-cli")));
      const meta = "AI Coding Agent CLI" + "  \u00B7  " + `v${VERSION}` + "  \u00B7  " +
        "Node " + process.version.replace("v", "") + "  \u00B7  " + process.platform + "/" + process.arch;
      lines.push(" " + C.dim(truncateText(meta, W - 1)));
      lines.push(C.gray("-".repeat(W)));
      titleRow = 4;
    }
    const headerLeft = layout.compact
      ? " " + C.bold(C.cyan("aicutad-cli")) + " " + C.gray(`v${VERSION}`)
      : " " + C.bold("aicutad-cli") +
        "  " + C.gray("|") + "  " + C.bold("AI Coding Agent CLI") + " " + C.bold(`v${VERSION}`);
    const headerRight = layout.showClock ? C.bold(clock) : "";
    const headerPad = Math.max(1, W - visibleLen(headerLeft) - visibleLen(headerRight) - 1);
    lines.push(headerLeft + (headerRight ? " ".repeat(headerPad) + headerRight : ""));
    lines.push(C.gray("-".repeat(W)));
    const headerH = lines.length;

    // ── Messages area ──
    const footerH = layout.showFooter ? 4 : 3; // separator + status + input (+ footer)
    const msgAreaH = Math.max(1, H - headerH - footerH);
    const msgLines = buildMessageLines(W);

    // Scroll: show last msgAreaH lines, adjusted by scrollOffset
    const totalMsgLines = msgLines.length;
    const maxOffset = Math.max(0, totalMsgLines - msgAreaH);
    const effectiveOffset = Math.min(scrollOffset, maxOffset);
    const startIdx = Math.max(0, totalMsgLines - msgAreaH - effectiveOffset);
    const visible = msgLines.slice(startIdx, startIdx + msgAreaH);
    for (const line of visible) {
      lines.push(line);
    }

    // Pad to fill terminal (keeps footer at bottom)
    while (lines.length < H - footerH) {
      lines.push("");
    }

    // ── Spinner / loading indicator ──
    // Simpan baris spinner untuk updateSpinnerInPlace
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
    lines.push(C.gray("-".repeat(W)));

    // ── Status bar (mockup: satu baris hijau, segmen dipisah " | ") ──
    // Warna seluruh baris mengikuti state: ready=hijau, bekerja=kuning,
    // error=merah. Di mode NO_COLOR semua fungsi warna jadi identitas.
    const sLabelPlain = loading ? "bekerja" : status === "error" ? "error" : (scrollOffset > 0 ? "scroll " + scrollOffset : "ready");
    const statusColor = loading ? C.bYellow : status === "error" ? C.bRed : C.bGreen;
    const msgCount = messages.length + " pesan";
    const provider = config.provider || "cutad";
    const modelDisplay = truncateText(model, layout.modelMaxLength);

    const segments = ["\u25CF " + sLabelPlain, modelDisplay, msgCount];
    if (costInfo && !layout.veryNarrow) {
      segments.push(formatTokens(costInfo.totalTokens) + " tok", costInfo.costFormatted);
    }
    segments.push("ctx " + ctxPercent + "%");
    if (!layout.compact) segments.push(provider);

    let statusPlain = " " + segments.join("  |  ");
    if (layout.showHints) {
      const hint = "/help untuk bantuan";
      const hintPad = Math.max(1, W - statusPlain.length - hint.length - 1);
      statusPlain += " ".repeat(hintPad) + hint;
    }
    lines.push(statusColor(truncateText(statusPlain, W)));

    // ── Input line ──
    const prompt = " " + C.bold(C.cyan("you \u203A")) + " ";
    const maxInput = W - prompt.length - 1;
    const dispInput = displayInputText(input);
    const inputDisplay = dispInput.length > maxInput ? dispInput.slice(dispInput.length - maxInput) : dispInput;
    lines.push(prompt + inputDisplay + " ");

    // ── Footer (persis mockup) ──
    if (layout.showFooter) {
      lines.push(" " + C.dim(truncateText("TUI corporate: label teks, tanpa emoji, splash statis, mode compact < 72 kolom", W - 1)));
    }

    // ── Build single-write frame with ABSOLUTE positioning ──
    // NO \n — \n after last line causes terminal scroll = glitch/double.
    // Use \x1b[R;1H to position each line absolutely.
    let frame = "";
    for (let i = 0; i < lines.length; i++) {
      frame += "\x1b[" + (i + 1) + ";1H" + lines[i] + A.clearEOL;
    }
    // Clear leftover lines from previous frame
    if (prevLineCount > lines.length) {
      for (let i = lines.length; i < prevLineCount; i++) {
        frame += "\x1b[" + (i + 1) + ";1H" + A.clearEOL;
      }
    }
    prevLineCount = lines.length;

    // ── Save layout positions for in-place timer updates ──
    // Clock ada di baris judul (baris 4 bila splash tampil, else baris 1)
    layoutInfo.clockRow = titleRow;
    const clockStr = "00:00:00";
    layoutInfo.clockCol = W - clockStr.length;
    // Input bukan baris terakhir bila footer tampil (footer = baris terakhir)
    layoutInfo.inputRow = lines.length - (layout.showFooter ? 1 : 0);
    const promptStr = " " + C.bold(C.cyan("you \u203A")) + " ";
    const dispForCol = displayInputText(input);
    const inputDisp = dispForCol.length > (W - promptStr.length - 1) ? dispForCol.slice(dispForCol.length - (W - promptStr.length - 1)) : dispForCol;
    layoutInfo.inputCol = promptStr.length + inputDisp.length + 1;
    // Spinner row = the line where spinner is written (last message area line, 1-indexed)
    layoutInfo.spinnerRow = lines.length - footerH; // same as where spinner is written in lines[]
    // Status row = 2 baris di atas footer, atau kedua terakhir tanpa footer
    layoutInfo.statusRow = lines.length - (layout.showFooter ? 2 : 1);

    // ── Modal overlay ──
    if (modal) {
      frame += buildModalOverlay(modal, W, H);
    }

    // Position cursor at end of input (bukan di footer)
    const cursorRow = layoutInfo.inputRow;
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
      out.push("   " + C.gray("\u2191\u2193 scroll/history  Tab complete  Ctrl+L clear  Ctrl+S save"));
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
      const style = TOOL_STYLE[msg.toolName] || { icon: "tool", color: C.yellow, label: msg.toolName };
      const argStr = msg.argsPreview || "";
      const maxArg = W - 25;
      const argDisplay = visibleLen(argStr) > maxArg ? argStr.slice(0, maxArg - 1) + "\u2026" : argStr;
      out.push(" " + style.icon + " " + C.bold(style.color(style.label)) + " " + C.gray(argDisplay) + " " + C.dim("\u2026"));
    } else if (msg.role === "tool_result") {
      const style = TOOL_STYLE[msg.toolName] || { icon: "tool", color: C.green, label: msg.toolName };
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
    if (name === "browse_page") return args.url || "";
    if (name === "web_search") return "\"" + (args.query || "") + "\"";
    if (name === "screenshot") return args.url || "";
    return Object.keys(args).join(", ");
  }

  function buildAgentTask(userMsg, history) {
    // history sudah memuat userMsg sebagai pesan terakhir (addMessage
    // dipanggil sebelum ini) -> buang duplikatnya agar tidak terkirim 2x.
    const cleaned = [...history];
    const lastIdx = cleaned.map((m) => m.role).lastIndexOf("user");
    if (lastIdx >= 0 && cleaned[lastIdx].content === userMsg) cleaned.splice(lastIdx, 1);
    const recent = cleaned
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => (m.role === "user" ? "User" : "AI") + ": " + m.content)
      .join("\n");
    if (recent) return userMsg + "\n\n--- Konteks percakapan sebelumnya ---\n" + recent;
    return userMsg;
  }

  // ── Modal overlay ──────────────────────────────────────────
  function buildModalOverlay(m, W, H) {
    const modalLines = [];
    let title = "";

    if (m.type === "help") {
      title = "Bantuan";
      for (let i = 0; i < COMMANDS.length; i++) {
        const [name, desc] = COMMANDS[i];
        const isSelected = i === (m.selected || 0);
        const marker = isSelected ? C.teal("\u25B8 ") : "  ";
        const nameStr = isSelected ? C.bold(C.teal(name.padEnd(22))) : C.cyan(name.padEnd(22));
        const descStr = isSelected ? C.white(desc) : C.gray(desc);
        modalLines.push(marker + nameStr + " " + descStr);
      }
      modalLines.push("");
      modalLines.push("  " + C.gray("\u2191\u2193 navigasi  Enter pilih  Esc tutup"));
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
    const modalW = Math.min(contentW + 4, getLayout(W, H).modalWidth);
    const modalH = modalLines.length + 4; // border top + title + separator + content + border bottom
    const modalX = Math.floor((W - modalW) / 2);
    const modalY = Math.floor((H - modalH) / 2);

    let frame = "";
    // Clear the modal area first to prevent glitch/bleed-through
    for (let r = modalY; r < modalY + modalH; r++) {
      frame += A.move(r, modalX) + " ".repeat(modalW);
    }
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
  function openHelp() {
    modal = { type: "help", selected: 0, items: COMMANDS.map(c => c[0]) };
    render();
  }
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
    // Reset scroll to bottom
    scrollOffset = 0;
    // Update context window percentage berdasarkan semua messages
    ctxPercent = Math.min(100, Math.round((estimateMessageTokens(messages) / 128000) * 100));
    loading = true;
    status = "agent";
    toolCount = 0;
    iterCount = 0;
    thinkingText = "";
    startTime = Date.now();
    render(); // single full render before spinner starts
    // startSpinner will NOT call render() again — layout already set up
    startSpinnerNoRender();

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
            const newText = content.trim().slice(0, 80);
            if (newText !== thinkingText) {
              thinkingText = newText;
              updateSpinnerInPlace();
            }
          }
        },
        onCost: (info) => {
          if (info) {
            costInfo = info;
            render();
          }
        },
        onSummarize: (text) => {
          addMessage({ role: "assistant", content: "[Context] " + text });
          // Context diringkas = reset percentage ke rendah
          ctxPercent = Math.max(5, Math.round(ctxPercent * 0.3));
          render();
        },
      });
      const responseContent = result.result || "(selesai)";
      const msgIdx = messages.length;
      addMessage({ role: "assistant", content: responseContent });
      status = "ready";
      thinkingText = "";
      // Update context window percentage berdasarkan total messages
      const totalEstTokens = estimateMessageTokens(messages);
      ctxPercent = Math.min(100, Math.round((totalEstTokens / 128000) * 100));
      // Update cost info dari result
      if (result.cost) {
        const { getCostSummary } = await import("../agent/cost.mjs");
        costInfo = getCostSummary(result.cost);
      }
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
      case "/logout":
        // Sama seperti `aicutad logout`: hapus kredensial lokal, lalu keluar.
        try { if (config.session) saveSession(config.session); } catch {}
        clearAuth();
        cleanup();
        process.stdout.write("\n  Kredensial lokal telah dihapus (logout). Jalankan 'aicutad login' untuk masuk lagi.\n");
        process.exit(0);
        break;
      default:
        addMessage({ role: "assistant", content: "Perintah tidak dikenal: " + command + ". Ketik /help" });
    }
  }

  // ── Input processing ───────────────────────────────────────
  // Paste utuh ditambahkan sekali (bukan per karakter): cepat dan
  // tidak ada redraw O(n^2) untuk paste panjang.
  function appendPastedText(text) {
    const clean = sanitizePastedText(text);
    if (!clean) return;
    if (modal) return; // modal hanya navigasi panah/Enter/Esc
    input += clean;
    updateInputInPlace();
  }

  function processChunk(str) {
    let inputDirty = false;
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
        // Paste tanpa bracketed-paste (terminal lama): newline di
        // tengah chunk yang masih berisi teks setelahnya adalah
        // baris baru hasil paste, BUKAN Enter untuk submit.
        // CRLF dihitung satu newline.
        if (!modal) {
          const nlEnd = (ch === "\r" && str[i + 1] === "\n") ? i + 1 : i;
          const restAfterNl = str.slice(nlEnd + 1);
          if (/[^\r\n]/.test(restAfterNl)) {
            input += "\n";
            inputDirty = true;
            i = nlEnd + 1;
            continue;
          }
        }
        // Modal Enter — handle per modal type
        if (modal) {
          if (modal.type === "help") {
            // Eksekusi command yang dipilih
            const cmd = COMMANDS[modal.selected || 0];
            if (cmd) {
              const cmdText = cmd[0];
              closeModal();
              // /model <name> → buka model picker, /model saja juga buka picker
              if (cmdText.startsWith("/model ") || cmdText === "/model <name>") {
                openModels();
              } else if (cmdText === "/exit" || cmdText === "/quit") {
                cleanup();
                process.exit(0);
                return;
              } else {
                handleSubmit(cmdText).catch(() => {});
              }
            }
          } else if (modal.type === "models" && modal.state === "ready") {
            // Pilih model
            const item = modal.items[modal.selected];
            if (item) {
              model = item.id || String(item);
              closeModal();
              addMessage({ role: "assistant", content: "Model diganti ke " + model });
              render();
            }
          } else {
            // Other modals: Enter closes
            closeModal();
          }
          i += 1;
          continue;
        }

        const text = input;
        input = "";
        historyIdx = -1;
        // JANGAN render() di sini — handleSubmit akan render sendiri.
        // Render di sini bikin "berpikir" muncul 2x (render ini + render di handleSubmit).
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
          inputDirty = true;
        }
        i += 1;
        continue;
      }

      // Printable characters
      if (ch >= " ") {
        if (modal && (modal.type === "help" || modal.type === "models")) {
          // Help & model picker: ignore printable chars (use arrows + enter + esc)
        } else if (modal && (modal.type === "sessions" || modal.type === "agents")) {
          // Sessions & agents: any key closes
          closeModal();
        } else {
          input += ch;
          inputDirty = true;
        }
        i += 1;
        continue;
      }

      // Skip other control chars
      i += 1;
    }
    // Satu kali redraw input per chunk (paste panjang tidak O(n^2))
    if (inputDirty) updateInputInPlace();
  }

  // ── History navigation ─────────────────────────────────────
  function handleHistoryUp() {
    if (modal) {
      if ((modal.type === "models" && modal.state === "ready") || modal.type === "help") {
        if (modal.selected > 0) modal.selected--;
        render();
      } else if (modal.type === "agents" || modal.type === "sessions") {
        if (!modal.scroll) modal.scroll = 0;
        if (modal.scroll < (modal.maxScroll || 0)) { modal.scroll++; render(); }
      }
      return;
    }
    // If input is empty, scroll messages up instead of history
    if (input.length === 0 && !loading) {
      scrollOffset++;
      render();
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
      if ((modal.type === "models" && modal.state === "ready") || modal.type === "help") {
        const max = modal.type === "help" ? COMMANDS.length - 1 : (modal.items.length - 1);
        if (modal.selected < max) modal.selected++;
        render();
      } else if (modal.type === "agents" || modal.type === "sessions") {
        if ((modal.scroll || 0) > 0) { modal.scroll--; render(); }
      }
      return;
    }
    // If input is empty, scroll messages down
    if (input.length === 0 && !loading) {
      if (scrollOffset > 0) { scrollOffset--; render(); }
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
    stdout.write(A.pasteOff);
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
  // StringDecoder: karakter UTF-8 multi-byte yang terpotong antar-chunk
  // tidak rusak. PasteParser: bracketed-paste dikeluarkan utuh.
  const pasteParser = createPasteParser();
  const utf8Decoder = new StringDecoder("utf8");
  const onData = (chunk) => {
    const str = typeof chunk === "string" ? chunk : utf8Decoder.write(chunk);
    if (booting) {
      // Only handle Ctrl+C during boot
      if (str.includes("\u0003")) {
        cleanup();
        process.exit(130);
      }
      return;
    }
    for (const ev of pasteParser.push(str)) {
      if (ev.type === "paste") appendPastedText(ev.text);
      else if (ev.text) processChunk(ev.text);
    }
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
  const messages = Array.isArray(config.session?.messages)
    ? config.session.messages.filter((m) => m && (m.role === "user" || m.role === "assistant")).map((m) => ({ role: m.role, content: m.content }))
    : [];

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
