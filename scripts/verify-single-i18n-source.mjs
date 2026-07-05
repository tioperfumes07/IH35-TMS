#!/usr/bin/env node
/**
 * verify-single-i18n-source
 *
 * G8-2 regression guard. The frontend app must have exactly ONE canonical
 * translation directory (`apps/frontend/src/i18n/locales/`) loaded by the
 * single init in `apps/frontend/src/i18n/index.ts`.
 *
 * History: the app previously carried TWO live translation directories
 * (`i18n/locales/` loaded by `index.ts` and `i18n/translations/` loaded by a
 * second wrapper `i18n/i18n.ts`). A string updated in one dir was not reflected
 * where the other was imported, producing stale-Spanish drift. They were merged
 * into `locales/` and the duplicate removed. This guard fails CI if a second
 * translation directory or a second init wrapper reappears.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const I18N_DIR = path.join(ROOT, "apps/frontend/src/i18n");
const CANONICAL_LOCALES_DIR = path.join(I18N_DIR, "locales");

const errors = [];

// 1. The canonical locales directory must exist.
if (!fs.existsSync(CANONICAL_LOCALES_DIR)) {
  errors.push(
    `Missing canonical translation directory: apps/frontend/src/i18n/locales/`,
  );
}

// 2. No second (banned) translation directory may exist alongside it.
const BANNED_DIRS = ["translations", "locale", "lang", "messages"];
for (const name of BANNED_DIRS) {
  const candidate = path.join(I18N_DIR, name);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    errors.push(
      `Banned second translation directory found: apps/frontend/src/i18n/${name}/ ` +
        `— merge its strings into apps/frontend/src/i18n/locales/ and remove it ` +
        `(single source of truth, see G8-2).`,
    );
  }
}

// 3. There must be exactly one init file (index.ts). A second init wrapper
//    (e.g. the old i18n.ts) is what caused the drift; ban it.
const BANNED_INIT_FILES = ["i18n.ts", "i18n.tsx", "config.ts"];
for (const name of BANNED_INIT_FILES) {
  const candidate = path.join(I18N_DIR, name);
  if (fs.existsSync(candidate)) {
    errors.push(
      `Banned second i18n init/wrapper file found: apps/frontend/src/i18n/${name} ` +
        `— all init must live in index.ts (single source of truth, see G8-2).`,
    );
  }
}

// 4. No source file may import from a second translation dir or the old wrapper.
const BANNED_IMPORT_SUBSTRINGS = ["i18n/translations", "i18n/i18n"];
function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
}
const srcDir = path.join(ROOT, "apps/frontend/src");
const files = [];
if (fs.existsSync(srcDir)) walk(srcDir, files);
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const banned of BANNED_IMPORT_SUBSTRINGS) {
    // Match only in import/require specifiers to avoid false positives in comments.
    const re = new RegExp(`(?:from|require\\()\\s*["'][^"']*${banned.replace("/", "\\/")}["']`);
    if (re.test(text)) {
      errors.push(
        `${path.relative(ROOT, file)} imports the deprecated "${banned}" path ` +
          `— import the canonical i18n init from apps/frontend/src/i18n (index.ts) instead.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("verify-single-i18n-source: FAIL");
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(
  "verify-single-i18n-source: PASS — one canonical translation dir (i18n/locales) and one init (index.ts).",
);
