#!/usr/bin/env node
// BANK-F30016 (2026-09-09) — pendingCategorizationPredicate (banking/pending-categorization.ts) is
// the SINGLE shared definition of "needs categorization" for both the Banking Home UNCATEGORIZED
// KPI (countUncategorizedTransactions) and the Transactions "For review" queue
// (categorization.routes.ts's pendingStatusesSql, which just calls this same function) -- per its
// own BANKING-1 comment, "so the headline count can never diverge from the list." It never filtered
// banking.bank_transactions.voided_at, so a voided/reversed row that still carried
// status='pending_categorization'/'uncategorized' inflated both surfaces with phantom work.
// Live-measured on USMCA: 101 of 388 (26%) "needs review" transactions were actually voided.
import fs from "node:fs";

const REL = "apps/backend/src/banking/pending-categorization.ts";

export function auditFile(src) {
  const failures = [];
  const m = src.match(/export function pendingCategorizationPredicate\([^)]*\)\s*:\s*string\s*\{([\s\S]*?)\n\}/);
  if (!m) {
    failures.push(`pendingCategorizationPredicate function body not found in ${REL} -- guard's own parsing may be stale`);
    return failures;
  }
  const body = m[1];
  if (!/voided_at\s+IS\s+NULL/i.test(body)) {
    failures.push("pendingCategorizationPredicate has no voided_at IS NULL filter -- voided rows will re-inflate the shared Banking Home KPI / For-review queue count");
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
    "AND ${alias}.voided_at IS NULL AND ${supersededDuplicatePredicate(alias)})`;",
    "AND ${supersededDuplicatePredicate(alias)})`;"
  );
  if (broken === good) throw new Error("SELFTEST setup broken -- the voided_at filter text to remove was not found");
  if (auditFile(broken).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from pendingCategorizationPredicate went undetected");

  console.log("verify-pending-categorization-excludes-voided: SELFTEST PASS (1/1 mutation caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-pending-categorization-excludes-voided FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-pending-categorization-excludes-voided OK — the shared pendingCategorizationPredicate excludes voided bank_transactions rows");
