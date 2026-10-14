import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeTool } from "../src/agent/executor.mjs";
import { loadPolicy, checkToolPolicy } from "../src/policy.mjs";
import { isTelemetryEnabled, trackEvent } from "../src/telemetry.mjs";
import { hasProxyEnv } from "../src/proxy.mjs";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-corp-"));
}

test("policy: deniedTools memblokir run_command", async () => {
  const dir = tmpdir();
  const policy = { deniedTools: ["run_command"], _source: "test" };
  const out = await executeTool("run_command", { command: "echo hi" }, dir, { policy });
  assert.match(out, /dilarang oleh policy/);
});

test("policy: allowedTools whitelist menolak tool di luar daftar", async () => {
  const dir = tmpdir();
  const policy = { allowedTools: ["read_file"], _source: "test" };
  const out = await executeTool("write_file", { path: "x.txt", content: "y" }, dir, { policy });
  assert.match(out, /allowedTools/);
  assert.equal(fs.existsSync(path.join(dir, "x.txt")), false);
});

test("policy: workspaceOnly menolak path di luar workspace", async () => {
  const dir = tmpdir();
  const outside = path.join(os.tmpdir(), "di-luar-workspace.txt");
  const policy = { workspaceOnly: true, _source: "test" };
  const out = await executeTool("write_file", { path: outside, content: "y" }, dir, { policy });
  assert.match(out, /workspaceOnly/);
  const inside = await executeTool("write_file", { path: "di-dalam.txt", content: "y" }, dir, { policy });
  assert.match(inside, /File ditulis/);
});

test("policy: file .aicutad/policy.json di proyek terbaca", () => {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, ".aicutad"));
  fs.writeFileSync(path.join(dir, ".aicutad", "policy.json"), JSON.stringify({ deniedTools: ["run_command"] }));
  const policy = loadPolicy(dir);
  assert.ok(policy);
  assert.deepEqual(policy.deniedTools, ["run_command"]);
  assert.equal(checkToolPolicy(policy, "read_file", { path: "a" }, dir), null);
});

test("policy: tanpa file policy -> null (perilaku default longgar)", () => {
  assert.equal(loadPolicy(tmpdir()), null);
});

test("telemetry: mati secara default, hanya nyala dengan opt-in eksplisit", () => {
  assert.equal(isTelemetryEnabled({}), false);
  assert.equal(isTelemetryEnabled({ CUTAD_TELEMETRY: "1" }), false); // tanpa URL
  assert.equal(isTelemetryEnabled({ CUTAD_TELEMETRY: "1", CUTAD_TELEMETRY_URL: "https://t.example/x" }), true);
  assert.equal(trackEvent("test_event", {}, {}), false); // tidak mengirim apa pun
});

test("proxy: deteksi env proxy", () => {
  assert.equal(hasProxyEnv({}), false);
  assert.equal(hasProxyEnv({ HTTPS_PROXY: "http://proxy.corp:8080" }), true);
  assert.equal(hasProxyEnv({ http_proxy: "http://proxy.corp:8080" }), true);
});

test("audit log: eksekusi tool tercatat TANPA isi file", async () => {
  const dir = tmpdir();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-audit-home-"));
  // audit-log memakai CONFIG_DIR dari constants (HOME proses). Kita hanya
  // memastikan modulnya berfungsi lewat env proses saat ini: jalankan tool
  // lalu cek file audit di CONFIG_DIR aktual.
  const { AUDIT_FILE, readAuditLog } = await import("../src/audit-log.mjs");
  const marker = `audit-marker-${Date.now()}`;
  await executeTool("write_file", { path: `${marker}.txt`, content: "ISI RAHASIA FILE" }, dir);
  assert.equal(fs.existsSync(AUDIT_FILE), true, `audit file harus ada: ${AUDIT_FILE} home=${home}`);
  const entries = readAuditLog(20);
  const mine = entries.filter((e) => JSON.stringify(e.args).includes(marker));
  assert.ok(mine.length >= 1);
  assert.ok(!JSON.stringify(entries).includes("ISI RAHASIA FILE"), "isi file tidak boleh masuk audit log");
  const mode = fs.statSync(AUDIT_FILE).mode & 0o777;
  assert.equal(mode, 0o600);
});
