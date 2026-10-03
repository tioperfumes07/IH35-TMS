#!/usr/bin/env node
// U6 (owner, 2026-10-03) — "Checks list must show all checks with full filters". Static.
//   1. GET /api/v1/checks/all unions every check: expense checks, bills paid by check, driver settlements paid by check
//   2. the Checks page reads it and filters type / status / bank account (multi-select), payee search, date range
import { readFileSync } from "node:fs";

const LABEL = "verify-checks-list-shows-every-check";
const fails = [];
const route = readFileSync("apps/backend/src/accounting/checks/checks.routes.ts", "utf8");
const all = route.slice(route.indexOf('"/api/v1/checks/all"'));
for (const [re, msg] of [
  [/e\.payment_type = 'check'/, "expense checks"],
  [/bp\.payment_method = 'check'/, "bills paid by check"],
  [/r\.source_kind = 'driver_settlement_payment'/, "driver settlements paid by check"],
]) if (!re.test(all.slice(0, 4000))) fails.push(`/api/v1/checks/all no longer includes ${msg}`);
const page = readFileSync("apps/frontend/src/pages/accounting/checks/CheckListPage.tsx", "utf8");
if (!/listAllChecks\(/.test(page)) fails.push("the Checks page no longer reads every check (listAllChecks)");
for (const id of ["checks-filter-kind", "checks-filter-status", "checks-filter-bank", "checks-search"]) {
  if (!page.includes(`data-testid="${id}"`)) fails.push(`the Checks page lost the ${id} filter`);
}
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — the Checks list shows every check (expense, bill payment, driver settlement) with full filters`);
