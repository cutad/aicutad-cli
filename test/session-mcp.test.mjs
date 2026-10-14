import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-home2-"));
process.env.HOME = fakeHome;

let session, mcp, provider;
before(async () => {
  session = await import("../src/session/index.mjs");
  mcp = await import("../src/mcp/index.mjs");
  provider = await import("../src/provider/index.mjs");
});

test("session: create/save/load/list/export/delete", () => {
  const s = session.createSession("model-x", "cutad");
  s.messages.push({ role: "user", content: "halo" });
  session.saveSession(s);

  const loaded = session.loadSession(s.id);
  assert.equal(loaded.model, "model-x");
  assert.equal(loaded.messages.length, 1);

  const list = session.listSessions();
  assert.equal(list.length, 1);
  assert.equal(list[0].messageCount, 1);

  const out = path.join(fakeHome, "export.json");
  assert.equal(session.exportSession(s.id, out), true);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).id, s.id);
  assert.equal(session.exportSession("tidak-ada", out), false);

  session.deleteSession(s.id);
  assert.equal(session.loadSession(s.id), null);
});

test("session: file tersimpan permission 0600", () => {
  const s = session.createSession("m", "cutad");
  session.saveSession(s);
  const file = path.join(fakeHome, ".cutad", "sessions", `${s.id}.json`);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("mcp: add/list/remove server", () => {
  mcp.addMcpServer("fs", { command: "npx", args: ["-y", "server-fs"] });
  const servers = mcp.listMcpServers();
  assert.equal(servers.length, 1);
  assert.equal(servers[0].name, "fs");
  assert.equal(servers[0].command, "npx");
  mcp.removeMcpServer("fs");
  assert.equal(mcp.listMcpServers().length, 0);
});

test("provider: syncToAuth menghasilkan site yang benar (regresi slice 0,3)", () => {
  provider.addProvider({ name: "custom", baseUrl: "https://gw.example/v1", apiKey: ["unit", "test", "key"].join("-") });
  provider.setActiveProvider("custom");
  provider.syncToAuth();
  const auth = JSON.parse(fs.readFileSync(path.join(fakeHome, ".cutad", "auth.json"), "utf8"));
  assert.equal(auth.site, "https://gw.example");
  assert.equal(auth.baseUrl, "https://gw.example/v1");
});
