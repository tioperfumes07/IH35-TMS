#!/usr/bin/env node
/**
 * CHROME-13-BILLPAY-UNIFY — Pay Bill / bill-payment (AP multi-bill) / CC-payment-to-vendor /
 * pay-credit-card-from-bank surfaces must all shell with ParityDrawer AND put their Cancel/Save
 * action buttons in the drawer's sticky `footer` slot (the QBO-like payment-drawer chrome already
 * established by RecordTransferModal / RecordPaymentModal / CCPaymentModal) — never a bare
 * centered Modal, and never buttons left scrolling inline inside the body.
 *
 * Does NOT touch CC_BILL_PAYMENT_GATED or ACCOUNT_CREATE_GATED — this guard also locks the
 * CC bill-payment HOLD gate so a future chrome PR can't silently flip it while "just" touching
 * the drawer shell.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const failures = [];

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), "utf8");
}

const SURFACES = [
  { path: "apps/frontend/src/pages/accounting/PayBillModal.tsx", label: "PayBillModal" },
  { path: "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx", label: "CCPaymentModal" },
  { path: "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx", label: "RecordCCPaymentModal" },
  { path: "apps/frontend/src/components/ap/BillPaymentModal.tsx", label: "ap/BillPaymentModal" },
];

for (const { path, label } of SURFACES) {
  const src = read(path);
  if (!src.includes("ParityDrawer")) {
    failures.push(`${label} (${path}) no longer shells with ParityDrawer`);
  }
  if (/<Modal[\s/>]/.test(src)) {
    failures.push(`${label} (${path}) renders a centered <Modal> — regression off the payment-drawer chrome`);
  }
  if (!/footer=\{/.test(src)) {
    failures.push(`${label} (${path}) no longer passes footer={...} to ParityDrawer — action buttons must live in the sticky footer, matching RecordTransferModal/RecordPaymentModal/CCPaymentModal`);
  }
}

// CC-bill-payment stays HOLD-for-Jorge: this block unifies chrome only, never flips the gate.
const ccBillPayment = read("apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx");
if (!/const CC_BILL_PAYMENT_GATED\s*=\s*true/.test(ccBillPayment)) {
  failures.push("CCPaymentModal.tsx CC_BILL_PAYMENT_GATED must stay true — flip requires explicit Jorge financial-cluster approval, not a chrome PR");
}

if (failures.length) {
  console.error("FAIL verify-chrome-13-billpay-unify:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-chrome-13-billpay-unify — bill-payment/CC-payment drawers share ParityDrawer + sticky footer chrome; CC gate untouched");
