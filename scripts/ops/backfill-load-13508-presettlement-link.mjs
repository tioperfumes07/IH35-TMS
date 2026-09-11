#!/usr/bin/env node
/**
 * scripts/ops/backfill-load-13508-presettlement-link.mjs
 *
 * SETTLEMENT/TOUR NUMBER SWEEP owner order (2026-09-11), Part 3 backfill.
 *
 * FINDING (live, Neon tiny-field-89581227, USMCA 5c854333-6ea5-4faa-af31-67cb272fef80,
 * bypass_rls=lucia, 2026-09-11): load 13508 (id 926f4142-3fe4-4aa5-b896-daa0ca6474c4, status
 * closed, driver fba21d80-628b-4228-ae54-336f9cbb73b6) carries presettlement_link_id = NULL, but
 * it already has its OWN real settlement — S-2026-0007 (id 27c304e2-652d-4972-9bd4-f396b394893c)
 * — whose first_load_id AND last_load_id both equal 13508's own id exactly, and whose driver_id
 * matches. This is not a "no settlement exists" case (unlike loads 13580/13581, repaired by the
 * sibling script link-orphan-loads-presettlement.ts, which genuinely had no settlement and needed
 * one created). The settlement already exists, 1:1, correctly matched by driver+load — the FK
 * back-reference on mdata.loads was simply never written.
 *
 * ROOT CAUSE: presettlement-link.service.ts's only writer, confirmPresettlementLink, is called
 * exclusively from the booking-time and post-assignment-time entry points. Load 13508 was booked
 * with trip_type unknown (this is the exact "deferred loads never get a suggestion row" gap this
 * sweep's audit identified: presettlement-link.service.ts only writes a
 * dispatch.load.presettlement_link_deferred audit-log entry and returns when trip_type is unknown
 * — no row in the human-review queue table, nothing ever reads that audit event back). By the time
 * REG-008's post-assignment hook could have retried, the load had already progressed to closed and
 * its own settlement had already been created and closed through some other path (documented, not
 * re-derived here) — the two simply never got wired together.
 *
 * FIX: a single, additive, idempotent UPDATE — write presettlement_link_id where it is NULL and
 * the target load+settlement are the exact confirmed 1:1 match above. Both tour_id columns are
 * already NULL on both sides (confirmed live), so this backfill introduces no NB/SB tour-grouping
 * mismatch. This does NOT call confirmPresettlementLink (that function's job is to CREATE a new
 * settlement or JOIN an OPEN one — S-2026-0007 is already CLOSED; running the production linker
 * against a closed settlement risks a validation path built for a different case). It does NOT
 * touch driver_finance.settlement_lines, GL postings, or any already-settled money — the 2
 * misattached deduction lines on S-2026-0015 are flagged separately (verify-load-settlement-
 * linkage.mjs's baseline) and are explicitly OUT OF SCOPE for this backfill.
 *
 * Usage:
 *   DATABASE_URL=<neon> node scripts/ops/backfill-load-13508-presettlement-link.mjs --dry-run
 *   DATABASE_URL=<neon> node scripts/ops/backfill-load-13508-presettlement-link.mjs --apply
 */
import { Client } from "pg";

const LOAD_ID = "926f4142-3fe4-4aa5-b896-daa0ca6474c4"; // load 13508
const LOAD_NUMBER = "13508";
const SETTLEMENT_ID = "27c304e2-652d-4972-9bd4-f396b394893c"; // S-2026-0007

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!apply && !args.includes("--dry-run")) throw new Error("choose --dry-run or --apply");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const preCheck = await client.query(
      `SELECT l.id, l.load_number, l.presettlement_link_id, l.tour_id, l.assigned_primary_driver_id,
              s.id AS settlement_id, s.display_id, s.first_load_id, s.last_load_id, s.driver_id, s.tour_id AS settlement_tour_id
       FROM mdata.loads l
       JOIN driver_finance.driver_settlements s ON s.id = $2
       WHERE l.id = $1`,
      [LOAD_ID, SETTLEMENT_ID]
    );
    const row = preCheck.rows[0];
    if (!row) throw new Error(`load ${LOAD_ID} or settlement ${SETTLEMENT_ID} not found`);
    if (row.load_number !== LOAD_NUMBER) throw new Error(`load_number mismatch: expected ${LOAD_NUMBER}, got ${row.load_number}`);
    if (row.presettlement_link_id !== null) {
      console.log(`ALREADY LINKED — load ${LOAD_NUMBER} already has presettlement_link_id=${row.presettlement_link_id}. No-op.`);
      await client.query("ROLLBACK");
      return;
    }
    if (row.first_load_id !== LOAD_ID || row.last_load_id !== LOAD_ID) {
      throw new Error(
        `SAFETY ABORT — settlement ${SETTLEMENT_ID}'s first_load_id/last_load_id do not both equal ${LOAD_ID}; ` +
          `this is not the clean 1:1 match this script was written for.`
      );
    }
    if (row.assigned_primary_driver_id !== row.driver_id) {
      throw new Error(`SAFETY ABORT — load's assigned driver ${row.assigned_primary_driver_id} != settlement's driver ${row.driver_id}`);
    }
    if (row.tour_id !== null && row.settlement_tour_id !== null && row.tour_id !== row.settlement_tour_id) {
      throw new Error(`SAFETY ABORT — load tour_id ${row.tour_id} conflicts with settlement tour_id ${row.settlement_tour_id}`);
    }

    console.log(`PRE-CHECK OK — load ${LOAD_NUMBER} (${LOAD_ID}) -> settlement ${row.display_id} (${SETTLEMENT_ID}), 1:1 match confirmed live.`);

    const result = await client.query(
      `UPDATE mdata.loads
       SET presettlement_link_id = $2
       WHERE id = $1 AND presettlement_link_id IS NULL`,
      [LOAD_ID, SETTLEMENT_ID]
    );
    console.log(`UPDATE affected ${result.rowCount} row(s).`);

    if (!apply) {
      console.log("DRY RUN — rolling back, no write committed.");
      await client.query("ROLLBACK");
      return;
    }

    await client.query("COMMIT");
    console.log(`APPLIED — load ${LOAD_NUMBER} now linked to settlement ${row.display_id}.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
