export type AnomalyFinding = {
  subject_kind: string | null;
  subject_uuid: string | null;
  evidence: Record<string, unknown>;
};

export type DetectorFn = (
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  operatingCompanyId: string,
  config: Record<string, unknown>
) => Promise<AnomalyFinding[]>;

async function detectDuplicateLoadNumber(client: Parameters<DetectorFn>[0], oci: string, _config: Record<string, unknown>) {
  const res = await client.query<{ load_number: string; cnt: string; load_ids: string[] }>(
    `SELECT load_number, COUNT(*)::text AS cnt, array_agg(id::text) AS load_ids
     FROM dispatch.loads
     WHERE operating_company_id = $1::uuid AND load_number IS NOT NULL AND load_number <> ''
     GROUP BY load_number HAVING COUNT(*) > 1 LIMIT 50`,
    [oci]
  );
  return res.rows.map((row) => ({
    subject_kind: 'load',
    subject_uuid: row.load_ids?.[0] ?? null,
    evidence: { load_number: row.load_number, duplicate_count: Number(row.cnt), load_ids: row.load_ids },
  }));
}

// BLOCK-1 — fuel-off-route detection is a SAFE NO-OP (returns no findings) until a real data source
// exists. The original query threw Postgres 42P01 on EVERY run: it selected FROM a phantom relation
// (the real table is fuel.fuel_transactions, with a different name) AND read a non-existent
// metadata->>'route_deviation_miles' (fuel.fuel_transactions has NO jsonb/metadata column and no
// precomputed deviation; it does carry location_lat/lng). So this detector never produced findings —
// it only spammed errors. Returning [] stops that. Building real off-route detection (compare each fuel
// stop's location_lat/lng against the load's planned route) is a separate follow-up; flagged for Jorge.
async function detectFuelOffRoute(
  _client: Parameters<DetectorFn>[0],
  _operatingCompanyId: string,
  _config: Record<string, unknown>
): Promise<AnomalyFinding[]> {
  return [];
}

async function detectDvirMajorOpen(client: Parameters<DetectorFn>[0], oci: string, _config: Record<string, unknown>) {
  const res = await client.query<{ unit_id: string; dvir_id: string }>(
    `SELECT DISTINCT d.unit_id::text AS unit_id, d.id::text AS dvir_id
     FROM safety.dvir_reports d
     JOIN safety.dvir_defect_severity_tags t ON t.dvir_defect_id = ANY(
       SELECT dd.id FROM safety.dvir_defects dd WHERE dd.dvir_report_id = d.id
     )
     WHERE d.operating_company_id = $1::uuid AND d.resolved_at IS NULL AND t.severity = 'major'
     LIMIT 50`,
    [oci]
  );
  return res.rows.map((row) => ({
    subject_kind: 'unit',
    subject_uuid: row.unit_id,
    evidence: { dvir_id: row.dvir_id, wf: 'WF-050' },
  }));
}

async function detectInactiveDriverAssignment(client: Parameters<DetectorFn>[0], oci: string, _config: Record<string, unknown>) {
  const res = await client.query<{ driver_id: string; status: string }>(
    `SELECT d.id::text AS driver_id, d.status::text AS status
     FROM mdata.drivers d
     JOIN dispatch.loads l ON l.assigned_primary_driver_id = d.id
     WHERE d.operating_company_id = $1::uuid
       AND (d.status <> 'Active' OR d.deactivated_at IS NOT NULL OR COALESCE(d.is_dispatch_blocked, false))
       AND l.status IN ('assigned','dispatched','in_transit')
     LIMIT 50`,
    [oci]
  );
  return res.rows.map((row) => ({
    subject_kind: 'driver',
    subject_uuid: row.driver_id,
    evidence: { status: row.status, wf: 'WF-038' },
  }));
}

async function detectGeofenceDuplicateFire(client: Parameters<DetectorFn>[0], oci: string, _config: Record<string, unknown>) {
  const res = await client.query<{ geofence_id: string; unit_id: string; fire_count: string }>(
    `SELECT geofence_id, unit_id, COUNT(*)::text AS fire_count
     FROM safety.integrity_findings
     WHERE operating_company_id = $1 AND anomaly_class = 'duplicate_fire'
       AND report_date >= CURRENT_DATE - 1 AND resolved = false
     GROUP BY geofence_id, unit_id LIMIT 50`,
    [oci]
  );
  return res.rows.map((row) => ({
    subject_kind: 'geofence',
    subject_uuid: null,
    evidence: { geofence_id: row.geofence_id, unit_id: row.unit_id, fire_count: Number(row.fire_count) },
  }));
}

async function detectPmDueAdvisory(client: Parameters<DetectorFn>[0], oci: string, config: Record<string, unknown>) {
  const days = Number(config.days_ahead ?? 14);
  const res = await client.query<{ unit_id: string; wo_id: string; due_at: string }>(
    `SELECT wo.unit_id::text AS unit_id, wo.id::text AS wo_id, wo.scheduled_start_at::text AS due_at
     FROM maintenance.work_orders wo
     WHERE wo.operating_company_id = $1::uuid AND wo.status IN ('open','in_progress')
       AND wo.category = 'pm' AND wo.scheduled_start_at <= now() + ($2 || ' days')::interval
     LIMIT 50`,
    [oci, days]
  );
  return res.rows.map((row) => ({
    subject_kind: 'unit',
    subject_uuid: row.unit_id,
    evidence: { wo_id: row.wo_id, due_at: row.due_at, wf: 'WF-044', days_ahead: days },
  }));
}

export const DETECTOR_REGISTRY: Record<string, DetectorFn> = {
  duplicate_load_number: detectDuplicateLoadNumber,
  fuel_off_route_geo: detectFuelOffRoute,
  dvir_major_open_unit: detectDvirMajorOpen,
  inactive_driver_assignment: detectInactiveDriverAssignment,
  geofence_duplicate_fire: detectGeofenceDuplicateFire,
  pm_due_advisory: detectPmDueAdvisory,
};

export function getDetector(name: string): DetectorFn | undefined {
  return DETECTOR_REGISTRY[name];
}
