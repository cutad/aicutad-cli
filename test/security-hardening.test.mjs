import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let session, auditMod, browserMod, mcpMod, executor, doctorMod;

before(async () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-sec-"));
  process.env.HOME = fakeHome;
  session = await import("../src/session/index.mjs");
  auditMod = await import("../src/audit-log.mjs");
  browserMod = await import("../src/agent/browser.mjs");
  mcpMod = await import("../src/mcp/index.mjs");
  executor = await import("../src/agent/executor.mjs");
  doctorMod = await import("../src/doctor.mjs");
});

function tmpWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-ws-"));
}

test("traversal: session ID ../ ditolak di load/delete/export", () => {
  assert.equal(session.isValidSessionId("../../auth"), false);
  assert.equal(session.isValidSessionId("a/b"), false);
  assert.equal(session.isValidSessionId("2026-01-01T00-00-00-abc1"), true);
  assert.equal(session.loadSession("../../auth"), null);
  assert.equal(session.deleteSession("../../auth"), false);
  assert.equal(session.exportSession("../../auth", path.join(os.tmpdir(), "x.json")), false);
});

test("traversal: delete session yang tidak ada -> false", () => {
  assert.equal(session.deleteSession("2099-01-01T00-00-00-zzzz"), false);
});

test("workspaceOnly: symlink ke luar workspace ditolak", async () => {
  const ws = tmpWorkspace();
  const outsideDir = tmpWorkspace();
  fs.writeFileSync(path.join(outsideDir, "secret.txt"), "rahasia");
  fs.symlinkSync(outsideDir, path.join(ws, "link-keluar"), "dir");
  const policy = { workspaceOnly: true, _source: "test" };
  const out = await executor.executeTool(
    "read_file",
    { path: "link-keluar/secret.txt" },
    ws,
    { policy },
  );
  assert.match(out, /workspaceOnly/);
});

test("workspaceOnly: run_command ditolak kecuali diizinkan eksplisit", async () => {
  const ws = tmpWorkspace();
  const policy = { workspaceOnly: true, _source: "test" };
  const blocked = await executor.executeTool("run_command", { command: "echo halo" }, ws, { policy });
  assert.match(blocked, /workspaceOnly menolak run_command/);
  const allowed = await executor.executeTool(
    "run_command",
    { command: "echo halo" },
    ws,
    { policy: { ...policy, allowRunCommandInWorkspaceOnly: true } },
  );
  assert.match(allowed, /halo/);
});

test("audit log: redaksi secret di command", () => {
  const fakeKey = ["cag_", "x".repeat(20)].join("");
  const redacted = auditMod.redactSecrets(`curl -H "Authorization: Bearer abcdef1234567890" https://x.test/?api_key=zzz123 dan key=${fakeKey}`);
  assert.doesNotMatch(redacted, /abcdef1234567890/);
  assert.doesNotMatch(redacted, /zzz123/);
  assert.match(redacted, /REDACTED/);
});

test("browser: skema non-http(s) ditolak", () => {
  assert.throws(() => browserMod.assertBrowsableUrl("file:///etc/passwd"), /ditolak/);
  assert.throws(() => browserMod.assertBrowsableUrl("data:text/html,hi"), /ditolak/);
  assert.throws(() => browserMod.assertBrowsableUrl("bukan-url"), /tidak valid/);
  assert.equal(browserMod.assertBrowsableUrl("https://example.com/a"), "https://example.com/a");
});

test("mcp env: rahasia induk tidak diteruskan, env eksplisit menang", () => {
  const parent = {
    PATH: "/usr/bin",
    HOME: "/home/x",
    CUTAD_API_KEY: ["cag_", "rahasia"].join(""),
    OPENAI_API_KEY: ["sk-", "rahasia"].join(""),
    MY_TOKEN_SECRET: "rahasia",
  };
  const env = mcpMod.buildMcpEnv({ MY_TOKEN_SECRET: "sengaja-untuk-server-ini" }, parent);
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.CUTAD_API_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.MY_TOKEN_SECRET, "sengaja-untuk-server-ini");
});

test("destructive: rm -r -f dan rm -r terpisah terdeteksi", () => {
  assert.equal(executor.isDestructiveCommand("rm -r -f /tmp/x"), true);
  assert.equal(executor.isDestructiveCommand("rm -r /tmp/x"), true);
  assert.equal(executor.isDestructiveCommand("rm --recursive /tmp/x"), true);
  assert.equal(executor.isDestructiveCommand("rm file-biasa.txt"), false);
  assert.equal(executor.isDestructiveCommand("ls -la"), false);
});

test("checkpoint: ID traversal ditolak", async () => {
  const cp = await import("../src/agent/checkpoint.mjs");
  assert.equal(cp.isValidCheckpointId("../../etc"), false);
  const r = cp.restoreCheckpoint("../../etc");
  assert.equal(r.ok, false);
});

test("doctor: nodeVersionOk", () => {
  assert.equal(doctorMod.nodeVersionOk("22.12.0"), true);
  assert.equal(doctorMod.nodeVersionOk("22.11.9"), false);
  assert.equal(doctorMod.nodeVersionOk("24.0.0"), true);
  assert.equal(doctorMod.nodeVersionOk("20.19.0"), false);
});

test("doctor: runDoctor offline menghasilkan checks tanpa fail untuk node", async () => {
  const { checks } = await doctorMod.runDoctor({ offline: true, argv: [] });
  const ids = checks.map((c) => c.id);
  for (const id of ["node", "version", "config-dir", "auth", "base-url", "gateway", "policy", "chromium"]) {
    assert.ok(ids.includes(id), `check ${id} ada`);
  }
  assert.equal(checks.find((c) => c.id === "gateway").status, "skip");
});
