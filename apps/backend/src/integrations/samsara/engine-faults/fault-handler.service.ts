import { autoCreateWorkOrderFromEngineFault } from "../../../maintenance/work-orders/auto-create-from-fault.js";
import { notifyEngineFaultWorkOrder } from "../../../notifications/fault-notifications.js";
import {
  faultDescription,
  resolveFaultSeverity,
  shouldAutoCreateWorkOrder,
  type FaultSeverity,
} from "./severe-fault-catalog.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ParsedEngineFaultEvent = {
  samsara_event_id: string;
  vehicle_id: string;
  spn_code: number;
  fmi_code: number | null;
  severity: FaultSeverity;
  occurred_at: string;
  raw_payload: Record<string, unknown>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function extractVehicleRecord(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.data && typeof payload.data === "object" && payload.data !== null) {
    return payload.data as Record<string, unknown>;
  }
  if (payload.vehicle && typeof payload.vehicle === "object" && payload.vehicle !== null) {
    return payload.vehicle as Record<string, unknown>;
  }
  return payload;
}

function parseIntField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseEngineFaultWebhookPayload(payload: Record<string, unknown>): ParsedEngineFaultEvent | null {
  const record = extractVehicleRecord(payload);
  const spn =
    parseIntField(record.spn) ??
    parseIntField(record.spnCode) ??
    parseIntField(record.spn_code) ??
    parseIntField(payload.spn) ??
    parseIntField(payload.spnCode);
  if (spn === null) return null;

  const fmi =
    parseIntField(record.fmi) ??
    parseIntField(record.fmiCode) ??
    parseIntField(record.fmi_code) ??
    parseIntField(payload.fmi) ??
    parseIntField(payload.fmiCode);

  const vehicleRaw =
    record.vehicleId ??
    record.vehicle_id ??
    record.id ??
    payload.vehicleId ??
    payload.vehicle_id;
  const vehicle_id =
    typeof vehicleRaw === "string" || typeof vehicleRaw === "number" ? String(vehicleRaw).trim() : "";
  if (!vehicle_id) return null;

  const eventIdRaw =
    payload.id ??
    payload.eventId ??
    record.id ??
    record.eventId ??
    `${vehicle_id}:${spn}:${fmi ?? "x"}:${record.timestamp ?? payload.timestamp ?? Date.now()}`;
  const samsara_event_id = String(eventIdRaw).trim();
  if (!samsara_event_id) return null;

  const occurredRaw = record.timestamp ?? record.time ?? record.occurred_at ?? payload.timestamp;
  const occurred_at = new Date(
    typeof occurredRaw === "string" || typeof occurredRaw === "number" ? occurredRaw : Date.now()
  ).toISOString();

  const severity = resolveFaultSeverity(spn, fmi);

  return {
    samsara_event_id,
    vehicle_id,
    spn_code: spn,
    fmi_code: fmi,
    severity,
    occurred_at,
    raw_payload: payload,
  };
}

async function resolveLocalUnitId(
  client: DbClient,
  operatingCompanyId: string,
  vehicleId: string
): Promise<{ unit_id: string | null; unit_label: string }> {
  const mapped = await client.query<{ unit_id: string | null; unit_number: string | null }>(
    `
      SELECT sv.local_unit_id::text AS unit_id, u.unit_number
      FROM integrations.samsara_vehicles sv
      LEFT JOIN mdata.units u ON u.id = sv.local_unit_id
      WHERE sv.operating_company_id = $1::uuid
        AND sv.samsara_vehicle_id = $2
      LIMIT 1
    `,
    [operatingCompanyId, vehicleId]
  );
  const row = mapped.rows[0];
  if (row?.unit_id) {
    return {
      unit_id: row.unit_id,
      unit_label: row.unit_number ? `Truck #${row.unit_number}` : "Unit",
    };
  }

  const byUnit = await client.query<{ unit_id: string | null; unit_number: string | null }>(
    `
      SELECT id::text AS unit_id, unit_number
      FROM mdata.units
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
    `,
    [operatingCompanyId, vehicleId]
  );
  const unitRow = byUnit.rows[0];
  return {
    unit_id: unitRow?.unit_id ?? null,
    unit_label: unitRow?.unit_number ? `Truck #${unitRow.unit_number}` : "Unit",
  };
}

