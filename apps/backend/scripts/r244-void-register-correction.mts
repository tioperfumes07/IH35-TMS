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
 * FIX: stamp voided_at to this row's own true historical void moment (NOT "now", which would
 * misrepresent when this bill actually stopped being live), void_reason, and voided_by_user_id.
 * NOT A NEW VOID, NOT AN UN-VOID: status stays 'void', gross_amount_cents/
 * settled_in_settlement_id untouched, no GL. This is a REGISTER CORRECTION on an already-void
 * row -- recording what should have been recorded the first time.
 *
 * TRANSPORTATION IS FROZEN (owner ruling, this round): the SAME inconsistency also exists on 2
 * TRANSP driver_bills rows (b1154498-... load L-20260616-0120, 7682985c-... load L-20260627-0036).
 * An earlier version of this script fixed those 2 rows too, reasoning that the table-wide CHECK
 * constraint could not otherwise build -- that write into a frozen entity was WRONG and has been
 * reverted (both rows confirmed back to their exact original state: status='void', voided_at
 * NULL, void_reason NULL, voided_by_user_id NULL, gross_amount_cents/settled_in_settlement_id
 * unchanged throughout). The correct answer, per the owner's ruling, is NOT VALID: the constraint
 * enforces the rule on every INSERT/UPDATE from this moment forward without scanning or touching
 * the 2 pre-existing TRANSP rows. `convalidated=false` on the constraint is the permanent,
 * queryable record that those rows were never proven -- VALIDATE CONSTRAINT remains available the
 * day TRANSPORTATION is unfrozen, and is NOT run here.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r244-void-register-correction.mts            # PREVIEW
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r244-void-register-correction.mts --commit   # write
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BILL_ID = "b3a0b7fe-2cad-45c3-a16b-2ec7b943b447";
const TRUE_VOID_AT = "2026-09-04T18:25:27.606Z"; // from audit.row_changes, the row's own original open->void moment
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // same actor audit.row_changes shows made the original open->void change
const VOID_REASON =
  "REGISTER CORRECTION 2026-09-14 (ROUND 24.4): status was already 'void' (set 2026-09-04T18:25:27Z " +
  "per audit.row_changes) but voided_at/void_reason/voided_by_user_id were never stamped, so this " +
  "bill silently passed every voided_at IS NULL filter as if still live. This is the superseded " +
  "overpay bill for load 13508 ($709.49, GEN-A S-2026-0007/cancelled) -- the live, correct bill is " +
  "c1d1aa02-08cc-4a6c-bc08-b823f83a35da ($633.46), repointed to S-2026-5769 in ROUND 24.2. Not a " +
  "new void, not an un-void: status stays 'void', amount and settlement link untouched, no GL.";

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
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);

    const { rows: before } = await client.query(
      `SELECT id, load_number, status, voided_at, void_reason, voided_by_user_id, gross_amount_cents,
              settled_in_settlement_id, operating_company_id
         FROM driver_finance.driver_bills WHERE id = $1::uuid`,
      [BILL_ID]
    );
    if (before.length !== 1 || before[0].status !== "void" || before[0].voided_at !== null) {
      throw new Error(`Expected bill ${BILL_ID} status='void' voided_at=NULL, found: ${JSON.stringify(before)}`);
    }
    if (before[0].operating_company_id !== USMCA) {
      throw new Error(`Bill ${BILL_ID} is not USMCA-scoped: ${before[0].operating_company_id} -- refusing.`);
    }
    console.log("before:", JSON.stringify(before[0], null, 2));

    await client.query(
      `UPDATE driver_finance.driver_bills
          SET voided_at = $2::timestamptz, void_reason = $3, voided_by_user_id = $4::uuid, updated_at = now()
        WHERE id = $1::uuid AND status = 'void' AND voided_at IS NULL`,
      [BILL_ID, TRUE_VOID_AT, VOID_REASON, ACTOR_USER_ID]
    );

    const { rows: after } = await client.query(
      `SELECT id, load_number, status, voided_at, gross_amount_cents, settled_in_settlement_id
         FROM driver_finance.driver_bills WHERE id = $1::uuid`,
      [BILL_ID]
    );
    console.log("after:", JSON.stringify(after[0], null, 2));
    if (after[0].gross_amount_cents !== before[0].gross_amount_cents || after[0].settled_in_settlement_id !== before[0].settled_in_settlement_id) {
      throw new Error("Refusing: amount or settlement link changed, this must be register-only.");
    }

    // NOT VALID: enforces the rule on every INSERT/UPDATE from this moment forward WITHOUT
    // scanning or touching the 2 pre-existing TRANSP rows (TRANSPORTATION is frozen -- owner
    // ruling this round). Do NOT run VALIDATE CONSTRAINT; it would fail on those rows and forcing
    // it past would mean writing them.
    await client.query(
      `ALTER TABLE driver_finance.driver_bills
         DROP CONSTRAINT IF EXISTS chk_driver_bills_void_register_consistent`
    );
    await client.query(
      `ALTER TABLE driver_finance.driver_bills
         ADD CONSTRAINT chk_driver_bills_void_register_consistent
         CHECK ((status = 'void') = (voided_at IS NOT NULL)) NOT VALID`
    );
    console.log("CHECK constraint chk_driver_bills_void_register_consistent added NOT VALID.");

    // DONE-proof, exact per-entity query from the owner's ruling.
    const { rows: proofByEntity } = await client.query(
      `SELECT operating_company_id::text AS opco,
              count(*) FILTER (WHERE status='void' AND voided_at IS NULL) AS void_no_stamp
         FROM driver_finance.driver_bills
        GROUP BY 1 ORDER BY 1`
    );
    console.log("\nDONE-proof (per entity):", JSON.stringify(proofByEntity));
    const usmcaRow = proofByEntity.find((r) => r.opco === USMCA);
    if (!usmcaRow || usmcaRow.void_no_stamp !== "0") {
      throw new Error(`USMCA DONE-proof FAILED: expected 0, got ${JSON.stringify(usmcaRow)}`);
    }
    console.log("PASS: USMCA 0. Any other entity's count (e.g. TRANSP) is expected and disclosed, not fixed here.");

    const { rows: constraintCheck } = await client.query(
      `SELECT conname, convalidated FROM pg_constraint WHERE conname='chk_driver_bills_void_register_consistent'`
    );
    console.log("Constraint state:", JSON.stringify(constraintCheck[0]));
    if (constraintCheck[0]?.convalidated !== false) {
      throw new Error(`Expected convalidated=false (NOT VALID), got: ${JSON.stringify(constraintCheck[0])}`);
    }

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
