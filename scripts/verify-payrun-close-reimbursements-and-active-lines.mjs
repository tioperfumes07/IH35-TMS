#!/usr/bin/env node
/**
 * ACCT-F5613 regression guard — settlement-payrun-close.service.ts (the code that computes the
 * ACTUAL disbursed cash and the balanced JE) must:
 *   1. Include settlement_lines('reimbursement') cents in the net-pay formula and post a
 *      reimbursement_expense debit leg for them — aggregateSettlementTotals
 *      (settlements-load-bookended.service.ts) already folds reimbursements into the settlement
 *      HEADER's net_pay ("net = gross - deductions + reimbursements"); this file must compute the
 *      same total or the settlement's own PDF/approval screen disagrees with the check that goes out.
 *   2. Filter BOTH the chargeback query and the reimbursement query by is_active = true —
 *      driver_finance.settlement_lines soft-deletes via is_active (ACCT-F156); an unfiltered SUM
 *      still counts a voided/reversed line against the driver's actual pay.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-payrun-close-reimbursements-and-active-lines";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";

const NET_FORMULA = "grossCents +\n      reimbursementsCents -\n      deductionsCents -\n      escrowContributionCents -\n      advanceRecoveriesCents -\n      chargebacksCents";
const REIMB_QUERY_MARKER = "async function loadReimbursementsCents(";
const REIMB_LEG_MARKER = 'legs.push({ account_id: reimbAcct, debit_or_credit: "debit", amount_cents: reimbursementsCents,';

function assertAll(src) {
  const problems = [];
  if (!src.includes(NET_FORMULA)) {
    problems.push(
      "netCents formula does not add reimbursementsCents -- either reverted to gross-only, or the term " +
        "order/shape drifted away from the reviewed formula."
    );
  }
  if (!src.includes(REIMB_QUERY_MARKER)) {
    problems.push("loadReimbursementsCents() is missing entirely -- reimbursements are not read at all.");
  }
  if (!src.includes(REIMB_LEG_MARKER)) {
    problems.push("the reimbursement_expense debit JE leg is missing -- the JE would no longer balance when reimbursementsCents > 0.");
  }
  // Both settlement_lines aggregation queries in THIS file must filter is_active = true (ACCT-F156 class).
  const chargebackBlockMatch = src.match(/async function loadChargebacksCents[\s\S]*?\n}/);
  if (!chargebackBlockMatch || !/is_active\s*=\s*true/.test(chargebackBlockMatch[0])) {
    problems.push("loadChargebacksCents() does not filter is_active = true -- a voided chargeback still reduces disbursed pay.");
  }
  const reimbBlockMatch = src.match(/async function loadReimbursementsCents[\s\S]*?\n}/);
  if (!reimbBlockMatch || !/is_active\s*=\s*true/.test(reimbBlockMatch[0])) {
    problems.push("loadReimbursementsCents() does not filter is_active = true -- a voided reimbursement still inflates disbursed pay.");
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const droppedFromFormula = src.replace(
    "grossCents +\n      reimbursementsCents -\n      deductionsCents",
    "grossCents -\n      deductionsCents"
  );
  const p1 = assertAll(droppedFromFormula);
  if (!p1.some((p) => p.includes("netCents formula"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping reimbursementsCents from the net formula not caught`);
    process.exit(1);
  }

  const droppedActiveFilterOnReimb = src.replace(
    /(async function loadReimbursementsCents[\s\S]*?)AND sl\.is_active = true\n(\s*`)/,
    "$1$2"
  );
  if (droppedActiveFilterOnReimb === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: is_active removal pattern did not match loadReimbursementsCents`);
    process.exit(1);
  }
  const p2 = assertAll(droppedActiveFilterOnReimb);
  if (!p2.some((p) => p.includes("loadReimbursementsCents() does not filter"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping is_active from loadReimbursementsCents not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — pay-run close nets reimbursements into disbursed cash, and both chargeback/reimbursement queries exclude inactive lines`);
