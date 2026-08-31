#!/usr/bin/env node
/**
 * verify-no-hard-delete-bank-stubs.mjs (F9-01)
 *
 * Tripwire: mergeManualBankTransactionStub must void, never DELETE, banking.bank_transactions.
 * --selftest plants a DELETE and proves RED.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-hard-delete-bank-stubs";

const DEDUP = "apps/backend/src/banking/bank-tx-dedup.ts";
const PLAID_SERVICE = "apps/backend/src/integrations/plaid/plaid.service.ts";
const P7_ROUTES = "apps/backend/src/banking/p7-wave2.routes.ts";
const BANKING_API = "apps/frontend/src/api/banking.ts";
const BANKING_VIEW = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const MIG = "db/migrations/202609010050_f9_01_bank_tx_stub_void_not_delete.sql";
const DELETE_RE = /DELETE\s+FROM\s+banking\.bank_transactions\b/i;
const EXCLUDE_DIR_RE = /(\/__tests__\/|\/tests\/|\.test\.|\.spec\.|e2e-)/i;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist") continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else if (/\.(ts|js|mjs|cjs)$/.test(ent.name)) out.push(abs);
  }
  return out;
}

export function assertNoHardDeleteBankStubs(opts = {}) {
  const root = opts.root ?? ROOT;
  const failures = [];

  const migAbs = path.join(root, MIG);
  if (!fs.existsSync(migAbs)) failures.push(`missing ${MIG}`);
  else {
    const sql = fs.readFileSync(migAbs, "utf8");
    if (!/DO NOT RUN ON PROD/i.test(sql)) failures.push(`${MIG} must carry DO NOT RUN ON PROD marker`);
    if (!/voided_at/i.test(sql)) failures.push(`${MIG} must add voided_at`);
    if (!/merged_into_bank_transaction_id/i.test(sql)) failures.push(`${MIG} must add merged_into_bank_transaction_id`);
    if (!/uq_bank_transactions_account_dedup/.test(sql)) {
      failures.push(`${MIG} must replace unique dedup index with active-only partial unique`);
    }
  }

  const dedupAbs = path.join(root, DEDUP);
  if (!fs.existsSync(dedupAbs)) failures.push(`missing ${DEDUP}`);
  else {
    const src = fs.readFileSync(dedupAbs, "utf8");
    if (DELETE_RE.test(src)) failures.push(`${DEDUP} must not DELETE FROM banking.bank_transactions`);
    if (!/merged_into_plaid/.test(src)) failures.push(`${DEDUP} must stamp voided_reason merged_into_plaid`);
    if (!/merged_into_bank_transaction_id/.test(src)) {
      failures.push(`${DEDUP} must set merged_into_bank_transaction_id on void`);
    }
    if (!/voided_at IS NULL/.test(src)) failures.push(`${DEDUP} stub lookup must exclude already-voided rows`);
    if (!/retirePlaidPendingPredecessor/.test(src)) failures.push(`${DEDUP} must retire Plaid pending predecessors`);
    if (!/pending\s*=\s*true/.test(src)) failures.push(`${DEDUP} pending retirement must target pending rows only`);
    if (!/replaced_by_plaid_posted/.test(src)) failures.push(`${DEDUP} must explain the posted replacement on the WORM row`);
    if (!/supersedePlaidPendingByExactPostedCandidate/.test(src)) failures.push(`${DEDUP} must expose fail-closed historical pending supersede`);
    if (!/multiple_exact_posted_candidates/.test(src)) failures.push(`${DEDUP} must reject ambiguous posted candidates`);
    if (!/operator_confirmed_plaid_pending_replacement/.test(src)) failures.push(`${DEDUP} operator supersede must retain an explicit WORM reason`);
  }

  for (const [rel, required] of [
    [P7_ROUTES, /supersede-plaid-pending/],
    [BANKING_API, /supersedePlaidPendingTransaction/],
    [BANKING_VIEW, /Supersede pending duplicate/],
  ]) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) failures.push(`missing ${rel}`);
    else if (!required.test(fs.readFileSync(abs, "utf8"))) failures.push(`${rel} must wire the operator pending-supersede control`);
  }

  const plaidServiceAbs = path.join(root, PLAID_SERVICE);
  if (!fs.existsSync(plaidServiceAbs)) failures.push(`missing ${PLAID_SERVICE}`);
  else {
    const src = fs.readFileSync(plaidServiceAbs, "utf8");
    if (!/retirePlaidPendingPredecessor\(client/.test(src)) {
      failures.push(`${PLAID_SERVICE} must invoke pending predecessor retirement in the Plaid ingest transaction`);
    }
    if (!/pendingPlaidTransactionId:\s*transaction\.pending_transaction_id/.test(src)) {
      failures.push(`${PLAID_SERVICE} must use Plaid's authoritative pending_transaction_id relationship`);
    }
  }

  const srcRoot = path.join(root, "apps/backend/src");
  if (fs.existsSync(srcRoot)) {
    for (const file of walk(srcRoot)) {
      const rel = path.relative(root, file);
      if (EXCLUDE_DIR_RE.test(rel)) continue;
      const text = fs.readFileSync(file, "utf8");
      if (DELETE_RE.test(text)) {
        failures.push(`${rel}: hard DELETE FROM banking.bank_transactions forbidden outside tests`);
      }
    }
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "f9-01-bank-stub-"));
  const dedupDir = path.join(tmp, "apps/backend/src/banking");
  const plaidDir = path.join(tmp, "apps/backend/src/integrations/plaid");
  const migDir = path.join(tmp, "db/migrations");
  fs.mkdirSync(dedupDir, { recursive: true });
  fs.mkdirSync(plaidDir, { recursive: true });
  fs.mkdirSync(migDir, { recursive: true });
  fs.writeFileSync(
    path.join(migDir, "202609010050_f9_01_bank_tx_stub_void_not_delete.sql"),
    "-- DO NOT RUN ON PROD\nALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS voided_at timestamptz;\nALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS merged_into_bank_transaction_id uuid;\nCREATE UNIQUE INDEX uq_bank_transactions_account_dedup_active ON banking.bank_transactions (bank_account_id, dedup_hash) WHERE voided_at IS NULL;\n"
  );
  fs.writeFileSync(
    path.join(dedupDir, "bank-tx-dedup.ts"),
    `await client.query(\`DELETE FROM banking.bank_transactions WHERE id = $1\`, [stubId]);\n`
  );
  fs.writeFileSync(path.join(plaidDir, "plaid.service.ts"), "// planted: pending replacement retirement removed\n");
  const planted = assertNoHardDeleteBankStubs({ root: tmp });
  if (planted.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAIL — planted DELETE not caught`);
    process.exit(1);
  }
  if (!planted.some((failure) => failure.includes("authoritative pending_transaction_id"))) {
    console.error(`[${LABEL}] SELFTEST FAIL — planted pending-replacement omission not caught`);
    process.exit(1);
  }
  if (!planted.some((failure) => failure.includes("historical pending supersede"))) {
    console.error(`[${LABEL}] SELFTEST FAIL — planted historical supersede omission not caught`);
    process.exit(1);
  }
  console.log(`[${LABEL}] SELFTEST PASS — planted DELETE, ingest, and historical supersede omissions caught (${planted.length})`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = assertNoHardDeleteBankStubs();
  if (failures.length) {
    console.error(`[${LABEL}] FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS — bank stub/pending replacement merges void; historical operator supersede wired; no hard DELETE`);
}

main();
