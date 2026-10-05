#!/usr/bin/env node
// U12 (owner UI register 2026-10-03) — "status is a multi-selector everywhere — right now it looks dirty". CC-2 owns the
// Accounting surfaces (CURSOR owns the app-wide sweep). Static.
//   1. no Accounting / Banking page binds a status filter to a single-select (<select> / SelectCombobox value={…status…})
//   2. the converted pages use the shared MultiSelectDropdown for status
//   3. their list endpoints accept a repeated ?status= through ONE helper (lib/status-list.ts) — invoices OR's its
//      active / posted pseudo-statuses with the literal ones
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";


if (process.argv.includes("--selftest")) selftest();

const LABEL = "verify-accounting-status-filters-are-multiselect";
const fails = [];
const read = (p) => readFileSync(p, "utf8");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") walk(p, out);
    } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

const SINGLE_STATUS = /<(?:SelectCombobox|select)\b[^>]*?value=\{(?:staged\.draft\.)?(?:statusFilter|status|syncStatus)\}/s;
const scanned = [...walk("apps/frontend/src/pages/accounting"), ...walk("apps/frontend/src/pages/banking")];
for (const f of scanned) {
  if (SINGLE_STATUS.test(read(f))) fails.push(`${f}: a status filter is a single-select — use MultiSelectDropdown (U12)`);
}

const CONVERTED = {
  "apps/frontend/src/pages/accounting/CreditMemosPage.tsx": "credit-memos-status-filter",
  "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx": "vendor-credits-status-filter",
  "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx": "fixed-assets-status-filter",
  "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx": "prepaid-status-filter",
  "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx": "revrec-status-filter",
  "apps/frontend/src/pages/accounting/DisputeQueuePage.tsx": "dispute-queue-status-filter",
  "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx": "integration-tx-status-filter",
  "apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx": "loans-status-filter",
  "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx": "b1-register-filter-status",
  "apps/frontend/src/pages/accounting/InvoicesListPage.tsx": "invoices-status-filter",
  "apps/frontend/src/pages/accounting/AbandonmentQueuePage.tsx": "abandonment-status-filter",
  "apps/frontend/src/pages/accounting/FactoringListPage.tsx": "factoring-status-filter",
  "apps/frontend/src/pages/accounting/PaymentsListPage.tsx": "payments-status-filter",
  "apps/frontend/src/pages/banking/TransfersListPage.tsx": "transfers-status-filter",
  "apps/frontend/src/pages/accounting/QboReconcileCapturesPage.tsx": "qbo-captures-status-filter",
  "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx": "invoice-create-load-status-filter",
};
for (const [f, testid] of Object.entries(CONVERTED)) {
  const src = read(f);
  if (!new RegExp(`<MultiSelectDropdown[\\s\\S]{0,600}data-testid="${testid}"`).test(src)) fails.push(`${f}: status is not the shared MultiSelectDropdown (${testid})`);
}

const BACKEND = [
  "apps/backend/src/accounting/credit-memos.routes.ts",
  "apps/backend/src/accounting/vendor-credits.routes.ts",
  "apps/backend/src/accounting/fixed-assets.routes.ts",
  "apps/backend/src/accounting/prepaid-expenses.routes.ts",
  "apps/backend/src/accounting/revenue-recognition.routes.ts",
  "apps/backend/src/accounting/related-party-loan-posting/routes.ts",
  "apps/backend/src/accounting/factoring-advances.routes.ts",
  "apps/backend/src/driver-finance/abandonment.routes.ts",
];
// status list parsed by the shared helper, SQL built in a service / inline ANY
for (const f of ["apps/backend/src/accounting/recon/recon.routes.ts", "apps/backend/src/accounting/qbo-reconcile-captures.routes.ts"]) {
  if (!/status: statusListParam\(/.test(read(f))) fails.push(`${f}: status list param no longer goes through lib/status-list.ts`);
}
for (const [f, re, msg] of [
  ["apps/backend/src/accounting/payments.routes.ts", /wantActive !== wantVoided/, "payments: Active + Voided together must mean every payment"],
  ["apps/backend/src/banking/transfers.service.ts", /wanted\.length === 1/, "transfers: Active + Revoked together must mean every transfer"],
  ["apps/backend/src/integrations/qbo/qbo-reconcile-read.service.ts", /status::text = ANY\(/, "QBO captures: a list of statuses"],
  ["apps/backend/src/accounting/recon/recon.routes.ts", /status::text = ANY\(\$3::text\[\]\)/, "recon exceptions: a list of statuses"],
]) if (!re.test(read(f))) fails.push(msg);
for (const f of BACKEND) {
  const src = read(f);
  if (!/status: statusListParam\(/.test(src) || !/statusListCondition\(/.test(src)) fails.push(`${f}: status list param no longer goes through lib/status-list.ts`);
}
const inv = read("apps/backend/src/accounting/invoices.routes.ts");
if (!/status: z\.union\(\[z\.string\(\)\.trim\(\), z\.array\(z\.string\(\)\.trim\(\)\)\]\)/.test(inv) || !/statusOr\.join\(" OR "\)/.test(inv)) {
  fails.push("invoices.routes.ts: the list no longer accepts several statuses (OR of active / posted / literal)");
}
const disp = read("apps/backend/src/driver-finance/settlement-disputes-p6.service.ts");
if (!/d\.status::text = ANY\(/.test(disp)) fails.push("settlement-disputes-p6.service.ts: dispute queue no longer filters a list of statuses");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${scanned.length} Accounting / Banking pages scanned, 0 single-select status filters; ${Object.keys(CONVERTED).length} converted pages on MultiSelectDropdown; ${BACKEND.length + 8} list endpoints take a repeated ?status=`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-accounting-status-filters-are-multiselect", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
