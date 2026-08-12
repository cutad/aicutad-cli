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
];

/** Daftar nama tool. */
export const TOOL_NAMES = TOOLS.map((t) => t.function.name);
