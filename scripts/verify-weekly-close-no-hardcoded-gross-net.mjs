#!/usr/bin/env node
// verify-weekly-close-no-hardcoded-gross-net.mjs  (REPAIR-A follow-on guard)
//
// Root defect (found live on origin/main): apps/backend/src/driver-finance/weekly-close.routes.ts
// inserted a driver_finance.driver_settlements row with deductions_total: 0, reimbursements_total: 0,
// net_pay: grossPay — a literal "pays gross" composition with NO feature-flag check and NO call to the
// canonical deduction applier (applyPendingDeductionsToSettlementWithNetFloor / aggregateSettlementTotals
// from settlements-load-bookended.service.ts). The route is mounted; the day a caller wires it, drivers
// get paid gross with deductions silently skipped.
//
// This guard fails CI if EITHER:
//   (A) the file still contains the exact broken literal shape — a params array whose last four
//       entries are [X, 0, 0, X] (same identifier repeated for gross_pay/net_pay, literal 0s for
//       deductions_total/reimbursements_total) — i.e. the precise regression signature, OR
//   (B) the file INSERTs into driver_finance.driver_settlements with deductions_total /
//       reimbursements_total / net_pay columns present, but never calls the canonical
//       aggregateSettlementTotals(...) or applyPendingDeductionsToSettlementWithNetFloor(...) helper
//       anywhere after that INSERT — i.e. those three fields are composed some other way than the
//       canonical reused path.
//
// Import-safe (exports run(); prints/exits only when invoked directly). Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/driver-finance/weekly-close.routes.ts";

// (A) The exact broken literal shape: identifier, then two literal-0 lines, then the SAME identifier
// again, immediately before the array closes. Matches across the multi-line params array formatting
// used by the original defect (order-sensitive: gross_pay, deductions_total=0, reimbursements_total=0,
// net_pay=<same gross var>).
const BROKEN_LITERAL_RE = /\b([A-Za-z_$][\w$]*)\s*,\s*\n\s*0\s*,\s*\n\s*0\s*,\s*\n\s*\1\s*,?\s*\n?\s*\]/;

// (B) A canonical-path call that actually computes these fields (must be a real call, not a bare
// import specifier — requires the open paren so an unused `import { aggregateSettlementTotals }`
// does not satisfy this check).
const CANONICAL_CALL_RE = /\b(aggregateSettlementTotals|applyPendingDeductionsToSettlementWithNetFloor)\s*\(/;

const INSERT_SETTLEMENTS_RE = /INSERT\s+INTO\s+driver_finance\.driver_settlements\s*\(([^)]*)\)/gi;

export function analyze(source) {
  const failures = [];

  if (BROKEN_LITERAL_RE.test(source)) {
    failures.push(
      "found the broken literal params shape [X, 0, 0, X] — deductions_total/reimbursements_total hardcoded to 0 and net_pay hardcoded to the gross var, with no applier call"
    );
  }

  let m;
  INSERT_SETTLEMENTS_RE.lastIndex = 0;
  while ((m = INSERT_SETTLEMENTS_RE.exec(source)) !== null) {
    const columns = m[1];
    const touchesAllThree =
      /deductions_total/.test(columns) && /reimbursements_total/.test(columns) && /net_pay/.test(columns);
    if (!touchesAllThree) continue;

    const insertEndIdx = m.index + m[0].length;
    const remainder = source.slice(insertEndIdx);
    if (!CANONICAL_CALL_RE.test(remainder)) {
      const line = source.slice(0, m.index).split("\n").length;
      failures.push(
        `line ${line} — INSERT into driver_finance.driver_settlements sets deductions_total/reimbursements_total/net_pay, but no aggregateSettlementTotals(...) or applyPendingDeductionsToSettlementWithNetFloor(...) call follows — those fields are not going through the canonical applier`
      );
    }
  }

  return failures;
}

function run() {
  const abs = path.join(ROOT, TARGET);
  let src;
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch {
    return [`${TARGET} not found — guard cannot verify; investigate before treating as pass`];
  }
  return analyze(src).map((f) => `${TARGET}: ${f}`);
}

export { run };

if (process.argv.includes("--selftest")) {
  const broken = `
        const settlementRes = await client.query(
          \`INSERT INTO driver_finance.driver_settlements (
              operating_company_id, display_id, driver_id, period_start, period_end, status,
              gross_pay, deductions_total, reimbursements_total, net_pay
            ) VALUES ($1,$2,$3,$4,$5,'presettle',$6,$7,$8,$9)\`,
          [
            companyId,
            displayId,
            driverId,
            weekStart,
            weekEnd,
            grossPay,
            0,
            0,
            grossPay,
          ]
        );
  `;
  const fixed = `
  const settlementRes = await client.query(
    \`INSERT INTO driver_finance.driver_settlements (
        operating_company_id, display_id, driver_id, period_start, period_end, status,
        gross_pay, deductions_total, reimbursements_total, net_pay
      ) VALUES ($1,$2,$3,$4,$5,'presettle',0,0,0,0)\`,
    [companyId, displayId, driverId, weekStart, weekEnd]
  );
  if (deductionApplyEnabled) {
    await applyPendingDeductionsToSettlementWithNetFloor(client, { settlementId, driverId, operatingCompanyId, actorUserId });
  }
  await aggregateSettlementTotals(client, settlementId);
  `;
  const checks = [
    ["broken [X,0,0,X] literal shape is flagged", analyze(broken).length > 0],
    ["fixed canonical-applier shape is not flagged", analyze(fixed).length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-weekly-close-no-hardcoded-gross-net --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify-weekly-close-no-hardcoded-gross-net --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify-weekly-close-no-hardcoded-gross-net FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify-weekly-close-no-hardcoded-gross-net PASS — weekly-close settlement totals route through the canonical applier/aggregator");
}
