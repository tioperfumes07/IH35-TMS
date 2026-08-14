#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["ap_bill"],"leafRe":"^(accounting\\.modal\\.pay_bill|accounting\\.parity\\.pay_bill|accounting\\.modal\\.ccpayment|accounting\\.parity\\.ccpayment|accounting\\.panel\\.bill_detail|accounting\\.parity\\.vendor_bill_create_page|accounting\\.modal\\.bill_payment)$","task":"ACCT-F5152-AP-BILL-SURFACE-WIRING"}
 * OWNER-EXECUTION-PLAN §2 money-cells sweep (2026-08-14): closes the last 5 accounting "ap_bill"
 * money-cell gaps. Verified live (grep, not assumed) that each surface already carries the real
 * ap_bill object contract — vendor + CoA/bank account + bill reference — before writing this guard;
 * this is not new functionality, only its first Built proof.
 *
 * Self-test: node scripts/verify-acct-ap-bill-surface-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-ap-bill-surface-wiring";

const FILES = {
  payBill: "apps/frontend/src/pages/accounting/PayBillModal.tsx",
  ccPayment: "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx",
  billDetail: "apps/frontend/src/pages/accounting/BillDetailPanel.tsx",
  vendorBillForm: "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  billPayment: "apps/frontend/src/components/ap/BillPaymentModal.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function audit(src) {
  const failures = [];

  // PayBillModal.tsx — pays an existing bill: must show the real vendor + real bill it's paying,
  // and (when a bank account is required) the paying account.
  if (!/kind="vendor"[\s\S]{0,120}id=\{billVendorDrillId\(bill\)\}/.test(src.payBill)) {
    failures.push("PayBillModal.tsx: missing canonical vendor EntityLink");
  }
  if (!/kind="bill"[\s\S]{0,80}id=\{bill\.id\}/.test(src.payBill)) {
    failures.push("PayBillModal.tsx: missing canonical bill EntityLink");
  }
  if (!/from_bank_account_id/.test(src.payBill)) {
    failures.push("PayBillModal.tsx: missing paying bank account field");
  }

  // CCPaymentModal.tsx — pays a bill by credit card: vendor label, the CC account, and a real
  // ReferenceSelect (not a raw dropdown) for account selection.
  if (!/bill\.vendor_id/.test(src.ccPayment)) {
    failures.push("CCPaymentModal.tsx: missing vendor reference from the bill being paid");
  }
  if (!/cc_account_id/.test(src.ccPayment)) {
    failures.push("CCPaymentModal.tsx: missing CC account field");
  }
  if (!/<ReferenceSelect/.test(src.ccPayment)) {
    failures.push("CCPaymentModal.tsx: missing canonical ReferenceSelect for account choice");
  }

  // BillDetailPanel.tsx — read surface: vendor identity (name+id — clickability is a separate
  // reverse_link concern, not this column), GL journal-entry lineage, and the money figures.
  if (!/bill\.vendor_id/.test(src.billDetail)) {
    failures.push("BillDetailPanel.tsx: missing vendor reference");
  }
  if (!/kind="journal_entry"[\s\S]{0,80}id=\{bill\.journal_entry_id\}/.test(src.billDetail)) {
    failures.push("BillDetailPanel.tsx: missing canonical journal-entry EntityLink");
  }
  if (!/Open balance/.test(src.billDetail)) {
    failures.push("BillDetailPanel.tsx: missing open-balance figure");
  }

  // VendorBillForm.tsx (VendorBillCreatePage's real form) — the bill CREATE object: vendor + CoA
  // account pickers via the canonical ReferenceSelect, and the submit payload carrying both FKs
  // plus lines.
  if (!/createKind="vendor"/.test(src.vendorBillForm)) {
    failures.push("VendorBillForm.tsx: missing canonical vendor ReferenceSelect");
  }
  if (!/createKind="account"/.test(src.vendorBillForm)) {
    failures.push("VendorBillForm.tsx: missing canonical CoA account ReferenceSelect");
  }
  if (!/vendor_id:\s*vendorKey/.test(src.vendorBillForm) || !/coa_account_id:\s*accountId/.test(src.vendorBillForm)) {
    failures.push("VendorBillForm.tsx: submit payload must carry vendor_id and coa_account_id");
  }
  if (!/lines:\s*linePayloads/.test(src.vendorBillForm)) {
    failures.push("VendorBillForm.tsx: submit payload must carry line items");
  }

  // BillPaymentModal.tsx (components/ap/) — the vendor-first payment flow: lists only that
  // vendor's open bills and stamps the vendor FK on submit.
  if (!/vendor_id:\s*vendorId[\s\S]{0,80}has_balance:\s*true/.test(src.billPayment)) {
    failures.push("BillPaymentModal.tsx: must scope open-bill lookup to the selected vendor");
  }
  if (!/vendor_id:\s*vendorId,/.test(src.billPayment)) {
    failures.push("BillPaymentModal.tsx: submit payload must carry vendor_id");
  }

  return failures;
}

function loadReal() {
  return Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(rel)]));
}

if (process.argv.includes("--selftest")) {
  const good = loadReal();
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["payBill-vendor", "payBill", /kind="vendor"/, 'kind="unit"'],
    ["payBill-bill", "payBill", /kind="bill"/g, 'kind="load"'],
    ["payBill-bankaccount", "payBill", /from_bank_account_id/g, "removed_field"],
    ["cc-vendor", "ccPayment", /bill\.vendor_id/g, "bill.missing_vendor"],
    ["cc-account", "ccPayment", /cc_account_id/g, "removed_field"],
    ["cc-refselect", "ccPayment", /<ReferenceSelect/g, "<RawSelect"],
    ["detail-vendor", "billDetail", /bill\.vendor_id/g, "bill.missing_vendor"],
    ["detail-je", "billDetail", /kind="journal_entry"/, 'kind="account"'],
    ["detail-balance", "billDetail", /Open balance/, "Balance owed"],
    ["form-vendor-picker", "vendorBillForm", /createKind="vendor"/, 'createKind="customer"'],
    ["form-account-picker", "vendorBillForm", /createKind="account"/, 'createKind="class"'],
    ["form-payload", "vendorBillForm", /vendor_id:\s*vendorKey/, "vendor_id: undefined"],
    ["form-lines", "vendorBillForm", /lines:\s*linePayloads/, "lines: []"],
    ["payment-scope", "billPayment", /has_balance:\s*true/, "has_balance: false"],
    ["payment-payload", "billPayment", /vendor_id:\s*vendorId,/, "vendor_id: undefined,"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadReal());
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — pay-bill, CC-payment, bill-detail, vendor-bill-create, and vendor-payment surfaces all carry the real ap_bill object contract`);
