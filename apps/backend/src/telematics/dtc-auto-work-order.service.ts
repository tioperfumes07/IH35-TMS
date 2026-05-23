import { getDriverForVehicleAtTime } from "./vehicle-driver-lookup.service.js";
import { classifyDtcCode } from "./dtc-classifier.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DtcEventInput = {
  operating_company_id: string;
  unit_id: string;
  occurred_at: string;
  dtc_code: string;
  description?: string | null;
};

export async function processDtcAutoWorkOrderEvent(client: DbClient, input: DtcEventInput): Promise<boolean> {
  const severity = classifyDtcCode(input.dtc_code);
  if (severity === "minor" || severity === "info") return false;

  const dedupe = await client.query<{ id: string }>(
    `
      SELECT w.id::text
      FROM maintenance.work_orders w
      WHERE w.operating_company_id = $1::uuid
        AND w.unit_id = $2::uuid
        AND w.status::text IN ('open', 'in_progress', 'waiting_parts')
        AND w.description ILIKE $3
        AND w.created_at >= ($4::timestamptz - interval '7 days')
      LIMIT 1
    `,
    [input.operating_company_id, input.unit_id, `%[samsara_dtc_auto] ${input.dtc_code.toUpperCase()}%`, input.occurred_at]
  );
  if (dedupe.rows[0]) return false;

  const driverId = await getDriverForVehicleAtTime(client as never, input.operating_company_id, input.unit_id, input.occurred_at);

  const display = await client.query<{ display_id: string; sequence: number }>(
    `
      SELECT display_id, sequence
      FROM maintenance.next_wo_display_id($1::uuid, $2, COALESCE($3::date, CURRENT_DATE), $4::uuid)
    `,
    [input.unit_id, "IS", input.occurred_at, input.operating_company_id]
  );
  const displayId = display.rows[0]?.display_id ?? null;
  const sequence = Number(display.rows[0]?.sequence ?? 0) || null;

  await client.query(
    `
      INSERT INTO maintenance.work_orders (
        operating_company_id, wo_type, source_type, status, unit_id, driver_id, load_id, opened_at,
        repair_location, vendor_id, external_vendor_invoice_number, description,
        external_vendor_id, external_vendor_wo_number,
        display_id, unit_sequence, estimated_cost_cents, total_actual_cost, bucket
      )
      VALUES (
        $1::uuid,'repair','IS','open',$2::uuid,$3::uuid,NULL,$4::timestamptz,
        'in_house',NULL,NULL,$5,
        NULL,NULL,
        $6,$7,NULL,NULL,'in_house'
      )
    `,
    [
      input.operating_company_id,
      input.unit_id,
      driverId,
      input.occurred_at,
      `[samsara_dtc_auto] ${input.dtc_code.toUpperCase()}: ${input.description ?? "Engine diagnostic fault detected"}`,
      displayId,
      sequence,
    ]
  );

  return true;
}
