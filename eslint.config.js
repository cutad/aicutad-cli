// ESLint flat config — standar corporate minimal tapi tegas.
// Fokus: bug nyata (unused, eqeqeq, unreachable) bukan gaya kosmetik.
export default [
  {
    ignores: ["node_modules/**", "coverage/**", "*.tgz"],
  },
  {
    files: ["bin/**/*.mjs", "src/**/*.mjs", "test/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        TextDecoder: "readonly",
        URL: "readonly",
        document: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "no-unreachable": "error",
      "no-duplicate-imports": "error",
      "no-async-promise-executor": "error",
      "require-atomic-updates": "off",
      "no-console": "off",
    },
  },
];
