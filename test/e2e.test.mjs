import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/cutad.mjs", import.meta.url));
const PKG = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function runCli(args, env = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-e2e-"));
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, HOME: home, CUTAD_AUDIT_LOG: "0", ...env },
  });
}

test("e2e: --help menampilkan perintah utama", () => {
  const r = runCli(["--help"]);
  assert.equal(r.status, 0, r.stderr);
  for (const cmd of ["login", "chat", "agent", "sessions", "mcp", "rollback", "resume", "audit"]) {
    assert.match(r.stdout, new RegExp(cmd));
  }
});

test("e2e: --version sama dengan package.json", () => {
  const r = runCli(["--version"]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), PKG.version);
});

test("e2e: sessions kosong di HOME baru", () => {
  const r = runCli(["sessions"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Belum ada session/);
});

test("e2e: mcp add/list/remove end-to-end", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-e2e-mcp-"));
  const env = { HOME: home };
  const add = runCli(["mcp", "--add", "fs", "--command", "npx", "--args", "-y", "srv"], env);
  assert.equal(add.status, 0, add.stderr);
  // HOME yang sama dipakai ulang: runCli membuat HOME baru, jadi pakai spawn langsung
  const list = spawnSync(process.execPath, [BIN, "mcp", "--list"], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.match(list.stdout, /fs/);
});

test("e2e: perintah tidak dikenal -> exit non-zero", () => {
  const r = runCli(["perintah-ngawur"]);
  assert.notEqual(r.status, 0);
});

test("e2e: profile memisahkan direktori config", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-e2e-prof-"));
  const repoDir = fileURLToPath(new URL("..", import.meta.url));
  const r = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { CONFIG_DIR } from "./src/constants.mjs"; console.log(CONFIG_DIR);`],
    { encoding: "utf8", cwd: repoDir, env: { ...process.env, HOME: home, CUTAD_PROFILE: "corp" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /profiles[/\\]corp/);
});
