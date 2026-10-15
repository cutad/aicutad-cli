import { test } from "node:test";
import assert from "node:assert/strict";
import { getLayout, isColorEnabled, isReducedMotion, truncateText, buildContextBar } from "../src/tui/layout.mjs";

test("layout: terminal besar bukan compact", () => {
  const l = getLayout(120, 40);
  assert.equal(l.compact, false);
  assert.equal(l.showHints, true);
  assert.equal(l.showClock, true);
  assert.ok(l.modalWidth <= 76);
});

test("layout: terminal kecil compact & modal selalu muat", () => {
  const l = getLayout(40, 12);
  assert.equal(l.compact, true);
  assert.equal(l.showHints, false);
  assert.ok(l.modalWidth <= 36);
  assert.ok(l.modalWidth >= 20);
});

test("layout: terminal sangat sempit model label pendek", () => {
  const l = getLayout(30, 10);
  assert.equal(l.veryNarrow, true);
  assert.ok(l.modelMaxLength <= 14);
});

test("NO_COLOR menonaktifkan warna", () => {
  assert.equal(isColorEnabled({ NO_COLOR: "1" }, { isTTY: true }), false);
  assert.equal(isColorEnabled({ TERM: "dumb" }, { isTTY: true }), false);
  assert.equal(isColorEnabled({}, { isTTY: true }), true);
  assert.equal(isColorEnabled({}, { isTTY: false }), false);
  assert.equal(isColorEnabled({ FORCE_COLOR: "1" }, { isTTY: false }), true);
});

test("reduced motion dari env", () => {
  assert.equal(isReducedMotion({ CUTAD_NO_ANIMATION: "1" }), true);
  assert.equal(isReducedMotion({ CUTAD_REDUCED_MOTION: "" }), true);
  assert.equal(isReducedMotion({}), false);
});

test("layout: layar besar tampilkan splash persisten & footer (mockup)", () => {
  const l = getLayout(120, 40);
  assert.equal(l.showSplash, true);
  assert.equal(l.showFooter, true);
  assert.equal(l.headerLines, 5);
});

test("layout: compact tanpa splash persisten", () => {
  const l = getLayout(48, 24);
  assert.equal(l.compact, true);
  assert.equal(l.showSplash, false);
  const pendek = getLayout(120, 12);
  assert.equal(pendek.showSplash, false);
});

test("context bar: proporsi, clamp, lebar minimum", () => {
  assert.equal(buildContextBar(0), "░".repeat(10));
  assert.equal(buildContextBar(100), "█".repeat(10));
  assert.equal(buildContextBar(50), "█████░░░░░");
  assert.equal(buildContextBar(42), "████░░░░░░");
  assert.equal(buildContextBar(150), "█".repeat(10));
  assert.equal(buildContextBar(-5), "░".repeat(10));
  assert.equal(buildContextBar(50, 1).length, 3);
  assert.equal(getLayout(100, 30).showContextBar, true);
  assert.equal(getLayout(48, 30).showContextBar, false);
});

test("truncateText", () => {
  assert.equal(truncateText("abcdef", 4), "abc…");
  assert.equal(truncateText("abc", 4), "abc");
  assert.equal(truncateText(null, 4), "");
});
