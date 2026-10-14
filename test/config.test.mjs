import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// HOME harus diset SEBELUM modul config/constants dimuat (CONFIG_DIR
// dihitung dari os.homedir() saat import).
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aicutad-home-"));
process.env.HOME = fakeHome;
delete process.env.CUTAD_BASE;

let config;
before(async () => {
  config = await import("../src/config.mjs");
});

test("writeAuth: file auth.json permission 0600", () => {
  config.writeAuth({ apiKey: ["unit", "test", "key"].join("-"), model: "m1", baseUrl: "https://example.test/v1" });
  const file = path.join(fakeHome, ".cutad", "auth.json");
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600, `mode aktual ${mode.toString(8)}`);
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(saved.apiKey, ["unit", "test", "key"].join("-"));
  assert.equal(saved.model, "m1");
});

test("resolveBase: flag --base menang atas auth tersimpan", () => {
  const { BASE_URL } = config.resolveBase(["node", "aicutad", "--base", "https://flag.test/v1"]);
  assert.equal(BASE_URL, "https://flag.test/v1");
});

test("resolveBase: flag -b juga didukung", () => {
  const { BASE_URL } = config.resolveBase(["node", "aicutad", "-b", "https://short.test/v1"]);
  assert.equal(BASE_URL, "https://short.test/v1");
});

test("resolveBase: tanpa flag, pakai baseUrl tersimpan di auth.json", () => {
  const { BASE_URL } = config.resolveBase([]);
  assert.equal(BASE_URL, "https://example.test/v1");
});

test("resolveBase: env CUTAD_BASE menang atas auth tersimpan", () => {
  process.env.CUTAD_BASE = "https://env.test/v1";
  try {
    assert.equal(config.resolveBase([]).BASE_URL, "https://env.test/v1");
  } finally {
    delete process.env.CUTAD_BASE;
  }
});

test("resolveBase: trailing slash dibuang & SITE benar", () => {
  const { BASE_URL, SITE } = config.resolveBase(["--base", "https://x.test/v1/"]);
  assert.equal(BASE_URL, "https://x.test/v1");
  assert.equal(SITE, "https://x.test");
});

test("isAuthenticated & clearAuth", () => {
  assert.equal(config.isAuthenticated(), true);
  config.clearAuth();
  assert.equal(config.isAuthenticated(), false);
});
