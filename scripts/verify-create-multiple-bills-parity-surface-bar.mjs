#!/usr/bin/env node
/**
 * ACCT-F3580 — CreateMultipleBillsPage draft grid must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 * ACCT-F443293-C slice 2 — same V3 board shell as Bills All / Recurring: AccountingSubNavWrapper
 * (no PageHeader layer), U18 crumbs Accounting › Bills › Multiple bills.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(src = fs.readFileSync(path.join(ROOT, PAGE), "utf8")) {
  assert(src.includes("ParityTable"), "CreateMultipleBillsPage: must use ParityTable");
  assert(src.includes('storageKey="create-multiple-bills-draft"'), "CreateMultipleBillsPage: storageKey");
  assert(src.includes('tableTestId="create-multiple-bills-table"'), "CreateMultipleBillsPage: tableTestId");
  assert(src.includes("createVendorBill"), "CreateMultipleBillsPage: keep createVendorBill");
  assert(src.includes("expense_account_id"), "CreateMultipleBillsPage: keep expense account column");
  assert(src.includes("dueDateFromBillTerms"), "CreateMultipleBillsPage: keep due-date terms helper");
  assert(!/<table\b/.test(src), "CreateMultipleBillsPage: must not use raw HTML table");
  assert(src.includes("AccountingSubNavWrapper"), "CreateMultipleBillsPage: must use AccountingSubNavWrapper (V3 board shell)");
  assert(src.includes('title="Multiple bills"'), 'CreateMultipleBillsPage: AccountingSubNavWrapper title="Multiple bills"');
  assert(
    /label:\s*"Bills"[\s\S]*href:\s*"\/accounting\/bills"/.test(src),
    "CreateMultipleBillsPage: crumbs must link Bills parent (/accounting/bills)",
  );
  assert(!/\bPageHeader\b/.test(src), "CreateMultipleBillsPage: must not layer PageHeader over the board shell");
  assert(src.includes("kpiStrip"), "CreateMultipleBillsPage: must pass kpiStrip (443.293-C V3 board)");
  assert(src.includes("MoneyListToolbar"), "CreateMultipleBillsPage: must use MoneyListToolbar in actions");
  assert(src.includes("createControl"), "CreateMultipleBillsPage: must pass createControl for primary CTA");
  assert(src.includes('data-testid="multi-bills-kpi-strip"'), "CreateMultipleBillsPage: KPI strip test id");
  // FILTER-MULTI-01 — MoneyListToolbar owns search; ParityTable must not render a second search/range.
  assert(src.includes("suppressToolbarSearch"), "CreateMultipleBillsPage: suppress ParityTable toolbar search (one search)");
  assert(src.includes("suppressToolbarRange"), "CreateMultipleBillsPage: suppress ParityTable toolbar range (one toolbar)");
}

function selftest() {
  check();
  const plantedTable = [
    "export function CreateMultipleBillsPage() {",
    '  return <table className="min-w-full" data-testid="create-multiple-bills-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  let failed = false;
  try {
    check(plantedTable);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL on raw HTML table");

  const good = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const noWrapper = good
    .replaceAll("AccountingSubNavWrapper", "RemovedSubNavWrapper")
    .replace('title="Multiple bills"', 'title="Create multiple bills"');
  failed = false;
  try {
    check(noWrapper);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL when AccountingSubNavWrapper / Multiple bills title removed");

  const withPageHeader = `${good}\nimport { PageHeader } from "../../components/layout/PageHeader";\n`;
  failed = false;
  try {
    check(withPageHeader);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL when PageHeader is reintroduced");

  const noSuppress = good.replaceAll("suppressToolbarSearch", "removedSuppressSearch").replaceAll(
    "suppressToolbarRange",
    "removedSuppressRange",
  );
  failed = false;
  try {
    check(noSuppress);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL when ParityTable search/range suppress is removed");
  console.log("verify-create-multiple-bills-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-create-multiple-bills-parity-surface-bar PASS");
}
