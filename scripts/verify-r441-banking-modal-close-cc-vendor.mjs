#!/usr/bin/env node
/**
 * ROUND 441 C1–C4 — banking modal close / edit hydrate / CC liability filter / vendor column dash.
 *
 *   C1  MatchDrawer confirm + multiConfirm call onClose() on success (never on error).
 *       DesignView postTransaction collapses expand + clears draft on success.
 *   C2  DesignView hydrates sticky empty draft string fields from makeDefaultDraft on expand.
 *   C3  RecordCCPaymentModal liabilityOptions = children of "Credit Cards" parent only.
 *   C4  Payee/Vendor register column never paints "Vendor — not visible" (em dash instead).
 *
 * Usage:
 *   node scripts/verify-r441-banking-modal-close-cc-vendor.mjs
 *   node scripts/verify-r441-banking-modal-close-cc-vendor.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const MATCH = "apps/frontend/src/pages/banking/components/MatchDrawer.tsx";
const DESIGN = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const CC = "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx";

function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function read(rel) {
  return stripComments(fs.readFileSync(path.join(repoRoot, rel), "utf8"));
}

export function checks() {
  const match = read(MATCH);
  const design = read(DESIGN);
  const cc = read(CC);

  // C1 — confirmMutation onSuccess closes; multiConfirm onSuccess closes.
  const confirmCloses =
    /pushToast\(\s*"Match confirmed[\s\S]{0,400}?onAccepted\?\.\(\);\s*onClose\(\);/.test(match);
  const multiCloses =
    /pushToast\(\s*"Multi-document match confirmed[\s\S]{0,400}?onAccepted\?\.\(\);\s*onClose\(\);/.test(match);
  // C1 — Post success collapses expand.
  const postCloses =
    /Transaction posted[\s\S]{0,200}?setExpandedTxId\(null\)/.test(design) &&
    /Post failed/.test(design);

  // C2 — hydrate effect fills empty string sticky draft keys from makeDefaultDraft.
  const editHydrate =
    /makeDefaultDraft\(tx\)/.test(design) &&
    /typeof next !== "string"/.test(design) &&
    /cur === "" && next !== ""/.test(design);

  // C3 — Credit Cards parent children only.
  const ccFilter =
    /account_name[\s\S]{0,80}?toLowerCase\(\) === "credit cards"/.test(cc) &&
    /parent_account_id === creditCardsParent\.id/.test(cc) &&
    !/\(acct\.account_type === "Liability" \|\|/.test(cc);

  // C4 — payee column uses em dash, not entityLabel(..., "Vendor").
  const payeeCol = (design.match(/key:\s*"payee"[\s\S]{0,900}/) ?? [""])[0];
  const vendorColDash =
    payeeCol.length > 0 &&
    /usableName \|\| "—"/.test(payeeCol) &&
    !/entityLabel\(\s*draft\.payee\s*,\s*draft\.vendorId\s*,\s*"Vendor"\s*\)/.test(payeeCol);

  return {
    confirmCloses,
    multiCloses,
    postCloses,
    editHydrate,
    ccFilter,
    vendorColDash,
  };
}

const LABELS = {
  confirmCloses: "R441-C1 — MatchDrawer confirmMutation onSuccess calls onClose()",
  multiCloses: "R441-C1 — MatchDrawer multiConfirmMutation onSuccess calls onClose()",
  postCloses: "R441-C1 — DesignView postTransaction success setExpandedTxId(null)",
  editHydrate: "R441-C2 — DesignView hydrates empty sticky draft strings from makeDefaultDraft",
  ccFilter: 'R441-C3 — RecordCCPaymentModal liabilityOptions = Credit Cards children only',
  vendorColDash: 'R441-C4 — payee column uses "—" never entityLabel Vendor — not visible',
};

function selftest() {
  const ok = Object.values(checks()).every(Boolean);
  if (!ok) {
    console.error("SELFTEST FAIL — one or more R441 C1–C4 assertions red on live tree");
    for (const [k, v] of Object.entries(checks())) {
      console.error(`  ${v ? "PASS" : "FAIL"}  ${LABELS[k]}`);
    }
    process.exit(1);
  }
  console.log("PASS verify-r441-banking-modal-close-cc-vendor --selftest");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const results = checks();
  let failed = 0;
  for (const [k, v] of Object.entries(results)) {
    if (!v) {
      console.error(`FAIL  ${LABELS[k]}`);
      failed += 1;
    } else {
      console.log(`PASS  ${LABELS[k]}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} R441 C1–C4 assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nPASS verify-r441-banking-modal-close-cc-vendor");
}

main();
