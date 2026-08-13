// ─────────────────────────────────────────────────────────────
// Tool definitions — tools yang bisa dipakai agent
// Format OpenAI function calling: {type:"function", function:{...}}
// ─────────────────────────────────────────────────────────────

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Baca isi sebuah file. Return seluruh konten sebagai string.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relatif atau absolut ke file." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Tulis/membuat file baru atau overwrite file yang ada. Parent direktori dibuat otomatis.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path file yang akan ditulis." },
          content: { type: "string", description: "Isi lengkap file." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit file dengan find-and-replace. Cari old_string lalu ganti dengan new_string. Jika old_string tidak ditemukan, return error.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path file." },
          old_string: { type: "string", description: "Teks yang akan diganti (harus unique di file)." },
          new_string: { type: "string", description: "Teks pengganti." },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Daftar file & direktori di path tertentu. Return nama + tipe (file/dir).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Direktori yang ingin didaftar (default: cwd)." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Cari teks (regex) di dalam file-file di direktori tertentu. Return nama file + baris yang cocok.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Pattern regex yang dicari." },
          path: { type: "string", description: "Direktori pencarian (default: cwd)." },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Jalankan command shell. Return stdout, stderr, exit code. Timeout 60 detik.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command shell yang dijalankan." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_page",
      description: "Buka URL di headless browser (Chromium) dan ekstrak teks halaman. Berguna untuk baca dokumentasi, artikel, atau API response dari web.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL halaman yang ingin dibuka." },
          wait: { type: "number", description: "Tunggu X ms setelah load untuk dynamic content (default: 0, max: 5000)." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Cari di Google menggunakan headless browser. Return 5 hasil teratas dengan judul, URL, dan snippet.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Query pencarian." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screenshot",
      description: "Ambil screenshot halaman web. Simpan sebagai PNG file. Berguna untuk inspeksi visual.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL halaman yang ingin di-screenshot." },
          full_page: { type: "boolean", description: "Screenshot full page (default: false, hanya viewport)." },
        },
        required: ["url"],
      },
    },
  },
];

/** Daftar nama tool. */
export const TOOL_NAMES = TOOLS.map((t) => t.function.name);
