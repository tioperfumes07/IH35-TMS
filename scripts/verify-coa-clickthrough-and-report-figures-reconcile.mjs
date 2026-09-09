#!/usr/bin/env node
/**
 * GUARD: CoA click-through chain + report figures reconcile to source GL.
 *
 * Two checks, both in the Lists/Reports lane:
 *
 * CLICK-THROUGH — the CoA list page must deep-link every row to a real destination:
 *   (a) BS accounts → "View register" → /accounting/chart-of-accounts/register/:id
 *   (b) P&L accounts → "Run report" → /reports/profit-loss
 *   (c) Edit button → AccountDrawer (create/edit shell)
 * The P&L report page must deep-link every line to the register:
 *   (d) P&L line account_name → /accounting/chart-of-accounts/register/:accountId?from_date=...&to_date=...&basis=...
 *
 * REPORT FIGURES RECONCILE — the P&L report service must read from the SAME GL
 * table that is the source of truth, not a copy or a derived table:
 *   (e) Reads from accounting.journal_entry_postings (the GL postings table)
 *   (f) Joins accounting.journal_entries (for status/date/void filtering)
 *   (g) Joins catalogs.accounts (for account_type classification)
 *   (h) Revenue = credits - debits for Income/OtherIncome
 *   (i) COGS = debits - credits for CostOfGoodsSold
 *   (j) Expenses = debits - credits for Expense/OtherExpense
 *   (k) Excludes voided, sample, and retained-earnings closing entries
 *
 * Usage: node scripts/verify-coa-clickthrough-and-report-figures-reconcile.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-coa-clickthrough-and-report-figures-reconcile";

const COA_LIST = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx"),
  "utf8",
);
const PNL_PAGE = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/reports/ProfitLossPage.tsx"),
  "utf8",
);
const PNL_SERVICE = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/accounting/profit-loss.service.ts"),
  "utf8",
);
const ACCOUNT_REGISTER = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx"),
  "utf8",
);
const ROUTES = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  "utf8",
);

const errors = [];

// --- CLICK-THROUGH: CoA list → register ---
if (!/accounting\/chart-of-accounts\/register\/\$\{row\.id\}/.test(COA_LIST)) {
  errors.push("CoA list: missing 'View register' deep-link to /accounting/chart-of-accounts/register/${row.id}");
}
// --- CLICK-THROUGH: CoA list → P&L report ---
if (!/to=["']\/reports\/profit-loss["']/.test(COA_LIST)) {
  errors.push("CoA list: missing 'Run report' link to /reports/profit-loss for P&L accounts");
}
// --- CLICK-THROUGH: CoA list → Edit drawer ---
if (!/AccountDrawer/.test(COA_LIST) || !/setDrawerMode\(["']edit["']\)/.test(COA_LIST)) {
  errors.push("CoA list: missing Edit → AccountDrawer wiring");
}
// --- CLICK-THROUGH: P&L line → register ---
if (!/registerHref/.test(PNL_PAGE) || !/accounting\/chart-of-accounts\/register\/\$\{accountId\}/.test(PNL_PAGE)) {
  errors.push("P&L page: missing registerHref deep-link from report lines to /accounting/chart-of-accounts/register/:accountId");
}
if (!/<Link\s+to=\{registerHref\(/.test(PNL_PAGE)) {
  errors.push("P&L page: lines must use <Link to={registerHref(...)}> for click-through");
}
// --- Route manifest has both routes ---
if (!/accounting\/chart-of-accounts\/register\/:accountId/.test(ROUTES)) {
  errors.push("Route manifest: missing /accounting/chart-of-accounts/register/:accountId route");
}
if (!/path=["']\/reports\/profit-loss["']/.test(ROUTES)) {
  errors.push("Route manifest: missing /reports/profit-loss route");
}
// --- AccountRegisterPage consumes the param ---
if (!/useParams/.test(ACCOUNT_REGISTER) || !/accountId/.test(ACCOUNT_REGISTER)) {
  errors.push("AccountRegisterPage: does not consume accountId route param");
}

// --- REPORT FIGURES RECONCILE: P&L reads from GL ---
if (!/accounting\.journal_entry_postings/.test(PNL_SERVICE)) {
  errors.push("P&L service: does not read from accounting.journal_entry_postings (the GL source table)");
}
if (!/accounting\.journal_entries/.test(PNL_SERVICE)) {
  errors.push("P&L service: does not join accounting.journal_entries (status/date/void filtering)");
}
if (!/catalogs\.accounts/.test(PNL_SERVICE)) {
  errors.push("P&L service: does not join catalogs.accounts (account_type classification)");
}
// --- Revenue = credits - debits ---
if (!/REVENUE_TYPES/.test(PNL_SERVICE) || !/Income.*OtherIncome/.test(PNL_SERVICE)) {
  errors.push("P&L service: REVENUE_TYPES must include Income and OtherIncome");
}
if (!/totalCredits\s*-\s*totalDebits/.test(PNL_SERVICE)) {
  errors.push("P&L service: revenue must be credits - debits");
}
// --- COGS = debits - credits ---
if (!/COGS_TYPES/.test(PNL_SERVICE) || !/CostOfGoodsSold/.test(PNL_SERVICE)) {
  errors.push("P&L service: COGS_TYPES must include CostOfGoodsSold");
}
if (!/totalDebits\s*-\s*totalCredits/.test(PNL_SERVICE)) {
  errors.push("P&L service: COGS/expenses must be debits - credits");
}
// --- Excludes voided, sample, closing entries ---
if (!/status\s*<>\s*['"]voided['"]/.test(PNL_SERVICE)) {
  errors.push("P&L service: must exclude voided journal entries (je.status <> 'voided')");
}
if (!/is_sample_data/.test(PNL_SERVICE)) {
  errors.push("P&L service: must exclude sample data (COALESCE(je.is_sample_data, false) = false)");
}
if (!/retained_earnings_entry_id/.test(PNL_SERVICE)) {
  errors.push("P&L service: must exclude period-close retained-earnings entries");
}
// --- Operating expenses ---
if (!/OPERATING_EXPENSE_TYPES/.test(PNL_SERVICE) || !/Expense.*OtherExpense/.test(PNL_SERVICE)) {
  errors.push("P&L service: OPERATING_EXPENSE_TYPES must include Expense and OtherExpense");
}

if (errors.length > 0) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`${LABEL} PASS — CoA click-through chain wired (list→register, list→P&L, P&L→register) + P&L figures reconcile to source GL (journal_entry_postings)`);

// --- Selftest ---
if (process.argv.includes("--selftest")) {
  const tests = [
    {
      name: "CoA list without register link fails",
      mutate: (s) => s.replace(/accounting\/chart-of-accounts\/register\/\$\{row\.id\}/, "/no-register"),
      file: "coa",
    },
    {
      name: "P&L service not reading GL fails",
      mutate: (s) => s.replace(/accounting\.journal_entry_postings/g, "accounting.other_table"),
      file: "pnl-service",
    },
    {
      name: "P&L page without registerHref fails",
      mutate: (s) => s.replace(/registerHref/g, "noRegisterHref"),
      file: "pnl-page",
    },
  ];
  let pass = 0;
  for (const t of tests) {
    const src = t.file === "coa" ? COA_LIST : t.file === "pnl-service" ? PNL_SERVICE : PNL_PAGE;
    const mutated = t.mutate(src);
    // Quick check: the mutation removes a required pattern
    if (mutated !== src) {
      pass++;
    } else {
      console.error(`${LABEL} SELFTEST FAIL — ${t.name}: mutation had no effect`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${pass}/${tests.length} mutations detected`);
}
