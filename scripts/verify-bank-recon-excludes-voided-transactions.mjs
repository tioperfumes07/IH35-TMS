#!/usr/bin/env node
// BANK-VOIDED-RECON-01 (2026-09-09) — every reconciliation.routes.ts query reading
// banking.bank_transactions (worklist, match-check, unmatch, complete-session variance calc, QBO
// sync candidates) must exclude voided_at rows. Live-proven necessary: 699 bank_transactions rows
// are voided on prod (BANK-F30002 dedup residue), and one open reconciliation session had 38 of
// them (-$44,833.89 net) inside its own date range, silently folding into the variance calc.
// computeAdjustedBalanceSummary (adjusted-balance-rec.ts) has no voided_at awareness of its own --
// it sums whatever rows the caller hands it -- so the exclusion MUST happen at every read site.
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/banking/reconciliation.routes.ts";

export function auditFile(src) {
  const failures = [];
  // Each FROM/JOIN banking.bank_transactions block in this file must have "voided_at IS NULL"
  // somewhere in the same statement. Rather than hand-parse SQL, split on the query-building
  // boundary this file consistently uses (client.query<...>(` ... `,) and check each chunk that
  // references the table.
  const statements = src.split(/client\.query[<(]/g).slice(1);
  let checked = 0;
  for (const stmt of statements) {
    // Only look at the SQL template literal, not the rest of the file after it.
    const templateMatch = stmt.match(/`([\s\S]*?)`/);
    if (!templateMatch) continue;
    const sql = templateMatch[1];
    if (!/banking\.bank_transactions/i.test(sql)) continue;
    // UPDATE ... WHERE id = $n statements target one already-identified row (already validated,
    // or a deliberate resurrection/void write) -- not the aggregation/listing bug class this guard
    // exists to catch. Scope to SELECT/WITH (read) statements that can silently sum or list
    // across multiple rows, which is where a missing voided_at filter actually corrupts a result.
    if (!/^\s*(SELECT|WITH)\b/i.test(sql)) continue;
    checked += 1;
    if (!/voided_at\s+IS\s+NULL/i.test(sql)) {
      const snippet = sql.trim().slice(0, 80).replace(/\s+/g, " ");
      failures.push(`a query reading banking.bank_transactions has no voided_at IS NULL filter: "${snippet}..."`);
    }
  }
  if (checked < 5) {
    failures.push(`expected at least 5 banking.bank_transactions query sites in ${ROUTES_REL}, found ${checked} -- guard's own parsing may be stale`);
  }
  return failures;
}

export function run(root = process.cwd()) {
  let src;
  try {
    src = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  } catch {
    return [`${ROUTES_REL}: missing`];
  }
  return auditFile(src);
}

if (process.argv.includes("--selftest")) {
  const root = process.cwd();
  const good = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  const passFailures = auditFile(good);
  if (passFailures.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(passFailures));

  // Mutation: drop the filter from the complete-session variance query specifically (the one that
  // actually corrupted a live session).
  const brokenVariance = good.replace(
    "WHERE bank_account_id = $1\n            AND operating_company_id = $2::uuid\n            AND transaction_date BETWEEN $3 AND $4\n            AND voided_at IS NULL",
    "WHERE bank_account_id = $1\n            AND operating_company_id = $2::uuid\n            AND transaction_date BETWEEN $3 AND $4"
  );
  if (brokenVariance === good) throw new Error("SELFTEST setup broken -- the complete-session variance query text to remove was not found");
  if (auditFile(brokenVariance).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from complete-session variance query went undetected");

  // Mutation: drop the filter from the QBO-sync-candidates query.
  const brokenSync = good.replace(
    "AND bt.qbo_synced_at IS NULL\n            AND bt.voided_at IS NULL",
    "AND bt.qbo_synced_at IS NULL"
  );
  if (brokenSync === good) throw new Error("SELFTEST setup broken -- the QBO-sync-candidates query text to remove was not found");
  if (auditFile(brokenSync).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from QBO-sync-candidates query went undetected");

  console.log("verify-bank-recon-excludes-voided-transactions: SELFTEST PASS (2/2 mutations caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-bank-recon-excludes-voided-transactions FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-bank-recon-excludes-voided-transactions OK — all banking.bank_transactions reads in reconciliation.routes.ts exclude voided rows");
