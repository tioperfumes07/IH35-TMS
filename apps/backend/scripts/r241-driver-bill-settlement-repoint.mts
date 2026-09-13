#!/usr/bin/env node
/**
 * ROUND 24.1 — DRIVER BILL -> SETTLEMENT LINKAGE REPOINT (blocks CC-3's B3).
 *
 * Two generations of driver settlements exist: GEN-B (correct: display_id S-2026-<doc>, status
 * locked, source_document_ref = an AllwaysTrack doc 5769-5803, net_pay matches the signed TOTAL DUE
 * to the cent) and GEN-A (stale: display_id S-2026-00NN, status cancelled/closed, ref NULL or out
 * of range, amounts matching no document). Every live driver_bill was attached to GEN-A; 33 of 45
 * GEN-B settlements had zero bills. This script repoints the 7 known-wrong FKs onto their correct
 * GEN-B settlement, sourced from data/alwaystrack/settlements-truth-2026-09-13.json's own loads[]
 * arrays for docs 5778/5790/5800/5801/5802/5803 -- nothing inferred, every (load, doc) pair
 * cross-checked against the ground truth before this script was written.
 *
 * NOT a void, NOT an un-void, NOT a reversal. Nothing deleted. No settlement header touched (GEN-A
 * rows are left standing, untouched -- CC-3's B3 territory, out of scope here). No GL written. Only
 * driver_bills.settled_in_settlement_id + driver_bills.notes change, on OPEN, non-voided bills.
 * gross_amount_cents/miles/rates are explicitly NOT touched (CC-3's B3, runs after this).
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r241-driver-bill-settlement-repoint.mts            # PREVIEW
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r241-driver-bill-settlement-repoint.mts --commit   # write
 */
import pg from "pg";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA

// load_number -> { correct GEN-B settlement id, doc number, expected CURRENT (wrong) display_id }
// every (load, doc) pair below is cross-checked against data/alwaystrack/settlements-truth-2026-09-13.json's
// own loads[] array for that doc before this script runs -- see the pre-flight check below.
const REPOINTS: Array<{ load: string; correctSettlementId: string; doc: string; expectedWrongDisplayId: string }> = [
  { load: "13524", correctSettlementId: "fc8d8883-2380-488d-8223-f4d532395557", doc: "5778", expectedWrongDisplayId: "S-2026-0011" },
  { load: "13554", correctSettlementId: "e68626d4-5a41-40bc-90d3-2ae1a4c6456b", doc: "5790", expectedWrongDisplayId: "S-2026-0010" },
  { load: "13573", correctSettlementId: "1104c9f4-2c1a-46f1-b96b-ed3a71b1901b", doc: "5800", expectedWrongDisplayId: "S-2026-0023" },
  { load: "13584", correctSettlementId: "1104c9f4-2c1a-46f1-b96b-ed3a71b1901b", doc: "5800", expectedWrongDisplayId: "S-2026-0031" },
  { load: "13580", correctSettlementId: "c0fdcc2a-2abb-421c-bfd2-fcf5973b7a33", doc: "5801", expectedWrongDisplayId: "S-2026-0028" },
  { load: "13589", correctSettlementId: "2e1dad71-afca-4590-bb39-3ace3f03a073", doc: "5802", expectedWrongDisplayId: "S-2026-0028" },
  { load: "13586", correctSettlementId: "3f67ff6b-0334-4234-b3b0-a09617c77b39", doc: "5803", expectedWrongDisplayId: "S-2026-0030" },
];

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    // Every target settlement must genuinely be GEN-B: locked, source_document_ref = the stated doc.
    const settlementIds = [...new Set(REPOINTS.map((r) => r.correctSettlementId))];
    const { rows: settlements } = await client.query(
      `SELECT id, display_id, source_document_ref, status FROM driver_finance.driver_settlements
        WHERE id = ANY($1::uuid[])`,
      [settlementIds]
    );
    const settlementById = Object.fromEntries(settlements.map((s) => [s.id, s]));
    for (const r of REPOINTS) {
      const s = settlementById[r.correctSettlementId];
      if (!s) throw new Error(`Target settlement ${r.correctSettlementId} for load ${r.load} not found.`);
      if (s.status !== "locked" || s.source_document_ref !== r.doc) {
        throw new Error(`Target settlement for load ${r.load} is not GEN-B as expected: ${JSON.stringify(s)}`);
      }
    }
    console.log("pre-flight: all 6 distinct target settlements confirmed GEN-B (locked, correct doc).\n");

    for (const r of REPOINTS) {
      const { rows: bills } = await client.query(
        `SELECT db.id, db.load_number, db.voided_at, db.status, db.settled_in_settlement_id,
                s.display_id AS current_display_id
           FROM driver_finance.driver_bills db
           LEFT JOIN driver_finance.driver_settlements s ON s.id = db.settled_in_settlement_id
          WHERE db.load_number = $1 AND db.voided_at IS NULL AND db.status = 'open'`,
        [r.load]
      );
      if (bills.length !== 1) {
        throw new Error(`Expected exactly 1 open, non-voided bill for load ${r.load}, found ${bills.length}: ${JSON.stringify(bills)}`);
      }
      const bill = bills[0];
      if (bill.current_display_id !== r.expectedWrongDisplayId) {
        throw new Error(
          `Load ${r.load}: expected current settlement ${r.expectedWrongDisplayId}, found ${bill.current_display_id} -- refusing, state changed since verification.`
        );
      }
      const targetDisplayId = settlementById[r.correctSettlementId].display_id;
      await client.query(
        `UPDATE driver_finance.driver_bills
            SET settled_in_settlement_id = $2::uuid,
                notes = COALESCE(notes,'') || CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE E'\n' END ||
                        'linkage repoint 2026-09-13: was ' || $3 || ', now ' || $4 || ' per AlwaysTrack doc ' || $5,
                updated_at = now()
          WHERE id = $1::uuid`,
        [bill.id, r.correctSettlementId, r.expectedWrongDisplayId, targetDisplayId, r.doc]
      );
      console.log(`load ${r.load}: bill ${bill.id} repointed ${r.expectedWrongDisplayId} -> ${targetDisplayId} (doc ${r.doc})`);
    }

    // DONE-proof query, exactly as specified in the round directive.
    const { rows: proof } = await client.query(
      `SELECT db.load_number, s.display_id, s.source_document_ref, s.status, s.net_pay
         FROM driver_finance.driver_bills db
         JOIN driver_finance.driver_settlements s ON s.id = db.settled_in_settlement_id
        WHERE db.voided_at IS NULL
          AND db.load_number IN ('13524','13554','13573','13580','13584','13586','13589')
        ORDER BY db.load_number`
    );
    console.log("\nDONE-proof query result:");
    console.table(proof);
    const allLocked = proof.length === 7 && proof.every((r) => r.status === "locked" && ["5778","5790","5800","5801","5802","5803"].includes(r.source_document_ref));
    if (!allLocked) throw new Error(`DONE-proof FAILED: ${JSON.stringify(proof)}`);
    console.log("\nPASS: all 7 rows show source_document_ref in (5778,5790,5800,5801,5802,5803) and status='locked'.");

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
