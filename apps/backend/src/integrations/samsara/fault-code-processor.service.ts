import { emitPredictiveAutoWoNotifications, emitFaultCodeNotifications } from "../../notifications/notification.service.js";
import { driverAtTimeSql } from "../../maintenance/driver-attribution.js";
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
  /** E-10 addition: catalog items the rule proposes (service task, labor code), with their names. */
  service_task_id: string | null;
  service_task_name: string | null;
  labor_code_id: string | null;
  labor_code_name: string | null;
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

  // ROUND 306 E-10/E-11 — the shape Samsara actually sends on /fleet/vehicles/stats?types=faultCodes,
  // measured live 2026-10-01 (95 vehicles, 134 J1939 DTCs): faultCodes is an OBJECT
  //   { j1939: { checkEngineLights, diagnosticTroubleCodes: [{ spnId, fmiId, spnDescription, fmiDescription,
  //     occurrenceCount, milStatus, txId, sourceAddressName }] }, obdii: { diagnosticTroubleCodes: [{ confirmedDtcs,
  //     pendingDtcs, permanentDtcs, ... }] }, canBusType, time }
  // The array-only parser below never matched it, so every live DTC was dropped (0 history rows ever).
  // Code = SAE J1939 "SPN <spn> FMI <fmi>"; OBD-II confirmed/permanent DTC strings are taken as-is
  // (all lists were empty live, so only plain string items are accepted -- never an invented field).
  for (const container of [asObject(record.faultCodes), asObject(payload.faultCodes)]) {
    if (!container) continue;
    const j1939 = asObject(container.j1939);
    for (const item of Array.isArray(j1939?.diagnosticTroubleCodes) ? j1939!.diagnosticTroubleCodes as unknown[] : []) {
      const d = asObject(item);
      if (!d || d.spnId == null || d.fmiId == null) continue;
      const code = `SPN ${String(d.spnId)} FMI ${String(d.fmiId)}`;
      if (seen.has(code)) continue;
      seen.add(code);
      const parts = [d.spnDescription, d.fmiDescription].filter((x): x is string => typeof x === "string" && x.length > 0);
      const src = typeof d.sourceAddressName === "string" && d.sourceAddressName ? ` (${d.sourceAddressName})` : "";
      out.push({ code, description: parts.length ? `${parts.join(" — ")}${src}` : null, source: "j1939_dtc" });
    }
    const obdii = asObject(container.obdii);
    for (const block of Array.isArray(obdii?.diagnosticTroubleCodes) ? obdii!.diagnosticTroubleCodes as unknown[] : []) {
      const b = asObject(block);
      for (const list of [b?.confirmedDtcs, b?.permanentDtcs]) {
        for (const dtc of Array.isArray(list) ? list : []) {
          if (typeof dtc !== "string" || !dtc.trim() || seen.has(dtc.trim())) continue;
          seen.add(dtc.trim());
          out.push({ code: dtc.trim(), description: null, source: "samsara" });
        }
      }
    }
  }

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
  // E-10: the measured stats shape carries the reading time on faultCodes.time.
  const fc = asObject(record.faultCodes) ?? asObject(payload.faultCodes);
  const raw = String(fc?.time ?? record.timestamp ?? record.time ?? record.occurred_at ?? payload.timestamp ?? new Date().toISOString());
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
        suggested_shop_id::text,
        r.service_task_id::text,
        (SELECT st.display_name FROM catalogs.maintenance_service_tasks st WHERE st.id = r.service_task_id) AS service_task_name,
        r.labor_code_id::text,
        (SELECT lc.display_name FROM catalogs.maintenance_labor_codes lc WHERE lc.id = r.labor_code_id) AS labor_code_name
      FROM maintenance.fault_code_severity_rules r
      WHERE operating_company_id = $1::uuid
        -- E-10 addition: an exact code wins; else a whole-SPN rule ('SPN 3251' matches 'SPN 3251 FMI 2')
        AND (fault_code = $2 OR $2 LIKE fault_code || ' FMI %')
        AND source = $3
        AND active = true
      ORDER BY (fault_code = $2) DESC
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
  faultCode: string,
  /** E-10: the history row this event just inserted -- it is not its own "recent duplicate". */
  excludeHistoryId: string
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
        AND id <> $4::uuid
      LIMIT 1
    `,
    [operatingCompanyId, unitId, faultCode, excludeHistoryId]
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
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO maintenance.samsara_fault_code_history (
        operating_company_id, unit_id, fault_code, source, severity,
        raw_event_id, occurred_at, raw_payload
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::timestamptz, $8::jsonb)
      ON CONFLICT (raw_event_id, fault_code) WHERE raw_event_id IS NOT NULL DO NOTHING
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
  if (res.rows[0]) return { id: res.rows[0].id, inserted: true };
  // ROUND 329: the unique index uq_fault_history_event decided (ON CONFLICT above) — this event was recorded already.
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM maintenance.samsara_fault_code_history WHERE raw_event_id = $1::uuid AND fault_code = $2 LIMIT 1`,
    [input.raw_event_id, input.fault_code]
  );
  return { id: existing.rows[0]?.id ?? "", inserted: false };
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
    proposed_service_task?: string | null;
    proposed_labor_code?: string | null;
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
  const proposal = [input.proposed_service_task ? `Proposed service task: ${input.proposed_service_task}.` : "", input.proposed_labor_code ? `Proposed labor code: ${input.proposed_labor_code}.` : ""].filter(Boolean).join(" ");
  const body = `Triggered by Samsara fault event at ${input.occurred_at}. Severity: ${input.severity}. Suggested priority: ${input.suggested_priority ?? "routine"}. ETA: ${input.estimated_repair_hours ?? "—"}h${proposal ? ` ${proposal}` : ""}`;

  const woRes = await client.query<{ id: string }>(
    `
      INSERT INTO maintenance.work_orders (
        operating_company_id, wo_type, source_type, status, unit_id, opened_at,
        repair_location, vendor_id, description, wo_title, wo_priority, labor_hours,
        display_id, unit_sequence, origin, origin_fault_history_id, bucket, fault_code
      )
      VALUES (
        $1::uuid, 'repair', 'IS', 'draft', $2::uuid, $3::timestamptz,
        'in_house', $4::uuid, $5, $6, $7, $8,
        $9, $10, 'fault_auto', $11::uuid, 'in_house', $12
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
      input.fault_code,
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
    `SELECT unit_number FROM mdata.units WHERE id = $1::uuid AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid LIMIT 1`,
    [localUnitId, event.operating_company_id]
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

    // ROUND 301 T-33 -- "WE ALL NEED TO READ SAMSARA FOR ANY ENGINE FAILURES AND FAULTS AND
    // CODES." One alert per NEW fault-code history row, unit + driver-at-the-time + severity,
    // regardless of whether it also crosses the (separate, narrower) auto-create-WO threshold
    // below. Driver-at-time is resolved via driverAtTimeSql (driver-attribution.ts) -- the one
    // shared predicate, never re-inlined -- at READ time, not stored: a driver assignment can
    // change after the fault, and this must always answer "who was driving WHEN this fired."
    if (history.inserted) {
      const driverAtTime = await client.query<{ driver_label: string | null }>(
        `
          SELECT d.first_name || ' ' || d.last_name AS driver_label
          FROM (SELECT 1) _dummy
          ${driverAtTimeSql("$2::uuid", "$3::timestamptz")}
          LEFT JOIN mdata.drivers d ON d.id = driver_at_time.driver_id
        `,
        [event.operating_company_id, localUnitId, occurredAt]
      );
      await emitFaultCodeNotifications(client, {
        operating_company_id: event.operating_company_id,
        unit_label: unitLabel,
        fault_code: fault.code,
        description: rule?.description ?? fault.description ?? null,
        severity,
        fault_history_id: history.id,
        driver_label: driverAtTime.rows[0]?.driver_label ?? null,
      });
    }

    const shouldAutoWo =
      rule?.auto_create_wo === true && (severity === "high" || severity === "critical");
    if (!shouldAutoWo) continue;

    // E-10 root fix: this ran AFTER the history insert and matched the row just inserted, so no rule could ever
    // open a work order. The new row is excluded; an older unresolved one within 24 h still de-duplicates.
    const recentDup = await hasRecentUnresolvedFault(client, event.operating_company_id, localUnitId, fault.code, history.id);
    if (recentDup) continue;

    // ROUND 329: claim the history row's auto work order in ONE statement before creating it. A re-run (the fault
    // event id is fixed per vehicle per day) used to find its own history row, skip it as "not a duplicate", open a
    // second draft work order, overwrite auto_wo_id and notify again. Same transaction: a failed create releases it.
    const claim = await client.query<{ id: string }>(
      `UPDATE maintenance.samsara_fault_code_history SET auto_wo_created_at = now()
        WHERE id = $1::uuid AND auto_wo_id IS NULL AND auto_wo_created_at IS NULL RETURNING id::text`,
      [history.id]
    );
    if (!claim.rows[0]) continue;

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
      proposed_service_task: rule?.service_task_name ?? null,
      proposed_labor_code: rule?.labor_code_name ?? null,
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
