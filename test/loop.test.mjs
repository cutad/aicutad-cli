import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runAgentLoop } from "../src/agent/loop.mjs";

async function mockServer(handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function jsonRes(res, obj, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

test("loop: respons TANPA usage tidak crash (regresi TDZ assistantMessage)", async () => {
  const { server, url } = await mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => jsonRes(res, {
      choices: [{ message: { role: "assistant", content: "Halo dari mock" }, finish_reason: "stop" }],
      // sengaja tanpa field usage
    }));
  });
  try {
    const result = await runAgentLoop({ baseUrl: url, apiKey: "***", model: "mock", task: "halo", cwd: "/tmp" });
    assert.equal(result.result, "Halo dari mock");
    assert.equal(result.iterations, 1);
    assert.equal(result.toolCalls, 0);
  } finally {
    server.close();
  }
});

test("loop: respons DENGAN usage tercatat di cost tracker", async () => {
  const { server, url } = await mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => jsonRes(res, {
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
  });
  try {
    const result = await runAgentLoop({ baseUrl: url, apiKey: "***", model: "mock", task: "halo", cwd: "/tmp" });
    assert.equal(result.result, "ok");
    assert.equal(result.cost.totalTokens, 15);
  } finally {
    server.close();
  }
});

test("loop: tool_calls dieksekusi lalu lanjut sampai stop", async () => {
  let call = 0;
  const { server, url } = await mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      call++;
      if (call === 1) {
        return jsonRes(res, {
          choices: [{
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "c1", type: "function", function: { name: "list_files", arguments: JSON.stringify({ path: "/tmp" }) } }],
            },
            finish_reason: "tool_calls",
          }],
        });
      }
      return jsonRes(res, {
        choices: [{ message: { role: "assistant", content: "selesai listing" }, finish_reason: "stop" }],
      });
    });
  });
  try {
    const result = await runAgentLoop({ baseUrl: url, apiKey: "***", model: "mock", task: "list /tmp", cwd: "/tmp" });
    assert.equal(result.result, "selesai listing");
    assert.equal(result.toolCalls, 1);
    assert.equal(result.iterations, 2);
  } finally {
    server.close();
  }
});

test("loop: HTTP 500 dari gateway -> return error, bukan throw/crash", async () => {
  const { server, url } = await mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => jsonRes(res, { error: "boom" }, 500));
  });
  try {
    const result = await runAgentLoop({ baseUrl: url, apiKey: "***", model: "mock", task: "halo", cwd: "/tmp" });
    assert.match(result.result, /Error/);
    assert.ok(result.error);
  } finally {
    server.close();
  }
});

test("loop: respons kosong (tanpa choices) -> pesan error rapi", async () => {
  const { server, url } = await mockServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => jsonRes(res, {}));
  });
  try {
    const result = await runAgentLoop({ baseUrl: url, apiKey: "***", model: "mock", task: "halo", cwd: "/tmp" });
    assert.match(result.result, /tidak memberikan respons/);
  } finally {
    server.close();
  }
});
