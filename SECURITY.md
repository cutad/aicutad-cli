# Keamanan (Security Policy)

## Versi yang didukung

| Versi | Didukung |
| ----- | -------- |
| 0.5.x | Ya       |
| < 0.5 | Tidak (upgrade ke 0.5+, ada perbaikan keamanan kritis) |

## Melaporkan kerentanan

Jangan buka issue publik untuk kerentanan keamanan.

Laporkan secara privat ke maintainer melalui GitHub Security Advisories
("Report a vulnerability" di tab Security repo ini) atau email ke
maintainer yang tercantum di `package.json`.

Sertakan: deskripsi, langkah reproduksi, dampak, dan versi yang terdampak.
Target respons awal: 3 hari kerja. Target perbaikan untuk severity
critical/high: 14 hari kalender sejak laporan terkonfirmasi.

## Praktik keamanan proyek

- Dependensi diaudit di CI (`npm audit --audit-level=high` sebagai gate).
- CodeQL berjalan di setiap push/PR dan terjadwal mingguan.
- Dependabot membuka PR pembaruan dependensi & GitHub Actions mingguan.
- SBOM CycloneDX dapat dibuat dengan `npm run sbom`.
- File kredensial lokal (`~/.cutad/auth.json` dkk) ditulis `0600`;
  direktori config `0700`.
- Audit log eksekusi tool tersedia di `~/.cutad/audit.log` (JSONL, `0600`,
  tanpa isi file/API key), nonaktif dengan `CUTAD_AUDIT_LOG=0`.
- Telemetry mati secara default; aktif hanya dengan opt-in eksplisit
  `CUTAD_TELEMETRY=1` + `CUTAD_TELEMETRY_URL`.

## Untuk pengguna corporate

- Batasi tool agent dengan policy (`.aicutad/policy.json` atau
  `~/.cutad/policy.json`): `allowedTools`, `deniedTools`, `workspaceOnly`.
  `workspaceOnly` memvalidasi realpath (symlink keluar tetap ditolak) dan
  menolak `run_command` secara default karena shell tidak bisa dikurung ke
  workspace; izinkan sadar dengan `allowRunCommandInWorkspaceOnly: true`.
- Tools browser hanya membuka URL http/https (skema `file:` dll ditolak).
- Audit log meredaksi pola rahasia (Bearer token, API key) sebelum dicatat.
- Kredensial induk tidak diteruskan ke subprocess MCP server; yang diteruskan
  hanya env yang ditulis eksplisit di konfigurasi server tersebut.
- Periksa kesehatan instalasi kapan saja dengan `aicutad doctor`.
- Gunakan profile terpisah per lingkungan: `CUTAD_PROFILE=corp aicutad`.
- Command destruktif diblokir secara default; override hanya dengan
  `CUTAD_ALLOW_DESTRUCTIVE=1` secara sadar.
