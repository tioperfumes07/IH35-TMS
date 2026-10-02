import { getDriverForVehicleAtTime } from "./vehicle-driver-lookup.service.js";
import { classifyDtcCode } from "./dtc-classifier.service.js";
import { createWorkOrderWithLines } from "../maintenance/two-section-service.js";

const SYSTEM_ACTOR_USER_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";

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

  // ROUND 326 audit M1: one work-order creator (display id, status history, audit) — createWorkOrderWithLines.
  await createWorkOrderWithLines(
    client as never,
    SYSTEM_ACTOR_USER_ID,
    {
      operating_company_id: input.operating_company_id,
      wo_type: "repair",
      source_type: "IS",
      unit_id: input.unit_id,
      driver_id: driverId,
      service_date: input.occurred_at,
      repair_location: "in_house",
      bucket: "in_house",
      description: `[samsara_dtc_auto] ${input.dtc_code.toUpperCase()}: ${input.description ?? "Engine diagnostic fault detected"}`,
      payment_timing: "in_house",
      origin: "samsara_dtc_auto",
    },
    [],
    []
  );

  return true;
}
