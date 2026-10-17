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
 * EXTENDED — SETL-DED-GL (owner ruling 2026-09-06 01:5xZ, "Admin fee is actually either wire fee, ACH
 * fee, or gas for a company vehicle they use. Should each line carry a GL? Of course."): the generic
 * deduction_type='other' bucket is retired going forward in favor of four typed kinds — company_
 * vehicle_fuel reuses the EXISTING, already-bound 'company_fuel_advance_expense' role (5000 Fuel &
 * Diesel — the same account a company fuel advance debits, no migration needed); escrow_contribution
 * resolves the driver's OWN escrow liability sub-account; wire_fee/ach_fee's correct target role
 * ('bank_fee_recovery' -> 6300 Bank Service Charges & Wire Fees) is NOT YET bound — it needs a
 * migration to admit it into chart_of_accounts_roles' CHECK constraint, which CC-3 has no lane for
 * (filed to the board) — until then those two types correctly stay pending with an honest reason,
 * never guessed and never commingled into the unrelated, actively-posted 'factor_wire_fee' Faro role
 * that happens to point at the same account today. Pre-existing 'other' rows are grandfathered (this
 * guard does not rewrite history); only a NEW 'other' row created after MERGE_CUTOFF is a violation.
 *
 * Three halves:
 *   1. STATIC (always runs) — settlement-lines-materialize.service.ts exists, its unresolved-role
 *      branches force approval_status='pending' rather than defaulting to whatever the source's own
 *      status implies, AND it resolves company_vehicle_fuel / escrow_contribution by role instead of
 *      falling through to the generic bucketRecoveryRoleKey guess for those specific types.
 *   2. LIVE (DATABASE_URL set) — for every active USMCA settlement_lines row: posting_account_id IS
 *      NOT NULL OR approval_status = 'pending' (the core invariant); every settlement with at least
 *      one active line ties SUM(lines) to the header totals within 1 cent; no ACTIVE (non-voided)
 *      driver_settlement_deductions row with deduction_type='other' was created after MERGE_CUTOFF;
 *      and every materialized company_vehicle_fuel line's posting_account_id matches the currently
 *      bound 'company_fuel_advance_expense' account.
 *
 * Usage:
 *   node scripts/verify-settlement-lines-have-accounts.mjs --selftest
 *   DATABASE_URL=<Neon prod> node scripts/verify-settlement-lines-have-accounts.mjs
 */
import fs from "node:fs";
import { exitIfMeasuredEmptyByPurge } from "./lib/purge-window.mjs";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";

const LABEL = "verify-settlement-lines-have-accounts";
const MATERIALIZE_PATH = "apps/backend/src/driver-finance/settlement-lines-materialize.service.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// SETL-DED-GL merge cutoff — the 'other' type is retired for any deduction created from this point on;
// rows already in prod before this ship keep their grandfathered 'other' classification.
const MERGE_CUTOFF = "2026-09-06T02:00:00Z";

// Repointed (ROUND 443.187): the tie-out buckets were hand-copied here and drifted from the engine.
// ba74c3967f "M.3 used flat close-time escrow ... (#20605)" moved escrow_contribution into the
// DEDUCTION bucket and 6049a94009 (ACCT-F1312) fixed earnings to exclude detention_pay — so every
// closed settlement with escrow read "lines gross = header + escrow, lines ded = header - escrow"
// (51 false mismatches on prod 2026-10-17). The header is written by aggregateSettlementTotals from
// apps/backend/src/driver-finance/settlement-line-buckets.ts; the guard now reads those SAME arrays
// (one source of truth) and the same active + non-voided line filter, so it can no longer drift.
const BUCKETS_PATH = "apps/backend/src/driver-finance/settlement-line-buckets.ts";

export function readCanonicalBuckets(src) {
  const grab = (name) => {
    const m = src.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const`));
    if (!m) return null;
    const items = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
    return items.length ? items : null;
  };
  const earnings = grab("SETTLEMENT_EARNINGS_LINE_TYPES");
  const deductions = grab("SETTLEMENT_DEDUCTION_LINE_TYPES");
  const reimbursements = grab("SETTLEMENT_REIMBURSEMENT_LINE_TYPES");
  if (!earnings || !deductions || !reimbursements) return null;
  return { earnings, deductions, reimbursements };
}

const sqlList = (xs) => xs.map((x) => `'${x}'`).join(",");

export function materializerForcesPendingWhenUnresolved(src) {
  // Both the reimbursement/extra_pay branch and the deduction branch must gate approval_status on
  // postingAccountId being non-null, never approving on source-status alone.
  const hasReimbGate = /postingAccountId && sourceApproved\s*\?\s*"approved"\s*:\s*"pending"/.test(src);
  return hasReimbGate && (src.match(/postingAccountId && sourceApproved/g) ?? []).length >= 2;
}

export function materializerHasTypedDeductionRoles(src) {
  return (
    // LST-F418: the materializer now switches on a local `deductionType` (same value as d.deduction_type).
    /(?:d\.deduction_type|deductionType) === "wire_fee" \|\| (?:d\.deduction_type|deductionType) === "ach_fee"/.test(src) &&
    /roleKey = "bank_fee_recovery"/.test(src) &&
    /(?:d\.deduction_type|deductionType) === "company_vehicle_fuel"/.test(src) &&
    /roleKey = "company_fuel_advance_expense"/.test(src) &&
    /(?:d\.deduction_type|deductionType) === "escrow_contribution"/.test(src) &&
    /resolveDriverEscrowLiabilityAccount\(/.test(src)
  );
}

function selftest() {
  const good = fs.readFileSync(MATERIALIZE_PATH, "utf8");
  if (!materializerForcesPendingWhenUnresolved(good)) {
    console.error(`${LABEL} SELFTEST FAIL — good materializer source rejected`);
    process.exit(1);
  }
  if (!materializerHasTypedDeductionRoles(good)) {
    console.error(`${LABEL} SELFTEST FAIL — good materializer source rejected (typed-deduction roles check)`);
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
  const regressedTyping = good.replace(/roleKey = "company_fuel_advance_expense";/g, `roleKey = bucketRecoveryRoleKey(deductionType);`);
  if (materializerHasTypedDeductionRoles(regressedTyping)) {
    console.error(`${LABEL} SELFTEST FAIL — reverting company_vehicle_fuel to the generic bucketRecoveryRoleKey guess was not caught`);
    process.exit(1);
  }
  // Plant the exact regression this extension exists to catch: a live deduction_type='other' row
  // created after MERGE_CUTOFF. Simulated against the SQL predicate shape itself (a live check has no
  // static source to mutate), by asserting the query text actually filters on both conditions.
  const dedRoutes = fs.readFileSync("apps/backend/src/driver-finance/deductions.service.ts", "utf8");
  if (!/"other"/.test(dedRoutes)) {
    console.error(`${LABEL} SELFTEST FAIL — 'other' is no longer a recognized (grandfathered) SettlementDeductionSourceType`);
    process.exit(1);
  }
  if (!/"wire_fee"/.test(dedRoutes) || !/"ach_fee"/.test(dedRoutes) || !/"company_vehicle_fuel"/.test(dedRoutes) || !/"escrow_contribution"/.test(dedRoutes)) {
    console.error(`${LABEL} SELFTEST FAIL — the four typed deduction kinds are not all present in SettlementDeductionSourceType`);
    process.exit(1);
  }
  const bucketsSrc = fs.readFileSync(BUCKETS_PATH, "utf8");
  const buckets = readCanonicalBuckets(bucketsSrc);
  if (!buckets || !buckets.deductions.includes("escrow_contribution") || !buckets.earnings.includes("deadhead_pay")) {
    console.error(`${LABEL} SELFTEST FAIL — canonical settlement buckets not readable from ${BUCKETS_PATH}`);
    process.exit(1);
  }
  if (readCanonicalBuckets(bucketsSrc.replace("export const SETTLEMENT_DEDUCTION_LINE_TYPES", "export const RENAMED"))) {
    console.error(`${LABEL} SELFTEST FAIL — a missing canonical bucket was not rejected (guard would compare against nothing)`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 4/4 plants rejected (unresolved-role gate, typed-role regression, missing typed union members, missing canonical bucket)`);
}

// LST-F418: a selftest is pure — it must not fall through to the live DB check.
if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(process.exitCode ?? 0);
}

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

