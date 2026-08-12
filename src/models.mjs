// Tampilkan daftar model dari gateway
import { readAuth, resolveBase } from "./config.mjs";
import { listModels } from "./api.mjs";
import { brand, rule, panel, row, ok, fail, spinner, pc } from "./ui.mjs";

export async function models(argv = []) {
  const auth = readAuth();
  if (!auth.apiKey) {
    console.error(`\n  ${fail("Belum login. Jalankan `login` dulu.")}`);
    process.exit(1);
  }

  const { BASE_URL } = resolveBase(argv);

  console.log(`\n${brand()}`);
  console.log(`${rule()}\n`);

  const stop = spinner("Memuat daftar model dari gateway");
  let list = [];
  try {
    list = await listModels(auth.baseUrl || BASE_URL, auth.apiKey);
    await stop();
  } catch (e) {
    await stop();
    console.log(`\n  ${fail(e.message)}`);
    process.exit(1);
  }

  const header = `Model di ${pc.cyan(auth.baseUrl || BASE_URL)} ${pc.dim(`(${list.length})`)}`;
  if (list.length === 0) {
    console.log(panel(header, [`  ${pc.dim("(tidak ada model yang dibagikan gateway)")}`]));
    console.log("");
    return;
  }

  // Susun 2 kolom biar rapi
  const rows = list.map((m) => m.id);
  const lines = [];
  for (let i = 0; i < rows.length; i += 2) {
    const left = `  ${pc.bold(pc.white(rows[i]))}`;
    const right = rows[i + 1] ? `  ${pc.bold(pc.white(rows[i + 1]))}` : "";
    lines.push(`${left.padEnd(34)}${right}`);
  }

  console.log(panel(header, lines));
  console.log(`  ${ok(`${list.length} model tersedia.`)}  ${pc.dim("Untuk memilih:")}  ${pc.bgCyan(pc.black(" chat -m <model> "))}`);
  console.log("");
}
