# AI CUTAD CLI — `aicutad-cli`

> AI coding agent CLI premium yang terhubung ke gateway AI **cutad.web.id**
> (OpenAI‑compatible `/v1`).

Desainnya khas, modern, dan **100% berbeda** dari CLI sejenis — gradient warna
teal‑to‑violet, ASCII banner, panel rapi, dan spinner saat kerja.

## Persyaratan

- **Node.js ≥ 18** (disarankan ≥ 22)

## Instalasi (global)

```bash
npm install -g .
# atau setelah di-publish ke registry:
npm install -g aicutad-cli
```

→ menyediakan command `aicutad`.

## Memulai (wizard interaktif)

Jalankan `aicutad` begitu saja — pertama kali akan membawa kamu ke **setup wizard**:

```bash
aicutad
```

Wizard akan:
1. Minta **API key** (tersembunyi `***`) dan **memvalidasinya** ke gateway
2. Tampilkan daftar **model** untuk dipilih (pakai ↑/↓ + Enter)
3. Simpan konfigurasi ke `~/.cutad`
4. Tanya mau langsung masuk mode chat

Setelah setup, `aicutad` langsung membuka **mode chat interaktif**.

### Login / konfigurasi manual

```bash
aicutad login            # ulangi wizard (ganti API key / model)
aicutad status           # cek status login & model
aicutad models           # daftar semua model
aicutad logout           # hapus kredensial lokal
```

### Chat

```bash
aicutad chat "jelaskan apa itu closure di javascript"
aicutad chat "buatkan function untuk fetch data di node" --model <nama-model>
```

Tanpa prompt, `aicutad chat` masuk **mode interaktif**:

```bash
aicutad chat
  you▸ tulis fungsi fibonacci di python
  AI CUTAD def fib(n): ...
```

## Perintah

| Command | Deskripsi |
|---|---|
| `aicutad login` | Simpan API key (opsional `--base <url>`) |
| `aicutad status` | Status login + jumlah model |
| `aicutad logout` | Hapus kredensial lokal |
| `aicutad models` | Daftar model di gateway |
| `aicutad chat [prompt...]` | Kirim pesan / mode interaktif |
| `aicutad --version`, `--help` | Info |

## Konfigurasi

Disimpan di **`~/.cutad/auth.json`**:

```json
{
  "apiKey": "sk-...",
  "baseUrl": "https://ai.cutad.web.id/v1",
  "site": "https://ai.cutad.web.id",
  "model": "<default-model>"
}
```

Variabel lingkungan (override):

| Env | Fungsi |
|---|---|
| `CUTAD_API_KEY` | API key untuk login non-interaktif |
| `CUTAD_BASE` | Base URL gateway (default `https://ai.cutad.web.id/v1`) |
| `CUTAD_MODEL` | Model default |

## Struktur project

```
aicutad-cli/
├── bin/cutad.mjs        # entrypoint (Commander)
├── src/
│   ├── api.mjs          # komunikasi gateway (models + chat)
│   ├── chat.mjs         # chat sebagai REPL
│   ├── commands.mjs     # login / status / logout
│   ├── config.mjs       # baca/tulis ~/.cutad/auth.json
│   ├── constants.mjs    # konstanta & URL default
│   ├── models.mjs       # daftar model
│   └── ui.mjs           # UI toolkit premium (gradient/panel/spinner)
├── package.json
└── README.md
```

## License

MIT
