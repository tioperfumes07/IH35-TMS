import type { PoolClient } from "pg";

/**
 * WIZ-STATUS-01 DURABLE FIX (owner order 2026-09-05, spec §1.1 step 1): "a load that ends ANY write
 * with an assigned unit + primary driver (or team), or that carries an open driver bill or a
 * proforma invoice, can never be draft."
 *
 * The original fix (update-load.service.ts:760-774) only fired inside the general Edit-Load PATCH
 * path (`updateDispatchLoad`). Live investigation 2026-09-05 found FOUR separate write paths that
 * assign a primary driver/unit/team directly to mdata.loads via their own raw UPDATE, all bypassing
 * that fix entirely: quick-assign.service.ts (quickAssignLoad), assignments/quicksave.service.ts
 * (reassignDriver + reassignUnit), dispatch-refinements.service.ts (manualReassignLoad), and
 * planner.service.ts (reschedulePlannerLoad). Each is a fresh way to reproduce the exact 13508 bug
 * even with the original fix live.
 *
 * Rather than duplicate the "effective driver/team" before/after diffing logic five times (fragile,
 * and the fifth call site will make the same mistake again), this is a POST-WRITE, RE-READ check:
 * call it AFTER any write that could leave a load crewed, and it re-reads the load's OWN current
 * row and decides purely from that -- no caller-supplied "did this field change" bookkeeping to get
 * wrong. Idempotent (a second call on an already-advanced load is a no-op); safe to call from every
 * write path, including ones that did not change the crew fields at all.
 *
 * Advances ONLY draft -> assigned_not_dispatched (a driver/team is assigned but not yet dispatched
 * -- NEVER claims 'dispatched'; dispatch is its own action, gated by the load-state-machine
 * /transition endpoint, not this helper). Non-draft loads are untouched.
 */
export async function advanceDraftStatusIfCrewed(
  client: PoolClient,
  loadId: string,
  operatingCompanyId: string
): Promise<boolean> {
  const { rows } = await client.query<{
    status: string;
    assigned_primary_driver_id: string | null;
    team_id: string | null;
  }>(
    `SELECT status::text, assigned_primary_driver_id::text, team_id::text
       FROM mdata.loads
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL
      LIMIT 1`,
    [loadId, operatingCompanyId]
  );
  const load = rows[0];
  if (!load) return false;
  if (load.status !== "draft") return false;
  if (!load.assigned_primary_driver_id && !load.team_id) return false;

  await client.query(
    `UPDATE mdata.loads
        SET status = 'assigned_not_dispatched'::mdata.load_status_enum, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status = 'draft'`,
    [loadId, operatingCompanyId]
  );
  return true;
}
