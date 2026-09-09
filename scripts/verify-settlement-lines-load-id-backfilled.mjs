#!/usr/bin/env node
// SETTLEMENT-LINES-REIMBURSEMENT-DEDUCTION-MISSING-LOAD-ID (item 6 of
// ~/Downloads/09-08-2026-CC1-SETTLEMENTS-6-ROOT-CAUSES-FOUND.md, closed 2026-09-09): 152 active
// reimbursement/deduction driver_finance.settlement_lines rows had load_id=NULL despite their own
// `description` text literally naming the load ("... load 13517 ..."), from an old one-time
// historical-backfill pass that predates the current code (which already correctly writes load_id on
// every new line). This made the on-screen Reimbursements/Deductions tables on the driver settlement
// detail page show a blank "Load #" column and (compounding it) a raw row-id in "Number" for every
// affected row -- looked broken even though the audit trail was intact in `description` all along.
// Backfilled live: parsed `load (\d+)` out of description, resolved to mdata.loads by
// (load_number, operating_company_id), and only wrote load_id where the resolution was unambiguous
// (exactly one real load) -- 152/152 resolved cleanly, 0 skipped for ambiguity, 1 known test-fixture
// row correctly left alone (no "load N" pattern to begin with). No dollar amount, GL posting, or
// source_type/category touched -- purely a missing-link backfill using data already on the row.
//
// This guard is a LIVE-DATA assertion, not a static code guard (there is no code defect to pin -- the
// current write path is already correct; the gap was purely historical). It exists to catch any NEW
// batch of settlement_lines that mentions a load in its own description text but never got the real
// load_id link -- e.g. a future one-off backfill/import repeating the same historical mistake.
//
// Usage: DATABASE_URL=<prod> node scripts/verify-settlement-lines-load-id-backfilled.mjs
import pg from "pg";

const LABEL = "verify-settlement-lines-load-id-backfilled";

async function main() {
  const url = process.env.DATABASE_URL;
  // GATE-LIVELOCK-01 / dead-port-forbidden (verify-static.mjs's own rule): the DB-less static
  // sweep deliberately runs with DATABASE_URL unset, never a dead-port sentinel -- an unscoped
  // verify-*.mjs that throws instead of skipping on absence hard-blocks EVERY branch's local
  // push, not just settlement-lines work (found 2026-09-09 blocking an unrelated docs push).
  // Same skip convention as verify-driver-status-lock-blocks-reactivation.mjs's liveCheck(): log
  // and exit 0 when there is no DB to check against; run for real (and fail loudly) whenever a
  // caller deliberately sets DATABASE_URL, exactly as this file's own "Usage" comment intends.
  if (!url) {
    console.log(`${LABEL}: SKIPPED-DB-CHECK (DATABASE_URL is unset) -- static sweep only, no live check ran`);
    return;
  }
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const res = await client.query(
      `SELECT id, description FROM driver_finance.settlement_lines
        WHERE load_id IS NULL AND line_type IN ('reimbursement','deduction') AND is_active = true
          AND description ~ 'load \\d+'`
    );
    if (res.rows.length > 0) {
      const sample = res.rows.slice(0, 5).map((r) => `${r.id}: ${r.description.slice(0, 80)}`).join("\n  ");
      throw new Error(
        `${res.rows.length} settlement_lines row(s) name a load in their own description but have no ` +
          `load_id link -- backfill them (parse "load (\\d+)", resolve against mdata.loads by ` +
          `(load_number, operating_company_id), write only when the resolution is unambiguous). Sample:\n  ${sample}`
      );
    }
    console.log(`${LABEL} PASS -- every reimbursement/deduction settlement_lines row that names a load in its description has a real load_id link`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
