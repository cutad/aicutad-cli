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

## Memulai dalam 3 langkah

```bash
# 1. Login (sekali saja) — minta API key dari gateway
aicutad login

# Non-interaktif (cocok untuk CI/deploy):
CUTAD_API_KEY="sk-..." aicutad login

# 2. Cek status & daftar model
aicutad status
aicutad models

# 3. Mulai ngobrol
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
