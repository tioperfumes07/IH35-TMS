// Reefer engine hours — the domain logic (log entries, specs, Samsara ingest, PM-due evaluation). Plain service: the cron
// imports it from here, never from reefer-hours.routes.ts (a cron importing a route module drags the HTTP auth middleware
// and Lucia session provider into the job — CC-2 2026-10-04). The route file keeps only request handling.
import { appendCrudAudit } from "../audit/crud-audit.js";
import { parseSamsaraVehiclePayload } from "../mdata/unit-aggregate.service.js";

export type ReeferHoursPmEvaluation = "due" | "near_due" | "current";

export type DbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export class ReeferEquipmentScopeError extends Error {
  statusCode = 400;
  code = "linked_entity_not_in_operating_company";
  constructor() {
    super("linked_entity_not_in_operating_company");
  }
}

export function reeferHoursSourceLabel(source: string) {
  switch (source) {
    case "samsara":
      return "Samsara";
    case "manual":
      return "Manual";
    default:
      return source;
  }
}

export function extractReeferEngineHours(rawPayload: unknown): number | null {
  const parsed = parseSamsaraVehiclePayload(rawPayload);
  return parsed.engine_hours;
}

export function evaluateReeferHoursPmDue(
  currentHours: number | null,
  lastServiceHours: number | null,
  intervalHours: number,
  lookaheadHours = 50
): ReeferHoursPmEvaluation {
  if (currentHours == null || lastServiceHours == null || intervalHours <= 0) return "current";
  const nextDue = lastServiceHours + intervalHours;
  if (currentHours >= nextDue) return "due";
  if (currentHours >= nextDue - lookaheadHours) return "near_due";
  return "current";
}

export function hoursUntilReeferService(
  currentHours: number | null,
  lastServiceHours: number | null,
  intervalHours: number
): number | null {
  if (currentHours == null || lastServiceHours == null || intervalHours <= 0) return null;
  const remaining = lastServiceHours + intervalHours - currentHours;
  return Math.max(0, Math.round(remaining * 10) / 10);
}

export function mapReeferHoursLogRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    equipment_id: row.equipment_id,
    hours_reading: Number(row.hours_reading ?? 0),
    source: row.source,
    source_label: reeferHoursSourceLabel(String(row.source ?? "")),
    recorded_at: row.recorded_at,
    notes: row.notes ?? "",
    samsara_event_id: row.samsara_event_id ?? null,
    archived_at: row.archived_at ?? null,
    created_at: row.created_at,
  };
}

export function mapReeferSpecsRow(row: Record<string, unknown>, currentHours: number | null = null) {
  const interval = Number(row.service_interval_hours ?? 2000);
  const lastService = row.last_service_hours == null ? null : Number(row.last_service_hours);
  const pmStatus = evaluateReeferHoursPmDue(currentHours, lastService, interval);
  const hoursUntil = hoursUntilReeferService(currentHours, lastService, interval);
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    equipment_id: row.equipment_id,
    equipment_number: row.equipment_number ?? null,
    reefer_brand: row.reefer_brand ?? "",
    service_interval_hours: interval,
    last_service_hours: lastService,
    last_service_date: row.last_service_date ?? null,
    notes: row.notes ?? "",
    current_hours: currentHours,
    hours_until_service: hoursUntil,
    pm_status: pmStatus,
    archived_at: row.archived_at ?? null,
    updated_at: row.updated_at,
  };
}


export const LOG_SELECT = `
  SELECT
    l.id::text,
    l.operating_company_id::text,
    l.equipment_id::text,
    l.hours_reading,
    l.source,
    l.recorded_at::text,
    l.notes,
    l.samsara_event_id,
    l.archived_at::text,
    l.created_at::text
  FROM maintenance.reefer_hours_log l
`;

