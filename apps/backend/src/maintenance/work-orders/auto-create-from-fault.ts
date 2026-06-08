import { getDriverForVehicleAtTime } from "../../telematics/vehicle-driver-lookup.service.js";
import {
  faultDescription,
  formatFaultCode,
  type FaultSeverity,
} from "../../integrations/samsara/engine-faults/severe-fault-catalog.js";

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

  const display = await client.query<{ display_id: string; sequence: number }>(
    `
      SELECT display_id, sequence
      FROM maintenance.next_wo_display_id($1::uuid, $2, COALESCE($3::date, CURRENT_DATE), $4::uuid)
    `,
    [input.unit_id, "IS", input.occurred_at, input.operating_company_id]
  );
  const displayId = display.rows[0]?.display_id ?? null;
  const sequence = Number(display.rows[0]?.sequence ?? 0) || null;

  const description = `[engine_fault_auto] ${faultDescription(input.spn_code, input.fmi_code)}`;
  const woTitle = `Engine diagnostic: ${faultCode}`;
  const woPriority = input.severity === "critical" ? "immediate" : "urgent";

  const woRes = await client.query<{ id: string }>(
    `
      INSERT INTO maintenance.work_orders (
        operating_company_id, wo_type, source_type, status, unit_id, driver_id, opened_at,
        repair_location, description, wo_title, wo_priority, display_id, unit_sequence,
        origin, fault_code, bucket
      )
      VALUES (
        $1::uuid, 'engine_diagnostic', 'IS', 'open', $2::uuid, $3::uuid, $4::timestamptz,
        'in_house', $5, $6, $7, $8, $9,
        'fault_auto', $10, 'in_house'
      )
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.unit_id,
      driverId,
      input.occurred_at,
      description,
      woTitle,
      woPriority,
      displayId,
      sequence,
      faultCode,
    ]
  );

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
