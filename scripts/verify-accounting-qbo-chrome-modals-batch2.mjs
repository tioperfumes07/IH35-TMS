#!/usr/bin/env node
/**
 * Accounting qbo_chrome — leaf-specific Built, batch 2 of 2 (panels, wizard, bills-create,
 * bill_payments, vendors/customers, coa, period_close, chrome.toolbar_filter).
 * HONEST-BUILT-LAUNCH-LAW: no leafRe:".*"; every leafRe below is anchored to its specific leaf(s).
 *
 * Completes the accounting qbo_chrome sweep started in
 * scripts/verify-accounting-qbo-chrome-modals-batch1.mjs (see that file's header for the root-cause
 * writeup — the broad CURSOR-VERTICAL-accounting-qbo sweep never opens most of these 65 leaves'
 * files).
 *
 * Route-manifest tracing for this batch:
 *   - bills.create.maintenance/fuel/driver all redirect to BillsPage?category=X&create=1, which
 *     mounts the SAME CreateBillModal.tsx already verified this session (real ParityDrawer chrome,
 *     see scripts/verify-cargo-claims-parity-and-picker-search.mjs history) — bills.create.vendor
 *     alone uses the standalone VendorBillCreatePage.tsx (already covered in batch 1).
 *   - bill_payments.create: BillPaymentsListPage.tsx mounts the same PayBillModal.tsx from batch 1.
 *   - vendors/customers: /accounting/vendors and /accounting/customers are plain <Navigate> redirects
 *     to the main /vendors and /customers pages (VendorsListView.tsx / CustomersListView.tsx),
 *     already verified this session (94/94 and 271/271 targeted guards green in the vendors/
 *     customers sweeps) — real CollapsedListFilters + ParityTable + EntityPicker chrome.
 *   - coa: ChartOfAccountsListPage.tsx (route /lists/accounting/chart-of-accounts) — a real ListView
 *     with a real AccountDrawer nested create, and mounts the two accounting.panel.* leaves
 *     (ChartOfAccountsSyncPanel, CoaAsymmetryReportPanel) directly, proving those aren't orphaned.
 *
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.bill_detail$","task":"VERTICAL-QBO-CHROME-accounting-panel-bill-detail","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.chart_of_accounts_sync$","task":"VERTICAL-QBO-CHROME-accounting-panel-coa-sync","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.panel\\.coa_asymmetry_report$","task":"VERTICAL-QBO-CHROME-accounting-panel-coa-asymmetry","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.wizard\\.loan_application$","task":"VERTICAL-QBO-CHROME-accounting-loan-wizard","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^bills\\.create\\.(maintenance|fuel|driver)$","task":"VERTICAL-QBO-CHROME-accounting-bills-create-redirect","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^bills\\.recurring$","task":"VERTICAL-QBO-CHROME-accounting-bills-recurring","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^bill_payments\\.create$","task":"VERTICAL-QBO-CHROME-accounting-bill-payments-create","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^vendors$","task":"VERTICAL-QBO-CHROME-accounting-vendors-redirect","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^customers$","task":"VERTICAL-QBO-CHROME-accounting-customers-redirect","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^coa$","task":"VERTICAL-QBO-CHROME-accounting-coa","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^period_close$","task":"VERTICAL-QBO-CHROME-accounting-period-close","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-accounting-toolbar-filter","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^bills\\.create\\.vendor$","task":"VERTICAL-QBO-CHROME-accounting-bills-create-vendor","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^(invoices\\.create|accounting\\.parity\\.invoice_create)$","task":"VERTICAL-QBO-CHROME-accounting-invoices-create","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^payments\\.receive$","task":"VERTICAL-QBO-CHROME-accounting-payments-receive","vertical":"column-wave"}
 * @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^je\\.create$","task":"VERTICAL-QBO-CHROME-accounting-je-create","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-accounting-qbo-chrome-modals-batch2.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-qbo-chrome-modals-batch2";

const CHECKS = [
  { name: "accounting.panel.bill_detail: BillDetailPanel real FlatFieldGrid + EntityLink chrome", file: "apps/frontend/src/pages/accounting/BillDetailPanel.tsx", pattern: /FlatFieldGrid[\s\S]*EntityLink/ },
  { name: "accounting.panel.chart_of_accounts_sync: real panel, mounted on ChartOfAccountsListPage", file: "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx", pattern: /<ChartOfAccountsSyncPanel\b/ },
  { name: "accounting.panel.coa_asymmetry_report: real panel, mounted on ChartOfAccountsListPage", file: "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx", pattern: /<CoaAsymmetryReportPanel\b/ },
  { name: "accounting.wizard.loan_application: LoanApplicationWizard real MoneyInput + DatePicker", file: "apps/frontend/src/pages/accounting/loans/LoanApplicationWizard.tsx", pattern: /MoneyInput[\s\S]*DatePicker|DatePicker[\s\S]*MoneyInput/ },
  { name: "bills.create.(maintenance|fuel|driver): BillsPage redirects mount the real CreateBillModal", file: "apps/frontend/src/pages/accounting/BillsPage.tsx", pattern: /import \{ CreateBillModal \}/ },
  { name: "bills.create.(maintenance|fuel|driver) target: CreateBillModal is a real ParityDrawer", file: "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx", pattern: /<ParityDrawer/ },
  { name: "bills.create.vendor: VendorBillCreatePage real chrome", file: "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx", pattern: /(ParityDrawer|MoneyInput|DatePicker)/ },
  { name: "bills.recurring: RecurringBillCreate real MoneyInput + DatePicker", file: "apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx", pattern: /MoneyInput[\s\S]*DatePicker|DatePicker[\s\S]*MoneyInput/ },
  { name: "bill_payments.create: BillPaymentsListPage mounts the real PayBillModal", file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx", pattern: /<PayBillModal/ },
  { name: "vendors: /accounting/vendors redirects to the real, already-verified /vendors page", file: "apps/frontend/src/routes/manifest.tsx", pattern: /path="\/accounting\/vendors"[\s\S]{0,200}Navigate to="\/vendors"/ },
  { name: "customers: /accounting/customers redirects to the real, already-verified /customers page", file: "apps/frontend/src/routes/manifest.tsx", pattern: /path="\/accounting\/customers"[\s\S]{0,200}Navigate to="\/customers"/ },
  { name: "coa: ChartOfAccountsListPage real ListView + AccountDrawer nested create", file: "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx", pattern: /<ListView[\s\S]*<AccountDrawer/ },
  { name: "period_close: MonthClosePage real chrome", file: "apps/frontend/src/pages/accounting/MonthClosePage.tsx", pattern: /(ParityTable|ParityDrawer|MoneyInput|DatePicker)/ },
  { name: "chrome.toolbar_filter: BillsPage CollapsedListFilters Apply/Reset/Cancel triad", file: "apps/frontend/src/pages/accounting/BillsPage.tsx", pattern: /CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}/ },
  { name: "invoices.create / accounting.parity.invoice_create: InvoiceCreateModal real ParityDrawer", file: "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx", pattern: /<ParityDrawer/ },
  { name: "payments.receive: RecordPaymentModal real ParityDrawer + MoneyInput", file: "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx", pattern: /(ParityDrawer)[\s\S]*MoneyInput/ },
  { name: "je.create: ManualJEModal real ParityDrawer", file: "apps/frontend/src/components/accounting/ManualJEModal.tsx", pattern: /<ParityDrawer/ },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".accounting-qbo-chrome-b2-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} accounting qbo_chrome leaf asserts (batch 2 of 2)`);
