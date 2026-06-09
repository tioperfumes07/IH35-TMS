#!/usr/bin/env node
/** CLOSURE-20 CI guard — A11Y audit artifacts present. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-closure-20-a11y-artifacts";
const REQUIRED = [
  "docs/audits/A11Y-AUDIT-2026-06-05.md",
  "scripts/a11y-axe-walk.mjs",
  "scripts/a11y-keyboard-nav.mjs",
  "scripts/a11y-screen-reader-checks.mjs",
  "scripts/a11y-color-contrast.mjs",
  "scripts/verify-a11y-no-critical-violations.mjs",
  ".github/workflows/a11y-checks.yml",
  ".block-ready/CLOSURE-20-A11Y-AUDIT.json",
];
for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAIL missing ${rel}`);
    process.exit(1);
  }
}
console.log(`[${LABEL}] PASS (${REQUIRED.length} artifacts)`);
