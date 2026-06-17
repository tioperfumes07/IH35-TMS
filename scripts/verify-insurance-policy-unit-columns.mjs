#!/usr/bin/env node
// Guard: insurance.policy_unit has NO is_active column — soft-delete state is
// removed_at (active = removed_at IS NULL). A raw policy_unit.is_active reference
// caused Postgres 42703 → 500 on the insurance dashboard ("Failed to load widgets").
// Fixed in #1011; this locks it so it can never regress.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = "apps/backend/src/insurance";
const failures = [];

function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { scan(full); continue; }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
    const src = readFileSync(full, "utf8");
    // Raw policy_unit alias .is_active (pu.is_active) or policy_unit.is_active — the column
    // does not exist. (Computed `(removed_at IS NULL) AS is_active` is fine and allowed.)
    if (/\bpu\.is_active\b/.test(src) || /policy_unit\.is_active/.test(src)) {
      failures.push(`${full}: references non-existent policy_unit.is_active — use removed_at`);
    }
    // A SELECT of is_active directly FROM insurance.policy_unit (not aliased from removed_at).
    if (/FROM\s+insurance\.policy_unit[\s\S]{0,200}?\bis_active\b(?!\s*$)/i.test(src) &&
        !/removed_at IS NULL\)\s*AS is_active/i.test(src)) {
      // Allow only when it's the computed alias; otherwise flag.
      if (!/\(removed_at IS NULL\) AS is_active/.test(src)) {
        failures.push(`${full}: selects is_active from insurance.policy_unit (column missing) — derive from removed_at`);
      }
    }
  }
}
scan(DIR);

if (failures.length) {
  console.error("verify:insurance-policy-unit-columns — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:insurance-policy-unit-columns — OK (no raw policy_unit.is_active; removed_at is the soft-delete column)");
