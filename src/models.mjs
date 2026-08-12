// Tampilkan daftar model dari gateway
import { readAuth, resolveBase } from "./config.mjs";
import { listModels } from "./api.mjs";
import { banner, subtitle, rule, panel, row, ok, fail, spinner, cmd, pc } from "./ui.mjs";

export async function models(argv = []) {
  const auth = readAuth();
  if (!auth.apiKey) {
    console.error(`\n  ${fail("Belum login. Jalankan `login` dulu.")}`);
    process.exit(1);
  }

  const { BASE_URL } = resolveBase(argv);

  console.log(`\n${banner()}\n  ${subtitle()}\n${rule()}\n`);

  const stop = spinner("Memuat daftar model ...");
  let list = [];
  try {
    list = await listModels(auth.baseUrl || BASE_URL, auth.apiKey);
    await stop();
  } catch (e) {
    await stop();
    console.log(`\n  ${fail(e.message)}`);
    process.exit(1);
  }

  const header = `Model di ${pc.cyan(auth.baseUrl || BASE_URL)}  (${list.length})`;
  if (list.length === 0) {
    console.log(panel(header, [`  ${pc.dim("(kosong)")}`]));
    console.log("");
    return;
  }

  const rows = list.map((m) => m.id);
  const lines = [];
  for (let i = 0; i < rows.length; i += 2) {
    const left = `  ${rows[i]}`;
    const right = rows[i + 1] ? `  ${rows[i + 1]}` : "";
    lines.push(`${left.padEnd(32)}${right}`);
  }

  console.log(panel(header, lines, { width: 78 }));
  console.log(`  ${ok(`${list.length} model tersedia.`)}  ${pc.dim("Pilih lewat:")} ${cmd("chat -m <model>")}`);
  console.log("");
}
