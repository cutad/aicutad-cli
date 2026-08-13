<div align="center">

# aicutad-cli

**AI Coding Agent CLI** — baca, tulis, edit file & jalankan command shell otonom lewat terminal.

Ditenagai gateway [ai.cutad.web.id](https://ai.cutad.web.id) · OpenAI-compatible `/v1`

[![Version](https://img.shields.io/badge/version-0.4.0-cyan)]()
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-orange)]()
[![Deps](https://img.shields.io/badge/dependencies-3-teal)]()

</div>

---

## Apa itu?

**aicutad-cli** adalah AI coding agent yang jalan di terminal kamu. Bukan sekadar chat — ia **baca file, tulis kode, edit file, dan jalankan command shell sendiri** lewat agentic loop dengan function calling.

Kamu kasih tugas, agent bekerja otonom: baca → tulis → verifikasi → lapor.

```
$ aicutad agent "buat file hello.js berisi console.log hello world"

  aicutad-cli agent mode · v0.4.0
  model: deepseek-ai/deepseek-v4-pro  dir: /root/project
  ────────────────────────────────────────────────────────────
  › buat file hello.js berisi console.log hello world
  ────────────────────────────────────────────────────────────

  ⠋ berpikir…
  📝 Write (hello.js, 42 bytes)
  📝 Write ✓ (1 baris)
  📖 Read (hello.js)
  📖 Read ✓ (2 baris)
  ⚡ Run (node hello.js)
  ⚡ Run ✓ (2 baris)

  ────────────────────────────────────────────────────────────
  aicutad-cli selesai · 4 iterasi · 3 tools · 1.2s

  File hello.js berhasil dibuat & diverifikasi. Output: "Hello, World!"
```

## Instalasi

```bash
npm install -g aicutad-cli
```

Atau dari source:

```bash
git clone https://github.com/cutad/aicutad-cli.git
cd aicutad-cli
npm install -g .
```

**Persyaratan:** Node.js ≥ 18 (disarankan ≥ 22)

## Mulai Cepat

```bash
aicutad
```

Pertama kali jalankan, **setup wizard premium** muncul otomatis:

1. **Boot animation** — bordered window, typewriter logo, system info
2. **Masukkan API key** (input tersembunyi `••••••••`)
3. **Validasi koneksi** ke gateway (animated spinner)
4. **Pilih model** (arrow-key ↑/↓ selector, clean UI)
5. **Simpan konfigurasi** ke `~/.cutad/auth.json`
6. **Langsung masuk TUI** full-screen immersive

Setelah setup, `aicutad` langsung buka **TUI agent** — ketik tugas apa pun, agent kerjakan.

## Mode Agent

Setiap pesan di TUI = **agent**. Model selalu punya akses ke 6 tools:

| Tool | Icon | Fungsi |
|---|:---:|---|
| `read_file` | 📖 | Baca isi file |
| `write_file` | 📝 | Buat / overwrite file |
| `edit_file` | ✏️ | Find-and-replace di file |
| `list_files` | 📂 | Daftar file & direktori |
| `search_files` | 🔍 | Cari teks (regex) di kode |
| `run_command` | ⚡ | Jalankan command shell |
| `browse_page` | 🌐 | Buka URL di headless Chromium & ekstrak teks |
| `web_search` | 🔎 | Cari di Google, return 5 hasil teratas |
| `screenshot` | 📷 | Screenshot halaman web (PNG) |

**Alur agentic loop:**

```
User: "buat file fibonacci.js"
  → Model: write_file(fibonacci.js, ...)
  → Model: read_file(fibonacci.js)          // verifikasi
  → Model: run_command(node fibonacci.js)   // test
  → Model: lapor hasil ke user
```

Model memutuskan sendiri tool apa yang dipakai, berapa kali, dan kapan selesai. Maks 20 iterasi untuk safety.

## TUI Full-Screen

```
 aicutad-cli │ AI Coding Agent CLI v0.4.0          19:20:35
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ┌─ you 19:20
 │ ada apa di sini
 └─
 📂 List /tmp/project …
 📂 List ✓ file hello.js, file utils.js
 📖 Read /tmp/project/hello.js …
 📖 Read ✓ console.log('Hello, World!')
 ┌─ aicutad-cli 19:20
 │ Di direktori ada 2 file: hello.js dan utils.js.
 │ hello.js berisi console.log('Hello, World!').
 │ Mau aku apain?
 └─
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ● │ ready │ deepseek-ai/deepseek-v4-pro │ 6 pesan │ cutad   /help
 you ›
```

### Fitur TUI v0.4.0

- **Boot animation premium** — bordered window, typewriter logo, multi-step progress
- **Full-screen immersive** — alternate buffer, fokus hanya ke aicutad-cli
- **Glitch-free rendering** — debounced single-write frame, in-place clock update
- **Typing animation** — AI response muncul char-by-char
- **Interactive model picker** — arrow keys, modal overlay
- **Input history** — ↑/↓ arrows recall pesan sebelumnya
- **Keyboard shortcuts** — `Ctrl+L` clear, `Ctrl+S` save, `Tab` autocomplete
- **Modal overlays** — help, models, sessions, agents (centered bordered)
- **Live clock** — `HH:MM:SS` di header
- **Markdown rendering** — code blocks, bold, italic, headers, lists, blockquotes
- **Message timestamps** — `HH:MM` per message
- **Compact tool display** — inline 1-baris dengan icon + color + status
- **Status bar** — colored indicator (🟢 ready · 🟡 bekerja · 🔴 error)
- **Spinner animation** — braille dots, 100ms smooth

### Keyboard Shortcuts

| Key | Fungsi |
|---|---|
| `↑` / `↓` | History navigasi / model picker scroll |
| `Tab` | Autocomplete command |
| `Ctrl+L` | Clear screen |
| `Ctrl+S` | Save session |
| `Ctrl+C` | Keluar |
| `Esc` | Tutup modal |
| `Enter` | Kirim pesan |

### Command di TUI

| Command | Fungsi |
|---|---|
| `/help` | Tampilkan bantuan (modal overlay) |
| `/models` | Pilih model (interactive modal picker) |
| `/model <name>` | Ganti model langsung |
| `/agents` | Daftar subagent (modal overlay) |
| `/sessions` | Daftar session tersimpan (modal overlay) |
| `/save` | Simpan session |
| `/clear` | Bersihkan layar |
| `/exit` | Keluar |

## Command Line

```bash
# Agent otonom (CLI mode — output ke terminal)
aicutad agent "buat file utils.js berisi fungsi fibonacci"
aicutad agent "fix bug di app.js" --model deepseek-ai/deepseek-v4-pro --dir /path/to/project

# TUI full-screen (default)
aicutad

# Chat satu kali
aicutad chat "jelaskan apa itu closure"

# Chat interaktif (REPL)
aicutad chat

# Manajemen
aicutad login      # setup wizard premium
aicutad status     # cek status login + jumlah model
aicutad models     # daftar model dari gateway
aicutad agents     # daftar subagent
aicutad sessions   # daftar session tersimpan
aicutad mcp --list # daftar MCP server
aicutad logout     # hapus kredensial
```

## Subagent

8 subagent bawaan untuk tugas spesifik:

| Agent | Role | Deskripsi |
|---|---|---|
| `cutad-build` | orchestrator | Implementasi fitur, bugfix, refactor |
| `cutad-architect` | architect | Desain sistem, ADR, dekomposisi komponen |
| `cutad-review` | reviewer | Code review multi-aspek (security, perf, API) |
| `cutad-debug` | debugger | Root-cause debugging 4 fase |
| `cutad-plan` | planner | Rencana implementasi terstruktur |
| `cutad-search` | researcher | Riset evidence-first dengan citations |
| `cutad-fe` | frontend | Frontend UI/UX (React, Vue, Svelte, CSS) |
| `cutad-droid` | android | Native Android (Kotlin, Compose, Room, Hilt) |

## Session Management

Percakapan otomatis tersimpan di `~/.cutad/sessions/`:

```bash
aicutad sessions          # daftar semua session
```

Di TUI: `/save` untuk simpan manual, `/sessions` untuk lihat daftar.

## MCP Support

aicutad-cli mendukung [Model Context Protocol](https://modelcontextprotocol.io) untuk extend tools:

```bash
aicutad mcp --list                    # daftar MCP server
aicutad mcp --add <name>              # tambah MCP server
aicutad mcp --connect <name>          # connect & list tools
aicutad mcp --remove <name>           # hapus MCP server
```

Config MCP disimpan di `~/.cutad/mcp.json`.

## Konfigurasi

Disimpan di `~/.cutad/`:

```
~/.cutad/
├── auth.json         # API key, model, gateway
├── sessions/         # riwayat percakapan
├── providers.json    # multi-gateway config
├── mcp.json          # MCP server config
└── plugins.json      # plugin config
```

**auth.json:**

```json
{
  "apiKey": "cag_...",
  "baseUrl": "https://ai.cutad.web.id/v1",
  "site": "https://ai.cutad.web.id",
  "model": "deepseek-ai/deepseek-v4-pro"
}
```

**Environment variables** (override, untuk CI/non-interaktif):

| Env | Fungsi |
|---|---|
| `CUTAD_API_KEY` | API key (skip prompt input) |
| `CUTAD_MODEL` | Model default (skip selector) |
| `CUTAD_BASE` | Base URL gateway |

```bash
# Login non-interaktif (CI/CD)
CUTAD_API_KEY=cag_... CUTAD_MODEL=deepseek-ai/deepseek-v4-pro aicutad login
```

## Struktur Project

```
aicutad-cli/
├── bin/
│   └── cutad.mjs              # entrypoint (Commander, 8 subcommands)
├── src/
│   ├── tui/
│   │   └── App.mjs            # TUI native full-screen (ANSI, v0.4.0)
│   ├── agent/
│   │   ├── tools.mjs          # 6 tool definitions (function calling)
│   │   ├── executor.mjs       # eksekusi tool (read/write/edit/run)
│   │   ├── loop.mjs           # agentic loop (model ↔ tool, max 20 iter)
│   │   ├── run.mjs            # CLI entrypoint agent mode
│   │   └── index.mjs          # 8 subagent + delegate parallel/chain
│   ├── session/
│   │   └── index.mjs          # save/load/list/export/import
│   ├── mcp/
│   │   └── index.mjs          # MCP client (connect, list tools, call)
│   ├── provider/
│   │   └── index.mjs          # multi-gateway config & switching
│   ├── plugin/
│   │   └── index.mjs          # load external modules
│   ├── api.mjs                # gateway komunikasi (models + chat)
│   ├── chat.mjs               # REPL + TUI launcher
│   ├── commands.mjs           # login wizard premium / status / logout
│   ├── config.mjs             # baca/tulis auth
│   ├── constants.mjs          # URL & konstanta
│   ├── models.mjs             # daftar model
│   ├── prompt.mjs             # masked input + arrow selector (glitch-free)
│   └── ui.mjs                 # UI toolkit (banner, panel, spinner)
├── .github/workflows/
│   ├── ci.yml                 # CI test (Node 18/20/22)
│   └── publish.yml            # Auto-publish to npm on release
├── .gitignore
├── package.json
└── README.md
```

## Teknologi

- **Runtime:** Node.js ≥ 18 (ESM, zero native deps)
- **Gateway:** ai.cutad.web.id (OpenAI-compatible `/v1`)
- **Function calling:** OpenAI tools API (`tools` + `tool_choice: auto`)
- **TUI:** Native ANSI control codes (no React/Ink dependency)
- **Rendering:** Debounced single-write frame + in-place timer updates
- **Dependencies:** `commander` (CLI), `picocolors` (color), `@modelcontextprotocol/sdk` (MCP)
- **Package size:** 29.7 KB (3 deps only)

## Roadmap

### Done (v0.4.0)

- [x] TUI full-screen immersive (alternate buffer)
- [x] Boot animation premium (bordered window, typewriter, multi-step)
- [x] Agentic loop dengan function calling (9 tools)
- [x] **Context window management** — auto-summarize old messages
- [x] **Cost tracking** — token usage & estimasi biaya per session
- [x] **Headless browser tools** — Chromium (browse, search, screenshot)
- [x] Glitch-free rendering (debounced + in-place clock/spinner)
- [x] Typing animation (AI response char-by-char)
- [x] Interactive model picker (modal overlay, arrow keys)
- [x] Input history (↑/↓ arrows)
- [x] Keyboard shortcuts (Ctrl+L, Ctrl+S, Tab autocomplete)
- [x] Modal overlays (help, models, sessions, agents)
- [x] Live clock di header
- [x] Markdown rendering (code blocks, bold, italic, headers, lists)
- [x] Message timestamps
- [x] Session management (save/load/list)
- [x] 8 subagent + delegate parallel/chain
- [x] MCP client support
- [x] Multi-provider config
- [x] Plugin system
- [x] First-run wizard premium
- [x] CI/CD (GitHub Actions)
- [x] Login wizard dengan animated spinner & progress bar

### Next Priority

- [ ] **Publish to npm registry**
- [ ] **Streaming response (SSE)** — TUI shows answer token-by-token
- [ ] **GitHub PR integration** — auto create branch, commit, push, open PR

### Future

- [ ] Headless server + web interface
- [ ] Diff viewer in TUI (show file changes before apply)
- [ ] Multi-file editing in single tool call
- [ ] Voice input (TTS/STT integration)
- [ ] Custom tool plugins (user-defined tools)
- [ ] Model-specific routing (different models for different tasks)

## License

MIT © [cutad](https://github.com/cutad)
