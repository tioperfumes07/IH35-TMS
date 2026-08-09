#!/usr/bin/env node
/**
 * Static guard: Factoring UI must not imply historical backfill / retroactive QBO write-back,
 * and must not present raw ISO or locale-dependent dates.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FACTORING_DIR = path.join(ROOT, "apps/frontend/src/pages/factoring");
const files = fs.readdirSync(FACTORING_DIR).filter((f) => f.endsWith(".tsx"));
const errors = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(FACTORING_DIR, file), "utf8");
  if (/historical|backfill|retroactive|bulk import|import all|sync historical/i.test(content)) {
    errors.push(`${file} contains historical/backfill/retroactive wording`);
  }
  if (/\.toLocaleString\(\)|\.toLocaleDateString\(\)/.test(content)) {
    errors.push(`${file} renders raw locale-dependent date string`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: Factoring pages use forward-only chrome with no historical/backfill language or raw locale dates");
process.exit(0);
