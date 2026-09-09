#!/usr/bin/env node
// BANK-F30019 (2026-09-09) — banking/bulk-transactions.ts defines its OWN separate,
// non-shared pendingStatusesSql() (distinct from banking/pending-categorization.ts's
// pendingCategorizationPredicate, fixed as BANK-F30016). It gates bulkCategorizeTransactions
// (writes categorized_at) and bulkPostAsBills (posts a REAL bill + bill_payment + GL entry via
// postSourceTransaction) and never filtered banking.bank_transactions.voided_at -- a voided row
// that still carried status='pending_categorization'/'uncategorized' could be bulk-posted as a
// real bill, double-booking a transaction that was already reversed/superseded. This is a
// write-path/GL-posting risk, not just a KPI/list-inflation one.
import fs from "node:fs";

const REL = "apps/backend/src/banking/bulk-transactions.ts";

export function auditFile(src) {
  const failures = [];
  const m = src.match(/function pendingStatusesSql\(\)\s*:\s*string\s*\{([\s\S]*?)\n\}/);
  if (!m) {
    failures.push(`pendingStatusesSql function body not found in ${REL} -- guard's own parsing may be stale`);
    return failures;
  }
  const body = m[1];
  if (!/voided_at\s+IS\s+NULL/i.test(body)) {
    failures.push("bulk-transactions.ts's local pendingStatusesSql has no voided_at IS NULL filter -- a voided row could be bulk-categorized or bulk-posted as a real bill/GL entry");
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
    "return `(bt.status = 'pending_categorization' OR bt.status = 'uncategorized') AND bt.voided_at IS NULL`;",
    "return `(bt.status = 'pending_categorization' OR bt.status = 'uncategorized')`;"
  );
  if (broken === good) throw new Error("SELFTEST setup broken -- the pendingStatusesSql voided_at filter text to remove was not found");
  if (auditFile(broken).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from pendingStatusesSql went undetected");

  console.log("verify-bulk-transactions-excludes-voided: SELFTEST PASS (1/1 mutation caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-bulk-transactions-excludes-voided FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-bulk-transactions-excludes-voided OK — bulk-transactions.ts's write-gate excludes voided bank_transactions rows");
