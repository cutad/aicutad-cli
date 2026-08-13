// ─────────────────────────────────────────────────────────────
// Context window management — summarize old messages
//
// Saat conversation terlalu panjang (melebihi threshold token),
// pesan lama di-summarize untuk hemat context window.
//
// Strategi:
// 1. Estimasi token per message (~4 chars = 1 token)
// 2. Jika total > threshold (default 80% dari context window):
//    - Simpan system prompt + pesan N terakhir
//    - Summarize sisanya jadi 1 pesan "ringkasan"
// 3. Gateway dipangai untuk summarization (model sendiri)
// ─────────────────────────────────────────────────────────────
import os from "node:os";

const DEFAULT_CONTEXT_WINDOW = 128000;
const SUMMARIZE_THRESHOLD = 0.8; // 80% dari context window
const KEEP_RECENT = 6; // simpan 6 pesan terakhir (3 user + 3 assistant)
const CHARS_PER_TOKEN = 4; // estimasi kasar

/**
 * Estimasi jumlah token dari string.
 * ~4 chars per token (heuristik kasar untuk mixed text+code).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const str = typeof text === "string" ? text : JSON.stringify(text);
  return Math.ceil(str.length / CHARS_PER_TOKEN);
}

/**
 * Estimasi total token dari array messages.
 */
export function estimateMessageTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    if (msg.content) total += estimateTokens(msg.content);
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function?.arguments || "");
      }
    }
  }
  return total;
}

/**
 * Cek apakah perlu summarize.
 */
export function needsSummarize(messages, contextWindow = DEFAULT_CONTEXT_WINDOW) {
  const total = estimateMessageTokens(messages);
  return total > contextWindow * SUMMARIZE_THRESHOLD;
}

/**
 * Summarize pesan lama jadi 1 ringkasan.
 * Pakai model sendiri untuk summarization via gateway.
 *
 * @param {Array} messages - array pesan lengkap
 * @param {object} opts - { baseUrl, apiKey, model, contextWindow }
 * @returns {Promise<Array>} messages baru dengan ringkasan
 */
export async function summarizeContext(messages, opts = {}) {
  const { baseUrl, apiKey, model, contextWindow = DEFAULT_CONTEXT_WINDOW } = opts;

  if (messages.length <= KEEP_RECENT + 1) return messages; // +1 for system

  // Pisahkan: system prompt + pesan lama + pesan terbaru
  const systemMsg = messages[0];
  const oldMessages = messages.slice(1, messages.length - KEEP_RECENT);
  const recentMessages = messages.slice(-KEEP_RECENT);

  // Build text untuk summarize
  const conversationText = oldMessages
    .map((m) => {
      if (m.role === "tool") return `[Tool result: ${(m.content || "").slice(0, 200)}...]`;
      if (m.role === "assistant" && m.tool_calls) {
        return `[Assistant used tools: ${m.tool_calls.map((tc) => tc.function?.name).join(", ")}]`;
      }
      return `${m.role}: ${(m.content || "").slice(0, 500)}`;
    })
    .join("\n");

  // Request summarization ke gateway
  const summary = await requestSummary(baseUrl, apiKey, model, conversationText);

  // Bangun messages baru: system + ringkasan + recent
  const summaryMsg = {
    role: "system",
    content: `Ringkasan percakapan sebelumnya:\n${summary}\n\nIni adalah ringkasan otomatis. Pesan terakhir dari user/AI ada di bawah.`,
  };

  return [systemMsg, summaryMsg, ...recentMessages];
}

/**
 * Request summarization ke gateway.
 */
async function requestSummary(baseUrl, apiKey, model, text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Ringkas percakapan berikut dalam 3-5 kalimat. Fokus pada: tugas yang diberikan, tool yang dipakai, hasil yang didapat, dan keputusan yang dibuat. Jawab ringkas dalam bahasa yang sama dengan percakapan.",
          },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Fallback: simple truncation
      return `[Summarization gagal (${res.status}). Percakapan sebelumnya berisi ${text.length} chars.]`;
    }

    const text2 = await res.text();
    try {
      const json = JSON.parse(text2);
      return json?.choices?.[0]?.message?.content || "[Ringkasan tidak tersedia.]";
    } catch {
      // Balanced brace extraction
      const start = text2.indexOf("{");
      if (start >= 0) {
        let depth = 0, inStr = false, esc = false;
        for (let i = start; i < text2.length; i++) {
          const ch = text2[i];
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
            if (depth === 0) {
              const json = JSON.parse(text2.slice(start, i + 1));
              return json?.choices?.[0]?.message?.content || "[Ringkasan tidak tersedia.]";
            }
          }
        }
      }
      return "[Ringkasan tidak tersedia.]";
    }
  } catch (e) {
    return `[Summarization error: ${e.message}]`;
  } finally {
    clearTimeout(timeout);
  }
}
