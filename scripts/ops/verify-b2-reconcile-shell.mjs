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
  assertIncludes(workspace, ">Cleared date<", WORKSPACE);
  assertIncludes(workspace, ">Payment<", WORKSPACE);
  assertIncludes(workspace, ">Deposit<", WORKSPACE);
  assertIncludes(workspace, ">Type<", WORKSPACE);
  assertIncludes(workspace, ">Ref no.<", WORKSPACE);
  assertIncludes(workspace, ">Account<", WORKSPACE);
  assertIncludes(workspace, ">Payee<", WORKSPACE);
  assertIncludes(workspace, ">Memo<", WORKSPACE);
  assertIncludes(workspace, 'data-b2-recon-grid="1"', WORKSPACE);
  assertIncludes(workspace, "bankTxTypeLabel", WORKSPACE);
  assertIncludes(workspace, "bankTxRef", WORKSPACE);
  // B-2 ORDERS §6 — completed session reopen = read-only report (beginning/cleared/ending/uncleared)
  assertIncludes(workspace, 'data-b2-recon-report="1"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-completed-report"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-report-uncleared"', WORKSPACE);
  assertIncludes(workspace, "isReportMode", WORKSPACE);
  assertIncludes(workspace, 'status === "reconciled"', WORKSPACE);
  assertIncludes(workspace, "Uncleared as of", WORKSPACE);
  assertIncludes(workspace, "Statement ending", WORKSPACE);
  assertIncludes(workspace, "Difference", WORKSPACE);
  assertIncludes(workspace, "text-red-700", WORKSPACE);
  assertIncludes(workspace, "posted_date", WORKSPACE);
  // B-2 ORDERS §6 — Filter popover: Find / Cleared / Type / Payee / Date / amount · Reset / Apply
  assertIncludes(workspace, 'data-b2-recon-filter="1"', WORKSPACE);
  assertIncludes(workspace, 'data-b2-recon-filter-popover="1"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-filter-find"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-filter-payee"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-filter-cleared"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-filter-type"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-filter-apply"', WORKSPACE);
  assertIncludes(workspace, 'data-testid="recon-filter-reset"', WORKSPACE);
  assertIncludes(workspace, "applyReconFilters", WORKSPACE);
  assertIncludes(workspace, "resetReconFilters", WORKSPACE);
  assertIncludes(workspace, "appliedAmtMode", WORKSPACE);

  assertIncludes(shell, 'data-b2-reconcile-strip="1"', SHELL);
  assertIncludes(shell, "Cleared payments", SHELL);
  assertIncludes(shell, "Cleared deposits", SHELL);
  assertIncludes(shell, "getReconciliationWorkspace", SHELL);
  assertIncludes(shell, "cleared_debits_cents", SHELL);
  assertIncludes(shell, 'data-b2-recon-view-report="1"', SHELL);
  assertIncludes(shell, "View report:", SHELL);
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