export type HandleEngineFaultResult = {
  inserted: boolean;
  event_uuid: string | null;
  auto_wo_uuid: string | null;
  severity: FaultSeverity;
  action: "auto_wo" | "logged" | "duplicate";
};

export async function handleEngineFaultEvent(
  client: DbClient,
  operatingCompanyId: string,
  parsed: ParsedEngineFaultEvent
): Promise<HandleEngineFaultResult> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const insertRes = await client.query<{ uuid: string }>(
    `
      INSERT INTO integrations.engine_fault_events (
        operating_company_id, vehicle_id, samsara_event_id, spn_code, fmi_code,
        severity, raw_payload
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (samsara_event_id) DO NOTHING
      RETURNING uuid::text
    `,
    [
      operatingCompanyId,
      parsed.vehicle_id,
      parsed.samsara_event_id,
      parsed.spn_code,
      parsed.fmi_code,
      parsed.severity,
      JSON.stringify(parsed.raw_payload),
    ]
  );

  const eventUuid = insertRes.rows[0]?.uuid ?? null;
  if (!eventUuid) {
    return {
      inserted: false,
      event_uuid: null,
      auto_wo_uuid: null,
      severity: parsed.severity,
      action: "duplicate",
    };
  }

  if (!shouldAutoCreateWorkOrder(parsed.severity, parsed.spn_code)) {
    await client.query(
      `
        UPDATE integrations.engine_fault_events
        SET handled_at = now()
        WHERE uuid = $1::uuid
      `,
      [eventUuid]
    );
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "integrations.engine_fault_logged",
      "info",
      JSON.stringify({
        operating_company_id: operatingCompanyId,
        event_uuid: eventUuid,
        spn_code: parsed.spn_code,
        severity: parsed.severity,
      }),
      "GAP-58-ENGINE-FAULT",
    ]);
    return {
      inserted: true,
      event_uuid: eventUuid,
      auto_wo_uuid: null,
      severity: parsed.severity,
      action: "logged",
    };
  }

  const { unit_id: unitId, unit_label: unitLabel } = await resolveLocalUnitId(
    client,
    operatingCompanyId,
    parsed.vehicle_id
  );
  if (!unitId) {
    await client.query(
      `
        UPDATE integrations.engine_fault_events
        SET handled_at = now()
        WHERE uuid = $1::uuid
      `,
      [eventUuid]
    );
    return {
      inserted: true,
      event_uuid: eventUuid,
      auto_wo_uuid: null,
      severity: parsed.severity,
      action: "logged",
    };
  }

  const woId = await autoCreateWorkOrderFromEngineFault(client, {
    operating_company_id: operatingCompanyId,
    unit_id: unitId,
    spn_code: parsed.spn_code,
    fmi_code: parsed.fmi_code,
    severity: parsed.severity,
    occurred_at: parsed.occurred_at,
  });

  if (woId) {
    const driverRes = await client.query<{ driver_id: string | null }>(
      `SELECT driver_id::text FROM maintenance.work_orders WHERE id = $1::uuid LIMIT 1`,
      [woId]
    );
    await notifyEngineFaultWorkOrder(client, {
      operating_company_id: operatingCompanyId,
      unit_label: unitLabel,
      fault_description: faultDescription(parsed.spn_code, parsed.fmi_code),
      severity: parsed.severity,
      work_order_id: woId,
      driver_id: driverRes.rows[0]?.driver_id ?? null,
    });
  }

  await client.query(
    `
      UPDATE integrations.engine_fault_events
      SET auto_wo_uuid = $2::uuid, handled_at = now()
      WHERE uuid = $1::uuid
    `,
    [eventUuid, woId]
  );

  return {
    inserted: true,
    event_uuid: eventUuid,
    auto_wo_uuid: woId,
    severity: parsed.severity,
    action: woId ? "auto_wo" : "logged",
  };
}
