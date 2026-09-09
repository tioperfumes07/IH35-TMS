#!/usr/bin/env node
// BANK-F30021 (2026-09-09) — cash-flow/cash-flow.service.ts's bank_categorization_coverage query
// (CASH-FLOW-01, the "N of M bank lines categorized" honesty message shown directly to the user)
// counted voided (reversed/superseded) banking.bank_transactions rows toward total_count. A voided
// row can never be categorized (0 of 149 voided USMCA rows have ever been), so including it only
// inflates the denominator and understates the true categorization coverage percentage. Live-
// measured: 1/437 pre-fix vs. the true 1/288 once phantom voided rows are excluded.
import fs from "node:fs";

const REL = "apps/backend/src/cash-flow/cash-flow.service.ts";

export function auditFile(src) {
  const failures = [];
  const m = src.match(/const coverageRes = await client\.query[\s\S]*?`([\s\S]*?)`/);
  if (!m) {
    failures.push(`bank_categorization_coverage query not found in ${REL} -- guard's own parsing may be stale`);
    return failures;
  }
  const sql = m[1];
  if (!/banking\.bank_transactions/i.test(sql)) {
    failures.push(`coverageRes query no longer references banking.bank_transactions -- guard's own parsing may be stale`);
    return failures;
  }
  if (!/voided_at\s+IS\s+NULL/i.test(sql)) {
    failures.push("cash_flow's bank_categorization_coverage query has no voided_at IS NULL filter -- voided rows inflate the 'N of M bank lines categorized' denominator");
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
    "WHERE ba.operating_company_id = $1::uuid\n        AND bt.voided_at IS NULL\n    `,",
    "WHERE ba.operating_company_id = $1::uuid\n    `,"
  );
  if (broken === good) throw new Error("SELFTEST setup broken -- the coverage query's voided_at filter text to remove was not found");
  if (auditFile(broken).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from bank_categorization_coverage went undetected");

  console.log("verify-cash-flow-coverage-excludes-voided: SELFTEST PASS (1/1 mutation caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-cash-flow-coverage-excludes-voided FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cash-flow-coverage-excludes-voided OK — the cash-flow bank-categorization coverage honesty message excludes voided rows");
