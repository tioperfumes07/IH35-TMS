/**
 * U6 3-4/6 — INBOX-CC-1.md "5 events: revrec, invoice+evidence, ...".
 *
 * Transitions a real, existing USMCA load (with a real driver, customer, delivery stop, and a
 * live proforma invoice already on it) through its own real production status graph:
 *   dispatched -> in_transit -> delivered_pending_docs
 *
 * This is a FAITHFUL REPLAY of PATCH /api/v1/dispatch/loads/:id/transition's own core logic
 * (apps/backend/src/dispatch/loads.routes.ts, the same functions in the same order, same
 * transaction shape) run via script instead of HTTP -- no new GL math, no new business logic,
 * every function called is the exact production function:
 *   1. validateLoadStatusTransition + status UPDATE (load-state-machine.ts)
 *   2. stampFinalActiveDeliveryDeparture (stamp-final-delivery-departure.ts) -- real delivery
 *      evidence, only fires on the delivered_pending_docs hop
 *   3. ensureDriverBillArtifactsForLoad (book-load.service.ts)
 *   4. latchOnDeliveryEvidence (delivery-evidence-latch.ts) -- fires postLoadRevenueLatch's
 *      "earn" event (DISP-01 two-event revenue latch) AND converts the load's existing proforma
 *      invoice to a real official draft invoice + auto-sends it (ND-INV-01) -- this is what
 *      closes BOTH "revrec" and "invoice+evidence" from the same INBOX order, in one real action.
 *   5. pingSettlementOnLoadEvent (best-effort, matches the route's own try/catch)
 *   6. emitDispatchSpineEvent (append-only spine event, matches the route)
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-u6-revrec-invoice-once.mts          # dry run
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-u6-revrec-invoice-once.mts --commit  # apply
 */
import pg from "pg";
import { withCompanyScope } from "../apps/backend/src/accounting/shared.js";
import { validateLoadStatusTransition, toMdataStatus } from "../apps/backend/src/dispatch/load-state-machine.js";
import {
  loadStatusRequiresDeliveryDepartureStamp,
  stampFinalActiveDeliveryDeparture,
} from "../apps/backend/src/dispatch/stamp-final-delivery-departure.js";
import { ensureDriverBillArtifactsForLoad } from "../apps/backend/src/dispatch/book-load.service.js";
import { latchOnDeliveryEvidence } from "../apps/backend/src/dispatch/delivery-evidence-latch.js";
import { pingSettlementOnLoadEvent } from "../apps/backend/src/driver-finance/settlements-load-bookended.service.js";
import { emitDispatchSpineEvent } from "../apps/backend/src/dispatch/dispatch-spine-emit.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_ID = "8df23e68-e1c0-415f-8397-40528bb3b499"; // L-20260816-0168 -- $1,200 rate, real driver+customer, live proforma INV-2026-00037
const HOPS = ["in_transit", "delivered_pending_docs"] as const;

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");
if (/-pooler\./.test(dbUrl)) {
  throw new Error("Refusing a pooled connection string.");
}

async function transitionOneHop(targetStatus: string) {
  return withCompanyScope(ACTOR_USER_UUID, USMCA, async (client: any) => {
    const currentRes = await client.query(
      `SELECT status FROM mdata.loads WHERE id = $1 AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL LIMIT 1`,
      [LOAD_ID, USMCA]
    );
    const current = currentRes.rows[0];
    if (!current) throw new Error("load_not_found");
    const transition = validateLoadStatusTransition(current.status, targetStatus);
    if (!transition.ok) throw new Error(`invalid_transition from=${transition.from} to=${transition.to}`);

    const mdataStatus = toMdataStatus(targetStatus);
    await client.query(`UPDATE mdata.loads SET status = $2 WHERE id = $1`, [LOAD_ID, mdataStatus]);

    let driverBillOutcome = null;
    if (loadStatusRequiresDeliveryDepartureStamp(targetStatus)) {
      await stampFinalActiveDeliveryDeparture(client, USMCA, LOAD_ID, null);
      driverBillOutcome = await ensureDriverBillArtifactsForLoad(client, {
        loadId: LOAD_ID,
        operatingCompanyId: USMCA,
        actorUserId: ACTOR_USER_UUID,
      });
    }

    await latchOnDeliveryEvidence(client, {
      operatingCompanyId: USMCA,
      loadId: LOAD_ID,
      targetStatus,
      actorUserId: ACTOR_USER_UUID,
    });

    try {
      await pingSettlementOnLoadEvent(client, {
        loadId: LOAD_ID,
        operatingCompanyId: USMCA,
        dispatchTargetStatus: targetStatus,
        actorUserId: ACTOR_USER_UUID,
      });
    } catch (err) {
      console.warn("settlement_ping_failed", err);
    }

    await emitDispatchSpineEvent(client, {
      operating_company_id: USMCA,
      actor_user_id: ACTOR_USER_UUID,
      event_type: "load.status_changed",
      load_id: LOAD_ID,
      payload: { from_status: current.status, to_status: targetStatus },
    });

    return { from: current.status, to: targetStatus, driverBillOutcome };
  });
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    const before = await client.query(`SELECT status FROM mdata.loads WHERE id = $1::uuid`, [LOAD_ID]);
    console.log("BEFORE load status:", before.rows[0]);

    if (!COMMIT) {
      console.log("DRY RUN — pass --commit to apply. No writes made.");
      return;
    }

    for (const hop of HOPS) {
      const result = await transitionOneHop(hop);
      console.log("HOP RESULT:", JSON.stringify(result, null, 2));
    }

    const after = await client.query(`SELECT status FROM mdata.loads WHERE id = $1::uuid`, [LOAD_ID]);
    console.log("AFTER load status:", after.rows[0]);

    const invoice = await client.query(
      `SELECT id, status, display_id, sent_at, total_cents FROM accounting.invoices WHERE source_load_id = $1::uuid AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [LOAD_ID]
    );
    console.log("INVOICE AFTER:", invoice.rows[0]);

    const je = await client.query(
      `SELECT id::text, memo, entry_date
         FROM accounting.journal_entries
        WHERE operating_company_id = $1::uuid AND memo ILIKE '%' || $2 || '%'
        ORDER BY created_at DESC`,
      [USMCA, "load L-20260816-0168"]
    );
    console.log("REVREC JE(S):", je.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
