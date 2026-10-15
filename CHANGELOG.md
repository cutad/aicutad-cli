# Changelog

## 0.5.2

- Perbaiki copy-paste di TUI: aktifkan bracketed-paste (mode 2004) dan tangani paste sebagai satu kesatuan. Paste multi-baris tidak lagi terkirim kepotong di baris pertama, paste panjang tidak lagi hilang/redraw per karakter, karakter Tab/ANSI/kontrol di isi paste disanitasi, dan marker paste yang terpotong antar-chunk tetap dikenali. Fallback untuk terminal tanpa bracketed-paste: newline di tengah chunk paste diperlakukan sebagai baris baru, bukan Enter. Input multi-baris ditampilkan dengan penanda ⏎ dan karakter UTF-8 yang terpotong antar-chunk tidak lagi rusak.

## 0.5.1

- TUI disamakan dengan mockup `docs/tui-corporate.png`: splash brand + meta persisten di layar non-compact, baris judul + jam di bawah separator, status bar satu warna mengikuti state dengan pemisah `|`, dan footer `TUI corporate: ...` di baris terakhir. Mode compact (< 72 kolom / layar pendek) tetap ringkas tanpa splash.
- Posisi jam, status, input, dan kursor disesuaikan dengan layout baru; test layout bertambah untuk `showSplash` / `showFooter` / `headerLines`.

## 0.5.0

Rilis stabilisasi & hardening besar-besaran.

### Breaking

- Node.js minimum naik ke **>= 22.12** (mengikuti Puppeteer 25). Node 18/20 tidak lagi didukung.

### Perbaikan kritis

- Fix crash agent (`ReferenceError: assistantMessage`) saat gateway tidak mengirim field `usage`. Cost tracking sekarang memakai estimasi token sebagai fallback.
- Fix **shell injection** di tool `search_files`: pattern sekarang diteruskan sebagai argumen `grep` tanpa shell, sehingga `$(...)`/backtick tidak dieksekusi. `node_modules`/`.git` juga dilewati saat pencarian.
- `package-lock.json` sinkron kembali; `npm ci` bekerja.

### Keandalan penulisan kode & sesi (baru)

- `write_file`/`edit_file` sekarang **atomik** (tulis temp + fsync + rename) dan **diverifikasi read-back** (sha256 dilaporkan ke model). Proses mati di tengah tidak meninggalkan file setengah jadi.
- Validasi argumen tool yang ketat: argumen hilang/salah tipe menghasilkan pesan error yang bisa dikoreksi model, bukan crash.
- `read_file` menolak file biner dan mendukung paginasi `offset`/`limit` untuk file besar.
- Session disimpan atomik dengan backup `.bak`; session korup otomatis recovery dari backup.
- Retry dengan backoff eksponensial untuk error transient gateway (HTTP 429/5xx, network) di agent loop maupun API biasa. Error permanen tidak di-retry.
- Ringkasan konteks tidak lagi memotong pasangan `tool_calls` -> `tool` result.
- Mode `aicutad agent` (CLI) sekarang menyimpan sesi sejak awal, bisa dilihat via `aicutad sessions`.
- System prompt agent mewajibkan verifikasi (syntax check/test) sebelum mengklaim selesai.

### Kontrak CLI

- `sessions --export <id> <path>` dan `--load <id>` sekarang benar-benar berfungsi (dulu tidak melakukan apa-apa).
- `mcp --add <name> --command <cmd> --args ...` sekarang benar-benar menambah server (dulu diabaikan).
- `chat --model` sekarang menang atas model tersimpan (dulu kebalik).
- Base URL dari login (`--base` custom) sekarang konsisten dipakai di semua perintah; prioritas: flag > env `CUTAD_BASE` > auth tersimpan > default.
- Versi tampil di TUI/CLI sekarang selalu dari `package.json` (`src/version.mjs`), tidak ada lagi string versi hardcode yang basi.
- Fix `provider` menghasilkan `site` yang salah (`slice(0, 3)` -> `"htt"`).

### Keamanan

- `~/.cutad/auth.json`, `providers.json`, `mcp.json`, dan file sesi ditulis dengan permission `0600` (direktori `0700`).
- Tool `run_command` memblokir pola destruktif (`rm -rf`, `curl | bash`, fork bomb, dll). Override eksplisit: `CUTAD_ALLOW_DESTRUCTIVE=1`.
- Browser tool memakai Chromium bawaan Puppeteer terlebih dahulu, fallback ke Chromium sistem (Linux/macOS/Windows); `page.waitForTimeout` yang sudah dihapus Puppeteer diganti timer internal.
- Dependensi diperbarui: Puppeteer 25, MCP SDK 1.32. `npm audit`: **0 vulnerabilities** (sebelumnya 14).

### Fase 5 — kemampuan kelas coding-agent

- **Auto-verifikasi oleh sistem** setelah `write_file`/`edit_file`: `.js/.mjs/.cjs` dicek `node --check`, `.json` di-parse, `.py` dicek `py_compile`. Syntax rusak langsung dilaporkan ke model sebagai error agar diperbaiki di iterasi yang sama — tidak lagi mengandalkan ketelitian model.
- **Approval + diff preview**: di terminal interaktif, aksi `write_file`/`edit_file`/`run_command` menampilkan preview (diff -/+) dan menunggu persetujuan `y/n/a`. `aicutad agent -y` untuk melewati prompt.
- **Checkpoint & rollback**: file yang akan diubah disnapshot dulu ke `~/.cutad/checkpoints/`. Pulihkan dengan `aicutad rollback <id>` (`--list` untuk daftar).
- **Resume sesi**: `aicutad resume <id>` membuka TUI dengan riwayat sesi tersebut sebagai konteks.
- **Streaming**: `aicutad chat` sekarang men-stream token SSE secara real-time (fallback otomatis bila gateway membalas JSON biasa).

