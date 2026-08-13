// Chat ke gateway + interactive REPL + TUI launcher
import { createInterface } from "node:readline";
import { readAuth, resolveBase } from "./config.mjs";
import { chatCompletion } from "./api.mjs";
import { banner, subtitle, rule, ok, fail, info, arrow, spinner, cmd, pc } from "./ui.mjs";

const SYSTEM_PROMPT = [
  "Kamu adalah AI CUTAD, asisten AI coding.",
  "Bantu menulis, memeriksa, merancang, dan menjelaskan kode.",
  "Jawab ringkas, praktis, sertakan contoh kode bila relevan.",
].join(" ");

/**
 * Jalankan chat.
 * @param {string} prompt teks prompt (kosong => interaktif/TUI)
 * @param {string[]} argv argumen CLI
 * @param {boolean} useTui pakai TUI full-screen
 */
export async function chat(prompt, argv = [], useTui = false) {
  const auth = readAuth();
  if (!auth.apiKey) {
    console.error(`\n  ${fail("Belum login — jalankan `login` dulu.")}`);
    process.exit(1);
  }

  const { BASE_URL } = resolveBase(argv);
  const promptText = (prompt || "").trim();
  const model = auth.model || reqModel(argv);

  if (!promptText && useTui) {
    return launchTui(auth, BASE_URL, model);
  }

  if (!promptText) {
    return interactive(auth, BASE_URL, model);
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: promptText },
  ];

  const stop = spinner(`Menunggu respons (${model}) ...`);
  try {
    const content = await chatCompletion({ baseUrl: BASE_URL, apiKey: auth.apiKey, model, messages });
    await stop();
    printAnswer(content, model);
  } catch (e) {
    await stop();
    console.error(`\n  ${fail(e.message)}`);
    process.exit(1);
  }
}

/** Cari --model / -m dari argv. */
function reqModel(argv) {
  const i = argv.indexOf("--model");
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const m = argv.indexOf("-m");
  if (m >= 0 && argv[m + 1]) return argv[m + 1];
  return undefined;
}

/** Cetak jawaban dengan pemisah rapi. */
function printAnswer(content, model) {
  console.log(`\n${pc.dim(rule("─", 56))}\n${content}\n${pc.dim(rule("─", 56))}  ${pc.dim(`[${model}]`)}\n`);
}

/** Launch TUI full-screen (native ANSI). */
async function launchTui(auth, baseUrl, model) {
  const { createSession } = await import("./session/index.mjs");
  const session = createSession(model, "cutad");
  const { startTUI } = await import("./tui/App.mjs");
  return startTUI({
    baseUrl,
    apiKey: auth.apiKey,
    model,
    provider: "cutad",
    session,
    systemPrompt: SYSTEM_PROMPT,
  });
}

/** REPL interaktif berkelanjutan. */
async function interactive(auth, baseUrl, model) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  console.log(`\n${banner()}\n  ${subtitle()}\n${rule()}`);
  console.log(`  ${info(`Mode interaktif`)}  ${pc.dim(`| model: ${pc.cyan(model)}`)}`);
  console.log(`  ${arrow(`Ketik pesan. ${cmd("exit")} untuk keluar.`)}\n`);

  const loop = () => {
    if (rl.closed) { cleanup(); return; }
    rl.question(`${pc.cyan("you")}${pc.dim(" > ")}`, async (input) => {
      const msg = input.trim();
      if (!msg) return loop();
      if (["exit", "quit", "/bye"].includes(msg.toLowerCase())) {
        console.log(`\n  ${ok("Sampai jumpa.")}\n`);
        rl.close();
        return;
      }

      messages.push({ role: "user", content: msg });
      const stop = spinner("Menunggu respons ...");
      try {
        const content = await chatCompletion({ baseUrl, apiKey: auth.apiKey, model, messages });
        await stop();
        messages.push({ role: "assistant", content });
        console.log(`\n${content}\n`);
      } catch (e) {
        await stop();
        console.error(`  ${fail(e.message)}`);
      }
      loop();
    });
  };
  rl.on("close", cleanup);
  function cleanup() {
    try { process.stdin.removeAllListeners?.(); } catch {}
  }
  loop();
}
