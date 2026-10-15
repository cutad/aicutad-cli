// ─────────────────────────────────────────────────────────────
// Bracketed paste untuk TUI.
//
// Terminal modern membungkus paste dengan \x1b[200~ ... \x1b[201~
// bila mode 2004 diaktifkan. Tanpa penanganan ini, newline pertama
// di teks paste ditafsirkan sebagai Enter (pesan terkirim kepotong)
// dan sisa paste hilang.
//
// Parser di sini stateful: marker yang terpotong di batas chunk
// (mis. "\x1b[20" di chunk ini, "0~..." di chunk berikutnya) tetap
// dikenali, dan isi paste dikeluarkan sebagai SATU event utuh.
// ─────────────────────────────────────────────────────────────

export const PASTE_START = "\x1b[200~";
export const PASTE_END = "\x1b[201~";

/** Normalisasi teks hasil paste agar aman masuk input satu field. */
export function sanitizePastedText(text) {
  let s = String(text ?? "");
  // Satukan semua bentuk newline ke \n
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Buang escape sequence ANSI (CSI / OSC / ESC tunggal) dari isi paste
  s = s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  s = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
  s = s.replace(/\x1b[@-Z\\-_]/g, "");
  // Tab -> 2 spasi (Tab di input berarti autocomplete, bukan karakter)
  s = s.replace(/\t/g, "  ");
  // Buang kontrol lain (termasuk \x00, \x03, \x7f) kecuali \n
  s = s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  return s;
}

/** Panjang suffix terpanjang dari `s` yang merupakan prefix dari `marker`. */
function partialSuffixLen(s, marker) {
  const max = Math.min(s.length, marker.length - 1);
  for (let len = max; len > 0; len--) {
    if (s.endsWith(marker.slice(0, len))) return len;
  }
  return 0;
}

/**
 * Buat parser paste stateful.
 * push(chunk) -> [{ type: "text" | "paste", text }]
 * - "text"  : input biasa, teruskan ke pemroses tombol.
 * - "paste" : isi paste utuh (sudah disanitasi), tambahkan ke input sekali.
 */
export function createPasteParser() {
  let mode = "text"; // "text" | "paste"
  let buf = "";

  function push(chunk) {
    buf += String(chunk ?? "");
    const events = [];

    for (;;) {
      if (mode === "text") {
        const at = buf.indexOf(PASTE_START);
        if (at === -1) {
          // Tahan suffix yang mungkin awal marker terpotong antar-chunk.
          const hold = partialSuffixLen(buf, PASTE_START);
          const emit = hold ? buf.slice(0, -hold) : buf;
          buf = hold ? buf.slice(-hold) : "";
          if (emit) events.push({ type: "text", text: emit });
          break;
        }
        if (at > 0) events.push({ type: "text", text: buf.slice(0, at) });
        buf = buf.slice(at + PASTE_START.length);
        mode = "paste";
        continue;
      }

      // mode === "paste": tunggu marker akhir utuh (isi tidak bocor per potong)
      const end = buf.indexOf(PASTE_END);
      if (end === -1) break; // simpan seluruh buf sampai marker akhir datang
      const raw = buf.slice(0, end);
      buf = buf.slice(end + PASTE_END.length);
      mode = "text";
      events.push({ type: "paste", text: sanitizePastedText(raw) });
    }
    return events;
  }

  return {
    push,
    get pasting() { return mode === "paste"; },
  };
}
