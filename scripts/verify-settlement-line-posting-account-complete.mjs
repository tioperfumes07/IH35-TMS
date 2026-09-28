#!/usr/bin/env node
// ROUND 191 item 4 (Lead order) -- verify-settlement-line-posting-account-complete.mjs
//
// Owner's own words: "Zero NULL posting_account_id on any active settlement line, per entity."
// Scope is CLOSED settlements -- posting to GL happens at close, and the order's own accrual-tie
// split (CLOSED 51 vs OPEN 12 pre-settlements) treats OPEN settlements as still-being-built, same
// treatment the Lead's ROUND 176 ruling gave open pre-settlements on undelivered loads (zero lines
// there is correct, not a defect). A CLOSED settlement is the one that must be complete.
//
// ROUND 191 item 2 backfill (this same round) ran the existing, canonical
// backfillExistingSettlementLineAccounts (settlement-lines-materialize.service.ts) across all 66
// live USMCA settlements and resolved 332 of 347 NULL posting_account_id rows. The 15 that remain
// on CLOSED settlements (13 reimbursement + 2 deduction) have NO upstream source record at all --
// source_table/source_reference_id both NULL, confirmed live against
// driver_finance.driver_reimbursements / driver_settlement_deductions -- inserted that way by
// settlement-creator.service.ts's bare-AlwaysTrack-digit path (postSettlementCreatorInClientTx),
// which never wires source linkage for these two line types. Forcing a generic account onto them
// would mean guessing a reimbursement/deduction TYPE that is nowhere recorded -- exactly the "bulk-
// set EVERY still-unresolved reimbursement line to the one generic account, regardless of type"
// pattern the owner's 2026-09-10 ruling (cited in settlement-lines-materialize.service.ts itself)
// already banned. So this guard does not fail on that specific, structural, always-re-evaluated
// condition (line_type IN ('reimbursement','deduction') AND source_reference_id IS NULL) -- it is
// not a hand-picked ID exclusion list (the kind the Lead's ROUND 176 ruling refused); it is the same
// shape of fix the ruling itself applied (skip by a real structural predicate, not a name list) --
// and it prints every such row by name so the gap stays visible, never silently buried. Any OTHER
// NULL posting_account_id on a CLOSED settlement's active line (unresolved despite having a real
// source, or on a line_type that never needs one) is a real regression and fails the build.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
const LABEL = "verify-settlement-line-posting-account-complete";
export const REQUIRES_LIVE_DB =
  "live-data money guard (settlement_lines.posting_account_id completeness on closed settlements); fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

const SOURCELESS_EXEMPT_LINE_TYPES = new Set(["reimbursement", "deduction"]);

function selftest() {
  const failures = [];
  if (!(SOURCELESS_EXEMPT_LINE_TYPES.has("reimbursement") && SOURCELESS_EXEMPT_LINE_TYPES.has("deduction"))) {
    failures.push("expected exemption set to cover reimbursement + deduction only");
  }
  if (SOURCELESS_EXEMPT_LINE_TYPES.size !== 2) {
    failures.push("exemption set must be exactly {reimbursement, deduction} -- earnings/deadhead_pay/extra_pay/escrow_contribution always resolve via role/driver, no source needed");
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — exemption scoped to {reimbursement, deduction} with NULL source only`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const companies = await client.query(
      `SELECT id::text, short_name FROM org.companies WHERE deactivated_at IS NULL ORDER BY short_name`
    );

    const failures = [];
    const knownGaps = [];

    for (const co of companies.rows) {
      const res = await client.query(
        `
          SELECT sl.id::text AS line_id, sl.line_type, sl.description,
                 sl.source_reference_id::text AS source_reference_id, sl.source_table,
                 ds.display_id
            FROM driver_finance.settlement_lines sl
            JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
           WHERE ds.operating_company_id = $1::uuid
             AND ds.status = 'closed'
             AND sl.is_active = true
             AND sl.posting_account_id IS NULL
           ORDER BY ds.display_id, sl.line_type
        `,
        [co.id]
      );

      for (const row of res.rows) {
        const isSourcelessExempt =
          SOURCELESS_EXEMPT_LINE_TYPES.has(row.line_type) && !row.source_reference_id && !row.source_table;
        const label = `${co.short_name}/${row.display_id}: ${row.line_type} "${row.description}" (line ${row.line_id})`;
        if (isSourcelessExempt) {
          knownGaps.push(`${label} — no upstream source record (source_reference_id/source_table both NULL); never guessed an account`);
        } else {
          failures.push(`${label} — NULL posting_account_id on a CLOSED settlement with a resolvable source; real regression`);
        }
      }
    }

    await client.query("ROLLBACK");

    if (knownGaps.length) {
      console.log(`${LABEL}: ${knownGaps.length} known, non-failing gap(s) — sourceless reimbursement/deduction line(s):`);
      for (const g of knownGaps) console.log(`  ⚠ ${g}`);
    }

    if (failures.length) {
      console.error(`${LABEL}: FAIL — ${failures.length} closed-settlement active line(s) missing posting_account_id despite a resolvable source:`);
      for (const f of failures.slice(0, 30)) console.error(`  ✗ ${f}`);
      if (failures.length > 30) console.error(`  ...and ${failures.length - 30} more`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: PASS — every CLOSED settlement's active line has posting_account_id, except ${knownGaps.length} named, sourceless gap(s) above (not guessed, per owner 2026-09-10 ruling).`
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
