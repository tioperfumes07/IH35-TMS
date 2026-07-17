#!/usr/bin/env node
/**
 * verify-record-transfer-mark-transfer-wired.mjs  (0441-mod8-mark-transfer-404-silent)
 *
 * Root cause: RecordTransferModal skipped bank<->bank linkBankTransactionId tagging after
 * createTransfer — stale comment claimed markBankTransactionTransfer was broken while
 * TransferModal already wired the real POST …/transfer contract.
 *
 * Fix: bank_to_bank + linkBankTransactionId calls markBankTransactionTransfer with
 * destination_bank_account_id + transfer_kind (in/out from seedAccountSide).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-record-transfer-mark-transfer-wired";
const MODAL = "apps/frontend/src/pages/banking/RecordTransferModal.tsx";

/** @param {{ modal: string | null }} input */
export function check({ modal }) {
  const f = [];
  if (!modal) {
    f.push(`${MODAL}: missing`);
    return f;
  }
  if (!/markBankTransactionTransfer/.test(modal)) {
    f.push(`${MODAL}: must import and call markBankTransactionTransfer for bank<->bank link`);
  }
  if (/known-broken\/mismatched/.test(modal) || /intentionally left for manual categorization/.test(modal)) {
    f.push(`${MODAL}: must not retain stale skip comment for mark-transfer`);
  }
  if (!/transferType === "bank_to_bank"/.test(modal) || !/fromAccountKind === "bank"/.test(modal)) {
    f.push(`${MODAL}: bank<->bank branch must gate on transferType and bank account kinds`);
  }
  if (!/destination_bank_account_id/.test(modal) || !/transfer_kind/.test(modal)) {
    f.push(`${MODAL}: must pass destination_bank_account_id and transfer_kind to markBankTransactionTransfer`);
  }
  if (!/seedAccountSide === "to"/.test(modal) || !/transferKind = seedAccountSide === "to" \? "in" : "out"/.test(modal)) {
    f.push(`${MODAL}: transfer_kind must derive from seedAccountSide (in for money-in leg, out for money-out)`);
  }
  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({ modal: read(MODAL) });
}

if (process.argv.includes("--selftest")) {
  const good = `
    import { markBankTransactionTransfer } from "../../api/banking";
    if (linkBankTransactionId) {
      const coaSideId = fromAccountKind === "coa" ? fromAccountId : null;
      if (coaSideId) { await categorizeBankTransaction(...); }
      else if (transferType === "bank_to_bank" && fromAccountKind === "bank" && toAccountKind === "bank") {
        const destinationBankAccountId = seedAccountSide === "to" ? fromAccountId : toAccountId;
        const transferKind = seedAccountSide === "to" ? "in" : "out";
        await markBankTransactionTransfer(linkBankTransactionId, operatingCompanyId, {
          destination_bank_account_id: destinationBankAccountId,
          transfer_kind: transferKind,
        });
      }
    }
  `;
  const bad = `
    // mark-transfer has a known-broken/mismatched contract
    // intentionally left for manual categorization
    if (linkBankTransactionId) {
      const coaSideId = ...;
      if (coaSideId) { await categorizeBankTransaction(...); }
    }
  `;
  const checks = [
    ["wired modal passes", check({ modal: good }).length === 0],
    ["stale skip comment fails", check({ modal: bad }).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const msg of failures) console.error("  ✗ " + msg);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (RecordTransferModal bank<->bank links via markBankTransactionTransfer)`);
}
