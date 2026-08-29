#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["connectivity","picker_law"],"leafRe":"^(bill_payments\\.(list|create)|bill_payments|bills\\.detail)$","task":"ACCT-F5060-BILL-PAYMENT-HUMAN-LABELS","pr":"#PENDING"}
 * ACCT-SURF-03 — Bill payment deep structural DoD.
 *
 * Frozen map: docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md
 *
 *   node scripts/verify-acct-surf-03-bill-payment.mjs
 *   node scripts/verify-acct-surf-03-bill-payment.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surf-03-bill-payment";

const FILES = {
  map: "docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  list: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  pay: "apps/frontend/src/pages/accounting/PayBillModal.tsx",
  api: "apps/frontend/src/api/accounting.ts",
  reverseGuard: "scripts/verify-bill-payment-list-reverse-links.mjs",
  topbar: "apps/frontend/src/components/Topbar.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,500}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];
  if (!src.map.includes("ACCT-SURF-03") || !src.map.includes("/accounting/bill-payments")) {
    errors.push("frozen map missing ACCT-SURF-03 → /accounting/bill-payments");
  }

  const block = routeBlock(src.manifest, "/accounting/bill-payments");
  if (!block) errors.push("DOD-A: missing route /accounting/bill-payments");
  else {
    if (/ComingSoonPage/.test(block)) {
      errors.push("DOD-A: /accounting/bill-payments must not mount ComingSoonPage");
    }
    if (!block.includes("<BillPaymentsListPage")) {
      errors.push("DOD-A: must render <BillPaymentsListPage />");
    }
  }
  if (!src.subnav.includes("/accounting/bill-payments")) {
    errors.push("DOD-A / NEVER-DELETE: Bill payment leaf missing from subnav");
  }

  if (!src.pay.includes("ParityDrawer") || !src.pay.includes("<ParityDrawer")) {
    errors.push("VERIFY-1: PayBillModal must use ParityDrawer");
  }
  if (!src.list.includes("PayBillModal")) {
    errors.push("DOD-A: BillPaymentsListPage must mount PayBillModal");
  }
  // ACCT-F5057 — Topbar Create→Bill payment must open PayBillModal via ?create=1.
  if (!src.topbar?.includes("/accounting/bill-payments?create=1")) {
    errors.push("VERIFY-1: Topbar Create→Bill payment must navigate to /accounting/bill-payments?create=1");
  }
  if (!/searchParams\.get\(["']create["']\)\s*===\s*["']1["']/.test(src.list)) {
    errors.push("VERIFY-1: BillPaymentsListPage must honor ?create=1 for PayBillModal");
  }
  if (!/params\.delete\(["']create["']\)/.test(src.list) || !/params\.set\(["']create["'],\s*["']1["']\)/.test(src.list)) {
    errors.push("VERIFY-1: BillPaymentsListPage must URL-sync create open/close");
  }

  for (const needle of [
    "payment_date:",
    "amount_cents:",
    "payment_method:",
    "from_bank_account_id:",
  ]) {
    if (!src.pay.includes(needle)) {
      errors.push(`DOD-B: PayBillModal submit payload missing ${needle}`);
    }
  }

  if (!src.pay.includes("getAllAccounts") && !src.pay.includes("listBankAccounts")) {
    errors.push("VERIFY-2: PayBillModal must load bank accounts from banking API (entity-scoped)");
  }
  if (!src.pay.includes("DatePicker")) {
    errors.push("VERIFY-1: PayBillModal must use DatePicker for payment date");
  }
  if (!src.pay.includes("MoneyInput")) {
    errors.push("VERIFY-1: PayBillModal must use MoneyInput for amount");
  }

  if (!src.api.includes("function payVendorBill")) {
    errors.push("VERIFY-3: missing payVendorBill API helper");
  } else {
    const idx = src.api.indexOf("function payVendorBill");
    const slice = src.api.slice(idx, idx + 1200);
    if (!slice.includes("/api/v1/accounting/bills/") || !slice.includes("/pay") || !slice.includes('method: "POST"')) {
      errors.push("VERIFY-3: payVendorBill must POST /api/v1/accounting/bills/:id/pay");
    }
  }

  // Reverse linkage already guarded — require that companion guard file stays present.
  if (!src.reverseGuard.includes("journal_entry_id") || !src.reverseGuard.includes("matched_bank_transaction_id")) {
    errors.push("VERIFY-4: verify-bill-payment-list-reverse-links must assert JE + bank reverse legs");
  }
  if (!src.list.includes('kind="journal_entry"') && !src.list.includes("kind=\"journal_entry\"")) {
    errors.push("VERIFY-4: BillPaymentsListPage must EntityLink journal_entry");
  }
  if (!src.list.includes('kind="bill"')) {
    errors.push("VERIFY-4: BillPaymentsListPage must EntityLink bill");
  }
  if (!src.list.includes('kind="vendor"')) {
    errors.push("VERIFY-4: BillPaymentsListPage must EntityLink vendor");
  }
  // ACCT-F5060 — CLS-LINKAGE-ONEWAY: list must use joined bill_number / JE memo+date, not null→UUID chrome.
  // GUARD RE-ANCHOR (CC-2, 2026-08-29): entityLabel(row.bill_number, …) was superseded by
  // visibleDocumentLabel(row.bill_number, …) (lib/entity-label.ts) — a deliberate, documented
  // successor for list/register/audit rows that shows the noun instead of a "not visible"
  // RLS-tombstone-confusing string when the number is missing. Accept either call shape so this
  // guard tracks the real behavior (bill number preferred over UUID) instead of one specific
  // helper name.
  if (
    !/(?:entityLabel|visibleDocumentLabel)\(\s*row\.bill_number\s*,\s*row\.bill_id\s*,\s*["']Bill["']\s*\)/.test(
      src.list
    )
  ) {
    errors.push("VERIFY-4: BillPaymentsListPage bill EntityLink must entityLabel/visibleDocumentLabel(row.bill_number, …)");
  }
  if (!/journal_entry_date/.test(src.list) || !/journal_entry_memo/.test(src.list)) {
    errors.push("VERIFY-4: BillPaymentsListPage JE EntityLink must prefer journal_entry_date/memo");
  }
  if (/(?:entityLabel|visibleDocumentLabel)\(\s*null\s*,\s*row\.bill_id\s*,\s*["']Bill["']\s*\)/.test(src.list)) {
    errors.push("VERIFY-4: BillPaymentsListPage must not entityLabel/visibleDocumentLabel(null, bill_id) — UUID chrome");
  }
  // ACCT-F5073 — bank txn human labels on list (connectivity).
  if (/entityLabel\(\s*null\s*,\s*row\.matched_bank_transaction_id/.test(src.list)) {
    errors.push("VERIFY-4: BillPaymentsListPage must not entityLabel(null, matched_bank_transaction_id)");
  }
  if (!/matched_bank_transaction_date/.test(src.list) || !/matched_bank_transaction_description/.test(src.list)) {
    errors.push("VERIFY-4: BillPaymentsListPage bank EntityLink must prefer date/description");
  }

  const service = read("apps/backend/src/accounting/bills.service.ts");
  if (!service.includes("INSERT INTO accounting.bill_payments")) {
    errors.push("VERIFY-3: payBill must INSERT INTO accounting.bill_payments (canonical)");
  }
  if (/INSERT INTO\s+bank\.bill_payments|INSERT INTO\s+payroll\./i.test(service)) {
    errors.push("VERIFY-3: payBill must not write RETIRE schemas");
  }
  // ACCT-F5060 — listBillPayments must join bill_number + JE memo/date (detail already did).
  if (!/b\.bill_number/.test(service) || !/AS journal_entry_memo/.test(service) || !/AS journal_entry_date/.test(service)) {
    errors.push("VERIFY-4: bills.service list/detail must SELECT b.bill_number + journal_entry_date/memo");
  }
  if (!/AS matched_bank_transaction_date/.test(service) || !/AS matched_bank_transaction_description/.test(service)) {
    errors.push("VERIFY-4: bills.service listBillPayments must JOIN bank_transactions date/description");
  }

  const billDetail = read("apps/frontend/src/pages/accounting/BillDetailPage.tsx");
  if (!/journal_entry_date/.test(billDetail) || !/journal_entry_memo/.test(billDetail)) {
    errors.push("VERIFY-4: BillDetailPage JE EntityLink must prefer journal_entry_date/memo");
  }
  if (/entityLabel\(\s*null\s*,\s*bill\.journal_entry_id/.test(billDetail)) {
    errors.push("VERIFY-4: BillDetailPage must not entityLabel(null, journal_entry_id) when memo/date exist");
  }

  return errors;
}

function selftest() {
  const good = {
    map: "ACCT-SURF-03 `/accounting/bill-payments`",
    manifest: 'path="/accounting/bill-payments"\n<BillPaymentsListPage />\n',
    subnav: "/accounting/bill-payments",
    list: 'PayBillModal\nkind="journal_entry"\nkind="bill"\nkind="vendor"\nsearchParams.get("create") === "1"\nparams.set("create", "1")\nparams.delete("create")\nvisibleDocumentLabel(row.bill_number, row.bill_id, "Bill")\njournal_entry_date\njournal_entry_memo\nmatched_bank_transaction_date\nmatched_bank_transaction_description\n',
    pay: [
      "ParityDrawer",
      "<ParityDrawer",
      "payment_date:",
      "amount_cents:",
      "payment_method:",
      "from_bank_account_id:",
      "getAllAccounts",
      "DatePicker",
      "MoneyInput",
    ].join("\n"),
    api: 'export function payVendorBill(){ return apiRequest(`/api/v1/accounting/bills/${id}/pay`, { method: "POST" }) }',
    reverseGuard: "journal_entry_id matched_bank_transaction_id",
    topbar: '[t("topbar.create_bill_payment", "Bill payment"), "/accounting/bill-payments?create=1"]',
  };
  // Plant service + bill detail via monkey-patch of read is unavailable; contractErrors reads
  // live files for service/billDetail — selftest only covers the injected src fields above.
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const thinList = {
    ...good,
    list: 'PayBillModal\nkind="journal_entry"\nkind="bill"\nkind="vendor"\nsearchParams.get("create") === "1"\nparams.set("create", "1")\nparams.delete("create")\nentityLabel(null, row.bill_id, "Bill")\n',
  };
  if (!contractErrors(thinList).some((e) => /bill_number|UUID chrome/.test(e))) {
    console.error(`${LABEL} --selftest FAIL: must catch null bill_number label`);
    process.exit(1);
  }
  // GUARD RE-ANCHOR (CC-2, 2026-08-29): same UUID-chrome mutation, but through the
  // visibleDocumentLabel successor — proves the re-anchored regex catches a real regression
  // under the CURRENT helper name, not just the retired entityLabel spelling.
  const thinListVisibleDoc = {
    ...good,
    list: 'PayBillModal\nkind="journal_entry"\nkind="bill"\nkind="vendor"\nsearchParams.get("create") === "1"\nparams.set("create", "1")\nparams.delete("create")\nvisibleDocumentLabel(null, row.bill_id, "Bill")\n',
  };
  if (!contractErrors(thinListVisibleDoc).some((e) => /bill_number|UUID chrome/.test(e))) {
    console.error(`${LABEL} --selftest FAIL: must catch null bill_number label via visibleDocumentLabel`);
    process.exit(1);
  }
  const thin = { ...good, pay: "export function PayBillModal(){ return <div>thin</div> }" };
  if (!contractErrors(thin).some((e) => e.includes("ParityDrawer"))) {
    console.error(`${LABEL} --selftest FAIL thin pay modal not caught`);
    process.exit(1);
  }
  const noCreate = { ...good, topbar: '[t("topbar.create_bill_payment", "Bill payment"), "/accounting/bill-payments"]' };
  if (!contractErrors(noCreate).some((e) => e.includes("?create=1"))) {
    console.error(`${LABEL} --selftest FAIL Topbar create deep-link not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — ACCT-SURF-03 Bill payment structural DoD; live browser still UNVERIFIED`
);
process.exit(0);
