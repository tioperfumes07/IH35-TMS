/**
 * Item e (Lead ruling, 2026-09-26): of the 4 driver_finance.driver_advances rows whose
 * recovered_in_settlement_id JE didn't reconcile to their own amount, correct each to the settlement
 * whose SIGNED AlwaysTrack Driver Settlement PDF actually carries that exact advance line. No GL write
 * -- pure driver_advances header correction (recovered_in_settlement_id, status), with audit rows.
 *
 * CA-2026-0005 ($148.00): PDF match found. Driver_Settlement_5775.txt, driver ALFONSO HIDALGO CHAVEZ:
 *   "Load 13516  2026-08-05 - CASH ADVANCE WIRE TRANSFER - CASH ADVANCE WIRE TRANSFER  -148.00"
 *   -- exact match. Its own linked_driver_bill_id (4ee15c3f, bill 13516) already points to settlement
 *   5775 -- only recovered_in_settlement_id was wrong (stored settlement "5787" instead). Corrected to
 *   settlement 5775's real id. status stays 'recovered' (real money, real recovery, wrong pointer).
 *
 * CA-2026-0008 ($167.87) and CA-2026-0009 ($34.12): NO Driver Settlement PDF anywhere carries either
 * amount as a cash-advance line (searched all Driver_Settlement_*.txt for "78.01", "167.87", "34.12"
 * -- zero matches for the latter two; TIE-5807 below explains the $78.01 case). Both rows are
 * disbursement_status='reversed', disbursed_at NULL -- no money ever actually left for either. Their
 * status='recovered' is therefore UNEARNED (nothing was disbursed, so nothing was recovered) --
 * corrected to status='reversed' (matching their own disbursement_status) and recovered_in_settlement_id
 * cleared to NULL (no settlement's PDF backs a recovery that never happened). CA-2026-0009's own memo
 * already documents this: "booked as a separate loan per owner's advance/bill-payment/loan-overflow
 * rule" -- consistent with these two never being real bill-payment/recovery events.
 *
 * CA-2026-TIE-5807 ($78.01): Driver_Settlement_5807.txt, driver Angel Alfonso Sosa Perez, carries
 * EXACTLY ONE cash-advance line for load 13587: "2026-09-10 - CASH ADVANCE WIRE TRANSFER -280.00" --
 * not $78.01. But $78.01 (TIE-5807, disbursed) + $167.87 (CA-2026-0008, reversed) + $34.12
 * (CA-2026-0009, reversed) = $280.00 EXACTLY, matching this single PDF line to the cent -- the
 * historical backfill evidently attempted to split one $280.00 advance into three rows, of which only
 * $78.01 actually disbursed. TIE-5807's own recovered_in_settlement_id (S-5807) is therefore the
 * CORRECT settlement (its PDF genuinely carries a load-13587 cash advance) -- NOT changed here. The
 * $280.00-vs-$78.01 amount gap is a real, separate finding (flagged, not fixed by this script -- Lead's
 * instruction covers recovered_in_settlement_id/status, not amount corrections).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const CORRECT_SETTLEMENT_5775_ID = "1709fb7c-a589-42f7-8085-e40f0ad0f0af";

async function main() {
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

      // CA-2026-0005: relink to its real settlement (5775), per the exact PDF match.
      {
        const id = "af1e4d4d-d65e-4746-a97f-45b7a976f43c";
        const before = await client.query<{ recovered_in_settlement_id: string | null; status: string }>(
          `SELECT recovered_in_settlement_id::text, status FROM driver_finance.driver_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [id, USMCA_ID]
        );
        if (!before.rows[0]) throw new Error(`STOP: ${id} not found`);
        if (before.rows[0].recovered_in_settlement_id === CORRECT_SETTLEMENT_5775_ID) {
          results.push({ id, display_id: "CA-2026-0005", status: "already_correct" });
        } else {
          const upd = await client.query(
            `UPDATE driver_finance.driver_advances SET recovered_in_settlement_id=$2::uuid, updated_at=now()
              WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
            [id, CORRECT_SETTLEMENT_5775_ID, USMCA_ID]
          );
          if (upd.rowCount !== 1) throw new Error(`STOP: ${id} UPDATE affected ${upd.rowCount} rows`);
          await appendCrudAudit(
            client as never, SYSTEM_ACTOR_USER_ID, "driver_advances.recovered_in_settlement_id_corrected",
            { resource_type: "driver_finance.driver_advances", resource_id: id, before: before.rows[0], after: { recovered_in_settlement_id: CORRECT_SETTLEMENT_5775_ID }, pdf_evidence: "Driver_Settlement_5775.txt: Load 13516 2026-08-05 CASH ADVANCE WIRE TRANSFER -148.00" },
            "warning", "R-187-ITEM-E-LINKAGE-FIX"
          );
          results.push({ id, display_id: "CA-2026-0005", status: "corrected", before: before.rows[0], after: { recovered_in_settlement_id: CORRECT_SETTLEMENT_5775_ID } });
        }
      }

      // CA-2026-0008 and CA-2026-0009: unearned -- no PDF anywhere carries either amount; both never
      // disbursed. Clear the false recovery linkage, correct status to match disbursement_status.
      for (const [id, displayId] of [
        ["1fc97d0d-653c-4d77-b78d-bb410e44564a", "CA-2026-0008"],
        ["344012ce-306a-4829-8fae-d253965b886c", "CA-2026-0009"],
      ]) {
        const before = await client.query<{ recovered_in_settlement_id: string | null; status: string; disbursement_status: string }>(
          `SELECT recovered_in_settlement_id::text, status, disbursement_status FROM driver_finance.driver_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [id, USMCA_ID]
        );
        if (!before.rows[0]) throw new Error(`STOP: ${id} not found`);
        if (before.rows[0].disbursement_status !== "reversed") throw new Error(`STOP: ${id} disbursement_status is ${before.rows[0].disbursement_status}, expected 'reversed'`);
        const upd = await client.query(
          `UPDATE driver_finance.driver_advances SET recovered_in_settlement_id=NULL, status='reversed', updated_at=now()
            WHERE id=$1::uuid AND operating_company_id=$2::uuid AND status='recovered'`,
          [id, USMCA_ID]
        );
        if (upd.rowCount !== 1) throw new Error(`STOP: ${id} UPDATE affected ${upd.rowCount} rows`);
        await appendCrudAudit(
          client as never, SYSTEM_ACTOR_USER_ID, "driver_advances.unearned_recovery_corrected",
          { resource_type: "driver_finance.driver_advances", resource_id: id, before: before.rows[0], after: { recovered_in_settlement_id: null, status: "reversed" }, reason: "no Driver Settlement PDF carries this amount as an advance line; disbursement_status was already 'reversed' (money never left)" },
          "warning", "R-187-ITEM-E-LINKAGE-FIX"
        );
        results.push({ id, display_id: displayId, status: "corrected", before: before.rows[0], after: { recovered_in_settlement_id: null, status: "reversed" } });
      }

      // CA-2026-TIE-5807: NOT touched -- its settlement (S-5807) genuinely carries a load-13587 cash
      // advance line ($280.00); the linkage is correct. Flagged only (amount gap out of scope here).
      results.push({
        id: "1df0e5fb-a22c-42d8-af46-5e6ab0469f43", display_id: "CA-2026-TIE-5807", status: "not_touched",
        reason: "recovered_in_settlement_id (S-5807) already correct -- its PDF carries a load 13587 cash advance line ($280.00). $78.01+$167.87(0008)+$34.12(0009)=$280.00 exactly; amount discrepancy flagged separately, not corrected here (out of scope: linkage, not amount).",
      });

      await client.query("COMMIT");
      console.log(JSON.stringify(results, null, 2));
      console.log("COMMITTED.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
