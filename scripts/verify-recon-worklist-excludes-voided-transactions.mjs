#!/usr/bin/env node
// BANK-F30015 (2026-09-09) — accounting/bank-recon/recon-worklist.service.ts is a SIBLING,
// parallel reconciliation system (banking.reconciliation_matches / match_state, distinct from
// banking/reconciliation.routes.ts's reconciliation_sessions / reconciliation_cleared, already
// fixed as BANK-F30012) with the identical missing-voided_at-filter gap. Live-proven necessary:
// for USMCA, this worklist's own "unmatched, needs review" count dropped from 433 to 284 once
// voided rows were excluded — 149 phantom line items an operator would otherwise have worked.
import fs from "node:fs";

const SERVICE_REL = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";

export function auditFile(src) {
  const failures = [];
  const statements = src.split(/client\.query[<(]/g).slice(1);
  let checked = 0;
  for (const stmt of statements) {
    const m = stmt.match(/`([\s\S]*?)`/);
    if (!m) continue;
    const sql = m[1];
    if (!/banking\.bank_transactions/i.test(sql)) continue;
    if (!/^\s*(SELECT|WITH)\b/i.test(sql)) continue;
    checked += 1;
    if (!/voided_at\s+IS\s+NULL/i.test(sql)) {
      const snippet = sql.trim().replace(/\s+/g, " ").slice(0, 100);
      failures.push(`a query reading banking.bank_transactions has no voided_at IS NULL filter: "${snippet}..."`);
    }
  }
  if (checked < 4) {
    failures.push(`expected at least 4 banking.bank_transactions query sites in ${SERVICE_REL}, found ${checked} -- guard's own parsing may be stale`);
  }
  return failures;
}

export function run(root = process.cwd()) {
  let src;
  try {
    src = fs.readFileSync(`${root}/${SERVICE_REL}`, "utf8");
  } catch {
    return [`${SERVICE_REL}: missing`];
  }
  return auditFile(src);
}

if (process.argv.includes("--selftest")) {
  const root = process.cwd();
  const good = fs.readFileSync(`${root}/${SERVICE_REL}`, "utf8");
  const passFailures = auditFile(good);
  if (passFailures.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(passFailures));

  const brokenUnmatched = good.replace(
    "AND bt.transaction_date BETWEEN $3::date AND $4::date\n          AND bt.voided_at IS NULL\n          AND NOT EXISTS (",
    "AND bt.transaction_date BETWEEN $3::date AND $4::date\n          AND NOT EXISTS ("
  );
  if (brokenUnmatched === good) throw new Error("SELFTEST setup broken -- the unmatched-query filter text to remove was not found");
  if (auditFile(brokenUnmatched).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from the unmatched worklist query went undetected");

  const brokenProgress = good.replace(
    "AND bank_account_id = $2::uuid\n            AND transaction_date BETWEEN $3::date AND $4::date\n            AND voided_at IS NULL\n        )\n        SELECT\n          COUNT(*)::int AS total_count,",
    "AND bank_account_id = $2::uuid\n            AND transaction_date BETWEEN $3::date AND $4::date\n        )\n        SELECT\n          COUNT(*)::int AS total_count,"
  );
  if (brokenProgress === good) throw new Error("SELFTEST setup broken -- the progress-CTE filter text to remove was not found");
  if (auditFile(brokenProgress).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from the progress CTE went undetected");

  console.log("verify-recon-worklist-excludes-voided-transactions: SELFTEST PASS (2/2 mutations caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-recon-worklist-excludes-voided-transactions FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-recon-worklist-excludes-voided-transactions OK — accounting/bank-recon worklist excludes voided bank_transactions rows");
