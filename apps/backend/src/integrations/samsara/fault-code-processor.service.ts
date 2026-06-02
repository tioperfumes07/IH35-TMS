import { emitPredictiveAutoWoNotifications } from "../../notifications/notification.service.js";
import type { SamsaraWebhookEvent } from "./webhook-projection.types.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ParsedFaultCode = {
  code: string;
  description: string | null;
  source: "samsara" | "j1939_dtc" | "custom";
};

type SeverityRule = {
  id: string;
  severity: string;
  auto_create_wo: boolean;
  description: string | null;
  suggested_priority: string | null;
  estimated_repair_hours: number | null;
  suggested_shop_id: string | null;
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

export function extractFaultCodesFromPayload(payload: Record<string, unknown>): ParsedFaultCode[] {
  const record = extractVehicleRecord(payload);
  const candidates = [
    record.faultCodes,
    record.fault_codes,
    record.dtc_codes,
    record.diagnostics,
    record.faults,
    payload.faultCodes,
    payload.fault_codes,
    payload.dtc_codes,
    payload.faults,
  ];
  const out: ParsedFaultCode[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const codeRaw = obj.code ?? obj.dtc_code ?? obj.fault_code ?? obj.id ?? obj.spn;
      const code = typeof codeRaw === "string" || typeof codeRaw === "number" ? String(codeRaw).trim() : "";
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const descriptionRaw = obj.description ?? obj.message ?? obj.name;
      const sourceRaw = String(obj.source ?? obj.type ?? "samsara").toLowerCase();
      const source: ParsedFaultCode["source"] =
        sourceRaw.includes("j1939") || sourceRaw.includes("dtc") ? "j1939_dtc" : sourceRaw === "custom" ? "custom" : "samsara";
      out.push({
        code,
        description: typeof descriptionRaw === "string" ? descriptionRaw : null,
        source,
      });
    }
  }
  return out;
}

function extractOccurredAt(payload: Record<string, unknown>): string {
  const record = extractVehicleRecord(payload);
  const raw = String(record.timestamp ?? record.time ?? record.occurred_at ?? payload.timestamp ?? new Date().toISOString());
  return new Date(raw).toISOString();
}

async function lookupRule(
  client: DbClient,
  operatingCompanyId: string,
  faultCode: string,
  source: string
): Promise<SeverityRule | null> {
  const res = await client.query<SeverityRule>(
    `
      SELECT
        id::text,
        severity,
        auto_create_wo,
        description,
        suggested_priority,
        estimated_repair_hours,
        suggested_shop_id::text
      FROM maintenance.fault_code_severity_rules
      WHERE operating_company_id = $1::uuid
        AND fault_code = $2
        AND source = $3
        AND active = true
      LIMIT 1
    `,
    [operatingCompanyId, faultCode, source]
  );
  return res.rows[0] ?? null;
}

async function hasRecentUnresolvedFault(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string,
  faultCode: string
): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM maintenance.samsara_fault_code_history
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND fault_code = $3
        AND resolved_at IS NULL
        AND occurred_at >= (now() - interval '24 hours')
      LIMIT 1
    `,
    [operatingCompanyId, unitId, faultCode]
  );
  return Boolean(res.rows[0]);
}

async function insertFaultHistory(
  client: DbClient,
  input: {
    operating_company_id: string;
    unit_id: string;
    fault_code: string;
    source: string;
    severity: string | null;
    raw_event_id: string | null;
    occurred_at: string;
    raw_payload: Record<string, unknown>;
  }
): Promise<{ id: string; inserted: boolean }> {
  if (input.raw_event_id) {
    const existing = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM maintenance.samsara_fault_code_history
        WHERE raw_event_id = $1::uuid
          AND fault_code = $2
        LIMIT 1
      `,
      [input.raw_event_id, input.fault_code]
    );
    if (existing.rows[0]) {
      return { id: existing.rows[0].id, inserted: false };
    }
  }

  const res = await client.query<{ id: string }>(
    `
      INSERT INTO maintenance.samsara_fault_code_history (
        operating_company_id, unit_id, fault_code, source, severity,
        raw_event_id, occurred_at, raw_payload
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::timestamptz, $8::jsonb)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.unit_id,
      input.fault_code,
      input.source,
      input.severity,
      input.raw_event_id,
      input.occurred_at,
      JSON.stringify(input.raw_payload),
    ]
  );
  return { id: res.rows[0]?.id ?? "", inserted: Boolean(res.rows[0]) };
}

async function createDraftWorkOrder(
  client: DbClient,
  input: {
    operating_company_id: string;
    unit_id: string;
    fault_code: string;
    description: string;
    severity: string;
    suggested_priority: string | null;
    estimated_repair_hours: number | null;
    occurred_at: string;
    origin_fault_history_id: string;
    vendor_id: string | null;
  }
): Promise<string | null> {
  const display = await client.query<{ display_id: string; sequence: number }>(
    `
      SELECT display_id, sequence
      FROM maintenance.next_wo_display_id($1::uuid, $2, COALESCE($3::date, CURRENT_DATE), $4::uuid)
    `,
    [input.unit_id, "IS", input.occurred_at, input.operating_company_id]
  );
  const displayId = display.rows[0]?.display_id ?? null;
  const sequence = Number(display.rows[0]?.sequence ?? 0) || null;
  const title = `AUTO: Fault Code ${input.fault_code} — ${input.description}`;
  const body = `Triggered by Samsara fault event at ${input.occurred_at}. Severity: ${input.severity}. Suggested priority: ${input.suggested_priority ?? "routine"}. ETA: ${input.estimated_repair_hours ?? "—"}h`;

  const woRes = await client.query<{ id: string }>(
    `
      INSERT INTO maintenance.work_orders (
        operating_company_id, wo_type, source_type, status, unit_id, opened_at,
        repair_location, vendor_id, description, wo_title, wo_priority, labor_hours,
        display_id, unit_sequence, origin, origin_fault_history_id, bucket
      )
      VALUES (
        $1::uuid, 'repair', 'IS', 'draft', $2::uuid, $3::timestamptz,
        'in_house', $4::uuid, $5, $6, $7, $8,
        $9, $10, 'fault_auto', $11::uuid, 'in_house'
      )
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.unit_id,
      input.occurred_at,
      input.vendor_id,
      body,
      title,
      input.suggested_priority,
      input.estimated_repair_hours,
      displayId,
      sequence,
      input.origin_fault_history_id,
    ]
  );
  return woRes.rows[0]?.id ?? null;
}

