#!/usr/bin/env node
/**
 * GO-0032-CASH-FLOW-STATEMENT-EXPORT-SILENT-DEAD-CLICK
 *
 * A bare `onClick={() => exportXReport(...)}` never awaits or catches the rejection
 * `downloadBinaryExport()` throws on any non-2xx response (a role-gated 403 for non-financial
 * roles, a rate limit, a genuine 500) -- the click becomes a silent dead control with zero
 * operator feedback (a bare unhandled promise rejection nothing in this app surfaces). This is
 * the same defect class already fixed once per-file for FLEET-F6114 / COMP-F6342; this guard
 * fails if any of the app's report-export buttons regress back to that fire-and-forget shape
 * instead of going through the shared `useExportAction()` hook
 * (apps/frontend/src/hooks/useExportAction.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-report-export-buttons-await-and-catch";

const FILES = [
  "apps/frontend/src/pages/reports/CashFlowStatementPage.tsx",
  "apps/frontend/src/pages/reports/ARAgingPage.tsx",
  "apps/frontend/src/pages/reports/APAgingPage.tsx",
  "apps/frontend/src/pages/reports/BalanceSheetPage.tsx",
  "apps/frontend/src/pages/reports/ProfitLossPage.tsx",
  "apps/frontend/src/pages/reports/TrialBalancePage.tsx",
];

// A bare onClick={() => exportXReport(...)} directly following the arrow -- not wrapped
// through exportAction.run(...) -- is the regression this guard exists to catch.
const BARE_EXPORT_CLICK_RE = /onClick=\{\(\)\s*=>\s*export[A-Z]\w*\(/;

export function check(filePath, text) {
  const failures = [];
  if (!/useExportAction\s*\(/.test(text) || !/hooks\/useExportAction["']/.test(text)) {
    failures.push(`${filePath}: does not import/use useExportAction() -- export buttons may have regressed to fire-and-forget`);
  }
  if (BARE_EXPORT_CLICK_RE.test(text)) {
    failures.push(`${filePath}: found a bare onClick={() => exportX(...)} not wrapped through exportAction.run(...)`);
  }
  return failures;
}

function run() {
  const allFailures = [];
  for (const rel of FILES) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    allFailures.push(...check(rel, text));
  }
  if (allFailures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of allFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — all ${FILES.length} report-export surfaces await+catch their export action via useExportAction()`);
}

function selftest() {
  const good = `
import { useExportAction } from "../../hooks/useExportAction";
export function Page() {
  const exportAction = useExportAction();
  return (
    <Button onClick={() =>
      void exportAction.run(
        () => exportCashFlowStatementReport({ format: "pdf" }),
        "Cash flow statement export failed",
      )
    }>Export PDF</Button>
  );
}
`;
  if (check("fixture.tsx", good).length) throw new Error(`PASS fail: ${JSON.stringify(check("fixture.tsx", good))}`);

  const regressed = `
import { useExportAction } from "../../hooks/useExportAction";
export function Page() {
  const exportAction = useExportAction();
  return (
    <Button onClick={() =>
      exportCashFlowStatementReport({ format: "pdf" })
    }>Export PDF</Button>
  );
}
`;
  if (!check("fixture.tsx", regressed).length) throw new Error("FAIL fail: bare fire-and-forget onClick should have been caught");

  const noHook = `
export function Page() {
  return (
    <Button onClick={() =>
      exportCashFlowStatementReport({ format: "pdf" })
    }>Export PDF</Button>
  );
}
`;
  if (!check("fixture.tsx", noHook).length) throw new Error("FAIL fail: missing useExportAction usage should have been caught");

  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
