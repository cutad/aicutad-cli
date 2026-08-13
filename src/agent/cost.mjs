// ─────────────────────────────────────────────────────────────
// Cost tracking — token usage & estimasi biaya per session
//
// Track:
// - Prompt tokens (input)
// - Completion tokens (output)
// - Total tokens
// - Estimasi biaya ($ per 1K token, default OpenAI pricing)
// - Durasi per API call
//
// Data disimpan di memory (per session), bisa di-save ke disk.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Default pricing per 1K tokens (estimasi, bisa di-override)
const DEFAULT_PRICING = {
  // format: { model_pattern: { input: 0.001, output: 0.002 } }
  // harga dalam USD per 1K token
  "default": { input: 0.0005, output: 0.0015 },
  "deepseek": { input: 0.00014, output: 0.00028 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "claude": { input: 0.003, output: 0.015 },
  "llama": { input: 0.0002, output: 0.0006 },
  "muse": { input: 0.0001, output: 0.0003 },
};

/**
 * Buat tracker kosong untuk session baru.
 */
export function createCostTracker() {
  return {
    calls: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    startTime: Date.now(),
  };
}

/**
 * Get pricing untuk model tertentu.
 */
function getPricing(model) {
  if (!model) return DEFAULT_PRICING.default;
  const lower = model.toLowerCase();
  for (const [pattern, price] of Object.entries(DEFAULT_PRICING)) {
    if (pattern !== "default" && lower.includes(pattern)) {
      return price;
    }
  }
  return DEFAULT_PRICING.default;
}

/**
 * Record satu API call.
 * @param {object} tracker - cost tracker object
 * @param {object} usage - { prompt_tokens, completion_tokens, total_tokens } dari API response
 * @param {string} model - nama model
 * @param {number} durationMs - durasi call dalam ms
 */
export function recordCall(tracker, usage, model, durationMs) {
  if (!usage || !tracker) return;

  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const totalTok = usage.total_tokens || (inputTokens + outputTokens);

  const pricing = getPricing(model);
  const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;

  tracker.calls.push({
    timestamp: Date.now(),
    model,
    inputTokens,
    outputTokens,
    totalTokens: totalTok,
    cost,
    durationMs: durationMs || 0,
  });

  tracker.totalInputTokens += inputTokens;
  tracker.totalOutputTokens += outputTokens;
  tracker.totalTokens += totalTok;
  tracker.totalCost += cost;
}

/**
 * Format angka biaya jadi string yang readable.
 */
export function formatCost(cost) {
  if (cost < 0.01) return "$" + cost.toFixed(6);
  if (cost < 1) return "$" + cost.toFixed(4);
  return "$" + cost.toFixed(2);
}

/**
 * Format token count dengan ribuan separator.
 */
export function formatTokens(n) {
  return n.toLocaleString("en-US");
}

/**
 * Generate summary string dari tracker.
 */
export function getCostSummary(tracker) {
  if (!tracker || tracker.calls.length === 0) {
    return null;
  }

  const elapsed = ((Date.now() - tracker.startTime) / 1000).toFixed(1);
  const avgDuration = tracker.calls.length > 0
    ? Math.round(tracker.calls.reduce((s, c) => s + c.durationMs, 0) / tracker.calls.length)
    : 0;

  return {
    calls: tracker.calls.length,
    inputTokens: tracker.totalInputTokens,
    outputTokens: tracker.totalOutputTokens,
    totalTokens: tracker.totalTokens,
    cost: tracker.totalCost,
    costFormatted: formatCost(tracker.totalCost),
    elapsedSeconds: elapsed,
    avgDurationMs: avgDuration,
  };
}

/**
 * Format summary jadi string untuk display.
 */
export function formatCostSummary(tracker) {
  const s = getCostSummary(tracker);
  if (!s) return "";
  return `${s.calls} calls · ${formatTokens(s.inputTokens)} in · ${formatTokens(s.outputTokens)} out · ${formatTokens(s.totalTokens)} total · ${s.costFormatted} · ${s.elapsedSeconds}s`;
}

/**
 * Save cost tracker ke disk.
 */
export function saveCostTracker(tracker, sessionId) {
  try {
    const dir = path.join(os.homedir(), ".cutad", "cost");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sessionId}.json`);
    fs.writeFileSync(file, JSON.stringify(tracker, null, 2));
    return file;
  } catch {
    return null;
  }
}