const BUCKETS = readCanonicalBuckets(fs.readFileSync(BUCKETS_PATH, "utf8"));
if (!BUCKETS) {
  console.error(`${LABEL}: FAIL — cannot read the canonical line-type buckets from ${BUCKETS_PATH}`);
  process.exit(1);
}

// Live half.
if (!process.env.DATABASE_URL) {
  console.error("verify-settlement-lines-have-accounts: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
  process.exit(1);
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
  // LST-F423 (owner 2026-10-06, "fix, never defer"): after AUTH-400 the book is empty BY ORDER (seeding freeze); a 0 here
  // is the purge, not a masked read. EMPTY BY PURGE only while the window is open and only on this measured 0 — the
  // first real row ends it.
  exitIfMeasuredEmptyByPurge("verify-settlement-lines-have-accounts", "USMCA settlement lines", Number(control.rows[0].n));
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
        COALESCE(SUM(sl.amount) FILTER (WHERE sl.line_type IN (${sqlList(BUCKETS.earnings)})), 0) AS lines_gross,
        COALESCE(SUM(sl.amount) FILTER (WHERE sl.line_type IN (${sqlList(BUCKETS.deductions)})), 0) AS lines_deductions,
        COALESCE(SUM(sl.amount) FILTER (WHERE sl.line_type IN (${sqlList(BUCKETS.reimbursements)})), 0) AS lines_reimbursements,
        -- LEAD 443.187 (measured 2026-10-17, CC-3): a cash advance repaid on the settlement is part of the header
        -- deductions (settlement-payrun-close.service.ts: deductions_total = deductions + escrow + appliedAdvanceRecovery
        -- + chargebacks) but is NEVER a settlement line — it posts as a credit to the driver's cash-advance account on the
        -- settlement's own entry. All 12 "header > lines" settlements (P-0009 … P-0062) tie header = GL = signed PDF to the
        -- cent; lines + this GL credit = header on all 77 closed USMCA settlements. Read from the GL (a partial repayment
        -- stamps no recovered_in_settlement_id), live postings only.
        (SELECT COALESCE(SUM(p.amount_cents), 0)::numeric / 100
           FROM accounting.journal_entry_postings p
          WHERE (p.settlement_id = ds.id
                 OR (p.source_transaction_type = 'driver_settlement' AND p.source_transaction_id::text = ds.id::text))
            AND p.debit_or_credit = 'credit'
            AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL
            AND p.account_id IN (SELECT a.coa_account_id FROM driver_finance.driver_advance_accounts a
                                  WHERE a.operating_company_id = ds.operating_company_id)) AS advance_repaid
        FROM driver_finance.driver_settlements ds
        JOIN driver_finance.settlement_lines sl ON sl.settlement_id = ds.id AND sl.is_active = true AND sl.voided_at IS NULL
       WHERE ds.operating_company_id = $1
         AND ds.status <> 'open'
       GROUP BY ds.id, ds.display_id, ds.gross_pay, ds.deductions_total, ds.reimbursements_total
    `,
    [USMCA]
  );

  // SETL-DED-GL: an 'other' deduction must never be an unaccounted bucket. Repointed (ROUND 443.187):
  // the 2026-09-06 form ("'other' is retired — no new row may carry it") was superseded by
  // 90398860f5 "443.110 G14: every Settlement Creator deduction posted as 'other' ... (#26623)":
  // 'other' is now the ADMIN-FEE type BY NAME, bound to role other_recovery (7200 Driver Admin Fee &
  // Chargeback Income) — settlement-creator-deduction-type.ts. Same rule, current truth: every ACTIVE
  // 'other' deduction created after MERGE_CUTOFF that is APPLIED to a settlement must materialize as
  // an active settlement line posting to the currently bound other_recovery account (an unapplied,
  // still-pending deduction has no settlement line yet by design).
  const newOther = await client.query(
    `
      WITH role AS (
        SELECT account_id
          FROM accounting.chart_of_accounts_roles
         WHERE operating_company_id = $1 AND role = 'other_recovery' AND is_active = true
      )
      SELECT d.id::text, d.created_at::text, d.reason
        FROM driver_finance.driver_settlement_deductions d
       WHERE d.operating_company_id = $1
         AND d.deduction_type = 'other'
         AND d.voided_at IS NULL
         AND d.created_at > $2::timestamptz
         AND (
           NOT EXISTS (SELECT 1 FROM role)
           OR (
             d.applied_to_settlement_id IS NOT NULL
             AND NOT EXISTS (
               SELECT 1
                 FROM driver_finance.settlement_lines sl
                WHERE sl.source_table = 'driver_finance.driver_settlement_deductions'
                  AND sl.source_reference_id = d.id
                  AND sl.is_active = true
                  AND sl.voided_at IS NULL
                  AND sl.posting_account_id = (SELECT account_id FROM role LIMIT 1)
             )
           )
         )
    `,
    [USMCA, MERGE_CUTOFF]
  );

  // Every materialized company_vehicle_fuel deduction line should carry the CURRENTLY bound
  // 'company_fuel_advance_expense' account — verifies the materializer's live output, not just its
  // source code. (wire_fee/ach_fee have no bindable role yet — see file header — so they are not
  // compared here; they are covered instead by the core invariant above: posting_account_id IS NULL
  // implies approval_status='pending', never an approved-with-no-account line.)
  const typedMismatch = await client.query(
    `
      WITH role AS (
        SELECT account_id
          FROM accounting.chart_of_accounts_roles
         WHERE operating_company_id = $1 AND role = 'company_fuel_advance_expense' AND is_active = true
      )
      SELECT sl.id::text, d.deduction_type, sl.posting_account_id::text AS line_account,
             role.account_id::text AS expected_account
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlement_deductions d ON d.id = sl.source_reference_id
        JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
        CROSS JOIN role
       WHERE ds.operating_company_id = $1
         AND sl.is_active = true
         AND sl.source_table = 'driver_finance.driver_settlement_deductions'
         AND d.deduction_type = 'company_vehicle_fuel'
         AND (sl.posting_account_id IS DISTINCT FROM role.account_id)
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
    const dedDiff = Math.abs(Number(r.lines_deductions) + Number(r.advance_repaid) - Number(r.deductions_total));
    const reimbDiff = Math.abs(Number(r.lines_reimbursements) - Number(r.reimbursements_total));
    return grossDiff > 0.01 || dedDiff > 0.01 || reimbDiff > 0.01;
  });
  if (mismatches.length > 0) {
    failures.push(
      `${mismatches.length} settlement(s) where SUM(lines) != header totals: ${mismatches
        .map((r) => `${r.display_id} (lines gross=${r.lines_gross}/header=${r.gross_pay}, lines ded=${r.lines_deductions} + advance repaid ${r.advance_repaid}/header=${r.deductions_total}, lines reimb=${r.lines_reimbursements}/header=${r.reimbursements_total})`)
        .join("; ")}`
    );
  }
  if (newOther.rows.length > 0) {
    failures.push(
      `${newOther.rows.length} deduction(s) created after MERGE_CUTOFF (${MERGE_CUTOFF}) are 'other' but not posted to the bound other_recovery account (or the role is unbound): ${newOther.rows.map((r) => `${r.id}(${r.created_at})`).join(", ")}`
    );
  }
  if (typedMismatch.rows.length > 0) {
    failures.push(
      `${typedMismatch.rows.length} typed-deduction line(s) whose posting_account_id does not match their role's currently bound account: ${typedMismatch.rows
        .map((r) => `${r.id}(${r.deduction_type}: line=${r.line_account} expected=${r.expected_account})`)
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
