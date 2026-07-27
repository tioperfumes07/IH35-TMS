#!/usr/bin/env node
/**
 * C9 wire — equipment chips + load_type land in BookLoad payload; migrations present; budget 0.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function mustInclude(path, needle, label) {
  const text = readFileSync(join(root, path), "utf8");
  if (!text.includes(needle)) problems.push(`${label}: missing ${needle}`);
}

mustInclude(
  "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  "requires_straps: values.requires_straps",
  "BookLoad payload"
);
mustInclude(
  "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  "load_type: values.load_type",
  "BookLoad load_type"
);
mustInclude(
  "scripts/verify-form-field-roundtrip.mjs",
  "export const BLOCKED_BUDGET = 0",
  "C9 budget ratchet"
);
for (const f of [
  "db/migrations/202609170000_c9_book_load_fields.sql",
  "db/migrations/202609180000_c9_accident_wo_persist_columns.sql",
  "db/migrations/202609190000_c9_form_roundtrip_persist_columns.sql",
]) {
  if (!existsSync(join(root, f))) problems.push(`missing migration ${f}`);
}

if (process.argv.includes("--selftest")) {
  // Plant: budget must be 0 string; if we temporarily can't find BookLoad straps, fail.
  if (problems.length) {
    console.error("[verify-c9-form-fields-wired] SELFTEST unexpected problems:", problems);
    process.exit(1);
  }
  console.log("[verify-c9-form-fields-wired] SELFTEST PASS");
  process.exit(0);
}

if (problems.length) {
  console.error("[verify-c9-form-fields-wired] FAIL");
  for (const p of problems) console.error("  ✗", p);
  process.exit(1);
}
console.log("[verify-c9-form-fields-wired] PASS");
