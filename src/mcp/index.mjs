// ─────────────────────────────────────────────────────────────
// MCP client — connect ke MCP servers, tool mapping
// Menggunakan @modelcontextprotocol/sdk
// Config MCP server di ~/.cutad/mcp.json
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../constants.mjs";
import { atomicWriteFileSync } from "../fs-utils.mjs";
import { VERSION } from "../version.mjs";

const MCP_FILE = path.join(CONFIG_DIR, "mcp.json");

/** Baca config MCP. */
export function readMcpConfig() {
  try {
    return JSON.parse(fs.readFileSync(MCP_FILE, "utf8"));
  } catch {
    return { servers: {} };
  }
}

/** Simpan config MCP (atomik, 0600; config bisa berisi env rahasia). */
export function writeMcpConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  atomicWriteFileSync(MCP_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  try { fs.chmodSync(MCP_FILE, 0o600); } catch {}
}

// Env induk yang TIDAK diteruskan ke subprocess MCP server: server adalah
// proses pihak ketiga, tidak perlu kredensial gateway user. Yang mau
// diteruskan harus ditulis eksplisit di env server pada mcp.json.
const BLOCKED_ENV_RE = /(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd|credential)/i;

export function buildMcpEnv(serverEnv = {}, parentEnv = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    if (BLOCKED_ENV_RE.test(key)) continue;
    if (/^(CUTAD_API_KEY|GH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)$/i.test(key)) continue;
    env[key] = value;
  }
  // env eksplisit per-server selalu menang (termasuk rahasia yang disengaja).
  return { ...env, ...serverEnv };
}

/**
 * Daftar MCP server terdaftar.
 * @returns {{name, command, args, env, enabled}[]}
 */
export function listMcpServers() {
  const { servers } = readMcpConfig();
  return Object.entries(servers).map(([name, cfg]) => ({
    name,
    command: cfg.command,
    args: cfg.args || [],
    env: cfg.env || {},
    enabled: cfg.enabled !== false,
  }));
}

/**
 * Tambah/update MCP server.
 * @param {string} name
 * @param {{command, args?, env?, enabled?}} config
 */
export function addMcpServer(name, config) {
  const cfg = readMcpConfig();
  cfg.servers = cfg.servers || {};
  cfg.servers[name] = {
    command: config.command,
    args: config.args || [],
    env: config.env || {},
    enabled: config.enabled !== false,
  };
  writeMcpConfig(cfg);
  return name;
}

/**
 * Hapus MCP server.
 * @param {string} name
 */
export function removeMcpServer(name) {
  const cfg = readMcpConfig();
  delete (cfg.servers || {})[name];
  writeMcpConfig(cfg);
  return true;
}

/**
 * Connect ke MCP server via stdio & list tools.
 * Menggunakan stdio transport dari MCP SDK.
 * @param {string} name nama server
 * @returns {Promise<{tools: object[], server: object}>}
 */
export async function connectMcpServer(name) {
  const servers = listMcpServers();
  const server = servers.find((s) => s.name === name);
  if (!server) throw new Error(`MCP server tidak ditemukan: ${name}`);
  if (!server.enabled) throw new Error(`MCP server dinonaktifkan: ${name}`);

  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    env: buildMcpEnv(server.env),
  });

  const client = new Client({
    name: "aicutad-cli",
    version: VERSION,
  }, {
    capabilities: {},
  });

  await client.connect(transport);
  const { tools } = await client.listTools();

  return { tools, client, transport };
}

/**
 * Panggil tool di MCP server.
 * @param {object} client instance MCP client
 * @param {string} toolName nama tool
 * @param {object} args argumen tool
 * @returns {Promise<object>} hasil tool
 */
export async function callMcpTool(client, toolName, args = {}) {
  return client.callTool({ name: toolName, arguments: args });
}

export { MCP_FILE };
