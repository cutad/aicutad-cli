// Lapisan komunikasi dengan gateway OpenAI-compatible (cutad.web.id)
import { authHeaders } from "./config.mjs";
import { withRetry } from "./retry.mjs";
import { REQUEST_TIMEOUT_MS } from "./constants.mjs";

/**
 * Fetch ke gateway dengan timeout.
 */
async function gatewayFetchOnce(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function gatewayFetch(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  // Retry hanya aman untuk: error network, atau respons 429/5xx.
  // Body request berupa string sehingga aman diulang.
  return withRetry(async () => {
    const res = await gatewayFetchOnce(url, options, timeoutMs);
    if (res.status === 429 || res.status >= 500) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    return res;
  });
}

/**
 * Ekstrak objek JSON seimbang (balanced braces) pertama dari string.
 * Menangani object bertingkat (choices→message) dan trailing SSE `data: [DONE]`.
 * @param {string} text
 * @returns {string|null} substring JSON pertama yang seimbang, atau null
 */
function extractFirstJson(text) {
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { start = i; break; }
  }
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parsing toleran respons gateway.
 * Gateway cutad kadang mengekor `data: [DONE]` (jejak SSE) di belakang JSON penuh.
 * Kita ekstrak objek JSON pertama yang valid dan abaikan sisa trailing.
 * @returns {Promise<object>} objek JSON respons
 */
async function parseJson(res) {
  const text = await res.text();

  // 1) coba parse penuh dulu (perilaku standar)
  try {
    return JSON.parse(text);
  } catch {}

  // 2) ekstrak objek JSON seimbang pertama, coba parse
  const candidate = extractFirstJson(text);
  if (candidate) {
    try { return JSON.parse(candidate); } catch {}
  }

  // 3) balik error asli dengan cuplikan berisi posisi gagal
  throw new SyntaxError(`Respons bukan JSON valid. Cuplikan: ${JSON.stringify(text.slice(0, 500))}`);
}

/**
 * Mendapatkan daftar model dari gateway.
 * @returns {Promise<{id:string}[]>} daftar model
 */
export async function listModels(baseUrl, apiKey) {
  const res = await gatewayFetch(`${baseUrl}/models`, {
    headers: authHeaders({ apiKey }),
  });
  if (!res.ok) {
    throw new Error(`Gagal mengambil daftar model (HTTP ${res.status}): ${await safeText(res)}`);
  }
  const json = await parseJson(res);
  const data = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
  return data.map((m) => ({ id: m.id || m.model || String(m) }));
}

/**
 * Chat dengan STREAMING SSE (stream: true).
 * Token diteruskan ke onToken secepatnya saat tiba; fungsi mengembalikan
 * teks lengkapnya. Bila gateway membalas JSON biasa (bukan SSE),
 * parser fallback mengekstrak content seperti biasa.
 * @param {object} opts {baseUrl, apiKey, model, messages, temperature, max_tokens, onToken}
 * @returns {Promise<string>}
 */
export async function chatCompletionStream(opts) {
  const { onToken, ...rest } = opts;
  const { baseUrl, apiKey, model, messages, temperature = 0.7, max_tokens: maxTokens } = rest;
  const body = { model, messages, temperature, stream: true };
  if (maxTokens) body.max_tokens = maxTokens;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: authHeaders({ apiKey }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Chat gagal (HTTP ${res.status}): ${detail.slice(0, 500)}`);
    }
    if (!res.body) throw new Error("Respons streaming tidak memiliki body.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let sawSse = false;
    const handleLine = (line) => {
      const t = line.trim();
      if (!t.startsWith("data:")) return;
      sawSse = true;
      const data = t.slice(5).trim();
      if (!data || data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || "";
        if (delta) { full += delta; onToken?.(delta); }
      } catch {}
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
    }
    if (buffer.trim()) handleLine(buffer);
    if (!sawSse) {
      // Gateway tidak streaming: buffer berisi JSON utuh
      try {
        const json = JSON.parse(buffer || full);
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content === "string") { onToken?.(content); return content; }
      } catch {}
      if (!full) throw new Error("Respons model tidak memiliki content yang valid.");
    }
    return full;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mengirim chat ke gateway (OpenAI /v1/chat/completions).
 * @param {object} opts {baseUrl, apiKey, model, messages, temperature, max_tokens}
 * @returns {Promise<string>} isi konten jawaban
 */
export async function chatCompletion(opts) {
  const {
    baseUrl, apiKey, model, messages,
    temperature = 0.7, max_tokens: maxTokens,
  } = opts;

  const body = {
    model,
    messages,
    temperature,
  };
  if (maxTokens) body.max_tokens = maxTokens;

  const res = await gatewayFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders({ apiKey }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`Chat gagal (HTTP ${res.status}): ${detail}`);
  }

  const json = await parseJson(res);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Respons model tidak memiliki content yang valid.");
  }
  return content;
}

async function safeText(res) {
  try {
    const text = await res.text();
    return text.slice(0, 500);
  } catch {
    return "(tidak bisa membaca body)";
  }
}
