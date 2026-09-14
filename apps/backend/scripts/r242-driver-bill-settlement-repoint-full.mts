#!/usr/bin/env node
/**
 * ROUND 24.2 — finish the linkage the Lead's own scoping error in 24.1 left incomplete (34
 * bills/settlements total, not just the 7 CC-3's B3 needed).
 *
 * Live-measured: 28 USMCA driver_bills point at a settlement whose source_document_ref is NULL
 * or outside the AllwaysTrack cutover range (5769-5803) -- the round's own live count when this
 * script was written; the round's message said 29, drifted since its own measurement, re-verified
 * fresh here. Of those 28:
 *   - 13 have a load that appears in EXACTLY ONE AllwaysTrack driver document's own loads[] array
 *     (data/alwaystrack/settlements-truth-2026-09-13.json) -- these are genuine GEN-A/wrong-doc
 *     mislinks, repointed here, same method as 24.1's 7.
 *   - 15 have a load that appears in NO document's loads[] array at all. These are NOT touched --
 *     per the round's own explicit rule ("A bill whose load appears in NO document's loads[]
 *     array is NOT repointed: list it and stop on that one"). Cross-checked: most of these already
 *     sit on a real, non-AllwaysTrack-sourced, status='open' settlement (S-2026-5804 through
 *     S-2026-5814 -- documents that do not exist anywhere in the truth file, confirmed: the truth
 *     file's driver docs run 5753-5803, nothing higher) -- almost certainly genuine TMS-native
 *     settlements for loads booked after the AllwaysTrack ingest window ended, not GEN-A ghosts at
 *     all. One exception: load 13581 is the standing owner-gated Faro short-pay dispute (do NOT
 *     touch, per multiple earlier rounds) -- its absence from the truth file's loads[] array is
 *     independent confirmation of that same standing instruction, not a new finding.
 *
 * NOT A REVERSAL. FK correction on OPEN, non-voided bills only. No GEN-A settlement modified,
 * cancelled, voided or deleted. No gross_amount_cents/miles/rates touched (CC-3's B3). No GL.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r242-driver-bill-settlement-repoint-full.mts            # PREVIEW
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r242-driver-bill-settlement-repoint-full.mts --commit   # write
 */
import pg from "pg";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA

// load_number -> { correct GEN-B settlement id, doc, expected CURRENT (wrong) display_id }
// every (load, doc) pair cross-checked against data/alwaystrack/settlements-truth-2026-09-13.json's
// own loads[] array for that doc before this script was written -- see the pre-flight check below.
const REPOINTS: Array<{ load: string; correctSettlementId: string; doc: string; expectedWrongDisplayId: string }> = [
  { load: "13508", correctSettlementId: "0c77ef0b-cb68-4965-8a60-707cb31dd830", doc: "5769", expectedWrongDisplayId: "S-2026-0007" },
  { load: "13546", correctSettlementId: "9007277f-3168-440d-a981-4b8b415413c8", doc: "5788", expectedWrongDisplayId: "S-2026-0015" },
  { load: "13551", correctSettlementId: "1104c9f4-2c1a-46f1-b96b-ed3a71b1901b", doc: "5800", expectedWrongDisplayId: "S-2026-0016" },
  { load: "13552", correctSettlementId: "9007277f-3168-440d-a981-4b8b415413c8", doc: "5788", expectedWrongDisplayId: "S-2026-0015" },
  { load: "13564", correctSettlementId: "3f67ff6b-0334-4234-b3b0-a09617c77b39", doc: "5803", expectedWrongDisplayId: "S-2026-0018" },
  { load: "13565", correctSettlementId: "4a2033d0-208d-4c5e-80bb-ae3de7daecf8", doc: "5793", expectedWrongDisplayId: "S-2026-0002" },
  { load: "13566", correctSettlementId: "4a2033d0-208d-4c5e-80bb-ae3de7daecf8", doc: "5793", expectedWrongDisplayId: "S-2026-0002" },
  { load: "13569", correctSettlementId: "553170bd-aba3-48f8-b51f-9454859084d8", doc: "5797", expectedWrongDisplayId: "S-2026-5805" },
  { load: "13570", correctSettlementId: "c0fdcc2a-2abb-421c-bfd2-fcf5973b7a33", doc: "5801", expectedWrongDisplayId: "S-2026-0020" },
  { load: "13572", correctSettlementId: "4d37edff-6369-443b-b890-af0d3b97f8b2", doc: "5798", expectedWrongDisplayId: "S-2026-0022" },
  { load: "13575", correctSettlementId: "4d37edff-6369-443b-b890-af0d3b97f8b2", doc: "5798", expectedWrongDisplayId: "S-2026-0018" },
  { load: "13577", correctSettlementId: "553170bd-aba3-48f8-b51f-9454859084d8", doc: "5797", expectedWrongDisplayId: "S-2026-5805" },
  { load: "13579", correctSettlementId: "2e1dad71-afca-4590-bb39-3ace3f03a073", doc: "5802", expectedWrongDisplayId: "S-2026-5810" },
];