export type FaultProcessorResult = {
  faults_processed: number;
  histories_inserted: number;
  draft_wos_created: number;
};

export async function processVehicleFaultCodeWebhookEvent(
  client: DbClient,
  event: SamsaraWebhookEvent,
  localUnitId: string
): Promise<FaultProcessorResult> {
  const tableExists = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('maintenance.samsara_fault_code_history') IS NOT NULL AS ok`
  );
  if (!tableExists.rows[0]?.ok) {
    return { faults_processed: 0, histories_inserted: 0, draft_wos_created: 0 };
  }

  const faults = extractFaultCodesFromPayload(event.payload);
  const occurredAt = extractOccurredAt(event.payload);
  let historiesInserted = 0;
  let draftWosCreated = 0;

  const unitLabelRes = await client.query<{ unit_number: string | null }>(
    `SELECT unit_number FROM mdata.units WHERE id = $1::uuid LIMIT 1`,
    [localUnitId]
  );
  const unitLabel = unitLabelRes.rows[0]?.unit_number ? `Truck #${unitLabelRes.rows[0].unit_number}` : "Unit";

  for (const fault of faults) {
    const rule = await lookupRule(client, event.operating_company_id, fault.code, fault.source);
    const severity = rule?.severity ?? "medium";
    const history = await insertFaultHistory(client, {
      operating_company_id: event.operating_company_id,
      unit_id: localUnitId,
      fault_code: fault.code,
      source: fault.source,
      severity,
      raw_event_id: event.id,
      occurred_at: occurredAt,
      raw_payload: asObject(event.payload) ?? {},
    });
    if (history.inserted) historiesInserted += 1;
    if (!history.id) continue;

    const shouldAutoWo =
      rule?.auto_create_wo === true && (severity === "high" || severity === "critical");
    if (!shouldAutoWo) continue;

    const recentDup = await hasRecentUnresolvedFault(client, event.operating_company_id, localUnitId, fault.code);
    if (recentDup) continue;

    const woId = await createDraftWorkOrder(client, {
      operating_company_id: event.operating_company_id,
      unit_id: localUnitId,
      fault_code: fault.code,
      description: rule?.description ?? fault.description ?? fault.code,
      severity,
      suggested_priority: rule?.suggested_priority ?? null,
      estimated_repair_hours: rule?.estimated_repair_hours ?? null,
      occurred_at: occurredAt,
      origin_fault_history_id: history.id,
      vendor_id: rule?.suggested_shop_id ?? null,
    });
    if (!woId) continue;
    draftWosCreated += 1;

    await client.query(
      `
        UPDATE maintenance.samsara_fault_code_history
        SET auto_wo_id = $1::uuid, auto_wo_created_at = now()
        WHERE id = $2::uuid
      `,
      [woId, history.id]
    );

    await emitPredictiveAutoWoNotifications(client, {
      operating_company_id: event.operating_company_id,
      unit_label: unitLabel,
      fault_description: rule?.description ?? fault.description ?? fault.code,
      severity,
      work_order_id: woId,
    });
  }

  return {
    faults_processed: faults.length,
    histories_inserted: historiesInserted,
    draft_wos_created: draftWosCreated,
  };
}
