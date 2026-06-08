import { registerGate, type GateFn } from "./gate-registry.service.js";

const wf044Gate: GateFn = async (ctx, client) => {
  if (!ctx.unit_uuid) return [];
  const days = 14;
  const res = await client.query<{ wo_id: string; due_at: string }>(
    `SELECT id::text AS wo_id, scheduled_start_at::text AS due_at
     FROM maintenance.work_orders
     WHERE operating_company_id = $1::uuid AND unit_id = $2::uuid
       AND status IN ('open','in_progress') AND category = 'pm'
       AND scheduled_start_at <= now() + ($3 || ' days')::interval LIMIT 5`,
    [ctx.operating_company_id, ctx.unit_uuid, days]
  );
  return res.rows.map((row) => ({
    workflow: "WF-044",
    kind: "warning" as const,
    message: `Unit has PM-due work order due ${row.due_at}`,
    evidence: { wo_id: row.wo_id, due_at: row.due_at },
  }));
};

registerGate("book_load", wf044Gate);
registerGate("assign_driver", wf044Gate);
registerGate("quick_assign", wf044Gate);
