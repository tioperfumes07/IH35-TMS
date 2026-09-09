#!/usr/bin/env node
// BANK-F30013 (2026-09-09) — Form 425C (U.S. Bankruptcy Court Monthly Operating Report) and its
// Exhibits A/B/C/D must never sum or list a voided (reversed/superseded) banking.bank_transactions
// row into a court filing or the 28 U.S.C. § 1930(a)(6) U.S. Trustee quarterly fee calculation.
// Live-proven necessary: for one operating company's 2025-2026 window alone, the pre-fix query
// overstated receipts by $102,680.38 and disbursements by $118,141.76 (149 voided rows silently
// included) — a materially wrong number in a document explicitly documented in this same code as
// something that "must never reach a court filing."
import fs from "node:fs";

const TARGETS = [
  "apps/backend/src/compliance/form-425c.routes.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-a-cash-receipts.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-b-disbursements.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-c-bank-reconciliation.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-d-quarterly-fees.ts",
];

export function auditFile(rel, src) {
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
      failures.push(`${rel}: a query reading banking.bank_transactions has no voided_at IS NULL filter`);
    }
  }
  if (checked === 0) {
    failures.push(`${rel}: expected at least one banking.bank_transactions query, found 0 -- guard's own parsing may be stale`);
  }
  return failures;
}

export function run(root = process.cwd()) {
  const failures = [];
  for (const rel of TARGETS) {
    let src;
    try {
      src = fs.readFileSync(`${root}/${rel}`, "utf8");
    } catch {
      failures.push(`${rel}: missing`);
      continue;
    }
    failures.push(...auditFile(rel, src));
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const root = process.cwd();
  const passFailures = run(root);
  if (passFailures.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(passFailures));

  // Mutation: drop the filter from exhibit-d (the statutory-fee calculation -- highest consequence).
  const rel = "apps/backend/src/reports/form-425c/exhibits/exhibit-d-quarterly-fees.ts";
  const good = fs.readFileSync(`${root}/${rel}`, "utf8");
  const broken = good.replace(
    /\s*-- BANK-F30013:[^\n]*\n\s*AND bt\.voided_at IS NULL\n/,
    "\n"
  );
  if (broken === good) throw new Error("SELFTEST setup broken -- the voided_at filter text to remove was not found in exhibit-d");
  if (auditFile(rel, broken).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from exhibit-d went undetected");

  console.log("verify-form425c-excludes-voided-transactions: SELFTEST PASS (1/1 mutation caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-form425c-excludes-voided-transactions FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-form425c-excludes-voided-transactions OK — Form 425C + all 4 exhibits exclude voided bank_transactions rows");
