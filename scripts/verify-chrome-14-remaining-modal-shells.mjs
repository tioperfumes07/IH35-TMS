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
  // OWNER 10-25-2026 1:46 PM: void / override / reason popups are a SMALL centered popup (Modal size="sm"),
  // not a side panel — VoidReasonModal leaves this drawer list (verify-reason-popups-are-small owns it).
  // Submit Factoring Batch — factoring-home money creator.
  "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
  // Factoring batch advance/reserve/release/recourse/void action shell.
  "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
  // P17 modules 11–28: Maintenance Fault Rules create/edit is an active +Create workflow and must
  // use the same QBO-style drawer + sticky footer as the rest of Maintenance.
  "apps/frontend/src/components/maintenance/FaultRuleModal.tsx",
  // P17 modules 11–28: Fleet roster and nested picker creators share one chrome contract.
  "apps/frontend/src/components/fleet/CreateUnitModal.tsx",
  "apps/frontend/src/components/fleet/CreateTrailerModal.tsx",
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

  // OWNER 10-25-2026 1:46 PM: "the pop up be made to spec and size, not entire page, it must be small pop up"
  // — confirm / override / void-reason popups render <Modal ... size="sm"> (440px), the Modal pins its centered
  // max-width inline, and the >=1920px responsive-shell rule caps only drawers (it used to stretch every card).
  const SMALL_POPUPS = [
    "apps/frontend/src/components/override/OverrideButton.tsx",
    "apps/frontend/src/components/shared/ConfirmModal.tsx",
    "apps/frontend/src/components/accounting/VoidReasonModal.tsx",
  ];
  for (const rel of SMALL_POPUPS) {
    const src = fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : "";
    if (!/<Modal\b[^>]*\bsize="sm"/.test(src)) failures.push(`${rel}: must render <Modal ... size="sm"> (small popup, owner 10-25)`);
  }
  const modalSrc = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/Modal.tsx"), "utf8");
  if (!/size === "sm" \? "min\(440px/.test(modalSrc) || !/: \{ maxWidth: centeredMaxWidth \}/.test(modalSrc)) failures.push("Modal.tsx: centered card must pin maxWidth inline (sm = 440px)");
  const shellCss = fs.readFileSync(path.join(ROOT, "apps/frontend/src/styles/responsive-shell.css"), "utf8");
  if (/\.ih35-responsive-shell \[role="dialog"\]\s*[,{]/.test(shellCss)) failures.push('responsive-shell.css: a bare [role="dialog"] max-width rule stretches centered popups — scope it to [data-modal-variant="drawer"]');

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
