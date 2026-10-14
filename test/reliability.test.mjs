import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { executeTool } from "../src/agent/executor.mjs";
import { runAgentLoop } from "../src/agent/loop.mjs";

const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-home4-"));
process.env.HOME = fakeHome;

let session;
before(async () => {
  session = await import("../src/session/index.mjs");
});

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-f4-"));
}

test("write_file: hasil terverifikasi + tidak ada file temp tersisa", async () => {
  const dir = tmpdir();
  const out = await executeTool("write_file", { path: "sub/code.js", content: "const a = 1;\n" }, dir);
  assert.match(out, /terverifikasi/);
  assert.match(out, /sha256:/);
  const leftovers = fs.readdirSync(path.join(dir, "sub")).filter((f) => f.includes(".tmp-"));
  assert.deepEqual(leftovers, []);
  assert.equal(fs.readFileSync(path.join(dir, "sub", "code.js"), "utf8"), "const a = 1;\n");
});

test("write_file: content non-string ditolak dengan pesan jelas", async () => {
  const dir = tmpdir();
  const out = await executeTool("write_file", { path: "x.txt", content: 12345 }, dir);
  assert.match(out, /content.*string/);
  assert.equal(fs.existsSync(path.join(dir, "x.txt")), false);
});

test("write_file: argumen hilang ditolak, bukan crash", async () => {
  const dir = tmpdir();
  assert.match(await executeTool("write_file", {}, dir), /path/);
  assert.match(await executeTool("read_file", {}, dir), /path/);
  assert.match(await executeTool("edit_file", { path: "a" }, dir), /old_string/);
});

test("tool arg parse error dari model -> error feedback, bukan eksekusi buta", async () => {
  const out = await executeTool("write_file", { _parse_error: "Unexpected token", _raw: "{oops" }, tmpdir());
  assert.match(out, /JSON valid/);
});

test("read_file: file biner ditolak", async () => {
  const dir = tmpdir();
  fs.writeFileSync(path.join(dir, "bin.dat"), Buffer.from([0x89, 0x50, 0x00, 0x10]));
  const out = await executeTool("read_file", { path: "bin.dat" }, dir);
  assert.match(out, /biner/);
});

test("read_file: paginasi offset/limit", async () => {
  const dir = tmpdir();
  await executeTool("write_file", { path: "many.txt", content: "l1\nl2\nl3\nl4\nl5" }, dir);
  const out = await executeTool("read_file", { path: "many.txt", offset: 2, limit: 2 }, dir);
  assert.match(out, /l2\nl3/);
  assert.doesNotMatch(out, /l5/);
  assert.match(out, /baris 2-3 dari 5/);
});

test("edit_file: tulis atomik + terverifikasi", async () => {
  const dir = tmpdir();
  await executeTool("write_file", { path: "e.txt", content: "satu dua" }, dir);
  const out = await executeTool("edit_file", { path: "e.txt", old_string: "dua", new_string: "tiga" }, dir);
  assert.match(out, /terverifikasi/);
  assert.equal(fs.readFileSync(path.join(dir, "e.txt"), "utf8"), "satu tiga");
});

test("session: file utama korup -> recovery dari .bak", () => {
  const s = session.createSession("m-recovery", "cutad");
  s.messages.push({ role: "user", content: "pesan penting" });
  session.saveSession(s);
  session.saveSession(s); // kedua: .bak dibuat dari versi valid pertama
  const file = path.join(session.SESSIONS_DIR, `${s.id}.json`);
  fs.writeFileSync(file, "{korup bukan json");
  const loaded = session.loadSession(s.id);
  assert.ok(loaded, "harus recovery dari backup");
  assert.equal(loaded.messages[0].content, "pesan penting");
});

test("session: tidak ada temp file tersisa setelah save", () => {
  const s = session.createSession("m-atomic", "cutad");
  session.saveSession(s);
  const dir = session.SESSIONS_DIR;
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
  assert.deepEqual(leftovers, []);
});

async function mockServer(handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test("loop: gateway 500 sekali lalu pulih -> retry berhasil", async () => {
  let hits = 0;
  const { server, url } = await mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      hits++;
      if (hits === 1) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "sementara" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "pulih" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
    });
  });
  try {
    const result = await runAgentLoop({ baseUrl: url, apiKey: "k", model: "mock", task: "halo", cwd: "/tmp" });
    assert.equal(result.result, "pulih");
    assert.equal(hits, 2);
  } finally {
    server.close();
  }
});

test("loop: gateway 400 (permanen) -> tidak retry berulang", async () => {
  let hits = 0;
  const { server, url } = await mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      hits++;
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad request" }));
    });
  });
  try {
    const result = await runAgentLoop({ baseUrl: url, apiKey: "k", model: "mock", task: "halo", cwd: "/tmp" });
    assert.match(result.result, /Error/);
    assert.equal(hits, 1);
  } finally {
    server.close();
  }
});
