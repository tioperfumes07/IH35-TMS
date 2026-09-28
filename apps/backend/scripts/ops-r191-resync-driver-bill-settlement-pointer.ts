#!/usr/bin/env -S npx tsx
/**
 * ROUND 191 item 1 — the settlement-linkage gap CC-2 and CC-3 both independently found (6
 * loads' driver_bills.settled_in_settlement_id pointing at the wrong/stale settlement) is NOT
 * the deep P-series allocator identity bug it first looked like. `mdata.loads.presettlement_
 * link_id` -- the TRUE canonical pointer, per settlement-load-reassignment.service.ts's own file
 * header ("driver_bills... kept in sync per the owner's explicit wording, not treated as
 * canonical") -- is ALREADY 100% correct for all 6 loads, confirmed live: every one already
 * points at the real closed settlement matching its true source_document_ref (13610/13619 ->
 * P-0015/5817, 13609/13614 -> P-0016/5818, 13612/13617 -> P-0017/5819). Only the LEGACY
 * driver_bills.settled_in_settlement_id column drifted out of sync for these 6 rows -- 4 point at
 * a DIFFERENT settlement (2 at cancelled debris P-0001, 2 at the SAME driver's OTHER, unrelated,
 * currently-active pre-settlement for different loads -- P-0002/Neftali's 13637+13638,
 * P-0004/Ruben's 13639), 2 are NULL entirely.
 *
 * This script re-syncs ONLY that legacy column to match the already-correct canonical pointer,
 * using the EXACT SQL pattern reassignLoadToSettlementInClientTx's own step 5 runs (copied
 * verbatim) -- not a reinterpretation, not a raw ad hoc UPDATE. Touches NOTHING else: no
 * settlement_lines, no deductions, no reimbursements, no company_settlement_driver_settlements,
 * no bookend fields -- those either already match (unaffected) or are explicitly out of scope
 * (CSD links, the separate 5819-duplicate-display-id question) per the CC-2/CC-3 agreement.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops-r191-resync-driver-bill-settlement-pointer.ts [--apply]
 * (run from apps/backend/)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TARGET_LOAD_NUMBERS = ["13609", "13610", "13612", "13614", "13617", "13619"];
const APPLY = process.argv.includes("--apply");
// ROUND 191 -- posted to docs/bus/09-28-2026-CC-2-TO-CC-3-SETTLEMENT-LINKAGE-MAP-AGREE-FIRST.md
// for CC-3's agreement, per the owner's explicit "neither of you writes that alone" order.
// NOT YET OPENED. Whoever runs --apply must first open a real AUTH-NNN entry in
// docs/bus/OWNER-AUTHORIZATIONS.md once CC-3 has confirmed agreement, then update this constant
// to that real id -- this deliberately-nonexistent placeholder makes --apply refuse until that
// happens (verify-owner-authorization.mjs rejects any AUTH id that isn't a real, open entry).
const AUTH_ID = "AUTH-PENDING-CC3-AGREEMENT-ROUND-191-ITEM-1";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`ROUND 133 P0: ${AUTH_ID} rejected by verify-owner-authorization.mjs -- see docs/bus/OWNER-AUTHORIZATIONS.md. This is expected until CC-3 agrees and a real AUTH is opened.`);
      process.exit(1);
    }
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    const loads = await client.query<{ id: string; load_number: string; presettlement_link_id: string | null }>(
      `SELECT id::text, load_number, presettlement_link_id::text
         FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[])`,
      [USMCA, TARGET_LOAD_NUMBERS]
    );
    console.log("BEFORE (loads' canonical pointer, unchanged by this script):", JSON.stringify(loads.rows));

    const before = await client.query(
      `SELECT db.id::text, l.load_number, db.settled_in_settlement_id::text
         FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND db.voided_at IS NULL`,
      [USMCA, TARGET_LOAD_NUMBERS]
    );
    console.log("BEFORE (driver_bills legacy pointer):", JSON.stringify(before.rows));

    const results: Array<{ load_number: string; bill_updated: boolean }> = [];
    for (const load of loads.rows) {
      if (!load.presettlement_link_id) {
        results.push({ load_number: load.load_number, bill_updated: false });
        continue;
      }
      // Verbatim copy of reassignLoadToSettlementInClientTx step 5's own UPDATE, targeting the
      // already-correct presettlement_link_id as the target (fromSettlementId param intentionally
      // omitted from the WHERE match-guard here since we are not tracking a "from" -- this script
      // only fires when the legacy pointer is WRONG or NULL, verified per-row below).
      const res = await client.query(
        `UPDATE driver_finance.driver_bills
            SET settled_in_settlement_id = $1::uuid, updated_at = now()
          WHERE load_id = $2::uuid AND operating_company_id = $3::uuid AND voided_at IS NULL
            AND (settled_in_settlement_id IS DISTINCT FROM $1::uuid)`,
        [load.presettlement_link_id, load.id, USMCA]
      );
      results.push({ load_number: load.load_number, bill_updated: (res.rowCount ?? 0) > 0 });
    }
    console.log("RESULTS:", JSON.stringify(results));

    const after = await client.query(
      `SELECT db.id::text, l.load_number, db.settled_in_settlement_id::text
         FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND db.voided_at IS NULL`,
      [USMCA, TARGET_LOAD_NUMBERS]
    );
    console.log("AFTER (driver_bills legacy pointer):", JSON.stringify(after.rows));

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("ROLLED BACK — dry run only");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
