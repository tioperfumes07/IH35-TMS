#!/usr/bin/env node
/**
 * BANK-DOM-02 + ACCT-DOM-03 — system-wide closed period/session immutability.
 *
 * Static guard (Rule 17 verify-step). FAILS when:
 *   - the HELD migration that installs DB triggers is missing / unmarked
 *   - categorization / bulk paths lack the reconciled-session assert
 *   - journal_entry_postings trigger is absent from the migration
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIG = "db/migrations/202609060000_closed_period_session_immutability.sql";
const HELPER = "apps/backend/src/banking/closed-session-immutability.ts";
const CAT = "apps/backend/src/banking/categorization.routes.ts";
const BULK = "apps/backend/src/banking/bulk-transactions.ts";
const RECON = "apps/backend/src/banking/reconciliation.routes.ts";
const HELD = "db/migrations/.held-migrations.json";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  console.error(`verify-closed-period-immutability FAILED — ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(path.join(ROOT, MIG))) fail(`missing ${MIG}`);
  const mig = read(MIG);
  if (!/DO NOT RUN ON PROD/.test(mig)) fail(`${MIG} must carry DO NOT RUN ON PROD`);
  if (!/trg_block_reconciled_session_txn_mutation/.test(mig)) {
    fail(`${MIG} must install banking reconciled-session mutation trigger`);
  }
  if (!/trg_block_closed_period_journal_entry_postings/.test(mig)) {
    fail(`${MIG} must install accounting.journal_entry_postings closed-period trigger`);
  }
  if (!/raise_if_txn_in_closed_period/.test(mig)) {
    fail(`${MIG} must call accounting.raise_if_txn_in_closed_period for JE lines`);
  }

  const held = JSON.parse(read(HELD));
  const heldFiles = (held.held ?? []).map((e) => e.file);
  if (!heldFiles.includes(path.basename(MIG))) {
    fail(`${path.basename(MIG)} must be registered in .held-migrations.json held[]`);
  }
  for (const e of held.held ?? []) {
    if (e.file === path.basename(MIG) && "applied_on_prod" in e && e.applied_on_prod !== true) {
      fail(`${e.file}: omit applied_on_prod (false is illegal); only true or absent`);
    }
  }

  const helper = read(HELPER);
  if (!/assertBankTxnNotInReconciledSession/.test(helper)) fail(`${HELPER} missing assert helper`);
  if (!/ReconciledSessionLockedError/.test(helper)) fail(`${HELPER} missing ReconciledSessionLockedError`);
  if (!/status = 'reconciled'/.test(helper)) fail(`${HELPER} must key off status='reconciled'`);

  const cat = read(CAT);
  if (!/assertBankTxnNotInReconciledSession/.test(cat)) {
    fail(`${CAT} must call assertBankTxnNotInReconciledSession on mutate paths`);
  }
  if ((cat.match(/assertBankTxnNotInReconciledSession/g) || []).length < 5) {
    fail(`${CAT} must gate categorize/transfer/skip/investigate/splits (expected ≥5 call sites)`);
  }

  const bulk = read(BULK);
  if (!/assertBankTxnsNotInReconciledSession/.test(bulk)) {
    fail(`${BULK} must call assertBankTxnsNotInReconciledSession`);
  }

  const recon = read(RECON);
  if (!/reconciliation_session_id = \$1/.test(recon) || !/status = 'reconciled'/.test(recon)) {
    fail(`${RECON} complete() must stamp reconciliation_session_id when closing a session`);
  }

  console.log(
    "verify-closed-period-immutability OK — migration + held registry + server asserts + recon stamp present"
  );
}

main();
