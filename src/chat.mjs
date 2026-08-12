// Chat ke gateway + interactive REPL
import { createInterface } from "node:readline";
import { readAuth, resolveBase } from "./config.mjs";
import { chatCompletion } from "./api.mjs";
import { brand, rule, ok, fail, info, arrow, spinner, cmd, pc } from "./ui.mjs";

const DEFAULT_SYSTEM = [
  "Kamu adalah AI❖CUTAD, asisten AI coding premium.",
  "Bantu menulis, memeriksa, merancang, dan menjelaskan kode.",
  "Jawab dengan ringkas, praktis, disertai contoh kode bila relevan.",
].join(" ");

/**
 * Jalankan chat sekali jalan lalu cetak jawabannya.
 * @param {string} prompt teks prompt (kosong => interaktif)
 * @param {string[]} argv argumen CLI
 */
export async function chat(prompt, argv = []) {
  const auth = readAuth();
  if (!auth.apiKey) {
    console.error(`\n  ${fail("Belum login — jalankan `login` dulu.")}`);
    process.exit(1);
  }

  const { BASE_URL } = resolveBase(argv);
  const promptText = (prompt || "").trim();
  const model = auth.model || reqModel(argv);

  if (!promptText) {
    return interactive(auth, BASE_URL, model);
  }

  const messages = [
    { role: "system", content: DEFAULT_SYSTEM },
    { role: "user", content: promptText },
  ];

  const stop = spinner(`AI❖CUTAD bekerja (${model})`);
  try {
    const content = await chatCompletion({ baseUrl: BASE_URL, apiKey: auth.apiKey, model, messages });
    await stop();
    printAssistant(content);
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

/** Cetak jawaban model dengan header khas. */
function printAssistant(content) {
  console.log(`\n${pc.dim("─".repeat(6))} ${pc.bold(pc.magenta("AI❖CUTAD"))} ${pc.dim("─".repeat(6))}\n`);
  console.log(content);
  console.log(`\n${pc.dim("─".repeat(32))}\n`);
}

/** REPL interaktif berkelanjutan. */
async function interactive(auth, baseUrl, model) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const messages = [{ role: "system", content: DEFAULT_SYSTEM }];

  console.log(`\n${brand()}`);
  console.log(`${rule()}`);
  console.log(`  ${info(`Mode interaktif`)}  ${pc.dim(`model: ${pc.white(model)}`)}`);
  console.log(`  ${arrow(`Ketik pesan, atau \`${cmd("exit")}\` untuk keluar.`)}\n`);

  const loop = () => {
    rl.question(pc.bold(pc.cyan("  you▸ ")), async (input) => {
      const msg = input.trim();
      if (!msg) return loop();
      if (["exit", "quit"].includes(msg.toLowerCase())) {
        console.log(`\n  ${ok("Sampai jumpa!")}  ${pc.dim("AI❖CUTAD")}\n`);
        rl.close();
        return;
      }

      messages.push({ role: "user", content: msg });
      const stop = spinner(`AI❖CUTAD bekerja (${model})`);
      try {
        const content = await chatCompletion({ baseUrl, apiKey: auth.apiKey, model, messages });
        await stop();
        messages.push({ role: "assistant", content });
        printAssistant(content);
      } catch (e) {
        await stop();
        console.error(`\n  ${fail(e.message)}`);
      }
      loop();
    });
  };
  loop();
}
