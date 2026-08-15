#!/usr/bin/env node
/** @matrix-built {"modules":["banking"],"cols":["bank"],"leafRe":"^(reconciliation|banking\\.modal\\.record_ccpayment|banking\\.modal\\.record_transfer|banking\\.modal\\.transfer|banking\\.modal\\.bank_transaction_split|banking\\.drawer\\.match|banking\\.parity\\.record_ccpayment|banking\\.parity\\.record_transfer|banking\\.parity\\.transfer|banking\\.parity\\.bank_transaction_split|banking\\.parity\\.match)$","task":"LINK-F5190-BANK-COLUMN-HONESTY-GENUINE-GAPS"} */
/**
 * LINK-F5190 — bank Required-column honesty audit, genuine-gap batch. 11 leaves close to 6
 * code fixes, all sharing one root cause: a real banking.bank_transactions id was already
 * available (fetched server-side or passed as a prop, and already used FUNCTIONALLY in a
 * mutation call) but never rendered as an EntityLink.
 *
 *   - BankReconciliationPage.tsx (reconciliation): worklist rows carry row.id (real
 *     bank_transaction id, already used in acceptBankReconMatch/rejectBankReconMatch/
 *     manualBankReconMatch) but rendered as a plain clickable <button> with no link. Row
 *     moved from <button> to role="button" <div> (a real <a> can't nest inside a <button>)
 *     with an EntityLink sibling; EntityLink's own stopPropagation keeps the drill click from
 *     also re-selecting the row.
 *   - RecordCCPaymentModal.tsx / RecordTransferModal.tsx / TransferModal.tsx (closes
 *     banking.modal.record_ccpayment/record_transfer/transfer + their .parity.* twins, same
 *     files): each already receives a real linkBankTransactionId prop (already used in
 *     categorizeBankTransaction/markBankTransactionTransfer) but never rendered it.
 *   - BankTransactionSplitModal.tsx (closes banking.modal.bank_transaction_split +
 *     .parity.bank_transaction_split): transaction.id (already used throughout
 *     getBankTransactionSplits/save/commit/void) rendered the header description as plain
 *     text; now wrapped in EntityLink.
 *   - MatchDrawer.tsx (closes banking.drawer.match + banking.parity.match): bankTransactionId
 *     prop (already used in getMatchCandidates/acceptBankReconMatch/categorizeBankTransaction)
 *     was never rendered -- only candidate rows got EntityLinks, never the transaction being
 *     matched itself.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECONCILIATION_PAGE = "apps/frontend/src/pages/banking/BankReconciliationPage.tsx";
const RECORD_CC_PAYMENT_MODAL = "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx";
const RECORD_TRANSFER_MODAL = "apps/frontend/src/pages/banking/RecordTransferModal.tsx";
const TRANSFER_MODAL = "apps/frontend/src/pages/banking/TransferModal.tsx";
const SPLIT_MODAL = "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx";
const MATCH_DRAWER = "apps/frontend/src/pages/banking/components/MatchDrawer.tsx";
const FILES = [RECONCILIATION_PAGE, RECORD_CC_PAYMENT_MODAL, RECORD_TRANSFER_MODAL, TRANSFER_MODAL, SPLIT_MODAL, MATCH_DRAWER];
const LABEL = "verify-bank-required-honest-genuine";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  banking: "docs/specs/scoreboard/modules/banking.required.json",
};

const KEEP_REQUIRED = [
  ["banking", "reconciliation"],
  ["banking", "banking.modal.record_ccpayment"],
  ["banking", "banking.modal.record_transfer"],
  ["banking", "banking.modal.transfer"],
  ["banking", "banking.modal.bank_transaction_split"],
  ["banking", "banking.drawer.match"],
  ["banking", "banking.parity.record_ccpayment"],
  ["banking", "banking.parity.record_transfer"],
  ["banking", "banking.parity.transfer"],
  ["banking", "banking.parity.bank_transaction_split"],
  ["banking", "banking.parity.match"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertBankGenuine(sources, docs) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];

  for (const [mod, id] of KEEP_REQUIRED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if (!(leaf.required || []).includes("bank")) problems.push(`${mod}:${id} must keep bank`);
  }

  const recon = src[RECONCILIATION_PAGE];
  const ccPayment = src[RECORD_CC_PAYMENT_MODAL];
  const transfer1 = src[RECORD_TRANSFER_MODAL];
  const transfer2 = src[TRANSFER_MODAL];
  const split = src[SPLIT_MODAL];
  const match = src[MATCH_DRAWER];

  if (!/kind="bank_transaction"/.test(recon)) problems.push(`${RECONCILIATION_PAGE}: worklist row must EntityLink kind=bank_transaction`);
  if (!/role="button"/.test(recon)) problems.push(`${RECONCILIATION_PAGE}: row must be role=button div, not a <button> wrapping an anchor`);
  if (!/kind="bank_transaction"/.test(ccPayment)) problems.push(`${RECORD_CC_PAYMENT_MODAL}: must EntityLink kind=bank_transaction for linkBankTransactionId`);
  if (!/kind="bank_transaction"/.test(transfer1)) problems.push(`${RECORD_TRANSFER_MODAL}: must EntityLink kind=bank_transaction for linkBankTransactionId`);
  if (!/kind="bank_transaction"/.test(transfer2)) problems.push(`${TRANSFER_MODAL}: must EntityLink kind=bank_transaction for linkBankTransactionId`);
  if (!/kind="bank_transaction"/.test(split)) problems.push(`${SPLIT_MODAL}: header must EntityLink kind=bank_transaction`);
  if (!/kind="bank_transaction"/.test(match)) problems.push(`${MATCH_DRAWER}: must EntityLink kind=bank_transaction for bankTransactionId`);

  return problems;
}

function selftest() {
  const good = {
    [RECONCILIATION_PAGE]: `
      <div role="button" tabIndex={0} onClick={() => setSelectedTxId(row.id)}>
        <EntityLink kind="bank_transaction" id={row.id} label="x" />
      </div>
    `,
    [RECORD_CC_PAYMENT_MODAL]: `
      {linkBankTransactionId ? <EntityLink kind="bank_transaction" id={linkBankTransactionId} label="x" /> : null}
    `,
    [RECORD_TRANSFER_MODAL]: `
      {linkBankTransactionId ? <EntityLink kind="bank_transaction" id={linkBankTransactionId} label="x" /> : null}
    `,
    [TRANSFER_MODAL]: `
      {linkBankTransactionId ? <EntityLink kind="bank_transaction" id={linkBankTransactionId} label="x" /> : null}
    `,
    [SPLIT_MODAL]: `
      <EntityLink kind="bank_transaction" id={transaction.id} label="x" />
    `,
    [MATCH_DRAWER]: `
      {bankTransactionId ? <EntityLink kind="bank_transaction" id={bankTransactionId} label="x" /> : null}
    `,
  };
  const docs = {};
  for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);

  const goodProblems = assertBankGenuine(good, docs);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  const sourceMutations = [
    { ...good, [RECONCILIATION_PAGE]: good[RECONCILIATION_PAGE].replace('kind="bank_transaction"', "") },
    { ...good, [RECONCILIATION_PAGE]: good[RECONCILIATION_PAGE].replace('role="button"', "") },
    { ...good, [RECORD_CC_PAYMENT_MODAL]: good[RECORD_CC_PAYMENT_MODAL].replace('kind="bank_transaction"', "") },
    { ...good, [RECORD_TRANSFER_MODAL]: good[RECORD_TRANSFER_MODAL].replace('kind="bank_transaction"', "") },
    { ...good, [TRANSFER_MODAL]: good[TRANSFER_MODAL].replace('kind="bank_transaction"', "") },
    { ...good, [SPLIT_MODAL]: good[SPLIT_MODAL].replace('kind="bank_transaction"', "") },
    { ...good, [MATCH_DRAWER]: good[MATCH_DRAWER].replace('kind="bank_transaction"', "") },
  ];
  for (const mutated of sourceMutations) {
    mutationCount++;
    if (assertBankGenuine(mutated, docs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — source mutation ${mutationCount} escaped detection`);
      process.exit(1);
    }
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = (leaf.required || []).filter((c) => c !== "bank");
    if (assertBankGenuine(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: drop bank from ${mod}:${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const liveDocs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) liveDocs[mod] = readJson(rel);
const failures = assertBankGenuine(undefined, liveDocs);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
