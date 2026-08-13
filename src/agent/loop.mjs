// ─────────────────────────────────────────────────────────────
// Agentic loop — jantung dari agent
//
// Alur:
// 1. User kasih tugas → kirim ke model dengan tools
// 2. Model balas: tool_calls? → eksekusi tool → kirim hasil ke model
// 3. Model balas: tool_calls lagi? → ulang
// 4. Model balas: content (finish_reason: stop) → selesai
//
// Max 20 iterasi untuk safety.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TOOLS } from "./tools.mjs";
import { executeTool } from "./executor.mjs";
import { needsSummarize, summarizeContext } from "./context.mjs";
import { createCostTracker, recordCall, getCostSummary, formatCostSummary } from "./cost.mjs";
import { closeBrowser } from "./browser.mjs";

const MAX_ITERATIONS = 20;
const AGENT_SYSTEM_PROMPT = `Kamu adalah aicutad-cli, agent coding otonom.

Kamu punya tools untuk membaca, menulis, mengedit file, menjalankan command shell, dan mencari di kode.

Cara kerjamu:
- Jika user bertanya/minta sesuatu yang butuh akses file atau command → gunakan tools
- Jika user cuma ngobrol/sapa/bertanya teori → jawab langsung tanpa tools
- Jangan bilang "aku tidak punya akses" — kamu PUNYA tools. Pakai!

Saat menulis/mengedit kode:
1. Baca file yang relevan dengan read_file atau list_files
2. Buat/edit dengan write_file atau edit_file
3. Verifikasi: baca ulang atau jalankan dengan run_command
4. Lapor ke user apa yang sudah dilakukan

Aturan:
- Selalu baca file sebelum edit (pastikan old_string unique & akurat)
- Jangan hapus file tanpa alasan jelas
- Jalankan command hanya yang relevan dengan tugas
- Jika error, perbaiki dan coba lagi
- Jawab dalam bahasa yang sama dengan user (Indonesia/Inggris)`;

/**
 * Jalankan agentic loop.
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.task - tugas dari user
 * @param {string} [opts.cwd] - working directory
 * @param {function} [opts.onToolCall] - callback saat tool dipanggil (name, args)
 * @param {function} [opts.onToolResult] - callback saat tool selesai (name, result)
 * @param {function} [opts.onThinking] - callback saat model thinking (content)
 * @param {function} [opts.onError] - callback saat error
 * @returns {Promise<{result, iterations, toolCalls}>}
 */
export async function runAgentLoop({
  baseUrl, apiKey, model, task, cwd,
  onToolCall, onToolResult, onThinking, onError, onCost, onSummarize,
}) {
  const workDir = cwd || process.cwd();
  const messages = [
    { role: "system", content: AGENT_SYSTEM_PROMPT + `\n\nWorking directory: ${workDir}\nOS: ${os.platform()} ${os.release()}\n\nKamu juga punya tools browser: browse_page (buka URL & baca teks), web_search (cari di Google), screenshot (ambil screenshot halaman).` },
    { role: "user", content: task },
  ];

  let iterations = 0;
  let toolCallCount = 0;
  let finalResult = "";
  const costTracker = createCostTracker();

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Context window management — summarize jika terlalu panjang
    if (needsSummarize(messages)) {
      onSummarize?.("Meringkas percakapan...");
      const before = messages.length;
      const summarized = await summarizeContext(messages, { baseUrl, apiKey, model });
      const after = summarized.length;
      if (after < before) {
        messages.length = 0;
        messages.push(...summarized);
        onSummarize?.(`Percakapan diringkas: ${before} → ${after} pesan`);
      }
    }

    // Kirim ke model dengan tools
    const callStart = Date.now();
    const response = await callModelWithTools(baseUrl, apiKey, model, messages);
    const callDuration = Date.now() - callStart;
    const choice = response?.choices?.[0];

    // Cost tracking — jika gateway tidak return usage, estimasi dari messages
    if (response?.usage) {
      recordCall(costTracker, response.usage, model, callDuration);
      onCost?.(getCostSummary(costTracker));
    } else {
      // Estimasi token dari request messages + response content
      const { estimateMessageTokens } = await import("./context.mjs");
      const estInput = estimateMessageTokens(messages);
      const estOutput = assistantMessage?.content
        ? Math.ceil(assistantMessage.content.length / 4)
        : 0;
      recordCall(costTracker, {
        prompt_tokens: estInput,
        completion_tokens: estOutput,
        total_tokens: estInput + estOutput,
      }, model, callDuration);
      onCost?.(getCostSummary(costTracker));
    }

    if (!choice) {
      const errMsg = "Model tidak memberikan respons.";
      onError?.(errMsg);
      await closeBrowser();
      return { result: errMsg, iterations, toolCalls: toolCallCount, cost: costTracker };
    }

    const assistantMessage = choice.message;

    // Jika ada content (thinking/hasil), simpan & notify
    if (assistantMessage.content) {
      onThinking?.(assistantMessage.content);
      finalResult = assistantMessage.content;
    }

    // Jika ada tool_calls → eksekusi & lanjut loop
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      });

      for (const toolCall of assistantMessage.tool_calls) {
        toolCallCount++;
        const funcName = toolCall.function.name;
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch (e) {
          args = { _parse_error: e.message, _raw: toolCall.function.arguments };
        }

        onToolCall?.(funcName, args);

        const result = await executeTool(funcName, args, workDir);

        onToolResult?.(funcName, result);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }

      continue;
    }

    // Tidak ada tool_calls → model selesai
    if (choice.finish_reason === "stop" || !assistantMessage.tool_calls) {
      if (!finalResult && !assistantMessage.content) {
        finalResult = "(Model tidak memberikan respons.)";
      }
      break;
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    finalResult += "\n\n(Berhenti setelah 20 iterasi — batas aman.)";
  }

  // Cleanup browser
  await closeBrowser();

  return {
    result: finalResult,
    iterations,
    toolCalls: toolCallCount,
    cost: costTracker,
    costSummary: formatCostSummary(costTracker),
  };
}

/**
 * Panggil model dengan tools (function calling).
 * Parsing toleran untuk trailing data: [DONE].
 */
async function callModelWithTools(baseUrl, apiKey, model, messages) {
  const body = {
    model,
    messages,
    tools: TOOLS,
    tool_choice: "auto",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2 menit

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const text = await res.text();

    // Parsing toleran (sama seperti api.mjs)
    try {
      return JSON.parse(text);
    } catch {}

    // Ekstrak JSON seimbang
    let start = text.indexOf("{");
    if (start === -1) throw new Error("Respons bukan JSON");
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
        if (depth === 0) {
          return JSON.parse(text.slice(start, i + 1));
        }
      }
    }

    throw new Error("JSON tidak bisa di-parse");
  } finally {
    clearTimeout(timeout);
  }
}
