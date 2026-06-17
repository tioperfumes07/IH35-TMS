#!/usr/bin/env node
// Guard (CASH-ANOMALY, auto projection): the daily-prediction opening-cash sum must
// exclude credit-card / line-of-credit accounts (their balances are debt, not cash).
// Counting them dragged opening cash to -$5.5M. Mirrors the manual-forecast guard
// verify:cash-forecast-opening-excludes-credit (#1072) for the auto source.
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const failures = [];

let src = "";
try {
  src = readFileSync(FILE, "utf8");
} catch {
  failures.push(`${FILE}: missing`);
}

if (src) {
  // Anchor on the opening-cash query's unique SQL (the is_credit sum), NOT the first
  // mention of bank_transactions (which appears in the file's header doc-comment).
  const idx = src.indexOf("CASE WHEN t.is_credit");
  const window = idx >= 0 ? src.slice(idx, idx + 500) : "";
  if (idx < 0) {
    failures.push(`${FILE}: opening-cash query (CASE WHEN t.is_credit ...) not found`);
  }
  if (!/banking\.bank_accounts/.test(window)) {
    failures.push(`${FILE}: opening-cash query must join banking.bank_accounts to classify accounts`);
  }
  if (!/NOT ILIKE '%credit%'/.test(window)) {
    failures.push(`${FILE}: opening-cash query must exclude credit accounts (NOT ILIKE '%credit%')`);
  }
}

if (failures.length) {
  console.error("verify:cash-flow-auto-opening-excludes-credit — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:cash-flow-auto-opening-excludes-credit — OK (auto opening cash excludes credit accounts)");
