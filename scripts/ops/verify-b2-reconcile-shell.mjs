#!/usr/bin/env node
/**
 * B-2 RECONCILE (ORDERS-2026-10-01-BANKING-REGISTER-SET §6/§8) — structural guard.
 * Asserts QBO reconcile arithmetic (STATEMENT − CLEARED = DIFFERENCE), Payments/Deposits/All
 * tabs, clear toggle via existing POST …/clear, Save for later, and shell strip live totals.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b2-reconcile-shell";

const WORKSPACE = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";
const SHELL = "apps/frontend/src/pages/banking/components/ReconciliationTabContent.tsx";
const API = "apps/frontend/src/api/banking.ts";
const ROUTES = "apps/backend/src/banking/reconciliation.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const workspace = read(WORKSPACE);
  const shell = read(SHELL);
  const api = read(API);
  const routes = read(ROUTES);

  assertIncludes(workspace, 'data-b2-reconcile-arithmetic="1"', WORKSPACE);
  assertIncludes(workspace, 'data-b2-reconcile-tabs="1"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-save-for-later"', WORKSPACE);
  assertIncludes(workspace, "clearReconciliationTransaction", WORKSPACE);
  assertIncludes(workspace, '["payments", "Payments"]', WORKSPACE);
  assertIncludes(workspace, '["deposits", "Deposits"]', WORKSPACE);
  assertIncludes(workspace, '["all", "All"]', WORKSPACE);
  assertIncludes(workspace, ">Cleared<", WORKSPACE);
  assertIncludes(workspace, ">Payment<", WORKSPACE);
  assertIncludes(workspace, ">Deposit<", WORKSPACE);
  assertIncludes(workspace, "Statement ending", WORKSPACE);
  assertIncludes(workspace, "Difference", WORKSPACE);
  assertIncludes(workspace, "text-red-700", WORKSPACE);
  assertIncludes(workspace, "posted_date", WORKSPACE);

  assertIncludes(shell, 'data-b2-reconcile-strip="1"', SHELL);
  assertIncludes(shell, "Cleared payments", SHELL);
  assertIncludes(shell, "Cleared deposits", SHELL);
  assertIncludes(shell, "getReconciliationWorkspace", SHELL);
  assertIncludes(shell, "cleared_debits_cents", SHELL);
  assertIncludes(shell, "cleared_credits_cents", SHELL);

  assertIncludes(api, "clearReconciliationTransaction", API);
  assertIncludes(api, "reconciliation_cleared", API);
  assertIncludes(api, "beginning_balance_cents", API);
  assertIncludes(api, "/clear?", API);

  assertIncludes(routes, '"/api/v1/banking/reconciliation/:sessionId/clear"', ROUTES);
  assertIncludes(routes, "reconciliation_cleared", ROUTES);
  assertIncludes(routes, "beginning_balance_cents", ROUTES);
  assertIncludes(routes, "cleared_credits_cents", ROUTES);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
