#!/usr/bin/env node
/**
 * CHROME-14-REMAINING-MODAL-SHELLS guard.
 *
 * Root cause it locks: the CHROME-12 leftover note named five still-centered-Modal money/ops shells
 * that were out of that block's bounded scope — SubmitFactoringModal, ManageAccountsModal,
 * PaymentMethodsCatalogPage, FactoringDetailPage, VoidReasonModal. This block converts the three
 * highest-traffic/highest-leverage ones (VoidReasonModal is a shared component used by JE void,
 * payment-method void, bill-payment void, invoice void, and HOS-violation void; SubmitFactoringModal
 * and the FactoringDetailPage advance/reserve/release/recourse/void action shell are core factoring
 * money workflows) onto the approved QBO-style `<ParityDrawer>` side panel. This guard asserts those
 * three never regress back to a bare Modal.
 *
 * NOT in scope (intentionally excluded, no assertion made here — deferred to a future chrome block):
 *   - ManageAccountsModal (banking admin/settings surface, lower traffic than the three above)
 *   - PaymentMethodsCatalogPage's inline create/edit modals (owner-catalog admin surface)
 *   - Create Vendor / Create Customer (owner lock: stay centered rich modals, never drawers)
 *   - CC bill-payment SUBMIT gating (CC_BILL_PAYMENT_GATED — financial-cluster HOLD, unrelated to shell)
 *   - ACCOUNT_CREATE_GATED, QBOBulkLinkPage, qbo_vendor_id fields (per dispatch HOLD list)
 *
 * Self-test (pure regex logic against synthetic strings): `node scripts/verify-chrome-14-remaining-modal-shells.mjs --selftest`
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
  // Shared VOID/reversal shell — JE void, payment-method void, bill-payment void, invoice void,
  // HOS-violation void all render through this one component.
  "apps/frontend/src/components/accounting/VoidReasonModal.tsx",
  // Submit Factoring Batch — factoring-home money creator.
  "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
  // Factoring batch advance/reserve/release/recourse/void action shell.
  "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
];

function runSelftest() {
  const failures = [];

  const bareModal = 'return (\n  <Modal open={open} onClose={onClose} title="x">\n    <div />\n  </Modal>\n);';
  if (usesParityDrawerNotModal(bareModal)) failures.push("selftest: bare <Modal> source must be rejected");

  const drawer = 'return (\n  <ParityDrawer open={open} onClose={onClose} title="x">\n    <div />\n  </ParityDrawer>\n);';
  if (!usesParityDrawerNotModal(drawer)) failures.push("selftest: <ParityDrawer> source must be accepted");

  const wideDrawer = 'return (\n  <ParityDrawer open={open} onClose={onClose} title="x" size="wide">\n    <div />\n  </ParityDrawer>\n);';
  if (!usesParityDrawerNotModal(wideDrawer)) failures.push('selftest: <ParityDrawer ... size="wide"> source must be accepted');

  const neither = 'return (\n  <div>no shell here</div>\n);';
  if (usesParityDrawerNotModal(neither)) failures.push("selftest: source with neither shell must be rejected");

  if (failures.length) {
    console.error("FAIL verify-chrome-14-remaining-modal-shells --selftest:");
    for (const f of failures) console.error(" -", f);
    process.exitCode = 1;
    return false;
  }
  console.log("PASS verify-chrome-14-remaining-modal-shells --selftest");
  return true;
}

function runLive() {
  const failures = [];
  for (const rel of TARGETS) {
    let source;
    try {
      source = read(rel);
    } catch {
      failures.push(`${rel}: file not found — CHROME-14 target moved or renamed without updating this guard`);
      continue;
    }
    if (!usesParityDrawerNotModal(source)) {
      failures.push(`${rel}: must render <ParityDrawer>, not a bare <Modal> (CHROME-14 QBO side-panel chrome)`);
    }
  }

  if (failures.length) {
    console.error("FAIL verify-chrome-14-remaining-modal-shells:");
    for (const f of failures) console.error(" -", f);
    process.exitCode = 1;
    return false;
  }
  console.log(`PASS verify-chrome-14-remaining-modal-shells — ${TARGETS.length} money/ops shells on ParityDrawer`);
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
