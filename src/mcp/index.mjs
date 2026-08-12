// ─────────────────────────────────────────────────────────────
// MCP client — connect ke MCP servers, tool mapping
// Menggunakan @modelcontextprotocol/sdk
// Config MCP server di ~/.cutad/mcp.json
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../constants.mjs";

const MCP_FILE = path.join(CONFIG_DIR, "mcp.json");

/** Baca config MCP. */
export function readMcpConfig() {
  try {
    return JSON.parse(fs.readFileSync(MCP_FILE, "utf8"));
  } catch {
    return { servers: {} };
  }
}

/** Simpan config MCP. */
export function writeMcpConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(MCP_FILE, JSON.stringify(config, null, 2));
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
    env: { ...process.env, ...server.env },
  });

  const client = new Client({
    name: "aicutad-cli",
    version: "0.2.0",
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
