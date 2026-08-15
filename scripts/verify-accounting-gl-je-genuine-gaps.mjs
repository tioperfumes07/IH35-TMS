#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^(bills\\.create\\.vendor|accounting\\.parity\\.vendor_bill_create_page|bills\\.multiple|accounting\\.parity\\.expense_create_page|accounting\\.modal\\.bill_payment|accounting\\.panel\\.period_status)$","task":"LINK-F5186-GL-JE-COLUMN-HONESTY-ACCOUNTING-GENUINE-GAPS"} */
/**
 * LINK-F5186 — gl_je Required-column honesty audit, accounting genuine-gap builds.
 * These 6 leaves were real gaps (unlike the false-required drops in the sibling guards): each
 * create-flow already had a real created-record id in local state but never surfaced a path to
 * that record's own JE-linked detail page.
 *
 *   bills.create.vendor / accounting.parity.vendor_bill_create_page (same file,
 *     VendorBillCreatePage.tsx): captured lastBillId but never rendered it -- now EntityLink
 *     kind="bill" -> BillDetailPage.tsx's real journal_entry link.
 *   bills.multiple (CreateMultipleBillsPage.tsx): createVendorBill's response was discarded
 *     entirely in the batch-create loop -- now captured into createdBillIds[] and rendered as
 *     EntityLink kind="bill" per created row.
 *   accounting.parity.expense_create_page (ExpenseCreatePage.tsx): same shape as
 *     VendorBillCreatePage -- lastExpenseId now surfaced via EntityLink kind="expense".
 *   accounting.modal.bill_payment (BillPaymentModal.tsx, hosted only in VendorBalancesPage.tsx):
 *     completedPaymentId was already captured for the TaskLinkPicker step but never linked -- now
 *     EntityLink kind="bill_payment" -> BillPaymentDetailPage.tsx's real journal_entry link.
 *   accounting.panel.period_status (MyAccountantPage.tsx's PeriodStatusPanel): had zero path
 *     toward any JE -- added a GL column linking closed/locked periods to Month Close, which
 *     already carries the (real, if generic) adjusting-entries JE list link.
 *
 * accounting.panel.trk_bulk_register / accounting.panel.detail (FixedAssetsPage.tsx) remain
 * genuinely open -- filed in docs/audit/GUARD-WORKORDERS.md
 * (FIXED-ASSETS-DEPRECIATION-GL-POSTING-NOT-BUILT) rather than force-built, since no depreciation
 * JE posting engine exists yet for either leaf to link to.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_BILL_CREATE = "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx";
const MULTI_BILLS = "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx";
const EXPENSE_CREATE = "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx";
const BILL_PAYMENT_MODAL = "apps/frontend/src/components/ap/BillPaymentModal.tsx";
const MY_ACCOUNTANT = "apps/frontend/src/pages/accounting/MyAccountantPage.tsx";
const PERIODS_ROUTES = "apps/backend/src/accounting/periods.routes.ts";
const FILES = [VENDOR_BILL_CREATE, MULTI_BILLS, EXPENSE_CREATE, BILL_PAYMENT_MODAL, MY_ACCOUNTANT, PERIODS_ROUTES];
const LABEL = "verify-accounting-gl-je-genuine-gaps";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertAccountingGlJeGaps(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const vendorBillCreate = src[VENDOR_BILL_CREATE];
  const multiBills = src[MULTI_BILLS];
  const expenseCreate = src[EXPENSE_CREATE];
  const billPaymentModal = src[BILL_PAYMENT_MODAL];
  const myAccountant = src[MY_ACCOUNTANT];
  const periodsRoutes = src[PERIODS_ROUTES];

  if (!/kind="bill"/.test(vendorBillCreate)) {
    problems.push(`${VENDOR_BILL_CREATE}: must EntityLink kind=bill to the created bill`);
  }
  if (!/createdBillIds: string\[\]/.test(multiBills) || !/created\?\.bill\?\.id/.test(multiBills)) {
    problems.push(`${MULTI_BILLS}: must capture created bill ids into createdBillIds`);
  }
  if (!/kind="bill"/.test(multiBills)) {
    problems.push(`${MULTI_BILLS}: must EntityLink kind=bill per created row`);
  }
  if (!/kind="expense"/.test(expenseCreate)) {
    problems.push(`${EXPENSE_CREATE}: must EntityLink kind=expense to the created expense`);
  }
  if (!/kind="bill_payment"/.test(billPaymentModal)) {
    problems.push(`${BILL_PAYMENT_MODAL}: must EntityLink kind=bill_payment to the recorded payment`);
  }
  if (!/to="\/accounting\/month-close"/.test(myAccountant)) {
    problems.push(`${MY_ACCOUNTANT}: closed/locked periods must link to Month Close's JE trail`);
  }
  if (!/closing_journal_entry_id/.test(myAccountant) || !/kind="journal_entry"/.test(myAccountant)) {
    problems.push(`${MY_ACCOUNTANT}: must prefer a direct EntityLink kind=journal_entry when the backend resolves closing_journal_entry_id`);
  }
  if (!/closing_journal_entry_id/.test(periodsRoutes) || !/journal_entries/.test(periodsRoutes)) {
    problems.push(`${PERIODS_ROUTES}: periods list must resolve closing_journal_entry_id via a real join to accounting.journal_entries`);
  }
  return problems;
}

function selftest() {
  const good = {
    [VENDOR_BILL_CREATE]: `<EntityLink kind="bill" id={lastBillId} label="View bill →" />`,
    [MULTI_BILLS]: `
      const createdBillIds: string[] = [];
      if (created?.bill?.id) createdBillIds.push(created.bill.id);
      <EntityLink kind="bill" id={id} label="View bill →" />
    `,
    [EXPENSE_CREATE]: `<EntityLink kind="expense" id={lastExpenseId} label="View expense →" />`,
    [BILL_PAYMENT_MODAL]: `<EntityLink kind="bill_payment" id={completedPaymentId} label="View payment →" />`,
    [MY_ACCOUNTANT]: `
      p.closing_journal_entry_id ? (
        <EntityLink kind="journal_entry" id={p.closing_journal_entry_id} label="View closing entry →" />
      ) : (
        <Link to="/accounting/month-close" className="text-xs font-semibold text-slate-700 underline">View closing entries →</Link>
      )
    `,
    [PERIODS_ROUTES]: `
      SELECT p.id, cje.id::text AS closing_journal_entry_id
      FROM accounting.periods p
      LEFT JOIN LATERAL (
        SELECT je.id FROM accounting.journal_entries je
        WHERE je.operating_company_id = p.operating_company_id
      ) cje ON true
    `,
  };
  const goodProblems = assertAccountingGlJeGaps(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [VENDOR_BILL_CREATE]: good[VENDOR_BILL_CREATE].replace('kind="bill"', "") },
    { ...good, [MULTI_BILLS]: good[MULTI_BILLS].replace("const createdBillIds: string[] = [];", "") },
    { ...good, [MULTI_BILLS]: good[MULTI_BILLS].replace("if (created?.bill?.id) createdBillIds.push(created.bill.id);", "") },
    { ...good, [MULTI_BILLS]: good[MULTI_BILLS].replace('<EntityLink kind="bill" id={id} label="View bill →" />', "") },
    { ...good, [EXPENSE_CREATE]: good[EXPENSE_CREATE].replace('kind="expense"', "") },
    { ...good, [BILL_PAYMENT_MODAL]: good[BILL_PAYMENT_MODAL].replace('kind="bill_payment"', "") },
    { ...good, [MY_ACCOUNTANT]: good[MY_ACCOUNTANT].replace('to="/accounting/month-close"', "") },
    { ...good, [MY_ACCOUNTANT]: good[MY_ACCOUNTANT].replace(/closing_journal_entry_id/g, "closed_je_id") },
    { ...good, [PERIODS_ROUTES]: good[PERIODS_ROUTES].replace("closing_journal_entry_id", "je_id") },
    { ...good, [PERIODS_ROUTES]: good[PERIODS_ROUTES].replace(/journal_entries/g, "je_table") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertAccountingGlJeGaps(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertAccountingGlJeGaps();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
