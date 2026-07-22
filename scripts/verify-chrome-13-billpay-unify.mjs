#!/usr/bin/env node
/**
 * CHROME-13-BILLPAY-UNIFY — Pay Bill / bill-payment (AP multi-bill) / CC-payment-to-vendor /
 * pay-credit-card-from-bank surfaces must all shell with ParityDrawer AND put their Cancel/Save
 * action buttons in the drawer's sticky `footer` slot (the QBO-like payment-drawer chrome already
 * established by RecordTransferModal / RecordPaymentModal / CCPaymentModal) — never a bare
 * centered Modal, and never buttons left scrolling inline inside the body.
 *
 * GATE OWNERSHIP (corrected 2026-07-22): this guard no longer asserts the value of
 * CC_BILL_PAYMENT_GATED. It originally locked the gate to `true` so a chrome PR could not silently
 * flip it — a good instinct, but the owner then gave an explicit GO (#3213) and flipped it to
 * `false`, leaving two guards on main asserting opposite values of the same constant. That is not
 * a stricter repo; it is a repo whose main is permanently red, which blocks every unrelated PR and
 * teaches people to bypass guards.
 *
 * The gate's value now has ONE owner: scripts/verify-owner-financial-gates-ungated.mjs. This guard
 * keeps doing its actual job — drawer shell + sticky-footer chrome — and stays silent on the flag.
 * A future chrome PR still cannot flip the gate unnoticed, because flipping it back would red the
 * dedicated gate guard instead.
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

// The CC_BILL_PAYMENT_GATED value is asserted by verify-owner-financial-gates-ungated.mjs, not
// here — see GATE OWNERSHIP above. Duplicating it produced two guards demanding opposite values.

if (failures.length) {
  console.error("FAIL verify-chrome-13-billpay-unify:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-chrome-13-billpay-unify — bill-payment/CC-payment drawers share ParityDrawer + sticky footer chrome");
