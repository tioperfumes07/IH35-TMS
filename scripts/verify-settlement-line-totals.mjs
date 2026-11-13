#!/usr/bin/env node
/**
 * ENG-49 (CC-2 Row 49) — settlement line totals engine.
 *
 * For every closed USMCA driver settlement:
 *   reimbursements_total MUST equal sum of settlement_lines WHERE line_type = 'reimbursement'
 *   deductions_total ratchet: mismatches ≤ DEDUCTIONS_MISMATCH_CEILING
 *
 * Note on deductions: the stored deductions_total includes advance_recovery + chargebacks
 * which are NOT represented as settlement_lines rows (they come from cash_advance_requests
 * and other tables). So a strict match is not expected; the ratchet ceiling captures the
 * current backlog.
 *
 * Ratchet ceilings (measured 2026-11-13, 103 closed settlements):
 *   REIMB_MISMATCH_CEILING    = 0    (strict: every reimbursement line must match)
 *   DEDUCTIONS_MISMATCH_CEIL  = 13   (ratchet: advance_recovery + chargebacks not in lines)
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-line-totals";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const REIMB_MISMATCH_CEILING   = 0;
const DEDUCTIONS_MISMATCH_CEIL = 13;

async function measure(client) {
  const res = await client.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE ABS(ds.reimbursements_total -
               COALESCE((
                 SELECT SUM(sl.amount)
                 FROM driver_finance.settlement_lines sl
                 WHERE sl.settlement_id = ds.id
                   AND sl.line_type = 'reimbursement'
               ), 0)) > 0.004
       ) AS reimb_mismatch_count,
       COUNT(*) FILTER (
         WHERE ABS(ds.deductions_total -
               COALESCE((
                 SELECT SUM(sl.amount)
                 FROM driver_finance.settlement_lines sl
                 WHERE sl.settlement_id = ds.id
                   AND sl.line_type IN ('deduction', 'escrow_contribution')
               ), 0)) > 0.004
       ) AS deductions_mismatch_count,
       COUNT(*) AS total_closed
     FROM driver_finance.driver_settlements ds
     WHERE ds.operating_company_id = $1::uuid
       AND ds.status = 'closed'
       AND ds.is_sample_data IS DISTINCT FROM true`,
    [USMCA]
  );
  return res.rows[0];
}

function check(row) {
  const fails = [];
  const reimbMismatch = parseInt(row.reimb_mismatch_count ?? "0");
  const deductMismatch = parseInt(row.deductions_mismatch_count ?? "0");

  if (reimbMismatch > REIMB_MISMATCH_CEILING)
    fails.push(
      `reimb_mismatch_count ${reimbMismatch} exceeds ceiling ${REIMB_MISMATCH_CEILING} — reimbursements_total must match sum of reimbursement lines`
    );
  if (deductMismatch > DEDUCTIONS_MISMATCH_CEIL)
    fails.push(
      `deductions_mismatch_count ${deductMismatch} exceeds ceiling ${DEDUCTIONS_MISMATCH_CEIL} — deductions_total vs sum of (deduction + escrow_contribution) lines`
    );

  return fails;
}

async function run() {
  if (process.argv.includes("--selftest")) {
    // Mutation 1: reimb mismatch exceeds strict ceiling 0
    const fake1 = { reimb_mismatch_count: "1", deductions_mismatch_count: "0", total_closed: "103" };
    if (check(fake1).length === 0) {
      process.stderr.write(`${LABEL} SELFTEST FAIL — mutation 1 (reimb_mismatch > 0) not caught\n`);
      process.exit(1);
    }
    // Mutation 2: deductions mismatch exceeds ceiling
    const fake2 = { reimb_mismatch_count: "0", deductions_mismatch_count: String(DEDUCTIONS_MISMATCH_CEIL + 1), total_closed: "103" };
    if (check(fake2).length === 0) {
      process.stderr.write(`${LABEL} SELFTEST FAIL — mutation 2 (deductions_mismatch exceeds) not caught\n`);
      process.exit(1);
    }
    process.stdout.write(`${LABEL} --selftest PASS 2/2 mutations caught\n`);
    process.exit(0);
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    await client.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);

    const row = await measure(client);
    const fails = check(row);

    if (fails.length > 0) {
      process.stderr.write(`${LABEL} FAIL (${fails.length}):\n`);
      for (const f of fails) process.stderr.write(`  - ${f}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `${LABEL}: PASS — total_closed=${row.total_closed}` +
        ` reimb_mismatch=${row.reimb_mismatch_count}/${REIMB_MISMATCH_CEILING}` +
        ` deductions_mismatch=${row.deductions_mismatch_count}/${DEDUCTIONS_MISMATCH_CEIL}\n`
      );
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  process.stderr.write(`${LABEL} ERROR: ${err.message}\n`);
  process.exit(1);
});
