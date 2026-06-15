#!/usr/bin/env node
/**
 * Static guard (INSURANCE-POLICY-UNIT-IS-ACTIVE-FIX):
 * insurance.policy_unit has NO `is_active` column — active state is `removed_at IS NULL`.
 * Referencing policy_unit.is_active throws Postgres 42703 → HTTP 500 (the create/units bug).
 *
 * This guard fails if any backtick SQL string under apps/backend/src that references
 * `policy_unit` uses `is_active` as a real column. The ONLY allowed form is the derived
 * alias `... AS is_active` (e.g. `(removed_at IS NULL) AS is_active`).
 *
 * Note: `is_active` is a legitimate column on OTHER tables (e.g. accounting.expenses),
 * so the check is scoped to SQL strings that mention policy_unit. Pure file-content; no DB.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "apps", "backend", "src");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(p)) out.push(p);
  }
  return out;
}

let failed = 0;
const violations = [];

for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  // Extract backtick template-literal strings (SQL lives in these).
  const templates = text.match(/`[^`]*`/g) || [];
  for (const tpl of templates) {
    if (!/policy_unit/.test(tpl)) continue;
    if (!/\bis_active\b/.test(tpl)) continue;
    // Allowed only as a derived alias: `... AS is_active`. Any other is_active token is a column ref.
    const stripped = tpl.replace(/\bAS\s+is_active\b/gi, "");
    if (/\bis_active\b/.test(stripped)) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      violations.push(rel);
    }
  }
}

if (violations.length) {
  console.error("verify-no-policy-unit-is-active: forbidden policy_unit.is_active SQL column reference (use `removed_at IS NULL`):");
  for (const v of [...new Set(violations)]) console.error(`  → ${v}`);
  failed = 1;
}

if (failed) process.exit(1);
console.log("verify-no-policy-unit-is-active: OK — no policy_unit.is_active column references (removed_at IS NULL is canonical).");
