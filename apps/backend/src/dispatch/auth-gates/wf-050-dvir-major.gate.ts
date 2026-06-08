import { registerGate, type GateFn } from "./gate-registry.service.js";

const wf050Gate: GateFn = async (ctx, client) => {
  if (!ctx.unit_uuid) return [];
  const res = await client.query<{ dvir_id: string }>(
    `SELECT DISTINCT d.id::text AS dvir_id
     FROM safety.dvir_reports d
     JOIN safety.dvir_defects dd ON dd.dvir_report_id = d.id
     JOIN safety.dvir_defect_severity_tags t ON t.dvir_defect_id = dd.id AND t.severity = 'major'
     WHERE d.operating_company_id = $1::uuid AND d.unit_id = $2::uuid AND d.resolved_at IS NULL LIMIT 5`,
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
