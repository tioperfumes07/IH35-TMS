import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  classifyDefect,
  getEffectiveSeverity,
  insertSeverityTag,
  type DbClient,
} from "./dvir-severity.service.js";
import type { DvirSeverity } from "./major-defect-catalog.js";

type DefectRow = {
  id: string;
  operating_company_id: string;
  dvir_submission_id: string;
  unit_id: string;
  item_key: string;
  notes: string;
  severity: string;
};

export type RouteDefectResult =
  | {
      ok: true;
      severity: DvirSeverity;
      action: "work_order_created" | "queued_next_pm" | "logged_observation" | "already_routed";
      work_order_id: string | null;
      display_id: string | null;
    }
  | { error: "defect_not_found" };

/**
 * Route a tagged DVIR defect according to its effective severity:
 *   - major       → auto-create a maintenance work order (dispatch stays blocked
 *                   by the WF-050 unit dispatch block set at submit time)
 *   - minor       → flag for the unit's next-PM service queue (no immediate WO)
 *   - observation → log only, no work order
 *
 * Idempotent: a defect whose latest tag is already routed is not re-routed.
 */
export async function routeDefect(
  client: DbClient,
  userId: string,
  operatingCompanyId: string,
  defectId: string
): Promise<RouteDefectResult> {
  const defectRes = await client.query<DefectRow>(
    `
      SELECT id, operating_company_id, dvir_submission_id, unit_id, item_key, notes, severity
      FROM safety.dvir_defects
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [defectId, operatingCompanyId]
  );
  const defect = defectRes.rows[0];
  if (!defect) return { error: "defect_not_found" };

  let effective = await getEffectiveSeverity(client, operatingCompanyId, defectId);
  if (!effective) {
    // Never tagged → classify from the defect text + existing minor/major flag.
    const classified = classifyDefect(defect.notes, defect.item_key);
    const severity: DvirSeverity =
      classified.severity === "major" || defect.severity === "major" ? "major" : "minor";
    const majorCode = severity === "major" ? classified.major_defect_code : null;
    await insertSeverityTag(client, {
      operatingCompanyId,
      defectId,
      severity,
      majorDefectCode: majorCode,
      source: "classifier",
    });
    effective = await getEffectiveSeverity(client, operatingCompanyId, defectId);
  }

  if (!effective) return { error: "defect_not_found" };

  if (effective.routed) {
    return {
      ok: true,
      severity: effective.severity,
      action: "already_routed",
      work_order_id: effective.auto_wo_id,
      display_id: null,
    };
  }

  if (effective.severity === "observation") {
    await insertSeverityTag(client, {
      operatingCompanyId,
      defectId,
      severity: "observation",
      source: "classifier",
      routed: true,
    });
    await appendCrudAudit(
      client,
      userId,
      "maintenance.dvir.routed_observation",
      { resource_type: "safety.dvir_defects", resource_id: defectId },
      "info",
      "WF-050"
    );
    return { ok: true, severity: "observation", action: "logged_observation", work_order_id: null, display_id: null };
  }

  if (effective.severity === "minor") {
    await insertSeverityTag(client, {
      operatingCompanyId,
      defectId,
      severity: "minor",
      source: "classifier",
      routed: true,
    });
    await appendCrudAudit(
      client,
      userId,
      "maintenance.dvir.queued_next_pm",
      { resource_type: "safety.dvir_defects", resource_id: defectId, unit_id: defect.unit_id },
      "info",
      "WF-050"
    );
    return { ok: true, severity: "minor", action: "queued_next_pm", work_order_id: null, display_id: null };
  }

  // major → auto-create a work order (same WO shape proven by safety DVIR spawn).
  const displayRes = await client.query<{ display_id: string; sequence: number }>(
    `
      SELECT display_id, sequence
      FROM maintenance.next_wo_display_id($1, 'DV', CURRENT_DATE, $2)
    `,
    [defect.unit_id, operatingCompanyId]
  );
  const display = displayRes.rows[0];

  const woRes = await client.query<{ id: string; display_id: string | null }>(
    `
      INSERT INTO maintenance.work_orders (
        operating_company_id,
        wo_type,
        source_type,
        status,
        unit_id,
        opened_at,
        repair_location,
        description,
        display_id,
        unit_sequence,
        origin,
        wo_title
      )
      VALUES ($1, 'repair', 'DV', 'open', $2, now(), 'in_house', $3, $4, $5, 'dvir', $6)
      RETURNING id, display_id
    `,
    [
      operatingCompanyId,
      defect.unit_id,
      `Auto-created from MAJOR DVIR defect ${defectId} (${effective.major_defect_code ?? "uncoded"}). ${defect.notes}`,
      display?.display_id ?? null,
      Number(display?.sequence ?? 0) || null,
      `Major DVIR defect — ${defect.item_key}`,
    ]
  );
  const workOrderId = woRes.rows[0]?.id ?? null;

  await insertSeverityTag(client, {
    operatingCompanyId,
    defectId,
    severity: "major",
    majorDefectCode: effective.major_defect_code,
    source: "classifier",
    routed: true,
    autoWoId: workOrderId,
  });

  await appendCrudAudit(
    client,
    userId,
    "maintenance.dvir.major_auto_wo",
    {
      resource_type: "maintenance.work_orders",
      resource_id: workOrderId,
      dvir_defect_id: defectId,
      major_defect_code: effective.major_defect_code,
    },
    "warning",
    "WF-050"
  );

  return {
    ok: true,
    severity: "major",
    action: "work_order_created",
    work_order_id: workOrderId,
    display_id: woRes.rows[0]?.display_id ?? null,
  };
}
