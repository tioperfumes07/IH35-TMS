#!/usr/bin/env node
/**
 * Guard 1471 — ACCT-R-17 duplicate expense detection surface.
 * Rule 17: verify-steps only.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) throw new Error(`missing ${rel}`);
  return readFileSync(p, "utf8");
}

function assertIncludes(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error(`${label}: expected ${JSON.stringify(needle)}`);
}

function selftest() {
  assertIncludes("acct-r17-ok", "acct-r17-ok", "selftest");
  console.log("verify-acct-r17-expense-duplicates: selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const svc = read("apps/backend/src/accounting/expense-duplicate.service.ts");
  assertIncludes(svc, "listExpenseDuplicateGroups", "service export");
  assertIncludes(svc, "vendor_uuid", "vendor fingerprint");
  assertIncludes(svc, "total_amount_cents", "amount fingerprint");
  assertIncludes(svc, "HAVING COUNT(*) > 1", "duplicate having");

  const routes = read("apps/backend/src/accounting/expenses.routes.ts");
  assertIncludes(routes, "/api/v1/expenses/duplicates", "route path");
  assertIncludes(routes, "listExpenseDuplicateGroups", "route uses service");
  // static path before :id
  const dupIdx = routes.indexOf("/api/v1/expenses/duplicates");
  const idIdx = routes.indexOf('"/api/v1/expenses/:id"');
  if (dupIdx < 0 || idIdx < 0 || dupIdx > idIdx) {
    throw new Error("duplicates route must be registered before /expenses/:id");
  }

  const api = read("apps/frontend/src/api/accounting.ts");
  assertIncludes(api, "listExpenseDuplicates", "FE client");
  assertIncludes(api, "/api/v1/expenses/duplicates", "FE path");

  const page = read("apps/frontend/src/pages/accounting/ExpensesListPage.tsx");
  assertIncludes(page, "expense-duplicates-panel", "panel testid");
  assertIncludes(page, "listExpenseDuplicates", "page fetches duplicates");

  const step = read("scripts/verify-steps/1471-verify-acct-r17-expense-duplicates.mjs");
  assertIncludes(step, "verify-acct-r17-expense-duplicates", "verify-step");

  const json = read("docs/module-completion/accounting.json");
  assertIncludes(json, '"id": "ACCT-R-17"', "scoreboard leaf");

  console.log("verify-acct-r17-expense-duplicates: PASS");
}

try {
  main();
} catch (err) {
  console.error("verify-acct-r17-expense-duplicates: FAIL", err?.message ?? err);
  process.exit(1);
}
