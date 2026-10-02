import { getDriverForVehicleAtTime } from "../../telematics/vehicle-driver-lookup.service.js";
import {
  faultDescription,
  formatFaultCode,
  type FaultSeverity,
} from "../../integrations/samsara/engine-faults/severe-fault-catalog.js";
import { createWorkOrderWithLines } from "../two-section-service.js";

const SYSTEM_ACTOR_USER_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type EngineFaultAutoWoInput = {
  operating_company_id: string;
  unit_id: string;
  spn_code: number;
  fmi_code?: number | null;
  severity: FaultSeverity;
  occurred_at: string;
};

export async function autoCreateWorkOrderFromEngineFault(
  client: DbClient,
  input: EngineFaultAutoWoInput
): Promise<string | null> {
  const faultCode = formatFaultCode(input.spn_code, input.fmi_code);
  const dedupe = await client.query<{ id: string }>(
    `
      SELECT w.id::text
      FROM maintenance.work_orders w
      WHERE w.operating_company_id = $1::uuid
        AND w.unit_id = $2::uuid
        AND w.fault_code = $3
        AND w.status::text IN ('open', 'in_progress', 'waiting_parts', 'draft')
        AND w.created_at >= ($4::timestamptz - interval '24 hours')
      LIMIT 1
    `,
    [input.operating_company_id, input.unit_id, faultCode, input.occurred_at]
  );
  if (dedupe.rows[0]) return dedupe.rows[0].id;

  const driverId = await getDriverForVehicleAtTime(
    client as never,
    input.operating_company_id,
    input.unit_id,
    input.occurred_at
  );

  const description = `[engine_fault_auto] ${faultDescription(input.spn_code, input.fmi_code)}`;
  const woTitle = `Engine diagnostic: ${faultCode}`;
  const woPriority = input.severity === "critical" ? "immediate" : "urgent";

  // ROUND 326 audit M1: one work-order creator (display id, status history, audit) — createWorkOrderWithLines.
  const created = await createWorkOrderWithLines(
    client as never,
    SYSTEM_ACTOR_USER_ID,
    {
      operating_company_id: input.operating_company_id,
      wo_type: "engine_diagnostic",
      source_type: "IS",
      unit_id: input.unit_id,
      driver_id: driverId,
      service_date: input.occurred_at,
      repair_location: "in_house",
      bucket: "in_house",
      description,
      payment_timing: "in_house",
      wo_priority: woPriority,
      origin: "fault_auto",
      wo_title: woTitle,
      fault_code: faultCode,
    },
    [],
    []
  );
  const woRes = { rows: [{ id: created.woUuid }] };

  const woId = woRes.rows[0]?.id ?? null;
  if (!woId) return null;

  await client.query(
    `
      UPDATE maintenance.work_orders
      SET severity = $3
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [woId, input.operating_company_id, input.severity]
  );

  return woId;
}
