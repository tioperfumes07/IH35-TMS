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
  /**
   * FAIL-LOUD (DISP-03). `anomalies_found: 0` is ambiguous on its own — it means "checked and clean"
   * OR "could not check at all". These two fields separate them, so a caller or a dashboard can never
   * read a structurally-dead run as a healthy one.
   */
  geofence_events_evaluable: boolean;
  expected_missing_evaluable: boolean;
  /** Delivered loads with NO assigned unit: unmatchable by construction, so never "clean". */
  unassigned_delivered_loads: number;
  /**
   * Delivered loads whose delivery stop has NO actual_departure_at. Anomaly 4 keys off that
   * timestamp, so these loads are invisible to the check entirely. Prod on 2026-07-27: 1 delivered
   * load and 0 of 20 stops carry a departure time — i.e. the check would report a perfect score while
   * being structurally unable to evaluate the only delivered load there is.
   */
  delivered_loads_without_departure_timestamp: number;
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
    // Previously returned a clean-looking zero. geo.geofence_events being absent is a schema failure,
    // not a quiet day — it must not be indistinguishable from a run that checked and found nothing.
    return {
      report_date: reportDate,
      operating_company_id: operatingCompanyId,
      total_events: 0,
      anomalies_found: 0,
      findings: [],
      geofence_events_evaluable: false,
      expected_missing_evaluable: false,
      unassigned_delivered_loads: 0,
      delivered_loads_without_departure_timestamp: 0,
    };
  }

  const findings: ReconciliationFinding[] = [];
  let expectedMissingEvaluable = true;
  let unassignedDeliveredLoads = 0;
  let deliveredWithoutDepartureTimestamp = 0;

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

  // Anomaly 4: expected_missing — delivered loads with no delivery geofence event.
  //
  // DISP-03. This query used to read four identifiers that DO NOT EXIST, verified on
  // br-fancy-credit-akjnd07a 2026-07-27: the table mdata.load_assignments (to_regclass IS NULL),
  // its column la.vehicle_id, mdata.loads.uuid (the PK is l.id) and mdata.loads.delivered_at (no
  // such column — delivery time lives on the stop). It was gated only by `hasLoads`, which is TRUE,
  // so it ran every time and threw 42P01 — and because the throw escaped before the "Persist
  // findings" loop below, anomalies 1-3 were computed and then THROWN AWAY. The daily geofence
  // reconciliation has therefore been persisting nothing at all, not merely missing anomaly 4.
  //
  // Canonical resolution (§4): unit = mdata.loads.assigned_unit_id; load id = l.id; delivered
  // timestamp = the LAST stop_type='delivery' stop's actual_departure_at, which is the same
  // truck-release basis booking-gap.service.ts already uses. Enum members verified on prod:
  // load_status_enum contains 'delivered' and 'delivered_pending_docs' — both count as delivered,
  // since docs-pending is still physically delivered and its geofence event should exist.
  const hasLoads = await tableExists(client, "mdata", "loads");
  const hasStops = await tableExists(client, "mdata", "load_stops");
  if (hasLoads && hasStops) {
    const missing = await client.query(
      `WITH delivered AS (
         SELECT DISTINCT ON (l.id)
           l.id                     AS load_id,
           l.assigned_unit_id       AS unit_id,
           ls.actual_departure_at   AS delivered_at
         FROM mdata.loads l
         JOIN mdata.load_stops ls
           ON ls.load_id = l.id
           AND ls.stop_type = 'delivery'
           AND ls.actual_departure_at IS NOT NULL
         WHERE l.operating_company_id = $1::uuid
           AND l.status::text IN ('delivered', 'delivered_pending_docs')
           AND l.soft_deleted_at IS NULL
           AND ls.actual_departure_at::date = $2::date
         ORDER BY l.id, ls.actual_departure_at DESC
       )
       SELECT d.load_id::text AS load_uuid, d.unit_id::text AS unit_id, d.delivered_at
       FROM delivered d
       WHERE NOT EXISTS (
         SELECT 1 FROM geo.geofence_events ge
         WHERE ge.operating_company_id = $1::uuid
           AND ge.unit_id = d.unit_id
           AND ge.event_kind IN ('entered','exited')
           AND ge.occurred_at BETWEEN d.delivered_at - INTERVAL '2 hours' AND d.delivered_at + INTERVAL '30 minutes'
       )
       LIMIT 50`,
      [operatingCompanyId, reportDate]
    );
    for (const row of missing.rows) {
      findings.push({ anomaly_class: "expected_missing", geofence_id: null, unit_id: row.unit_id, load_uuid: row.load_uuid, occurred_at: row.delivered_at, details: {} });
    }
    // FAIL-LOUD: a load with no assigned unit can never match a geofence event, so it would silently
    // masquerade as "no anomaly". Counting it separately keeps "nothing to check" distinguishable
    // from "checked and clean" — the distinction this whole audit exists to enforce.
    const unassigned = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM mdata.loads l
         JOIN mdata.load_stops ls
           ON ls.load_id = l.id AND ls.stop_type = 'delivery' AND ls.actual_departure_at IS NOT NULL
        WHERE l.operating_company_id = $1::uuid
          AND l.status::text IN ('delivered', 'delivered_pending_docs')
          AND l.soft_deleted_at IS NULL
          AND ls.actual_departure_at::date = $2::date
          AND l.assigned_unit_id IS NULL`,
      [operatingCompanyId, reportDate]
    );
    unassignedDeliveredLoads = Number(unassigned.rows[0]?.count ?? 0);

    // The check keys off the delivery stop's actual_departure_at. A delivered load without one is
    // not "clean" — it is unevaluable, and counting it is what keeps a structurally-blind run from
    // reading as a passing one.
    const noTimestamp = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.status::text IN ('delivered', 'delivered_pending_docs')
          AND l.soft_deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM mdata.load_stops ls
             WHERE ls.load_id = l.id
               AND ls.stop_type = 'delivery'
               AND ls.actual_departure_at IS NOT NULL
          )`,
      [operatingCompanyId]
    );
    deliveredWithoutDepartureTimestamp = Number(noTimestamp.rows[0]?.count ?? 0);
  } else {
    // The canonical sources are missing entirely — that is a schema problem, not "no anomalies".
    // Say so rather than returning a clean-looking report.
    expectedMissingEvaluable = false;
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

  return {
    report_date: reportDate,
    operating_company_id: operatingCompanyId,
    total_events,
    anomalies_found: findings.length,
    findings,
    geofence_events_evaluable: true,
    expected_missing_evaluable: expectedMissingEvaluable,
    unassigned_delivered_loads: unassignedDeliveredLoads,
    delivered_loads_without_departure_timestamp: deliveredWithoutDepartureTimestamp,
  };
}

export async function getReconciliationReport(
  _userUuid: string,
  operatingCompanyId: string,
  date: string
) {
  return withLuciaBypass(async (client) => {
    const res = await client.query(
      `SELECT f.uuid, f.anomaly_class, f.geofence_id, g.label AS geofence_label,
              f.unit_id, u.unit_number, f.load_uuid, f.occurred_at, f.details,
              f.resolved, f.resolved_at, f.resolution_note
       FROM safety.integrity_findings f
       LEFT JOIN geo.geofences g ON g.id = f.geofence_id AND g.operating_company_id = f.operating_company_id
       LEFT JOIN mdata.units u ON u.id = f.unit_id AND u.operating_company_id = f.operating_company_id
       WHERE f.operating_company_id = $1::uuid AND f.report_date = $2::date
       ORDER BY f.anomaly_class, f.occurred_at`,
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
