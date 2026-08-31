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
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

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

// `overrides` maps a relative file path (one of WRITER_FILES / AGG_FILE) to an alternate absolute
// path to read instead of path.join(ROOT, file) — the copy-to-temp mechanism a selftest uses to
// probe a mutation without ever writing the real tracked file.
function assertAll(overrides = {}) {
  const problems = [];
  for (const file of WRITER_FILES) {
    const src = fs.readFileSync(overrides[file] ?? path.join(ROOT, file), "utf8");
    if (!src.includes(WRITE_MARKER) || !src.includes(TYPE_MARKER)) {
      problems.push(`${file}: does not write a settlement_lines('dispute_adjustment') row on approval.`);
    }
  }
  const aggSrc = fs.readFileSync(overrides[AGG_FILE] ?? path.join(ROOT, AGG_FILE), "utf8");
  if (!aggSrc.includes(AGG_MARKER)) {
    problems.push(`${AGG_FILE}: aggregateSettlementTotals no longer folds dispute_adjustment into the reimbursements bucket.`);
  }
  return problems;
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: both probes below used to writeFileSync straight into the
// real tracked file, restoring on the next line with no finally. Both now use withMutatedCopy —
// the real files are only ever read; the planted mutation lives in a temp copy that assertAll()
// is pointed at via `overrides`.
async function selftest() {
  const p6File = "apps/backend/src/driver-finance/settlement-disputes-p6.service.ts";
  const p6Path = path.join(ROOT, p6File);
  await withMutatedCopy(
    p6Path,
    (p6Src) => {
      const droppedWrite = p6Src.replace(
        /\n\s*\/\/ ACCT-F5619[\s\S]*?VALUES \(\$1::uuid, 'dispute_adjustment', \$2, \$3::numeric\)\n\s*`,\n\s*\[dispute\.settlement_id, `Dispute adjustment \(\$\{nextCanonical\}\)`, adjustment \/ 100\]\n\s*\);\n/,
        "\n"
      );
      if (droppedWrite === p6Src) {
        throw new Error(`${LABEL} SELFTEST SETUP FAILED: p6 write-drop mutation did not match live source`);
      }
      return droppedWrite;
    },
    (tmpPath) => {
      const mutatedProblems = assertAll({ [p6File]: tmpPath });
      if (!mutatedProblems.some((p) => p.includes(p6File))) {
        throw new Error(`${LABEL} SELFTEST FAILED: dropping the p6 settlement_lines write not caught`);
      }
    },
  );

  const aggPath = path.join(ROOT, AGG_FILE);
  await withMutatedCopy(
    aggPath,
    (aggSrc) => {
      const droppedAgg = aggSrc.replace(AGG_MARKER, "CASE WHEN line_type = 'reimbursement' THEN amount ELSE 0 END");
      if (droppedAgg === aggSrc) {
        throw new Error(`${LABEL} SELFTEST SETUP FAILED: aggregation mutation did not match live source`);
      }
      return droppedAgg;
    },
    (tmpPath) => {
      const aggMutatedProblems = assertAll({ [AGG_FILE]: tmpPath });
      if (!aggMutatedProblems.some((p) => p.includes(AGG_FILE))) {
        throw new Error(`${LABEL} SELFTEST FAILED: dropping dispute_adjustment from the aggregation not caught`);
      }
    },
  );

  const live = assertAll();
  if (live.length) {
    throw new Error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (SELFTEST) {
  try {
    await selftest();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  process.exit(0);
}

const problems = assertAll();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all 3 dispute-resolution surfaces write settlement_lines('dispute_adjustment'), and the settlement header aggregation folds it in`);
