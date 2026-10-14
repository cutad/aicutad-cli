// Single source of truth untuk versi: selalu dari package.json.
// Jangan hardcode string versi di file lain.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

export const VERSION = pkg.version;
export const PACKAGE_NAME = pkg.name;
