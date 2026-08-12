// Lapisan komunikasi dengan gateway OpenAI-compatible (cutad.web.id)
import { authHeaders } from "./config.mjs";
import { REQUEST_TIMEOUT_MS } from "./constants.mjs";

/**
 * Fetch ke gateway dengan timeout.
 */
async function gatewayFetch(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
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
