/**
 * settlement-stuck-close-repair.service.ts — CC-1 E1 (2026-11-12, AUTH-471).
 *
 * Target: load_bookended settlements whose trip_closed_at IS NOT NULL but status='open' because
 * postFinalLoadSettlementsGl failed silently at the time of the load close (ENG-61 era). The route
 * handler never retried, so the settlements are permanently stuck. This service re-triggers the
 * exact same engine call (postFinalLoadSettlementsGl) for each stuck load, in the same way the
 * original route handler would have. It is idempotent: if a settlement is already closed it is
 * skipped (the guard already queries status='open' before we run).
 *
 * Pattern: each postFinalLoadSettlementsGl call runs in its own committed transaction (the engine
 * owns the commit boundary — it matches the ENG-61 "after the outer transaction commits" design).
 * This is NOT a client-tx repair; we do not hold a savepoint. The dry-run only reads and reports
 * what would be retried without calling the engine.
 *
 * Scope: USMCA only (AUTH-476). The 3 known loads are 13711/13727/13729 (settlements P-0125/P-0128/
 * P-0130, trip_closed between 2026-11-09 20:48Z and 22:34Z).
 */
import { notVoided } from "../accounting/live-document-predicates.sql.js";
import { withLuciaBypass } from "../auth/db.js";
import { postFinalLoadSettlementsGl } from "../driver-finance/settlement-payrun-close.service.js";

export const STUCK_CLOSE_REPAIR_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA only (AUTH-476)

export class StuckCloseRepairRefused extends Error {}

/** Rows a stuck settlement exposes before we retry it. */
export type StuckSettlement = {
  load_id: string;
  load_number: number;
  settlement_id: string;
  display_id: string;
  trip_closed_at: string;
};

/** Full result returned to the route and echoed back as JSON. */
export type StuckCloseRepairResult = {
  dry_run: boolean;
  found: number;
  retried: number;
  posted: number;
  still_open: number;
  rows: Array<{
    load_number: number;
    settlement_display_id: string;
    outcome: "dry_run_skip" | "posted" | "already_closed" | "post_failed";
    detail?: string;
  }>;
};

/** Read the stuck settlements from prod (live query, no mutations). */
async function findStuck(companyId: string): Promise<StuckSettlement[]> {
  const DELIVERY_STATUSES = ["delivered_pending_docs", "completed_docs_received", "invoiced", "closed", "paid"];
  const res = await withLuciaBypass(async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return client.query<StuckSettlement>(
      `SELECT
         ds.last_load_id::text AS load_id,
         l.load_number,
         ds.id::text AS settlement_id,
         ds.display_id,
         ds.trip_closed_at::text
       FROM driver_finance.driver_settlements ds
       JOIN mdata.loads l ON l.id = ds.last_load_id AND l.operating_company_id = ds.operating_company_id
      WHERE ds.operating_company_id = $1::uuid
        AND ds.settlement_model = 'load_bookended'
        AND ds.status = 'open'
        AND ds.trip_closed_at IS NOT NULL
        AND ${notVoided("ds")}
        AND l.status::text = ANY($2::text[])
        AND ds.updated_at < now() - interval '2 minutes'
      ORDER BY ds.trip_closed_at`,
      [companyId, DELIVERY_STATUSES]
    );
  }, { actorUserId: "system" });
  return res.rows;
}

export async function repairStuckSettlementClose(input: {
  companyId: string;
  actorUserId: string;
  dryRun: boolean;
}): Promise<StuckCloseRepairResult> {
  if (input.companyId !== STUCK_CLOSE_REPAIR_COMPANY_ID) throw new StuckCloseRepairRefused("AUTH-476 scope is USMCA only");

  const stuck = await findStuck(input.companyId);
  const rows: StuckCloseRepairResult["rows"] = [];

  if (input.dryRun) {
    for (const s of stuck) {
      rows.push({ load_number: s.load_number, settlement_display_id: s.display_id, outcome: "dry_run_skip", detail: `trip_closed_at ${s.trip_closed_at}` });
    }
    return { dry_run: true, found: stuck.length, retried: 0, posted: 0, still_open: stuck.length, rows };
  }

  let retried = 0;
  let posted = 0;

  for (const s of stuck) {
    retried++;
    // Re-query the settlement status immediately before retrying — a prior iteration may have already posted it.
    const check = await withLuciaBypass(async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      return client.query<{ status: string }>(
        `SELECT status FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [s.settlement_id, input.companyId]
      );
    }, { actorUserId: input.actorUserId });

    if (check.rows[0]?.status !== "open") {
      rows.push({ load_number: s.load_number, settlement_display_id: s.display_id, outcome: "already_closed" });
      continue;
    }

    try {
      await postFinalLoadSettlementsGl({
        loadId: s.load_id,
        actorUserId: input.actorUserId,
        operatingCompanyId: input.companyId,
      });
      // Verify it actually closed
      const after = await withLuciaBypass(async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
        return client.query<{ status: string }>(
          `SELECT status FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
          [s.settlement_id, input.companyId]
        );
      }, { actorUserId: input.actorUserId });

      if (after.rows[0]?.status === "open") {
        rows.push({ load_number: s.load_number, settlement_display_id: s.display_id, outcome: "post_failed", detail: "settlement still open after postFinalLoadSettlementsGl" });
      } else {
        posted++;
        rows.push({ load_number: s.load_number, settlement_display_id: s.display_id, outcome: "posted", detail: `status now ${after.rows[0]?.status}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rows.push({ load_number: s.load_number, settlement_display_id: s.display_id, outcome: "post_failed", detail: msg });
    }
  }

  const stillOpen = rows.filter((r) => r.outcome === "post_failed").length;
  return { dry_run: false, found: stuck.length, retried, posted, still_open: stillOpen, rows };
}
