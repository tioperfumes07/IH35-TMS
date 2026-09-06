#!/usr/bin/env node
/**
 * SETL-LINES-GL (owner item, 2026-09-05, deadline 04:00Z) — every settlement_lines row either
 * carries a resolved GL posting_account_id, or is honestly left approval_status='pending' (LAW:
 * never a guessed account, and an approved line must always carry a real one).
 *
 * ROOT CAUSE this closes: driver_finance.settlement_lines.posting_account_id was "never yet written
 * by any live poster" (settlements.routes.ts's own prior comment) — reimbursement/deduction/
 * extra-pay lines existed with the column permanently NULL regardless of approval state, so an
 * "approved" line could silently carry no real GL linkage. apps/backend/src/driver-finance/
 * settlement-lines-materialize.service.ts is the fix: it resolves posting_account_id BY ROLE
 * (reimbursement_expense / driver_pay_expense / bucketRecoveryRoleKey(deduction_type)) and FORCES
 * approval_status='pending' whenever no role resolves — the exact invariant this guard locks.
 *
 * Two halves:
 *   1. STATIC (always runs) — settlement-lines-materialize.service.ts exists and its unresolved-role
 *      branches force approval_status='pending' rather than defaulting to whatever the source's own
 *      status implies.
 *   2. LIVE (DATABASE_URL set) — for every active USMCA settlement_lines row: posting_account_id IS
 *      NOT NULL OR approval_status = 'pending' (the core invariant); and, for every settlement with
 *      at least one active line, SUM(lines) ties to the settlement header's gross_pay/
 *      deductions_total/reimbursements_total within 1 cent (aggregateSettlementTotals computes the
 *      header FROM the lines, so this also catches a materializer that silently drops or duplicates
 *      an amount).
 *
 * Usage:
 *   node scripts/verify-settlement-lines-have-accounts.mjs --selftest
 *   DATABASE_URL=<Neon prod> node scripts/verify-settlement-lines-have-accounts.mjs
 */
import fs from "node:fs";

const LABEL = "verify-settlement-lines-have-accounts";
const MATERIALIZE_PATH = "apps/backend/src/driver-finance/settlement-lines-materialize.service.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function materializerForcesPendingWhenUnresolved(src) {
  // Both the reimbursement/extra_pay branch and the deduction branch must gate approval_status on
  // postingAccountId being non-null, never approving on source-status alone.
  const hasReimbGate = /postingAccountId && sourceApproved\s*\?\s*"approved"\s*:\s*"pending"/.test(src);
  return hasReimbGate && (src.match(/postingAccountId && sourceApproved/g) ?? []).length >= 2;
}

