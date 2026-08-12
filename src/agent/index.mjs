// ─────────────────────────────────────────────────────────────
// Agent system — define agents & delegate tasks (parallel/chain)
// Terinspirasi OpenCode/ByNara: subagent = context terisolasi
// ─────────────────────────────────────────────────────────────

/**
 * Definisi agen bawaan aicutad.
 * Setiap agen punya: role, systemPrompt, model preference, tools.
 */
export const BUILTIN_AGENTS = [
  {
    name: "cutad-build",
    role: "orchestrator",
    description: "Implementasi fitur, bugfix, refactor. Agen orkestrator utama.",
    systemPrompt: "Kamu adalah cutad-build, agen orkestrator. Tugasmu mengimplementasikan fitur, memperbaiki bug, dan refactor kode. Pecah tugas kompleks jadi langkah kecil. Delegasikan ke subagent bila perlu.",
    model: null, // pakai model default
    tools: ["file", "terminal", "search"],
  },
  {
    name: "cutad-architect",
    role: "architect",
    description: "Desain sistem, ADR, dekomposisi komponen. Read-only.",
    systemPrompt: "Kamu adalah cutad-architect. Rancang arsitektur sistem, tulis ADR, uraikan komponen. Jangan edit kode — cuma analisis & rekomendasi.",
    model: null,
    tools: ["file", "search"],
  },
  {
    name: "cutad-review",
    role: "reviewer",
    description: "Code review multi-aspek (security, perf, API, tests). Tidak memperbaiki.",
    systemPrompt: "Kamu adalah cutad-review. Lakukan code review menyeluruh: security, performance, API design, test coverage. Beri temuan terstruktur, jangan fix kode.",
    model: null,
    tools: ["file", "search"],
  },
  {
    name: "cutad-debug",
    role: "debugger",
    description: "Root-cause debugging 4 fase (reproduce, isolate, fix, verify).",
    systemPrompt: "Kamu adalah cutad-debug. Debug dengan 4 fase: (1) reproduce, (2) isolate root cause, (3) fix, (4) verify. Dokumentasikan setiap fase.",
    model: null,
    tools: ["file", "terminal", "search"],
  },
  {
    name: "cutad-plan",
    role: "planner",
    description: "Rencana implementasi terstruktur. Tidak edit kode.",
    systemPrompt: "Kamu adalah cutad-plan. Buat rencana implementasi dengan tugas bite-sized. Sertakan file yang terdampak, urutan, dan risiko. Jangan edit kode.",
    model: null,
    tools: ["file", "search"],
  },
  {
    name: "cutad-search",
    role: "researcher",
    description: "Riset evidence-first dengan citations.",
    systemPrompt: "Kamu adalah cutad-search. Lakukan riset dengan evidence dan citations. Bandingkan library, dokumentasi, migration guide.",
    model: null,
    tools: ["search"],
  },
  {
    name: "cutad-fe",
    role: "frontend",
    description: "Frontend UI/UX (React, Vue, Svelte, CSS, Tailwind, a11y).",
    systemPrompt: "Kamu adalah cutad-fe. Kerjakan tugas frontend: komponen, styling, responsif, aksesibilitas. Fokus pada React, Vue, Svelte, CSS/Tailwind.",
    model: null,
    tools: ["file", "terminal", "search"],
  },
  {
    name: "cutad-droid",
    role: "android",
    description: "Native Android (Kotlin, Gradle, Compose, Room, Hilt).",
    systemPrompt: "Kamu adalah cutad-droid. Kerjakan tugas Android native: Kotlin, Jetpack Compose, Gradle, Room, Hilt, ADB. Bantu build failure & release.",
    model: null,
    tools: ["file", "terminal", "search"],
  },
];

/**
 * Dapatkan agen berdasarkan nama.
 * @param {string} name
 * @returns {object|null}
 */
export function getAgent(name) {
  return BUILTIN_AGENTS.find((a) => a.name === name) || null;
}

/**
 * Daftar semua agen.
 * @returns {object[]}
 */
export function listAgents() {
  return BUILTIN_AGENTS;
}

/**
 * Daftar agen berdasarkan role.
 * @param {string} role
 * @returns {object[]}
 */
export function agentsByRole(role) {
  return BUILTIN_AGENTS.filter((a) => a.role === role);
}

// ─────────────────────────────────────────────────────────────
// Delegation engine
// ─────────────────────────────────────────────────────────────

/**
 * Jalankan satu agen dengan prompt.
 * @param {object} agent definisi agen
 * @param {string} task prompt tugas
 * @param {object} ctx {baseUrl, apiKey, model, previous?}
 * @returns {Promise<string>} hasil agen
 */
export async function runAgent(agent, task, ctx) {
  const { chatCompletion } = await import("../api.mjs");
  const prompt = ctx.previous
    ? `${task}\n\n--- Konteks dari langkah sebelumnya ---\n${ctx.previous}`
    : task;

  const messages = [
    { role: "system", content: agent.systemPrompt },
    { role: "user", content: prompt },
  ];

  const model = agent.model || ctx.model;
  return chatCompletion({
    baseUrl: ctx.baseUrl,
    apiKey: ctx.apiKey,
    model,
    messages,
  });
}

/**
 * Delegasi paralel: beberapa agen jalankan tugas masing-masing sekaligus.
 * @param {{agent, task}[]} tasks daftar tugas
 * @param {object} ctx context
 * @returns {Promise<{agent, task, result, error}[]>}
 */
export async function delegateParallel(tasks, ctx) {
  const results = await Promise.allSettled(
    tasks.map(async ({ agent: agentName, task }) => {
      const agent = getAgent(agentName);
      if (!agent) throw new Error(`Agent tidak dikenal: ${agentName}`);
      const result = await runAgent(agent, task, ctx);
      return { agent: agentName, task, result };
    })
  );
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { agent: "?", task: "?", error: r.reason?.message || String(r.reason) }
  );
}

/**
 * Delegasi berantai: agen A → B → C, output A jadi input B.
 * @param {{agent, task}[]} chain urutan langkah
 * @param {object} ctx context
 * @returns {Promise<{agent, result}[]>}
 */
export async function delegateChain(chain, ctx) {
  const out = [];
  let previous = null;
  for (const step of chain) {
    const agent = getAgent(step.agent);
    if (!agent) throw new Error(`Agent tidak dikenal: ${step.agent}`);
    const result = await runAgent(agent, step.task, { ...ctx, previous });
    out.push({ agent: step.agent, result });
    previous = result;
  }
  return out;
}
