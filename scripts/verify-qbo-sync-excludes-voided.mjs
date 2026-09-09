#!/usr/bin/env node
// BANK-F30020 (2026-09-09) — integrations/qbo/qbo-sync.service.ts's loadBankTxnContext (the row
// loader for a queued QBO sync job) never filtered banking.bank_transactions.voided_at. A sync job
// can be enqueued for a pending transaction that is superseded/voided before the job actually runs
// (bank-tx-dedup.ts::supersedePlaidPendingByExactPostedCandidate); without this filter the voided
// row would still load and get pushed to QuickBooks as a live transaction -- an external-system
// integrity risk. The caller already handles a missing row cleanly (`if (!txn) throw new
// Error("bank_transaction_not_found_for_sync")`, an existing job-failure path), so excluding the
// voided row here is a pure tightening. Live-checked prod: zero voided rows have ever reached
// qbo_id/synced (latent gap, no incident) and zero are currently queued.
import fs from "node:fs";

const REL = "apps/backend/src/integrations/qbo/qbo-sync.service.ts";

export function auditFile(src) {
  const failures = [];
  const m = src.match(/async function loadBankTxnContext\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (!m) {
    failures.push(`loadBankTxnContext function body not found in ${REL} -- guard's own parsing may be stale`);
    return failures;
  }
  const body = m[1];
  if (!/voided_at\s+IS\s+NULL/i.test(body)) {
    failures.push("loadBankTxnContext has no voided_at IS NULL filter -- a voided bank_transaction could be synced to QuickBooks as a live transaction");
  }
  return failures;
}

export function run(root = process.cwd()) {
  let src;
  try {
    src = fs.readFileSync(`${root}/${REL}`, "utf8");
  } catch {
    return [`${REL}: missing`];
  }
  return auditFile(src);
}

if (process.argv.includes("--selftest")) {
  const root = process.cwd();
  const good = fs.readFileSync(`${root}/${REL}`, "utf8");
  const passFailures = auditFile(good);
  if (passFailures.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(passFailures));

  const broken = good.replace(
    "WHERE bt.id = $2\n          AND bt.operating_company_id = $1::uuid\n          AND bt.voided_at IS NULL\n        LIMIT 1",
    "WHERE bt.id = $2\n          AND bt.operating_company_id = $1::uuid\n        LIMIT 1"
  );
  if (broken === good) throw new Error("SELFTEST setup broken -- the voided_at filter text to remove was not found");
  if (auditFile(broken).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from loadBankTxnContext went undetected");

  console.log("verify-qbo-sync-excludes-voided: SELFTEST PASS (1/1 mutation caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-qbo-sync-excludes-voided FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-qbo-sync-excludes-voided OK — the QBO sync job's bank_transaction loader excludes voided rows");
