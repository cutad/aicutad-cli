// ─────────────────────────────────────────────────────────────
// Headless browser tool — Chromium via Puppeteer
//
// Agent bisa: buka URL, baca konten, screenshot, klik elemen,
// ekstrak teks, jalankan JavaScript di halaman.
//
// Pakai puppeteer-core + chromium-browser yang sudah terinstall.
// Tidak download Chromium tambahan — pakai yang sistem.
// ─────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const MAX_OUTPUT = 20000;
const SCREENSHOT_DIR = path.join(os.homedir(), ".cutad", "screenshots");
const NAV_TIMEOUT = 15000;

// Cache browser instance (keep alive between tool calls dalam 1 session)
let _browser = null;
let _lastActivity = 0;
const IDLE_TIMEOUT = 60000; // close browser after 60s idle

// Cari executable Chromium
function findChromium() {
  const paths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/local/bin/chromium",
    "/snap/bin/chromium",
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

/**
 * Lazy-load puppeteer (dynamic import).
 * Jika tidak tersedia, fallback ke curl.
 */
async function getPuppeteer() {
  try {
    const puppeteer = await import("puppeteer");
    return puppeteer.default || puppeteer;
  } catch {
    try {
      // Coba puppeteer-core
      const core = await import("puppeteer-core");
      return core.default || core;
    } catch {
      return null;
    }
  }
}

/**
 * Launch browser (atau reuse yang sudah ada).
 */
async function getBrowser() {
  const now = Date.now();

  // Reuse jika masih aktif
  if (_browser && now - _lastActivity < IDLE_TIMEOUT) {
    try {
      // Test jika browser masih hidup
      const pages = await _browser.pages();
      if (pages) {
        _lastActivity = now;
        return _browser;
      }
    } catch {
      _browser = null;
    }
  }

  // Close stale browser
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }

  const puppeteer = await getPuppeteer();
  if (!puppeteer) {
    throw new Error("Puppeteer tidak tersedia. Install: npm install puppeteer");
  }

  const execPath = findChromium();
  if (!execPath) {
    throw new Error("Chromium tidak ditemukan. Install: apt install chromium-browser");
  }

  _browser = await puppeteer.launch({
    executablePath: execPath,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--metrics-recording-only",
      "--disable-default-apps",
      "--no-default-browser-check",
    ],
  });

  _lastActivity = now;
  return _browser;
}

/**
 * Tutup browser (cleanup).
 */
export async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

function truncate(s, max = MAX_OUTPUT) {
  if (!s || s.length <= max) return s;
  return s.slice(0, max) + "\n... (output dipotong, total " + s.length + " chars)";
}

/**
 * Buka URL dan ekstrak konten teks.
 */
export async function browsePage(url, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    await page.setViewport({ width: opts.width || 1280, height: opts.height || 800 });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    // Tunggu sebentar untuk dynamic content
    if (opts.wait) {
      await page.waitForTimeout(Math.min(opts.wait, 5000));
    }

    // Ekstrak teks
    const title = await page.title();
    const text = await page.evaluate(() => {
      // Hapus script & style
      const remove = document.querySelectorAll("script, style, noscript, iframe");
      remove.forEach((el) => el.remove());
      return document.body ? document.body.innerText : "";
    });

    const result = {
      url: page.url(),
      title,
      text: truncate(text.trim(), 15000),
      chars: text.length,
    };

    return JSON.stringify(result, null, 2);
  } finally {
    await page.close();
    _lastActivity = Date.now();
  }
}

/**
 * Screenshot halaman.
 */
export async function screenshotPage(url, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    await page.setViewport({ width: opts.width || 1280, height: opts.height || 800 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    if (opts.wait) {
      await page.waitForTimeout(Math.min(opts.wait, 5000));
    }

    // Buat dir untuk screenshot
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const filename = "screenshot-" + Date.now() + ".png";
    const filepath = path.join(SCREENSHOT_DIR, filename);

    if (opts.fullPage) {
      await page.screenshot({ path: filepath, fullPage: true });
    } else {
      await page.screenshot({ path: filepath });
    }

    return "Screenshot disimpan: " + filepath + " (" + (opts.width || 1280) + "x" + (opts.height || 800) + ")";
  } finally {
    await page.close();
    _lastActivity = Date.now();
  }
}

/**
 * Klik elemen di halaman.
 */
export async function clickElement(url, selector, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    // Tunggu elemen muncul
    await page.waitForSelector(selector, { timeout: 10000 }).catch(() => {});
    await page.click(selector).catch((e) => {
      throw new Error("Tidak bisa klik '" + selector + "': " + e.message);
    });

    // Tunggu navigasi jika ada
    if (opts.waitNav) {
      await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
    }

    const title = await page.title();
    const text = await page.evaluate(() => {
      const remove = document.querySelectorAll("script, style");
      remove.forEach((el) => el.remove());
      return document.body ? document.body.innerText : "";
    });

    return JSON.stringify({
      url: page.url(),
      title,
      text: truncate(text.trim(), 10000),
      clicked: selector,
    }, null, 2);
  } finally {
    await page.close();
    _lastActivity = Date.now();
  }
}

/**
 * Jalankan JavaScript di halaman.
 */
export async function evalPage(url, jsCode, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    if (opts.wait) {
      await page.waitForTimeout(Math.min(opts.wait, 5000));
    }

    const result = await page.evaluate(jsCode);
    const str = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return truncate(str);
  } finally {
    await page.close();
    _lastActivity = Date.now();
  }
}

/**
 * Cari di Google dan return hasil.
 */
export async function searchWeb(query, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    const url = "https://www.google.com/search?q=" + encodeURIComponent(query);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    // Ekstrak hasil pencarian
    const results = await page.evaluate(() => {
      const items = [];
      const searchResults = document.querySelectorAll("div.g, div[data-sokoban-container] div");
      let count = 0;
      for (const item of searchResults) {
        if (count >= 5) break;
        const titleEl = item.querySelector("h3");
        const linkEl = item.querySelector("a[href]");
        const snippetEl = item.querySelector("div[data-sncf], div.VwiC3b, span.aCOpRe");
        if (titleEl && linkEl) {
          items.push({
            title: titleEl.textContent || "",
            url: linkEl.href || "",
            snippet: snippetEl ? snippetEl.textContent?.slice(0, 200) || "" : "",
          });
          count++;
        }
      }
      return items;
    });

    if (results.length === 0) {
      return "Tidak ada hasil ditemukan untuk: " + query;
    }

    const lines = results.map((r, i) =>
      `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
    );
    return truncate("Hasil pencarian untuk \"" + query + "\":\n\n" + lines.join("\n\n"));
  } finally {
    await page.close();
    _lastActivity = Date.now();
  }
}
