#!/usr/bin/env node
// ROUND 185 (Lead, P0): "any banking.reconciliation_matches row with no corresponding accept audit
// event fails the build. Lead persisted 207 rows outside the handler today; all are voided, but
// the guard is what makes it impossible."
//
// WHY THIS CHECKS audit.audit_events, NOT audit.row_changes: audit.row_changes' own DB trigger on
// this table (tg_audit_row_reconciliation_matches) reads changed_by_user_id from a session
// variable that withLuciaBypass never sets -- verified live, 100% of 680 existing rows show
// changed_by_user_id IS NULL regardless of how they were written, so that column cannot
// distinguish a real accept from a raw INSERT. acceptMatchWithResolveDifference now calls
// appendCrudAudit(..., "bank_match.accepted", { reconciliation_match_id, ... }) right after
// storeMatch, passing the actor explicitly (never a session var) -- that event is the real,
// reliable "this went through the accept handler" signal this guard checks for.
import pg from "pg";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";

const LABEL = "verify-no-match-persisted-outside-accept-handler";

function selftest() {
  console.log(`${LABEL} selftest OK — this guard is a live-data check by design (no pure logic to unit test)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (live-data invariant by design).`);
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    // 2026-10-01 (Lead, ruling LEAD-MAY-FIX-A-GATE-BLOCKING-HANG): the local gate runs under the
    // READONLY GATE CREDENTIAL (ih35_ci_readonly, BYPASSRLS, cannot SET ROLE). A hard
    // "SET LOCAL ROLE neondb_owner" turned every seat's gate red with "permission denied to set
    // role". Try the owner role inside a savepoint; when the credential cannot assume it, the
    // bypass setting alone is sufficient for this read and the read is still a real read.
    await client.query("SAVEPOINT role_try");
    try {
      // NEONDB-OWNER-OK: attempted inside a savepoint on whatever credential the gate was given; the readonly credential cannot assume it and falls through to BYPASSRLS
      await client.query("SET LOCAL ROLE neondb_owner");
      await client.query("RELEASE SAVEPOINT role_try");
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT role_try");
    }
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const res = await client.query(
      `SELECT rm.id::text, rm.bank_transaction_id::text, rm.operating_company_id::text
         FROM banking.reconciliation_matches rm
        WHERE rm.voided_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM audit.audit_events ae
             WHERE ae.event_class = 'bank_match.accepted'
               AND ae.payload->>'reconciliation_match_id' = rm.id::text
          )
        ORDER BY rm.id`
    );
    await client.query("ROLLBACK");

    if (res.rows.length > 0) {
      console.error(`${LABEL}: FAIL — ${res.rows.length} live (non-voided) reconciliation_matches row(s) have no corresponding accept audit event:`);
      for (const r of res.rows.slice(0, 20)) console.error(`  ✗ match ${r.id} (bank_transaction_id ${r.bank_transaction_id})`);
      if (res.rows.length > 20) console.error(`  ...and ${res.rows.length - 20} more`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — every live reconciliation_matches row has a real accept audit event.`);
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