export const SPECS_SELECT = `
  SELECT
    rs.id::text,
    rs.operating_company_id::text,
    rs.equipment_id::text,
    e.equipment_number,
    rs.reefer_brand,
    rs.service_interval_hours,
    rs.last_service_hours,
    rs.last_service_date::text,
    rs.notes,
    rs.archived_at::text,
    rs.updated_at::text
  FROM maintenance.reefer_specs rs
  -- CLS-JOIN-ENTITY-UNSCOPED: scoping the DRIVING row does not scope the joined row.
  -- §4 landmine: mdata.units/mdata.equipment have NO operating_company_id — the scope column is
  -- COALESCE(currently_leased_to_company_id, owner_company_id).
  JOIN mdata.equipment e ON e.id = rs.equipment_id
                        AND COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = rs.operating_company_id
`;

export async function fetchLatestHours(client: DbClient, companyId: string, equipmentId: string): Promise<number | null> {
  const res = await client.query(
    `${LOG_SELECT}
     WHERE l.equipment_id = $1 AND l.operating_company_id = $2::uuid AND l.archived_at IS NULL
     ORDER BY l.recorded_at DESC, l.created_at DESC
     LIMIT 1`,
    [equipmentId, companyId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return Number(row.hours_reading);
}

export async function ensureReeferSpecs(
  client: DbClient,
  companyId: string,
  equipmentId: string
): Promise<Record<string, unknown>> {
  const existing = await client.query(
    `${SPECS_SELECT} WHERE rs.equipment_id = $1 AND rs.operating_company_id = $2::uuid AND rs.archived_at IS NULL LIMIT 1`,
    [equipmentId, companyId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const eqRes = await client.query(
    `SELECT reefer_brand, reefer_service_interval_hours, reefer_last_service_hours, reefer_last_service_date::text
     FROM mdata.equipment WHERE id = $1 AND (
       owner_company_id = $2 OR currently_leased_to_company_id = $2
     ) AND deactivated_at IS NULL LIMIT 1`,
    [equipmentId, companyId]
  );
  const eq = eqRes.rows[0];
  if (!eq) throw new ReeferEquipmentScopeError();
  const insert = await client.query(
    `INSERT INTO maintenance.reefer_specs (
      operating_company_id, equipment_id, reefer_brand, service_interval_hours,
      last_service_hours, last_service_date
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id::text`,
    [
      companyId,
      equipmentId,
      String(eq.reefer_brand ?? ""),
      Number(eq.reefer_service_interval_hours ?? 2000) || 2000,
      eq.reefer_last_service_hours ?? null,
      eq.reefer_last_service_date ?? null,
    ]
  );
  const specsId = insert.rows[0]?.id == null ? null : String(insert.rows[0].id);
  if (!specsId) throw new Error("reefer_specs_insert_returned_no_row");
  const fetched = await client.query(`${SPECS_SELECT} WHERE rs.id = $1 AND rs.operating_company_id = $2::uuid`, [
    specsId,
    companyId,
  ]);
  const createdSpecs = fetched.rows[0];
  if (!createdSpecs) throw new Error("reefer_specs_reload_returned_no_row");
  return createdSpecs;
}

export async function appendReeferHoursLogEntry(
  client: DbClient,
  input: {
    operating_company_id: string;
    equipment_id: string;
    hours_reading: number;
    source: "samsara" | "manual";
    recorded_at?: string;
    notes?: string;
    samsara_event_id?: string | null;
    created_by_user_id?: string | null;
  }
): Promise<Record<string, unknown> | null> {
  const latest = await fetchLatestHours(client, input.operating_company_id, input.equipment_id);
  if (latest != null && Math.abs(latest - input.hours_reading) < 0.01 && input.source === "samsara") {
    return null;
  }

  const res = await client.query(
    `INSERT INTO maintenance.reefer_hours_log (
      operating_company_id, equipment_id, hours_reading, source, recorded_at, notes,
      samsara_event_id, created_by_user_id
    ) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, $7, $8)
    RETURNING id::text`,
    [
      input.operating_company_id,
      input.equipment_id,
      input.hours_reading,
      input.source,
      input.recorded_at ?? null,
      input.notes ?? "",
      input.samsara_event_id ?? null,
      input.created_by_user_id ?? null,
    ]
  );
  const id = res.rows[0]?.id == null ? null : String(res.rows[0].id);
  if (!id) throw new Error("reefer_hours_log_insert_returned_no_row");
  const fetched = await client.query(`${LOG_SELECT} WHERE l.id = $1 AND l.operating_company_id = $2::uuid`, [
    id,
    input.operating_company_id,
  ]);
  const createdLog = fetched.rows[0];
  if (!createdLog) throw new Error("reefer_hours_log_reload_returned_no_row");
  return createdLog;
}

export async function ingestReeferHoursFromSamsaraForCompany(
  client: DbClient,
  operatingCompanyId: string
): Promise<{ ingested: number; skipped: number }> {
  const res = await client.query(
    `
      SELECT DISTINCT ON (e.id)
        e.id::text AS equipment_id,
        sv.raw_payload,
        sv.samsara_vehicle_id
      FROM mdata.equipment e
      JOIN mdata.units u ON u.id = e.current_unit_id
                         AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
      JOIN integrations.samsara_vehicles sv
        ON sv.local_unit_id = u.id
       AND sv.operating_company_id = $1::uuid
      WHERE e.equipment_type = 'Reefer'
        AND (e.owner_company_id = $1::uuid OR e.currently_leased_to_company_id = $1::uuid)
        AND e.deactivated_at IS NULL
      ORDER BY e.id, sv.last_seen_at DESC NULLS LAST
    `,
    [operatingCompanyId]
  );

  let ingested = 0;
  let skipped = 0;
  for (const row of res.rows) {
    const hours = extractReeferEngineHours(row.raw_payload);
    if (hours == null) {
      skipped += 1;
      continue;
    }
    await ensureReeferSpecs(client, operatingCompanyId, String(row.equipment_id));
    const inserted = await appendReeferHoursLogEntry(client, {
      operating_company_id: operatingCompanyId,
      equipment_id: String(row.equipment_id),
      hours_reading: hours,
      source: "samsara",
      samsara_event_id: row.samsara_vehicle_id ? String(row.samsara_vehicle_id) : null,
      notes: "Samsara ingest",
    });
    if (inserted) ingested += 1;
    else skipped += 1;
  }
  return { ingested, skipped };
}

export async function evaluateReeferHoursPmSchedulesForCompany(
  client: DbClient,
  operatingCompanyId: string
): Promise<Array<Record<string, unknown>>> {
  const res = await client.query(
    `
      SELECT
        ps.id::text AS pm_schedule_id,
        ps.label,
        ps.interval_value,
        ps.unit_id::text,
        u.unit_number,
        e.id::text AS equipment_id,
        e.equipment_number
      FROM maintenance.pm_schedules ps
      JOIN mdata.units u ON u.id = ps.unit_id
                        AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ps.operating_company_id
      LEFT JOIN mdata.equipment e ON e.current_unit_id = u.id AND e.equipment_type = 'Reefer'
                                  AND COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = $1::uuid
      WHERE ps.operating_company_id = $1::uuid
        AND ps.is_active = true
        AND ps.interval_kind = 'hours'
    `,
    [operatingCompanyId]
  );

  const dueRows: Array<Record<string, unknown>> = [];
  for (const row of res.rows) {
    const equipmentId = row.equipment_id ? String(row.equipment_id) : null;
    if (!equipmentId) continue;
    const specs = await ensureReeferSpecs(client, operatingCompanyId, equipmentId);
    const currentHours = await fetchLatestHours(client, operatingCompanyId, equipmentId);
    const mapped = mapReeferSpecsRow(specs, currentHours);
    if (mapped.pm_status === "due" || mapped.pm_status === "near_due") {
      dueRows.push({
        pm_schedule_id: row.pm_schedule_id,
        label: row.label,
        interval_hours: row.interval_value,
        unit_id: row.unit_id,
        unit_number: row.unit_number,
        equipment_id: equipmentId,
        equipment_number: row.equipment_number,
        current_hours: mapped.current_hours,
        hours_until_service: mapped.hours_until_service,
        pm_status: mapped.pm_status,
      });
    }
  }
  return dueRows;
}
