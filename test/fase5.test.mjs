import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { executeTool, verifyWrittenFile } from "../src/agent/executor.mjs";
import { createCheckpoint, restoreCheckpoint, listCheckpoints } from "../src/agent/checkpoint.mjs";
import { buildApprovalPreview } from "../src/agent/diff.mjs";
import { runAgentLoop } from "../src/agent/loop.mjs";
import { chatCompletionStream } from "../src/api.mjs";

const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-home5-"));
process.env.HOME = fakeHome;

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-f5-"));
}

test("F5.1 write JS rusak -> sistem melaporkan syntax error", async () => {
  const dir = tmpdir();
  const out = await executeTool("write_file", { path: "rusak.js", content: "const x = ;\n" }, dir);
  assert.match(out, /Verifikasi: Error verifikasi syntax/);
});

test("F5.1 write JS valid -> syntax OK", async () => {
  const dir = tmpdir();
  const out = await executeTool("write_file", { path: "bagus.js", content: "const x = 1;\n" }, dir);
  assert.match(out, /syntax OK/);
});

test("F5.1 write JSON invalid -> dilaporkan", async () => {
  const dir = tmpdir();
  const out = await executeTool("write_file", { path: "data.json", content: "{bukan json" }, dir);
  assert.match(out, /Error verifikasi/);
});

test("F5.1 edit yang merusak syntax -> dilaporkan", async () => {
  const dir = tmpdir();
  await executeTool("write_file", { path: "e.js", content: "const a = 1;\n" }, dir);
  const out = await executeTool("edit_file", { path: "e.js", old_string: "const a = 1;", new_string: "const a = ;" }, dir);
  assert.match(out, /Error verifikasi syntax/);
});

test("F5.1 verifyWrittenFile langsung", () => {
  const dir = tmpdir();
  const f = path.join(dir, "v.py");
  fs.writeFileSync(f, "def x(:\n");
  assert.match(verifyWrittenFile(f, "def x(:\n") || "", /Error verifikasi/);
});

test("F5.3 checkpoint: rollback memulihkan file lama & menghapus file baru", async () => {
  const dir = tmpdir();
  fs.writeFileSync(path.join(dir, "lama.txt"), "versi asli");
  const cp = createCheckpoint(dir);
  // simulasi agent mengubah via executor dengan checkpoint
  await executeTool("write_file", { path: "lama.txt", content: "versi agent" }, dir, { checkpoint: cp });
  await executeTool("write_file", { path: "baru.txt", content: "file baru agent" }, dir, { checkpoint: cp });
  assert.equal(fs.readFileSync(path.join(dir, "lama.txt"), "utf8"), "versi agent");
  const r = restoreCheckpoint(cp.id);
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(path.join(dir, "lama.txt"), "utf8"), "versi asli");
  assert.equal(fs.existsSync(path.join(dir, "baru.txt")), false);
  assert.ok(listCheckpoints().some((c) => c.id === cp.id));
});

test("F5.2 diff preview untuk edit menampilkan -/+", () => {
  const preview = buildApprovalPreview("edit_file", { path: "a.js", old_string: "satu", new_string: "dua" }, "/tmp");
  assert.match(preview, /- satu/);
  assert.match(preview, /\+ dua/);
  const runPreview = buildApprovalPreview("run_command", { command: "npm test" }, "/tmp");
  assert.match(runPreview, /npm test/);
});

async function mockServer(handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function toolCallServer(dir) {
  let call = 0;
  return mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      call++;
      res.writeHead(200, { "Content-Type": "application/json" });
      if (call === 1) {
        return res.end(JSON.stringify({
          choices: [{
            message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "write_file", arguments: JSON.stringify({ path: "hasil.txt", content: "dari agent" }) } }] },
            finish_reason: "tool_calls",
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }));
      }
      res.end(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "selesai" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
    });
  });
}

test("F5.2 approval DITOLAK -> file tidak dibuat", async () => {
  const dir = tmpdir();
  const { server, url } = await toolCallServer(dir);
  try {
    const result = await runAgentLoop({
      baseUrl: url, apiKey: "k", model: "mock", task: "tulis file", cwd: dir,
      onApprove: async () => false,
    });
    assert.equal(fs.existsSync(path.join(dir, "hasil.txt")), false);
    assert.equal(result.result, "selesai");
  } finally { server.close(); }
});

test("F5.2 approval DITERIMA -> file dibuat + ada checkpointId", async () => {
  const dir = tmpdir();
  const { server, url } = await toolCallServer(dir);
  const previews = [];
  try {
    const result = await runAgentLoop({
      baseUrl: url, apiKey: "k", model: "mock", task: "tulis file", cwd: dir,
      onApprove: async ({ preview }) => { previews.push(preview); return true; },
    });
    assert.equal(fs.readFileSync(path.join(dir, "hasil.txt"), "utf8"), "dari agent");
    assert.ok(result.checkpointId);
    assert.match(previews[0], /hasil\.txt/);
  } finally { server.close(); }
});

test("F5.5 streaming SSE: token mengalir & teks lengkap benar", async () => {
  const { server, url } = await mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"Halo "}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"dunia"}}]}\n\n');
      res.end("data: [DONE]\n\n");
    });
  });
  try {
    const tokens = [];
    const full = await chatCompletionStream({
      baseUrl: url, apiKey: "k", model: "mock",
      messages: [{ role: "user", content: "hi" }],
      onToken: (t) => tokens.push(t),
    });
    assert.equal(full, "Halo dunia");
    assert.deepEqual(tokens, ["Halo ", "dunia"]);
  } finally { server.close(); }
});
