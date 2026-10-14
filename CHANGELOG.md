# Changelog

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

### Pengujian & CI

- Test suite beneran di `test/` (35 test: executor, agent loop dengan mock gateway, config, session/MCP/provider, reliability) dijalankan via `npm test`.
- CI sekarang memakai `npm ci` (gagal bila lockfile tidak sinkron) dan menjalankan test di Node 22 & 24.

## 0.4.8

- Rilis sebelumnya (lihat riwayat git).
