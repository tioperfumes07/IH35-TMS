#!/usr/bin/env node
/**
 * ACCT-F5619 regression guard — REPORTING-ONLY half of "settlement dispute adjustments never reach
 * the settlement header". All THREE mounted dispute-resolution surfaces (disputes.routes.ts,
 * settlement-dispute.service.ts's resolveDispute, settlement-disputes-p6.service.ts's decideDispute)
 * must write a driver_finance.settlement_lines('dispute_adjustment') row on approval, and
 * aggregateSettlementTotals (settlements-load-bookended.service.ts) must fold that line_type into its
 * reimbursements bucket instead of falling through ELSE 0. Deliberately does NOT touch
 * settlement-payrun-close.service.ts's disbursed-cash formula -- see the OPEN board finding
 * SETTLEMENT-DISPUTE-APPROVAL-HAS-NO-DISBURSEMENT-PATH for why wiring cash requires an owner
 * accounting-treatment decision first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-dispute-adjustment-lines-and-aggregation";
const SELFTEST = process.argv.includes("--selftest");

const WRITER_FILES = [
  "apps/backend/src/settlements/disputes/disputes.routes.ts",
  "apps/backend/src/driver-finance/settlement-dispute.service.ts",
  "apps/backend/src/driver-finance/settlement-disputes-p6.service.ts",
];
const AGG_FILE = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
const AGG_MARKER = "CASE WHEN line_type IN ('reimbursement', 'dispute_adjustment') THEN amount ELSE 0 END";
const WRITE_MARKER = "INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)";
const TYPE_MARKER = "'dispute_adjustment'";

function assertAll() {
  const problems = [];
  for (const file of WRITER_FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!src.includes(WRITE_MARKER) || !src.includes(TYPE_MARKER)) {
      problems.push(`${file}: does not write a settlement_lines('dispute_adjustment') row on approval.`);
    }
  }
  const aggSrc = fs.readFileSync(path.join(ROOT, AGG_FILE), "utf8");
  if (!aggSrc.includes(AGG_MARKER)) {
    problems.push(`${AGG_FILE}: aggregateSettlementTotals no longer folds dispute_adjustment into the reimbursements bucket.`);
  }
  return problems;
}

if (SELFTEST) {
  const p6File = "apps/backend/src/driver-finance/settlement-disputes-p6.service.ts";
  const p6Path = path.join(ROOT, p6File);
  const p6Src = fs.readFileSync(p6Path, "utf8");
  const droppedWrite = p6Src.replace(
    /\n\s*\/\/ ACCT-F5619[\s\S]*?VALUES \(\$1::uuid, 'dispute_adjustment', \$2, \$3::numeric\)\n\s*`,\n\s*\[dispute\.settlement_id, `Dispute adjustment \(\$\{nextCanonical\}\)`, adjustment \/ 100\]\n\s*\);\n/,
    "\n"
  );
  if (droppedWrite === p6Src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: p6 write-drop mutation did not match live source`);
    process.exit(1);
  }
  fs.writeFileSync(p6Path, droppedWrite);
  const mutatedProblems = assertAll();
  fs.writeFileSync(p6Path, p6Src);
  if (!mutatedProblems.some((p) => p.includes(p6File))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the p6 settlement_lines write not caught`);
    process.exit(1);
  }

  const aggPath = path.join(ROOT, AGG_FILE);
  const aggSrc = fs.readFileSync(aggPath, "utf8");
  const droppedAgg = aggSrc.replace(
    AGG_MARKER,
    "CASE WHEN line_type = 'reimbursement' THEN amount ELSE 0 END"
  );
  if (droppedAgg === aggSrc) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: aggregation mutation did not match live source`);
    process.exit(1);
  }
  fs.writeFileSync(aggPath, droppedAgg);
  const aggMutatedProblems = assertAll();
  fs.writeFileSync(aggPath, aggSrc);
  if (!aggMutatedProblems.some((p) => p.includes(AGG_FILE))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping dispute_adjustment from the aggregation not caught`);
    process.exit(1);
  }

  const live = assertAll();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all 3 dispute-resolution surfaces write settlement_lines('dispute_adjustment'), and the settlement header aggregation folds it in`);
