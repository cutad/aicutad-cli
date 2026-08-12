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
  const json = await res.json();
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

  const json = await res.json();
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
