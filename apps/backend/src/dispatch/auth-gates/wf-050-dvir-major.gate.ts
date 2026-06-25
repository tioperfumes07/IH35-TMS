import { registerGate, type GateFn } from "./gate-registry.service.js";

const wf050Gate: GateFn = async (ctx, client) => {
  if (!ctx.unit_uuid) return [];
  // Real schema: the DVIR header is safety.dvir_submissions (NOT safety.dvir_reports — phantom) and
  // carries a precomputed has_major_defect flag. The old query joined a non-existent dvir_reports +
  // dd.dvir_report_id + d.resolved_at (none exist), throwing 42P01/42703 and breaking this dispatch
  // safety gate. Use the major-defect flag directly.
  const res = await client.query<{ dvir_id: string }>(
    `SELECT DISTINCT d.id::text AS dvir_id
     FROM safety.dvir_submissions d
     WHERE d.operating_company_id = $1::uuid AND d.unit_id = $2::uuid AND d.has_major_defect = true LIMIT 5`,
    [ctx.operating_company_id, ctx.unit_uuid]
  );
  return res.rows.map((row) => ({
    workflow: "WF-050",
    kind: "blocker" as const,
    message: "Open DVIR with major defect on unit — dispatch blocked",
    evidence: { dvir_id: row.dvir_id },
  }));
};

registerGate("book_load", wf050Gate);
registerGate("assign_driver", wf050Gate);
registerGate("quick_assign", wf050Gate);
