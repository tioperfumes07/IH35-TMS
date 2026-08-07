#!/usr/bin/env node
/**
 * GUARD: verify-pre-commit.mjs must filter out undefined default exports from
 * verify-step files to prevent TypeError crashes when a step file has no default export.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const FILE = resolve(ROOT, "scripts/verify-pre-commit.mjs");

const src = readFileSync(FILE, "utf8");

if (!src.includes(".filter(Boolean)")) {
  console.error(
    "FAIL: verify-pre-commit.mjs does not filter undefined step exports.\n" +
    "Without .filter(Boolean), a verify-step file with no default export crashes the pre-commit."
  );
  process.exit(1);
}

console.log("PASS: verify-pre-commit.mjs filters undefined step exports");
