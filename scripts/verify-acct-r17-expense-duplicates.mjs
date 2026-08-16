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

const SVC_REL = "apps/backend/src/accounting/expense-duplicate.service.ts";
const ROUTES_REL = "apps/backend/src/accounting/expenses.routes.ts";

/**
 * ACCT-R-17 (2026-08-16) — the previous selftest was a tautology
 * (assertIncludes("acct-r17-ok", "acct-r17-ok", ...)), which can never fail regardless of what
 * happens to the real assertions below, so a regression in any of them would ship silently. This
 * mutation-proves two of the real checks: the service losing its export, and the route losing its
 * before-:id ordering (the exact class of bug — a static path shadowed by a later :id param route —
 * this guard exists to catch).
 */
function auditService(svc) {
  const failures = [];
  if (!svc.includes("listExpenseDuplicateGroups")) failures.push("service export");
  if (!svc.includes("vendor_uuid")) failures.push("vendor fingerprint");
  if (!svc.includes("total_amount_cents")) failures.push("amount fingerprint");
  if (!svc.includes("HAVING COUNT(*) > 1")) failures.push("duplicate having");
  return failures;
}

function auditRouteOrder(routes) {
  const failures = [];
  if (!routes.includes("/api/v1/expenses/duplicates")) failures.push("route path");
  if (!routes.includes("listExpenseDuplicateGroups")) failures.push("route uses service");
  const dupIdx = routes.indexOf("/api/v1/expenses/duplicates");
  const idIdx = routes.indexOf('"/api/v1/expenses/:id"');
  if (dupIdx < 0 || idIdx < 0 || dupIdx > idIdx) {
    failures.push("duplicates route must be registered before /expenses/:id");
  }
  return failures;
}

function selftest() {
  const svc = read(SVC_REL);
  const routes = read(ROUTES_REL);

  if (auditService(svc).length !== 0) {
    throw new Error("selftest baseline FAIL — real service file already fails its own audit");
  }
  if (auditRouteOrder(routes).length !== 0) {
    throw new Error("selftest baseline FAIL — real routes file already fails its own audit");
  }

  const brokenSvc = svc.replace("listExpenseDuplicateGroups", "renamedAway");
  if (brokenSvc === svc || auditService(brokenSvc).length === 0) {
    throw new Error("selftest FAIL — removing the service export did not trip auditService");
  }

  // Simulate the exact shadowing bug this guard exists to catch (a static path registered after its
  // own :id wildcard never gets reached) by injecting an earlier occurrence of the :id route marker
  // ahead of the duplicates route — same effect as physically moving the registration.
  const reordered = `"/api/v1/expenses/:id" // injected-earlier-marker\n${routes}`;
  if (reordered === routes || auditRouteOrder(reordered).length === 0) {
    throw new Error("selftest FAIL — shadowing the duplicates route behind :id did not trip auditRouteOrder");
  }

  console.log("verify-acct-r17-expense-duplicates: selftest PASS — service-export and route-order mutations both caught");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const svc = read(SVC_REL);
  for (const f of auditService(svc)) throw new Error(f);

  const routes = read(ROUTES_REL);
  for (const f of auditRouteOrder(routes)) throw new Error(f);

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
