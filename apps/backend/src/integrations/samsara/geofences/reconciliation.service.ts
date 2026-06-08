/**
 * GAP-27 — Daily geofence reconciliation service.
 * Detects 4 anomaly classes in geo.geofence_events for a given date.
 */
import type { PoolClient } from "pg";
import { withLuciaBypass } from "../../../auth/db.js";

export type AnomalyClass = "orphan_entry" | "orphan_exit" | "duplicate_fire" | "expected_missing";

export interface ReconciliationFinding {
  anomaly_class: AnomalyClass;
  geofence_id: string | null;
  unit_id: string | null;
  load_uuid: string | null;
  occurred_at: string | null;
  details: Record<string, unknown>;
}

export interface ReconciliationResult {
  report_date: string;
  operating_company_id: string;
  total_events: number;
  anomalies_found: number;
  findings: ReconciliationFinding[];
}

async function tableExists(client: PoolClient, schema: string, table: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function runDailyReconciliation(
  client: PoolClient,
  operatingCompanyId: string,
  reportDate: string
): Promise<ReconciliationResult> {
  const hasGeoEvents = await tableExists(client, "geo", "geofence_events");
  if (!hasGeoEvents) {
    return { report_date: reportDate, operating_company_id: operatingCompanyId, total_events: 0, anomalies_found: 0, findings: [] };
  }

  const findings: ReconciliationFinding[] = [];

  const totalRes = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM geo.geofence_events
     WHERE operating_company_id = $1::uuid
       AND occurred_at::date = $2::date`,
    [operatingCompanyId, reportDate]
  );
  const total_events = parseInt(totalRes.rows[0]?.count ?? "0", 10);

  // Anomaly 1: orphan_entry — entry with no exit within 8h, event older than 2h
  const orphanEntries = await client.query(
    `SELECT ge.geofence_id::text, ge.unit_id::text, ge.occurred_at
     FROM geo.geofence_events ge
     WHERE ge.operating_company_id = $1::uuid
       AND ge.event_kind = 'entered'
       AND ge.occurred_at::date = $2::date
       AND NOT EXISTS (
         SELECT 1 FROM geo.geofence_events ge2
         WHERE ge2.operating_company_id = ge.operating_company_id
           AND ge2.geofence_id = ge.geofence_id
           AND ge2.unit_id = ge.unit_id
           AND ge2.event_kind = 'exited'
           AND ge2.occurred_at > ge.occurred_at
           AND ge2.occurred_at < ge.occurred_at + INTERVAL '8 hours'
       )
       AND ge.occurred_at < now() - INTERVAL '2 hours'`,
    [operatingCompanyId, reportDate]
  );
  for (const row of orphanEntries.rows) {
    findings.push({ anomaly_class: "orphan_entry", geofence_id: row.geofence_id, unit_id: row.unit_id, load_uuid: null, occurred_at: row.occurred_at, details: {} });
  }

  // Anomaly 2: orphan_exit — exit with no prior entry within 8h on same day
  const orphanExits = await client.query(
    `SELECT ge.geofence_id::text, ge.unit_id::text, ge.occurred_at
     FROM geo.geofence_events ge
     WHERE ge.operating_company_id = $1::uuid
       AND ge.event_kind = 'exited'
       AND ge.occurred_at::date = $2::date
       AND NOT EXISTS (
         SELECT 1 FROM geo.geofence_events ge2
         WHERE ge2.operating_company_id = ge.operating_company_id
           AND ge2.geofence_id = ge.geofence_id
           AND ge2.unit_id = ge.unit_id
           AND ge2.event_kind = 'entered'
           AND ge2.occurred_at < ge.occurred_at
           AND ge2.occurred_at > ge.occurred_at - INTERVAL '8 hours'
       )`,
    [operatingCompanyId, reportDate]
  );
  for (const row of orphanExits.rows) {
    findings.push({ anomaly_class: "orphan_exit", geofence_id: row.geofence_id, unit_id: row.unit_id, load_uuid: null, occurred_at: row.occurred_at, details: {} });
  }

  // Anomaly 3: duplicate_fire — entry within 60s of another entry, same unit + geofence
  const duplicates = await client.query(
    `SELECT ge.geofence_id::text, ge.unit_id::text, ge.occurred_at, ge2.occurred_at AS prior_at
     FROM geo.geofence_events ge
     JOIN geo.geofence_events ge2
       ON ge2.operating_company_id = ge.operating_company_id
         AND ge2.geofence_id = ge.geofence_id
         AND ge2.unit_id = ge.unit_id
         AND ge2.event_kind = 'entered'
         AND ge2.occurred_at < ge.occurred_at
         AND ge2.occurred_at > ge.occurred_at - INTERVAL '60 seconds'
     WHERE ge.operating_company_id = $1::uuid
       AND ge.event_kind = 'entered'
       AND ge.occurred_at::date = $2::date`,
    [operatingCompanyId, reportDate]
  );
  for (const row of duplicates.rows) {
    findings.push({ anomaly_class: "duplicate_fire", geofence_id: row.geofence_id, unit_id: row.unit_id, load_uuid: null, occurred_at: row.occurred_at, details: { prior_at: row.prior_at } });
  }

  // Anomaly 4: expected_missing — delivered loads with no delivery geofence event
  const hasLoads = await tableExists(client, "mdata", "loads");
  if (hasLoads) {
    const missing = await client.query(
      `SELECT l.uuid AS load_uuid, la.vehicle_id::text, l.delivered_at
       FROM mdata.loads l
       LEFT JOIN mdata.load_assignments la ON la.load_uuid = l.uuid
       WHERE l.operating_company_id = $1::uuid
         AND l.status = 'delivered'
         AND l.delivered_at::date = $2::date
         AND NOT EXISTS (
           SELECT 1 FROM geo.geofence_events ge
           WHERE ge.operating_company_id = l.operating_company_id
             AND ge.unit_id = la.vehicle_id
             AND ge.event_kind IN ('entered','exited')
             AND ge.occurred_at BETWEEN l.delivered_at - INTERVAL '2 hours' AND l.delivered_at + INTERVAL '30 minutes'
         )
       LIMIT 50`,
      [operatingCompanyId, reportDate]
    );
    for (const row of missing.rows) {
      findings.push({ anomaly_class: "expected_missing", geofence_id: null, unit_id: row.vehicle_id, load_uuid: row.load_uuid, occurred_at: row.delivered_at, details: {} });
    }
  }

  // Persist findings
  for (const f of findings) {
    await client.query(
      `INSERT INTO safety.integrity_findings
         (operating_company_id, report_date, anomaly_class, geofence_id, unit_id, load_uuid, occurred_at, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT DO NOTHING`,
      [operatingCompanyId, reportDate, f.anomaly_class, f.geofence_id, f.unit_id, f.load_uuid, f.occurred_at, JSON.stringify(f.details)]
    );
  }

  return { report_date: reportDate, operating_company_id: operatingCompanyId, total_events, anomalies_found: findings.length, findings };
}

export async function getReconciliationReport(
  _userUuid: string,
  operatingCompanyId: string,
  date: string
) {
  return withLuciaBypass(async (client) => {
    const res = await client.query(
      `SELECT uuid, anomaly_class, geofence_id, unit_id, load_uuid, occurred_at, details, resolved, resolved_at, resolution_note
       FROM safety.integrity_findings
       WHERE operating_company_id = $1 AND report_date = $2::date
       ORDER BY anomaly_class, occurred_at`,
      [operatingCompanyId, date]
    );
    return res.rows;
  });
}

export async function resolveIntegrityFinding(
  client: PoolClient,
  uuid: string,
  resolvedByUuid: string,
  note: string
): Promise<void> {
  await client.query(
    `UPDATE safety.integrity_findings
     SET resolved = true, resolved_by_user_uuid = $2, resolved_at = now(), resolution_note = $3
     WHERE uuid = $1`,
    [uuid, resolvedByUuid, note]
  );
}
