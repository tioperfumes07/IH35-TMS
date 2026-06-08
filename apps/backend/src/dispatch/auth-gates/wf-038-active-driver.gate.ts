import { registerGate, type GateFn } from "./gate-registry.service.js";

const wf038Gate: GateFn = async (ctx, client) => {
  if (!ctx.driver_uuid) return [];
  const res = await client.query<{ status: string; is_dispatch_blocked: boolean }>(
    `SELECT status::text, COALESCE(is_dispatch_blocked,false) AS is_dispatch_blocked
     FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [ctx.driver_uuid, ctx.operating_company_id]
  );
  const row = res.rows[0];
  if (!row) return [{ workflow: "WF-038", kind: "blocker", message: "Driver not found" }];
  if (row.status !== "Active" || row.is_dispatch_blocked) {
    return [{ workflow: "WF-038", kind: "blocker", message: `Driver inactive or dispatch-blocked (status=${row.status})`, evidence: { status: row.status } }];
  }
  return [];
};

registerGate("book_load", wf038Gate);
registerGate("assign_driver", wf038Gate);
registerGate("quick_assign", wf038Gate);