### Pengujian & CI

- Test suite beneran di `test/` (59 test: executor, agent loop, config, session/MCP/provider, reliability, Fase 5, e2e, enterprise) dijalankan via `npm test`.
- CI sekarang memakai `npm ci` (gagal bila lockfile tidak sinkron) dan menjalankan test di Node 22 & 24.

### Fase 6 — Corporate / enterprise grade

- **Security & compliance**: `SECURITY.md` (kebijakan pelaporan + versi didukung), workflow CodeQL, Dependabot (npm + Actions), secret scanning (gitleaks), gate `npm audit` di CI, SBOM CycloneDX (`npm run sbom`, di-upload sebagai artefak CI & rilis).
- **Engineering quality**: ESLint flat config sebagai gate CI (23 temuan awal dibersihkan), coverage gate (~78% baris), test e2e CLI, perintah tidak dikenal sekarang error exit 1 (sebelumnya membuka TUI diam-diam).
- **Enterprise features**:
  - Profile config: `CUTAD_PROFILE=<name>` memisahkan config ke `~/.cutad/profiles/<name>/`.
  - Policy tool governance: `.aicutad/policy.json` / `~/.cutad/policy.json` dengan `allowedTools`, `deniedTools`, `workspaceOnly`.
  - Audit log JSONL `~/.cutad/audit.log` (`0600`, tanpa isi file/API key) + perintah `aicutad audit`.
  - Telemetry privacy-first: mati secara default, opt-in eksplisit, hanya metadata.
  - Proxy corporate `HTTP(S)_PROXY`/`NO_PROXY` via undici.
- **Governance & release**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, template issue/PR, publish npm dengan `--provenance` dan gerbang kualitas penuh sebelum rilis.

### Fase 7 — UI/UX corporate profesional

- Design system terminal (`src/tui/layout.mjs`): satu aksen warna, label teks (bukan emoji), keputusan layout responsif terpusat dan teruji.
- Menghormati `NO_COLOR`, `TERM=dumb`, `CUTAD_NO_ANIMATION`/`CUTAD_REDUCED_MOTION` di seluruh UI (termasuk palet TUI yang sebelumnya hardcode).
- Boot TUI diganti dari animasi berlapis (typewriter/progress/fade ±2 detik) menjadi splash statis singkat (~120ms).
- TUI responsif: mode compact untuk terminal <72 kolom (header ringkas, status dipangkas aman, modal selalu muat), pesan terminal terlalu kecil tetap jelas.
- Ikon emoji tool di TUI & CLI agent diganti label teks (`read/write/edit/run/...`).
- CLI UX: `--help` berisi contoh & environment, keluaran `--json` untuk `status`, `models`, `sessions`, `mcp`, `audit` (termasuk bentuk error JSON), cocok untuk skrip/CI.
- README & komentar kode dibersihkan dari bahasa marketing ("premium/immersive") menjadi deskripsi faktual.
- Terverifikasi dengan snapshot PTY pada 100, 48, dan 30 kolom: header tampil, 0 emoji, tidak ada kata "premium".

### Fase 8 — Audit A–Z & hardening lanjutan

- **Path traversal ditutup**: ID session (`load/delete/export`) dan ID checkpoint (`rollback`) divalidasi ketat; pola `../../auth` tidak lagi bisa keluar dari direktori penyimpanan.
- **Policy `workspaceOnly` diperkuat**: path divalidasi terhadap realpath (symlink ke luar workspace ditolak) dan `run_command` ditolak secara default (shell tidak bisa dikurung); opt-in sadar via `allowRunCommandInWorkspaceOnly`.
- **Audit log**: pola rahasia (Bearer token, API key, `ghp_*`, dsb) diredaksi sebelum dicatat; izin file dipaksa `0600` juga untuk file lama.
- **Browser agent**: hanya URL http/https (skema `file:`/`data:` ditolak, mencegah pembacaan file lokal); direktori screenshot mengikuti profile config aktif.
- **MCP**: kredensial env induk (API key/token/secret) tidak diteruskan ke subprocess server — hanya env eksplisit per-server; versi client mengikuti versi paket; config ditulis atomik `0600`.
- **Blokir destruktif diperkuat**: `rm -r`, `rm -r -f`, `rm --recursive` kini terdeteksi (sebelumnya hanya bentuk `-rf` gabungan).
- **CLI**: perintah baru `aicutad doctor` (diagnostik Node/config/kredensial/gateway/policy/Chromium, `--offline`/`--json`, exit 1 bila ada FAIL); `/logout` di TUI; `sessions --delete` & `mcp --connect` kini exit 1 saat target tidak ada; kesalahan tak tertangani tampil bersih tanpa stack trace.
- **Repo**: file `LICENSE` (MIT) ditambahkan; screenshot README diganti versi corporate; klaim roadmap provider/plugin diluruskan (modul internal, belum diekspos ke CLI); penulisan config provider/plugin atomik.
- 11 test regresi keamanan baru; total 76 test.

## 0.4.8

- Rilis sebelumnya (lihat riwayat git).
