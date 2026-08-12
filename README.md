<div align="center">

# AI CUTAD CLI

**AI Coding Agent CLI** — baca, tulis, edit file & jalankan command otonom lewat terminal.

Ditenagai gateway [ai.cutad.web.id](https://ai.cutad.web.id) · OpenAI-compatible `/v1`

[![Version](https://img.shields.io/badge/version-0.3.0-cyan)]()
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-orange)]()

</div>

---

## Apa itu?

**AI CUTAD** adalah agent coding yang jalan di terminal kamu. Bukan sekadar chat — ia **baca file, tulis kode, edit file, dan jalankan command shell sendiri** lewat agentic loop dengan function calling.

Kamu kasih tugas, agent bekerja otonom: baca → tulis → verifikasi → lapor.

```
$ aicutad agent "buat file hello.js berisi console.log hello world"

⚡ tool  write_file(hello.js, 42 bytes)
✓ result (1 baris)
⚡ tool  read_file(hello.js)
✓ result (2 baris)
⚡ tool  run_command(node hello.js)
✓ result (2 baris)

AI CUTAD selesai · 4 iterasi · 4 tool calls

File hello.js berhasil dibuat & diverifikasi. Output: "Hello, World!"
```

## Instalasi

```bash
npm install -g aicutad-cli
```

Atau dari source:

```bash
git clone https://github.com/rudiansyah1998/aicutad-cli.git
cd aicutad-cli
npm install -g .
```

**Persyaratan:** Node.js ≥ 18 (disarankan ≥ 22)

## Mulai Cepat

```bash
aicutad
```

Pertama kali jalankan, **setup wizard** muncul otomatis:

1. **Masukkan API key** (input tersembunyi `••••••••`)
2. **Validasi koneksi** ke gateway (animated spinner)
3. **Pilih model** (arrow-key ↑/↓ selector)
4. **Simpan konfigurasi** ke `~/.cutad/auth.json`
5. **Langsung masuk TUI** full-screen

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

**Alur agentic loop:**

```
User: "buat file fibonacci.js"
  → Model: write_file(fibonacci.js, ...)
  → Model: read_file(fibonacci.js)     // verifikasi
  → Model: run_command(node fibonacci.js)  // test
  → Model: lapor hasil ke user
```

Model memutuskan sendiri tool apa yang dipakai, berapa kali, dan kapan selesai. Maks 20 iterasi untuk safety.

## TUI Full-Screen

```
 ◆ AI CUTAD │ AI Coding Agent CLI v0.3.0
 ──────────────────────────────────────────────────────────────────
 ┌─ you
 │ ada apa di sini
 └─
 ┌─ 📂 List Files /tmp/project
 └─ menunggu eksekusi...
 ┌─ 📂 List Files selesai
 │ file  hello.js
 │ file  utils.js
 └─
 ┌─ 📖 Read File /tmp/project/hello.js
 └─ menunggu eksekusi...
 ┌─ 📖 Read File selesai
 │ console.log('Hello, World!')
 └─
 ┌─ AI CUTAD
 │ Di direktori ada 2 file: hello.js dan utils.js.
 │ hello.js berisi console.log('Hello, World!').
 │ Mau aku apain?
 └─
 ──────────────────────────────────────────────────────────────────
 ● │ ready │ muse-spark-1.2-contributor │ 6 pesan │ cutad
 you › ▎
```

**Fitur TUI:**
- Animated spinner (10-frame, 80ms) — halus tanpa flicker
- Tool boxes berwarna dengan icon per tool
- User messages: cyan border · AI responses: green border
- Status bar dengan colored indicator (🟢 ready · 🟡 bekerja · 🔴 error)
- Real-time tool count & iteration counter
- Alternate screen buffer (terminal asli tidak rusak)

**Command di TUI:**

| Command | Fungsi |
|---|---|
| `/help` | Tampilkan daftar perintah |
| `/models` | Daftar model dari gateway |
| `/model <name>` | Ganti model aktif |
| `/agents` | Daftar subagent tersedia |
| `/sessions` | Daftar session tersimpan |
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

# Manajemen
aicutad login      # setup wizard
aicutad status     # cek status login
aicutad models     # daftar model
aicutad agents     # daftar subagent
aicutad sessions   # daftar session tersimpan
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

## Konfigurasi

Disimpan di `~/.cutad/auth.json`:

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
│   └── cutad.mjs              # entrypoint (Commander)
├── src/
│   ├── tui/
│   │   └── App.mjs            # TUI native full-screen (ANSI)
│   ├── agent/
│   │   ├── tools.mjs          # 6 tool definitions (function calling)
│   │   ├── executor.mjs       # eksekusi tool (read/write/edit/run)
│   │   ├── loop.mjs           # agentic loop (model ↔ tool)
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
│   ├── commands.mjs           # login wizard / status / logout
│   ├── config.mjs             # baca/tulis auth
│   ├── constants.mjs          # URL & konstanta
│   ├── models.mjs             # daftar model
│   ├── prompt.mjs             # masked input + arrow selector
│   └── ui.mjs                 # UI toolkit (banner, panel, spinner)
├── .gitignore
├── package.json
└── README.md
```

## Teknologi

- **Runtime:** Node.js ≥ 18 (ESM, zero native deps)
- **Gateway:** ai.cutad.web.id (OpenAI-compatible `/v1`)
- **Function calling:** OpenAI tools API (`tools` + `tool_choice: auto`)
- **TUI:** Native ANSI control codes (no React/Ink dependency)
- **Dependencies:** `commander` (CLI), `picocolors` (color), `@modelcontextprotocol/sdk` (MCP)

## Roadmap

- [x] TUI full-screen dengan animated spinner & tool boxes
- [x] Agentic loop dengan function calling (6 tools)
- [x] Session management (save/load/list)
- [x] 8 subagent bawaan + delegate parallel/chain
- [x] MCP client support
- [x] Multi-provider config
- [x] Plugin system
- [ ] Streaming response (SSE) di TUI
- [ ] GitHub PR integration
- [ ] Headless server + web interface
- [ ] Publish ke npm registry

## License

MIT © [rudiansyah1998](https://github.com/rudiansyah1998)