// Confirmed NOT in any truth doc's loads[] array -- listed for the round's own record, not touched.
const NOT_FOUND_LOADS = [
  "13553", "13563", "13576", "13578", "13581", "13582", "13583", "13587",
  "13588", "13590", "13591", "13592", "13593", "13594", "13595",
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
    console.log(`pre-flight: all ${settlementIds.length} distinct target settlements confirmed GEN-B (locked, correct doc).\n`);

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
                        'linkage repoint 2026-09-14: was ' || $3 || ', now ' || $4 || ' per AlwaysTrack doc ' || $5,
                updated_at = now()
          WHERE id = $1::uuid`,
        [bill.id, r.correctSettlementId, r.expectedWrongDisplayId, targetDisplayId, r.doc]
      );
      console.log(`load ${r.load}: bill ${bill.id} repointed ${r.expectedWrongDisplayId} -> ${targetDisplayId} (doc ${r.doc})`);
    }

    console.log(`\n${NOT_FOUND_LOADS.length} loads confirmed absent from every truth doc's loads[] array -- NOT repointed, listed per the round's own rule:`);
    const { rows: notFoundRows } = await client.query(
      `SELECT db.load_number, db.id AS bill_id, s.display_id, s.source_document_ref, s.status
         FROM driver_finance.driver_bills db
         JOIN driver_finance.driver_settlements s ON s.id = db.settled_in_settlement_id
        WHERE db.load_number = ANY($1::text[]) AND db.voided_at IS NULL AND db.status = 'open'
        ORDER BY db.load_number::bigint`,
      [NOT_FOUND_LOADS]
    );
    console.table(notFoundRows);

    // DONE-proof: fresh L1 / L3 counts, bypass CTE referenced.
    const { rows: l1 } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM driver_finance.driver_bills db
         JOIN driver_finance.driver_settlements s ON s.id = db.settled_in_settlement_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL AND db.status = 'open'
          AND (s.source_document_ref IS NULL OR s.source_document_ref !~ '^(576[9]|57[7-9][0-9]|580[0-3])$')`,
      [OPCO]
    );
    const { rows: l3 } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM driver_finance.driver_settlements s
        WHERE s.operating_company_id = $1::uuid AND s.status = 'locked'
          AND s.source_document_ref ~ '^(576[9]|57[7-9][0-9]|580[0-3])$'
          AND NOT EXISTS (
            SELECT 1 FROM driver_finance.driver_bills db
             WHERE db.settled_in_settlement_id = s.id AND db.voided_at IS NULL AND db.status = 'open'
          )`,
      [OPCO]
    );
    console.log(`\nL1 count (required 0): ${l1[0].n}`);
    console.log(`L3 count (must be < 26): ${l3[0].n}`);

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
