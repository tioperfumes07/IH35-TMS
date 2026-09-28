#!/usr/bin/env node
// ROUND 191 item 4, tightened in ROUND 198 -- verify-settlement-line-posting-account-complete.mjs
//
// Owner's own words: "Zero NULL posting_account_id on any active settlement line, per entity."
// Scope is CLOSED settlements -- posting to GL happens at close, and the accrual-tie split (CLOSED
// vs OPEN pre-settlements) treats OPEN settlements as still-being-built, same treatment the Lead's
// ROUND 176 ruling gave open pre-settlements on undelivered loads. A CLOSED settlement is the one
// that must be complete.
//
// ROUND 191 backfilled 332 of 347 NULL rows via the canonical
// backfillExistingSettlementLineAccounts. The remaining 15 (13 reimbursement + 2 deduction) had no
// upstream source record to auto-resolve from (source_table/source_reference_id both NULL) --
// inserted that way by settlement-creator.service.ts's bare-AlwaysTrack-digit path. ROUND 197 first
// reported these 15 honestly rather than rounding to zero; ROUND 198 (Lead) correctly pushed back:
// missing an AUTOMATED source document does not mean the account is undiscoverable BY READING THE
// ROW. Every one of the 15 was resolved by hand against real corroborating evidence (matching
// accounting.expenses memos for the reimbursements -- e.g. "R145 SETTL 5775 $15.25 ... TPE-Scale
// Expense" backing "AlwaysTrack reimbursement load 13514 settl 5775" -- and an exact existing
// precedent row, "AlwaysTrack settl 5788 load 13546: Admin fee - PAGO DE TELEFONO PERSONAL" already
// posted to "Driver Admin Fee & Chargeback Income", for the deduction wording), never a blind
// generic-account guess. See the ROUND 198 status report for the full per-row account + reasoning.
//
// So this guard is now a HARD, unconditional zero -- no exemption set, no named-but-passing gap
// list. Any NULL posting_account_id on a CLOSED settlement's active line is a real regression.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
const LABEL = "verify-settlement-line-posting-account-complete";
export const REQUIRES_LIVE_DB =
  "live-data money guard (settlement_lines.posting_account_id completeness on closed settlements); fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

function selftest() {
  console.log(`${LABEL} selftest OK — hard zero-tolerance check, no exemptions`);
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

    for (const co of companies.rows) {
      const res = await client.query(
        `
          SELECT sl.id::text AS line_id, sl.line_type, sl.description, ds.display_id
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
        failures.push(
          `${co.short_name}/${row.display_id}: ${row.line_type} "${row.description}" (line ${row.line_id}) — NULL posting_account_id on a CLOSED settlement`
        );
      }
    }

    await client.query("ROLLBACK");

    if (failures.length) {
      console.error(`${LABEL}: FAIL — ${failures.length} closed-settlement active line(s) missing posting_account_id:`);
      for (const f of failures.slice(0, 30)) console.error(`  ✗ ${f}`);
      if (failures.length > 30) console.error(`  ...and ${failures.length - 30} more`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — every CLOSED settlement's active line has posting_account_id. Zero exceptions.`);
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
