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
// 443.99: the P&L rules moved into shared modules (ACCT-F413 sections table, ACCT-F2026100601 one
// ledger-membership rule) and the line drill moved onto the shared AmountLink (Lead #25488). Read them.
const PNL_SECTIONS = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/profit-loss-sections.ts"), "utf8");
const LEDGER_MEMBERSHIP = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/ledger-membership.ts"), "utf8");
const AMOUNT_LINK = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/shared/AmountLink.tsx"), "utf8");
const ACCOUNT_REGISTER = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx"),
  "utf8",
);
const ROUTES = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  "utf8",
);

const SOURCES = { COA_LIST, PNL_PAGE, PNL_SERVICE, PNL_SECTIONS, LEDGER_MEMBERSHIP, AMOUNT_LINK, ACCOUNT_REGISTER, ROUTES };

/** Every check, over in-memory sources — --selftest plants regressions through the same function. */
export function collectErrors({ COA_LIST, PNL_PAGE, PNL_SERVICE, PNL_SECTIONS, LEDGER_MEMBERSHIP, AMOUNT_LINK, ACCOUNT_REGISTER, ROUTES }) {
  const errors = [];

  // --- CLICK-THROUGH: CoA list → register ---
  if (!/accounting\/chart-of-accounts\/register\/\$\{row\.id\}/.test(COA_LIST)) {
    errors.push("CoA list: missing 'View register' deep-link to /accounting/chart-of-accounts/register/${row.id}");
  }
  // --- CLICK-THROUGH: CoA list → P&L report ---
  const coaRunReportLink =
    /to=["']\/reports\/profit-loss["']/.test(COA_LIST) ||
    /window\.location\.assign\(["']\/reports\/profit-loss["']\)/.test(COA_LIST);
  if (!coaRunReportLink) {
    errors.push("CoA list: missing 'Run report' link to /reports/profit-loss for P&L accounts");
  }
  // --- CLICK-THROUGH: CoA list → Edit drawer ---
  if (!/AccountDrawer/.test(COA_LIST) || !/setDrawerMode\(["']edit["']\)/.test(COA_LIST)) {
    errors.push("CoA list: missing Edit → AccountDrawer wiring");
  }
  // --- CLICK-THROUGH: P&L line → register ---
  // LEAD 443.99 class B (2026-10-12).
  //   old rule: ProfitLossPage defines its own registerHref() and wraps each line in <Link to={registerHref(...)}>.
  //   new rule: each line's name AND amount are <AmountLink filter={plFilter(line.account_id, applied)}>, plFilter
  //             targets "register" with the account id, and AmountLink resolves the register target to
  //             /accounting/chart-of-accounts/register/:accountId.
  //   why: Lead #25488 moved every report drill onto the shared AmountLink (one route table, basis-aware) and
  //        deleted the page-local registerHref. The destination is unchanged; a line with no drill still fails.
  if (!/<AmountLink\s+filter=\{plFilter\(line\.account_id, applied\)\}[\s\S]{0,200}data-testid=\{`pl-name-/.test(PNL_PAGE) ||
      !/<AmountLink\s+filter=\{plFilter\(line\.account_id, applied\)\}[\s\S]{0,200}data-testid=\{`pl-amount-/.test(PNL_PAGE)) {
    errors.push("P&L page: each line's name and amount must drill via <AmountLink filter={plFilter(line.account_id, applied)}>");
  }
  if (!/target:\s*"register",\s*accountId/.test(PNL_PAGE)) {
    errors.push("P&L page: plFilter must target the account register");
  }
  if (!/\/accounting\/chart-of-accounts\/register\/\$\{filter\.accountId\}/.test(AMOUNT_LINK)) {
    errors.push("AmountLink: register target must resolve to /accounting/chart-of-accounts/register/:accountId");
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
  // LEAD 443.99 class B (2026-10-12) — P&L figure rules.
  //   old rule: REVENUE_TYPES / COGS_TYPES / OPERATING_EXPENSE_TYPES sets, inline credits-debits arithmetic and
  //             inline void / sample filters, all inside profit-loss.service.ts.
  //   new rule: the service places every account through profit-loss-sections.ts (Income + OtherIncome ->
  //             revenue, credit-positive; CostOfGoodsSold -> cogs and Expense + OtherExpense ->
  //             operating_expenses, debit-positive; signedSectionAmount = credits - debits when credit-positive,
  //             else debits - credits) and filters through ledger-membership.ts's one rule (status <> 'voided',
  //             is_sample_data excluded); the period-close exclusion stays in the service.
  //   why: ACCT-F413 made one section table for both P&L bases and ACCT-F2026100601 replaced 15 hand-typed
  //        membership filters with one; the same facts are now asserted where they live, none dropped.
  if (!/from "\.\/profit-loss-sections\.js"/.test(PNL_SERVICE) || !/signedSectionAmount\(placement, totalDebits, totalCredits\)/.test(PNL_SERVICE)) {
    errors.push("P&L service: amounts must be signed through profit-loss-sections signedSectionAmount");
  }
  for (const [type, section, credit] of [["Income", "revenue", true], ["OtherIncome", "revenue", true], ["CostOfGoodsSold", "cogs", false], ["Expense", "operating_expenses", false], ["OtherExpense", "operating_expenses", false]]) {
    const re = new RegExp(`\\b${type}: \\{ kind: "profit_loss", section: "${section}", creditPositive: ${credit} \\}`);
    if (!re.test(PNL_SECTIONS)) errors.push(`P&L sections: ${type} must be ${section} (${credit ? "credits - debits" : "debits - credits"})`);
  }
  if (!/return creditPositive \? totalCredits - totalDebits : totalDebits - totalCredits;/.test(PNL_SECTIONS)) {
    errors.push("P&L sections: revenue must be credits - debits and COGS/expenses debits - credits");
  }
  if (!/LEDGER_POSTING_COUNTS_SQL/.test(PNL_SERVICE)) {
    errors.push("P&L service: must filter through the one ledger-membership rule (LEDGER_POSTING_COUNTS_SQL)");
  }
  if (!/status <> 'voided'/.test(LEDGER_MEMBERSHIP)) {
    errors.push("ledger membership: must exclude voided journal entries (je.status <> 'voided')");
  }
  if (!/COALESCE\(\$\{je\}\.is_sample_data, false\) = false/.test(LEDGER_MEMBERSHIP)) {
    errors.push("ledger membership: must exclude sample data (COALESCE(je.is_sample_data, false) = false)");
  }
  if (!/retained_earnings_entry_id/.test(PNL_SERVICE)) {
    errors.push("P&L service: must exclude period-close retained-earnings entries");
  }
  return errors;
}

// --- Selftest --- (443.99: was a no-op that only checked the mutation changed the text; now each plant must
// be caught by collectErrors, and the real sources must pass.)
if (process.argv.includes("--selftest")) {
  const plants = [
    ["CoA list without register link", { COA_LIST: SOURCES.COA_LIST.replace(/accounting\/chart-of-accounts\/register\/\$\{row\.id\}/g, "/no-register") }],
    ["P&L service not reading the GL", { PNL_SERVICE: SOURCES.PNL_SERVICE.replace(/accounting\.journal_entry_postings/g, "accounting.other_table") }],
    ["P&L line amount not drilled", { PNL_PAGE: SOURCES.PNL_PAGE.replace(/data-testid=\{`pl-amount-/g, "data-testid={`pl-plain-") }],
    ["P&L drill not to the register", { PNL_PAGE: SOURCES.PNL_PAGE.replace(/target:\s*"register",\s*accountId/, 'target: "journal", accountId') }],
    ["AmountLink register route changed", { AMOUNT_LINK: SOURCES.AMOUNT_LINK.replace("/accounting/chart-of-accounts/register/${filter.accountId}", "/accounting/register?id=${filter.accountId}") }],
    ["revenue made debit-positive", { PNL_SECTIONS: SOURCES.PNL_SECTIONS.replace('Income: { kind: "profit_loss", section: "revenue", creditPositive: true }', 'Income: { kind: "profit_loss", section: "revenue", creditPositive: false }') }],
    ["OtherExpense dropped from operating expenses", { PNL_SECTIONS: SOURCES.PNL_SECTIONS.replace('OtherExpense: { kind: "profit_loss", section: "operating_expenses", creditPositive: false }', "OtherExpense: { kind: \"balance_sheet\" }") }],
    ["sign rule inverted", { PNL_SECTIONS: SOURCES.PNL_SECTIONS.replace("return creditPositive ? totalCredits - totalDebits : totalDebits - totalCredits;", "return totalDebits - totalCredits;") }],
    ["voided entries counted", { LEDGER_MEMBERSHIP: SOURCES.LEDGER_MEMBERSHIP.replaceAll("status <> 'voided'", "true") }],
    ["sample data counted", { LEDGER_MEMBERSHIP: SOURCES.LEDGER_MEMBERSHIP.replace("COALESCE(${je}.is_sample_data, false) = false", "true") }],
    ["service bypasses the membership rule", { PNL_SERVICE: SOURCES.PNL_SERVICE.replaceAll("LEDGER_POSTING_COUNTS_SQL", "TRUE_SQL") }],
    ["period-close entries counted", { PNL_SERVICE: SOURCES.PNL_SERVICE.replaceAll("retained_earnings_entry_id", "other_id") }],
  ];
  let caught = 0;
  for (const [name, patch] of plants) {
    if (collectErrors({ ...SOURCES, ...patch }).length > 0) caught += 1;
    else console.error(`${LABEL} SELFTEST: planted violation escaped — ${name}`);
  }
  const clean = collectErrors(SOURCES);
  if (clean.length) console.error(`${LABEL} SELFTEST: real sources flagged — ${clean.join("; ")}`);
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted violations caught`);
  process.exit(caught === plants.length && clean.length === 0 ? 0 : 1);
}

const errors = collectErrors(SOURCES);
if (errors.length > 0) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`${LABEL} PASS — CoA click-through chain wired (list→register, list→P&L, P&L→register) + P&L figures reconcile to source GL (journal_entry_postings)`);