function selftest() {
  const good = fs.readFileSync(MATERIALIZE_PATH, "utf8");
  if (!materializerForcesPendingWhenUnresolved(good)) {
    console.error(`${LABEL} SELFTEST FAIL — good materializer source rejected`);
    process.exit(1);
  }
  const regressed = good.replace(
    /const approvalStatus: "pending" \| "approved" = postingAccountId && sourceApproved \? "approved" : "pending";/g,
    `const approvalStatus: "pending" | "approved" = sourceApproved ? "approved" : "pending";`
  );
  if (materializerForcesPendingWhenUnresolved(regressed)) {
    console.error(`${LABEL} SELFTEST FAIL — dropping the postingAccountId gate (approving with a NULL account) was not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 1/1 plant rejected`);
}

if (process.argv.includes("--selftest")) selftest();

// Static half.
if (!fs.existsSync(MATERIALIZE_PATH)) {
  console.error(`${LABEL}: FAIL — ${MATERIALIZE_PATH} not found`);
  process.exit(1);
}
if (!materializerForcesPendingWhenUnresolved(fs.readFileSync(MATERIALIZE_PATH, "utf8"))) {
  console.error(`${LABEL}: FAIL — ${MATERIALIZE_PATH} no longer forces approval_status='pending' when no GL role resolves`);
  process.exit(1);
}
console.log(`${LABEL}: static OK — materializer never approves a line with an unresolved GL account`);

// Live half.
if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: DATABASE_URL not set — skipping the live re-check (static check above still ran).`);
  console.log(`${LABEL}: to re-run live: DATABASE_URL=<prod> node ${process.argv[1]}`);
  process.exit(0);
}

const { Client } = await import("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  const control = await client.query(
    `SELECT count(*)::int AS n FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id WHERE ds.operating_company_id = $1 AND sl.is_active = true`,
    [USMCA]
  );
  if (control.rows[0].n === 0) {
    console.error(`${LABEL}: FAIL — settlement_line_control=0, this connection cannot see USMCA's settlement lines (masked read, not a verdict)`);
    process.exit(1);
  }

  const violations = await client.query(
    `
      SELECT sl.id::text, sl.line_type, sl.approval_status
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
       WHERE ds.operating_company_id = $1
         AND sl.is_active = true
         AND sl.posting_account_id IS NULL
         AND sl.approval_status <> 'pending'
    `,
    [USMCA]
  );

  // aggregateSettlementTotals only writes gross_pay/deductions_total/reimbursements_total onto the
  // settlement HEADER at CLOSE time (settlements-load-bookended.service.ts) — an OPEN settlement's
  // header legitimately still reads its $0.00 initial values no matter how many lines exist under
  // it, so comparing lines-vs-header is only meaningful once a settlement has actually closed.
  const totalsCheck = await client.query(
    `
      SELECT ds.id::text, ds.display_id, ds.gross_pay, ds.deductions_total, ds.reimbursements_total,
        COALESCE(SUM(sl.amount) FILTER (WHERE sl.line_type IN ('earnings','deadhead_pay','extra_pay','team_split_primary','team_split_secondary','detention_pay','escrow_contribution','dispute_adjustment')), 0) AS lines_gross,
        COALESCE(SUM(sl.amount) FILTER (WHERE sl.line_type IN ('deduction','advance_recovery','auto_deduction','abandonment_chargeback')), 0) AS lines_deductions,
        COALESCE(SUM(sl.amount) FILTER (WHERE sl.line_type = 'reimbursement'), 0) AS lines_reimbursements
        FROM driver_finance.driver_settlements ds
        JOIN driver_finance.settlement_lines sl ON sl.settlement_id = ds.id AND sl.is_active = true
       WHERE ds.operating_company_id = $1
         AND ds.status <> 'open'
       GROUP BY ds.id, ds.display_id, ds.gross_pay, ds.deductions_total, ds.reimbursements_total
    `,
    [USMCA]
  );

  await client.query("ROLLBACK");

  const failures = [];
  if (violations.rows.length > 0) {
    failures.push(
      `${violations.rows.length} line(s) approved with NO posting_account_id: ${violations.rows.map((r) => `${r.id}(${r.line_type}/${r.approval_status})`).join(", ")}`
    );
  }
  const mismatches = totalsCheck.rows.filter((r) => {
    const grossDiff = Math.abs(Number(r.lines_gross) - Number(r.gross_pay));
    const dedDiff = Math.abs(Number(r.lines_deductions) - Number(r.deductions_total));
    const reimbDiff = Math.abs(Number(r.lines_reimbursements) - Number(r.reimbursements_total));
    return grossDiff > 0.01 || dedDiff > 0.01 || reimbDiff > 0.01;
  });
  if (mismatches.length > 0) {
    failures.push(
      `${mismatches.length} settlement(s) where SUM(lines) != header totals: ${mismatches
        .map((r) => `${r.display_id} (lines gross=${r.lines_gross}/header=${r.gross_pay}, lines ded=${r.lines_deductions}/header=${r.deductions_total}, lines reimb=${r.lines_reimbursements}/header=${r.reimbursements_total})`)
        .join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL}: FAIL (settlement_line_control=${control.rows[0].n})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    totalsCheck.rows.length > 0
      ? `${LABEL}: PASS — 0 lines approved without a posting_account_id, ${totalsCheck.rows.length} non-open settlement(s) with lines all tie to their header totals (settlement_line_control=${control.rows[0].n})`
      : `${LABEL}: PASS — 0 lines approved without a posting_account_id (settlement_line_control=${control.rows[0].n}). 0 non-open (closed/locked/approved/paid) USMCA settlements exist yet to tie-out against — every live settlement is still status='open', so aggregateSettlementTotals has never written a final header total to compare; this is the SAME "no settlement has ever closed" state SETL-TIEOUT-01 already measured, not a masked failure of this check.`
  );
} finally {
  await client.end();
}
