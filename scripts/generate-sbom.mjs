#!/usr/bin/env node
// Generate SBOM (Software Bill of Materials) format CycloneDX JSON
// dari package-lock.json. Dipakai untuk compliance corporate:
// inventaris dependensi + lisensi yang bisa diaudit.
// Output: sbom.cyclonedx.json (atau argumen pertama sebagai path).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const components = [];
for (const [key, info] of Object.entries(lock.packages || {})) {
  if (!key || !key.startsWith("node_modules/")) continue;
  const name = key.split("node_modules/").pop();
  components.push({
    type: "library",
    name,
    version: info.version || "0.0.0",
    purl: `pkg:npm/${name}@${info.version || "0.0.0"}`,
    ...(info.license ? { licenses: [{ license: { id: info.license } }] } : {}),
    scope: info.dev ? "optional" : "required",
  });
}
components.sort((a, b) => a.name.localeCompare(b.name));

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: "application",
      name: pkg.name,
      version: pkg.version,
      purl: `pkg:npm/${pkg.name}@${pkg.version}`,
    },
  },
  components,
};

const out = process.argv[2] || path.join(root, "sbom.cyclonedx.json");
fs.writeFileSync(out, JSON.stringify(sbom, null, 2) + "\n");
console.log(`SBOM ditulis: ${out} (${components.length} komponen)`);
