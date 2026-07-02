import { pool } from "../auth/db.js";

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DriverAssignmentAvailability = {
  ok: boolean;
  blocker?: string;
  work_order_id?: string;
  asset_id?: string | null;
};

export async function canAssignLoadToDriver(
  driverId: string,
  tenantId: string,
  queryable?: Queryable
): Promise<DriverAssignmentAvailability> {
  const run = async (db: Queryable): Promise<DriverAssignmentAvailability> => {
    const woRes = await db.query<{
      id: string;
      asset_id: string | null;
      status: string;
    }>(
      `
        SELECT id::text AS id, unit_id::text AS asset_id, status::text AS status
        FROM maintenance.work_orders
        WHERE driver_id = $1
          AND operating_company_id = $2
          AND status::text NOT IN ('completed', 'cancelled')
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [driverId, tenantId]
    );

    const activeWo = woRes.rows[0];
    if (!activeWo) return { ok: true };

    if (["completed", "cancelled"].includes(String(activeWo.status))) {
      return { ok: true };
    }

    return {
      ok: false,
      blocker: `Driver's truck is in repair (WO ${activeWo.id})`,
      work_order_id: activeWo.id,
      asset_id: activeWo.asset_id ?? null,
    };
  };

  if (queryable) {
    return run(queryable);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [tenantId]);
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
