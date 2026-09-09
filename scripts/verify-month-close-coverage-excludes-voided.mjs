#!/usr/bin/env node
// BANK-F30017 (2026-09-09) — accounting/month-close.service.ts's bank-recon coverage-check CTE
// (the gate that blocks month-close until every bank_transaction in the period is reconciled)
// counted banking.bank_transactions.voided_at rows toward total_transactions with no way to ever
// become "covered" (banking.reconciliation_matches has no row for a superseded transaction),
// permanently blocking close on phantom uncovered work. Live-measured on USMCA: one bank account's
// ENTIRE transaction set (48/48) was voided, all counted uncovered; a second account had 101 of 385
// uncovered rows voided.
import fs from "node:fs";

const SERVICE_REL = "apps/backend/src/accounting/month-close.service.ts";

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
  if (checked < 1) {
    failures.push(`expected at least 1 banking.bank_transactions query site in ${SERVICE_REL}, found ${checked} -- guard's own parsing may be stale`);
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

  const broken = good.replace(
    "AND bt.transaction_date BETWEEN $2::date AND $3::date\n          AND bt.voided_at IS NULL\n          ${bankTransactionHiddenFilterSql(hideOnForClose, \"bt\")}",
    "AND bt.transaction_date BETWEEN $2::date AND $3::date\n          ${bankTransactionHiddenFilterSql(hideOnForClose, \"bt\")}"
  );
  if (broken === good) throw new Error("SELFTEST setup broken -- the coverage CTE filter text to remove was not found");
  if (auditFile(broken).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from the coverage CTE went undetected");

  console.log("verify-month-close-coverage-excludes-voided: SELFTEST PASS (1/1 mutation caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-month-close-coverage-excludes-voided FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-month-close-coverage-excludes-voided OK — month-close bank-recon coverage check excludes voided bank_transactions rows");
