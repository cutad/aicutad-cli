# Berkontribusi ke aicutad-cli

Terima kasih sudah berkontribusi. Standar proyek ini mengikuti praktik
engineering corporate agar kualitasnya konsisten.

## Prasyarat

- Node.js >= 22.12
- `npm ci --ignore-scripts` untuk install persis dari lockfile

## Alur kerja

1. Fork/clone, buat branch dari `main`: `feat/...`, `fix/...`, `docs/...`
2. Tulis kode + test. Setiap perbaikan bug wajib disertai test regresi.
3. Jalankan gerbang kualitas lokal (sama persis dengan CI):

   ```bash
   npm run check     # lint + test + audit
   npm run coverage  # coverage dengan ambang minimum
   ```

4. Buka Pull Request memakai template PR. CI harus hijau:
   lint, test, coverage, audit, syntax, smoke CLI.
5. Minimal 1 review sebelum merge. Squash-merge diutamakan.

## Standar kode

- ESM murni (`.mjs`), tanpa transpiler.
- `npx eslint` bersih (konfigurasi di `eslint.config.js`).
- Penulisan file yang menyentuh data user wajib atomik
  (pakai `src/fs-utils.mjs`).
- Eksekusi proses eksternal wajib tanpa string shell bila argumen
  berasal dari model/user (pakai array argumen).
- Jangan mencatat API key, isi file, atau prompt ke log/telemetry.

## Commit

Pesan commit ringkas bergaya conventional commits:
`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.

## Keamanan

Kerentanan jangan dilaporkan lewat issue publik. Lihat `SECURITY.md`.

## Rilis

Rilis dilakukan maintainer dari tag `vX.Y.Z` (lihat workflow Publish).
Perubahan penting dicatat di `CHANGELOG.md` mengikuti
[Keep a Changelog](https://keepachangelog.com/).
