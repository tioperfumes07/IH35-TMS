import { pool } from "../auth/db.js";

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DriverAssignmentAvailability = {
  ok: boolean;
  blocker?: string;
  /** When set, callers can map to a stable error code (e.g. E_DRIVER_HOS_VIOLATION). */
  code?: "E_DRIVER_HOS_VIOLATION" | "E_DRIVER_REPAIR_BLOCK";
  work_order_id?: string;
  asset_id?: string | null;
  /** FAIL-U1: operator-facing labels. The ids above stay for programmatic callers; these are what
      a dispatcher can actually read. `WO ad7c6b47-…` told nobody which work order or which truck. */
  work_order_display_id?: string | null;
  asset_label?: string | null;
};

export async function canAssignLoadToDriver(
  driverId: string,
  tenantId: string,
  queryable?: Queryable
): Promise<DriverAssignmentAvailability> {
  const run = async (db: Queryable): Promise<DriverAssignmentAvailability> => {
    // HOS first — same gate Book uses. Quick-assign previously only checked repair WO and could
    // seat an HOS violator from the board while Book correctly refused.
    const hosRes = await db.query<{
      full_name: string | null;
      display_id: string | null;
      is_in_violation: boolean;
    }>(
      `
        SELECT full_name::text AS full_name,
               display_id::text AS display_id,
               COALESCE(is_in_violation, false) AS is_in_violation
        FROM views.drivers_with_hos_status
        WHERE id = $1
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [driverId, tenantId]
    );
    const hos = hosRes.rows[0];
    if (hos?.is_in_violation) {
      const who = hos.full_name || hos.display_id || "Driver";
      return {
        ok: false,
        code: "E_DRIVER_HOS_VIOLATION",
        blocker: `${who} is in HOS violation`,
      };
    }

    const woRes = await db.query<{
      id: string;
      asset_id: string | null;
      status: string;
      display_id: string | null;
      unit_number: string | null;
    }>(
      `
        SELECT wo.id::text AS id,
               wo.unit_id::text AS asset_id,
               wo.status::text AS status,
               wo.display_id::text AS display_id,
               u.unit_number::text AS unit_number
        FROM maintenance.work_orders wo
        LEFT JOIN mdata.units u ON u.id = wo.unit_id
         AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
        WHERE wo.driver_id = $1
          AND wo.operating_company_id = $2::uuid
          AND wo.status::text NOT IN ('completed', 'cancelled')
        ORDER BY wo.created_at DESC
        LIMIT 1
      `,
      [driverId, tenantId]
    );

    const activeWo = woRes.rows[0];
    if (!activeWo) return { ok: true };

    if (["completed", "cancelled"].includes(String(activeWo.status))) {
      return { ok: true };
    }

    // A UUID is not an operator label. Keep canonical ids in their dedicated fields, and make
    // missing catalog/display data explicit instead of disguising it as a readable blocker.
    const woLabel = activeWo.display_id || "work order unavailable";

    return {
      ok: false,
      code: "E_DRIVER_REPAIR_BLOCK",
      blocker: `Driver's truck is in repair (WO ${woLabel})`,
      work_order_id: activeWo.id,
      asset_id: activeWo.asset_id ?? null,
      work_order_display_id: activeWo.display_id ?? null,
      asset_label: activeWo.unit_number ?? null,
    };
  };

  if (queryable) {
    return run(queryable);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [tenantId]);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
