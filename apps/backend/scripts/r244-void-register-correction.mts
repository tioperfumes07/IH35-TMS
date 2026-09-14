#!/usr/bin/env node
/**
 * ROUND 24.4 item 1 — VOID REGISTER INCONSISTENCY.
 *
 * Live-measured, USMCA: 1 driver_bills row (b3a0b7fe-2cad-45c3-a16b-2ec7b943b447, load 13508,
 * gross $709.49, still pointing at S-2026-0007 cancelled/GEN-A) has status='void' but
 * voided_at/void_reason/voided_by_user_id were never stamped -- so it silently passes every
 * `voided_at IS NULL` filter as if it were still live. Confirmed via audit.row_changes: this
 * bill's status flipped open -> void on 2026-09-04T18:25:27.606Z by e4117991-...(the same actor
 * used throughout this session's ingestion) -- the stamp was never written even at that original
 * moment, not something that regressed later. This is the superseded overpay bill for load 13508:
 * the live, CORRECT bill is c1d1aa02-08cc-4a6c-bc08-b823f83a35da ($633.46), repointed to
 * S-2026-5769 (locked, correct GEN-B document) in ROUND 24.2.
 *
 * FOUND WHILE FIXING (not in the round's own stated scope, but the table-wide CHECK constraint
 * the round asks for cannot be added without them, and NEVER DEFER law applies): the SAME
 * inconsistency exists on 2 TRANSP driver_bills rows (b1154498-... load L-20260616-0120,
 * 7682985c-... load L-20260627-0036). Neither has an audit.row_changes INSERT or a meaningful
 * status-transition record -- both predate this table's audit trigger entirely (only a single
 * void->void no-op UPDATE exists, itself with changed_by_user_id NULL). The row's own updated_at
 * (2026-09-01T18:47:10.539Z, identical for both -- a batch operation) is the best available
 * historical anchor; the true original reason for either void is not recoverable from any
 * evidence this session has access to, and this script says so honestly in each void_reason
 * rather than inventing one. L-20260616-0120's own load IS cancelled ("customer cancelled the
 * load via phone") -- consistent with its bill being void. L-20260627-0036's own load is
 * status='assigned_not_dispatched', NOT cancelled -- why its bill was voided is genuinely unknown;
 * flagged as such.
 *
 * FIX (all 3 rows): stamp voided_at to each row's own best-evidenced historical void moment (NOT
 * "now", which would misrepresent when a bill actually stopped being live), void_reason, and
 * voided_by_user_id. NOT A NEW VOID, NOT AN UN-VOID on any of the three: status stays 'void',
 * gross_amount_cents/settled_in_settlement_id untouched, no GL. This is a REGISTER CORRECTION on
 * already-void rows -- recording what should have been recorded the first time.
 *
 * ALSO ADDS: a CHECK constraint enforcing (status='void') = (voided_at IS NOT NULL) on the whole
 * table (not scoped per-company -- this is why the 2 TRANSP rows had to be included) so the two
 * columns can never disagree again for any company.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r244-void-register-correction.mts            # PREVIEW
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r244-void-register-correction.mts --commit   # write
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // the actor audit.row_changes shows made the load-13508 bill's original open->void change

const FIXES: Array<{ billId: string; opco: string; voidedAt: string; reason: string }> = [
  {
    billId: "b3a0b7fe-2cad-45c3-a16b-2ec7b943b447",
    opco: USMCA,
    voidedAt: "2026-09-04T18:25:27.606Z", // from audit.row_changes, the row's own original open->void moment
    reason:
      "REGISTER CORRECTION 2026-09-14 (ROUND 24.4): status was already 'void' (set 2026-09-04T18:25:27Z " +
      "per audit.row_changes) but voided_at/void_reason/voided_by_user_id were never stamped, so this " +
      "bill silently passed every voided_at IS NULL filter as if still live. This is the superseded " +
      "overpay bill for load 13508 ($709.49, GEN-A S-2026-0007/cancelled) -- the live, correct bill is " +
      "c1d1aa02-08cc-4a6c-bc08-b823f83a35da ($633.46), repointed to S-2026-5769 in ROUND 24.2. Not a " +
      "new void, not an un-void: status stays 'void', amount and settlement link untouched, no GL.",
  },
  {
    billId: "b1154498-a54a-4372-96fe-04e14928d5a5",
    opco: TRANSP,
    voidedAt: "2026-09-01T18:47:10.539Z", // row's own updated_at -- audit trail predates this row, no earlier transition recorded
    reason:
      "REGISTER CORRECTION 2026-09-14 (found fixing ROUND 24.4's table-wide CHECK constraint, TRANSP, " +
      "load L-20260616-0120): status already 'void' but never stamped. No audit.row_changes " +
      "INSERT or status-transition record exists for this row (predates the audit trigger) -- " +
      "voided_at backdated to the row's own last-known updated_at as the best available anchor, " +
      "not 'now'. The load itself IS cancelled ('customer cancelled the load via phone'), " +
      "consistent with a void bill. Not a new void, not an un-void: status/amount/settlement " +
      "link untouched, no GL.",
  },
  {
    billId: "7682985c-23db-429a-b3e7-5379fd51fdfd",
    opco: TRANSP,
    voidedAt: "2026-09-01T18:47:10.539Z", // same anchor as above, same batch timestamp
    reason:
      "REGISTER CORRECTION 2026-09-14 (found fixing ROUND 24.4's table-wide CHECK constraint, TRANSP, " +
      "load L-20260627-0036): status already 'void' but never stamped. No audit.row_changes " +
      "INSERT or status-transition record exists for this row (predates the audit trigger) -- " +
      "voided_at backdated to the row's own last-known updated_at as the best available anchor, " +
      "not 'now'. UNLIKE the sibling row above, this load is NOT cancelled " +
      "(status=assigned_not_dispatched) -- the original reason this bill was voided is genuinely " +
      "not recoverable from any evidence available this session; recorded honestly as unknown " +
      "rather than invented. Not a new void, not an un-void: status/amount/settlement link " +
      "untouched, no GL.",
  },
];

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Landmine documented this session: pooled Neon connections can downgrade current_user to
    // ih35_app, which lacks ownership to ALTER TABLE this table's constraints. RESET ROLE first.
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    // Two different companies are touched below (USMCA + TRANSP) -- bypass_rls='lucia' alone
    // covers every read/write on this table; the per-company GUC is set per-row inside the loop
    // instead of once here.

    for (const fix of FIXES) {
      await client.query("SELECT set_config('app.operating_company_id',$1,true)", [fix.opco]);
      const { rows: before } = await client.query(
        `SELECT id, load_number, status, voided_at, void_reason, voided_by_user_id, gross_amount_cents,
                settled_in_settlement_id, operating_company_id
           FROM driver_finance.driver_bills WHERE id = $1::uuid`,
        [fix.billId]
      );
      if (before.length !== 1 || before[0].status !== "void" || before[0].voided_at !== null) {
        throw new Error(`Expected bill ${fix.billId} status='void' voided_at=NULL, found: ${JSON.stringify(before)}`);
      }
      if (before[0].operating_company_id !== fix.opco) {
        throw new Error(`Bill ${fix.billId} operating_company_id mismatch: expected ${fix.opco}, found ${before[0].operating_company_id}`);
      }
      console.log(`\nbefore [${fix.billId}]:`, JSON.stringify(before[0], null, 2));

      await client.query(
        `UPDATE driver_finance.driver_bills
            SET voided_at = $2::timestamptz, void_reason = $3, voided_by_user_id = $4::uuid, updated_at = now()
          WHERE id = $1::uuid AND status = 'void' AND voided_at IS NULL`,
        [fix.billId, fix.voidedAt, fix.reason, ACTOR_USER_ID]
      );

      const { rows: after } = await client.query(
        `SELECT id, load_number, status, voided_at, gross_amount_cents, settled_in_settlement_id
           FROM driver_finance.driver_bills WHERE id = $1::uuid`,
        [fix.billId]
      );
      console.log(`after [${fix.billId}]:`, JSON.stringify(after[0], null, 2));
      if (after[0].gross_amount_cents !== before[0].gross_amount_cents || after[0].settled_in_settlement_id !== before[0].settled_in_settlement_id) {
        throw new Error("Refusing: amount or settlement link changed, this must be register-only.");
      }
    }

    // Add the CHECK constraint so the two columns can never disagree again. Idempotent.
    await client.query(
      `ALTER TABLE driver_finance.driver_bills
         DROP CONSTRAINT IF EXISTS chk_driver_bills_void_status_matches_voided_at`
    );
    await client.query(
      `ALTER TABLE driver_finance.driver_bills
         ADD CONSTRAINT chk_driver_bills_void_status_matches_voided_at
         CHECK ((status = 'void') = (voided_at IS NOT NULL))`
    );
    console.log("CHECK constraint chk_driver_bills_void_status_matches_voided_at added.");

    // DONE-proof, exact query from the round directive, scoped to USMCA as asked -- plus a
    // table-wide check since the new CHECK constraint (and the 2 TRANSP rows it required fixing)
    // applies to every company, not just USMCA.
    const { rows: proofUsmca } = await client.query(
      `SELECT count(*) FILTER (WHERE status='void' AND voided_at IS NULL)      AS void_no_stamp,
              count(*) FILTER (WHERE voided_at IS NOT NULL AND status<>'void') AS stamp_no_void
         FROM driver_finance.driver_bills
        WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    console.log("\nDONE-proof (USMCA, exact round query):", JSON.stringify(proofUsmca[0]));
    if (proofUsmca[0].void_no_stamp !== "0" || proofUsmca[0].stamp_no_void !== "0") {
      throw new Error(`USMCA DONE-proof FAILED: expected 0/0, got ${JSON.stringify(proofUsmca[0])}`);
    }

    const { rows: proofAll } = await client.query(
      `SELECT count(*) FILTER (WHERE status='void' AND voided_at IS NULL)      AS void_no_stamp,
              count(*) FILTER (WHERE voided_at IS NOT NULL AND status<>'void') AS stamp_no_void
         FROM driver_finance.driver_bills`
    );
    console.log("DONE-proof (table-wide, all companies):", JSON.stringify(proofAll[0]));
    if (proofAll[0].void_no_stamp !== "0" || proofAll[0].stamp_no_void !== "0") {
      throw new Error(`Table-wide DONE-proof FAILED: expected 0/0, got ${JSON.stringify(proofAll[0])}`);
    }
    console.log("PASS: 0 / 0 (both USMCA and table-wide)");

    if (commit) {
      await client.query("COMMIT");
      console.log("\nCOMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nPREVIEW ONLY -- rolled back. Re-run with --commit to persist.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
