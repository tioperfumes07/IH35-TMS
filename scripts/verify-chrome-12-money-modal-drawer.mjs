#!/usr/bin/env node
/**
 * CHROME-12-MONEY-MODAL→DRAWER guard.
 *
 * Root cause it locks: high-traffic money creators (Invoice, Receive Payment, Manual JE, Transfer,
 * Bank-transaction Split, Pay-with-CC) previously opened as centered `<Modal>` shells instead of the
 * approved QBO-style `<ParityDrawer>` side panel (owner creator-chrome lock, docs/specs/
 * ARCHITECTURE-BLUEPRINT-2026-07-05.md + CHROME-11 leftover note naming InvoiceTypeModalBase +
 * BankTransactionSplitModal as CHROME-12 scope). This guard asserts every named CHROME-12 surface
 * uses ParityDrawer and never regresses back to a bare Modal.
 *
 * NOT in scope (intentionally excluded, no assertion made here):
 *   - Create Vendor / Create Customer (owner lock: stay centered rich modals, never drawers)
 *   - CC bill-payment SUBMIT gating (CC_BILL_PAYMENT_GATED — financial-cluster HOLD, unrelated to shell)
 *   - SubmitFactoringModal / ManageAccountsModal / PaymentMethodsCatalogPage / FactoringDetailPage /
 *     VoidReasonModal — not named in the CHROME-12 dispatch scope; deferred to a future chrome block.
 *
 * Self-test (pure regex logic against synthetic strings): `node scripts/verify-chrome-12-money-modal-drawer.mjs --selftest`
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function usesParityDrawerNotModal(source) {
  const opensBareModal = /<Modal[\s/>]/.test(source);
  const opensParityDrawer = /<ParityDrawer[\s/>]/.test(source);
  return !opensBareModal && opensParityDrawer;
}

const TARGETS = [
  // Invoice create (all 5 invoice types share this shell) — CHROME-11 leftover note.
  "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
  // Receive Payment.
  "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx",
  // Manual JE (canonical component + banking-drawer variant; pages/accounting/ManualJEModal.tsx is a
  // re-export of the first and carries no JSX of its own).
  "apps/frontend/src/components/accounting/ManualJEModal.tsx",
  "apps/frontend/src/pages/banking/components/ManualJEModal.tsx",
  // Transfer (bank-to-bank).
  "apps/frontend/src/pages/banking/TransferModal.tsx",
  "apps/frontend/src/pages/banking/RecordTransferModal.tsx",
  // Pay with CC.
  "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx",
  "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx",
  // Bank-transaction Split — CHROME-11 leftover note; this block's primary fix.
  "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
  // Vendor credit create — writes an accounting.vendor_credits money row, and its ReferenceSelect
  // createKind="vendor" opens a nested InlineCreateDrawer, so a centered Modal here would invert
  // the drawer stack. Added when the creator was converted off <Modal> (PR #3265).
  "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
];

function runSelftest() {
  const failures = [];

  const bareModal = 'return (\n  <Modal open={open} onClose={onClose} title="x">\n    <div />\n  </Modal>\n);';
  if (usesParityDrawerNotModal(bareModal)) failures.push("selftest: bare <Modal> source must be rejected");

  const wideModal = 'return (\n  <Modal open={open} onClose={onClose} title="x" wide>\n    <div />\n  </Modal>\n);';
  if (usesParityDrawerNotModal(wideModal)) failures.push("selftest: <Modal ... wide> source must be rejected");

  const drawer = 'return (\n  <ParityDrawer open={open} onClose={onClose} title="x" size="wide">\n    <div />\n  </ParityDrawer>\n);';
  if (!usesParityDrawerNotModal(drawer)) failures.push("selftest: <ParityDrawer> source must be accepted");

  const neither = 'return (\n  <div>no shell here</div>\n);';
  if (usesParityDrawerNotModal(neither)) failures.push("selftest: source with neither shell must be rejected");

  if (failures.length) {
    console.error("FAIL verify-chrome-12-money-modal-drawer --selftest:");
    for (const f of failures) console.error(" -", f);
    process.exitCode = 1;
    return false;
  }
  console.log("PASS verify-chrome-12-money-modal-drawer --selftest");
  return true;
}

function runLive() {
  const failures = [];
  for (const rel of TARGETS) {
    let source;
    try {
      source = read(rel);
    } catch {
      failures.push(`${rel}: file not found — CHROME-12 target moved or renamed without updating this guard`);
      continue;
    }
    if (!usesParityDrawerNotModal(source)) {
      failures.push(`${rel}: must render <ParityDrawer>, not a bare <Modal> (CHROME-12 QBO side-panel chrome)`);
    }
  }

  if (failures.length) {
    console.error("FAIL verify-chrome-12-money-modal-drawer:");
    for (const f of failures) console.error(" -", f);
    process.exitCode = 1;
    return false;
  }
  console.log(`PASS verify-chrome-12-money-modal-drawer — ${TARGETS.length} money-creator shells on ParityDrawer`);
  return true;
}

const selftestOnly = process.argv.includes("--selftest");
const selftestOk = runSelftest();
if (!selftestOk) {
  process.exit(1);
}
if (!selftestOnly) {
  const liveOk = runLive();
  if (!liveOk) process.exit(1);
}
