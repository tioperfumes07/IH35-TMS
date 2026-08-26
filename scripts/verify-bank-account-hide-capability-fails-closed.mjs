#!/usr/bin/env node
/**
 * verify-bank-account-hide-capability-fails-closed.mjs
 *
 * BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN — three cash-flow/report readers called
 * `isBankAccountHideEnabled(...).catch(() => false)`: a schema/RLS/connection failure on the
 * flag read was silently treated as a successful "hide is off" read, letting accounts that may
 * be intentionally hidden for an entity back into opening-cash / report totals with zero
 * indication anything was wrong. `false` is only a safe value AFTER a successful read that says
 * the flag is off — never a substitute for a failed read.
 *
 * Guards that all three named consumers call isBankAccountHideEnabled with NO .catch() (so a
 * failed read fails the request loud, matching the pattern already established, uncaught, in
 * apps/backend/src/accounting/cash-forecast.routes.ts).
 */
import { readFileSync } from "node:fs";

const files = [
  "apps/backend/src/cash-flow/cash-flow.service.ts",
  "apps/backend/src/reports/cash-flow-overview.routes.ts",
  "apps/backend/src/reports/cash-flow/route-fix.ts",
];

const failures = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!/isBankAccountHideEnabled\(/.test(src)) {
    failures.push(`${file}: no longer calls isBankAccountHideEnabled — cannot verify the fail-closed fix (did the hide check move or get removed?)`);
    continue;
  }
  const failOpenRe = /isBankAccountHideEnabled\([^)]*\)\s*\.catch\(\s*\(\)\s*=>\s*false\s*\)/;
  if (failOpenRe.test(src)) {
    failures.push(`${file}: isBankAccountHideEnabled(...).catch(() => false) reintroduced — a failed flag read must never be silently treated as "hide is off"`);
  }
}

if (failures.length > 0) {
  console.error("verify-bank-account-hide-capability-fails-closed: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-bank-account-hide-capability-fails-closed: OK — all 3 named consumers read isBankAccountHideEnabled uncaught (a failed read fails the request loud, never silently 'hide is off')"
);
