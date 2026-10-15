import { test } from "node:test";
import assert from "node:assert/strict";
import { createPasteParser, sanitizePastedText, PASTE_START, PASTE_END } from "../src/tui/paste.mjs";

test("paste: bracketed paste multi-baris keluar utuh sebagai satu event", () => {
  const p = createPasteParser();
  const ev = p.push(PASTE_START + "baris 1\nbaris 2\nbaris 3" + PASTE_END);
  assert.deepEqual(ev, [{ type: "paste", text: "baris 1\nbaris 2\nbaris 3" }]);
  assert.equal(p.pasting, false);
});

test("paste: teks biasa di sekitar paste tetap berurutan", () => {
  const p = createPasteParser();
  const ev = p.push("halo " + PASTE_START + "dunia\nbaru" + PASTE_END + "!");
  assert.deepEqual(ev, [
    { type: "text", text: "halo " },
    { type: "paste", text: "dunia\nbaru" },
    { type: "text", text: "!" },
  ]);
});

test("paste: marker terpotong antar-chunk tetap dikenali", () => {
  const p = createPasteParser();
  assert.deepEqual(p.push("\x1b[20"), []);
  assert.equal(p.pasting, false);
  const ev = p.push("0~isi paste\x1b[20");
  assert.deepEqual(ev, []);
  assert.equal(p.pasting, true);
  const ev2 = p.push("1~selesai");
  assert.deepEqual(ev2, [
    { type: "paste", text: "isi paste" },
    { type: "text", text: "selesai" },
  ]);
});

test("paste: isi tidak bocor sebelum marker akhir datang", () => {
  const p = createPasteParser();
  const separuh = "x".repeat(5000);
  assert.deepEqual(p.push(PASTE_START + separuh), []);
  const ev = p.push(separuh + PASTE_END);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].text.length, 10000);
});

test("paste: tanpa bracket, teks biasa lolos apa adanya", () => {
  const p = createPasteParser();
  assert.deepEqual(p.push("ketik biasa"), [{ type: "text", text: "ketik biasa" }]);
});

test("sanitize: CRLF/CR jadi \\n, tab jadi spasi, kontrol & ANSI dibuang", () => {
  assert.equal(sanitizePastedText("a\r\nb\rc\td"), "a\nb\nc  d");
  assert.equal(sanitizePastedText("a\x1b[31mmerah\x1b[0m\x03\x7fb"), "amerahb");
  assert.equal(sanitizePastedText(null), "");
});
