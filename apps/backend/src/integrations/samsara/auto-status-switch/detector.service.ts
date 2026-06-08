/**
 * GAP-56 / CAP-4 — Auto status switching when GPS movement diverges from driver-reported load status.
 */
import { appendCrudAudit } from "../../../audit/crud-audit.js";
import { notifyDriverWebPush } from "../../../services/push-notification.service.js";

const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

export const MOVEMENT_MILES = 5;
export const MOVEMENT_WINDOW_MIN = 30;
export const GEOFENCE_MILES = 0.5;
export const STATIONARY_WINDOW_MIN = 30;
export const DELIVERY_DWELL_MIN = 5;
export const IDEMPOTENCY_WINDOW_MIN = 30;

export type AutoStatusCaseId = "A" | "B" | "C";

export type DriftAction =
  | {
      case_id: AutoStatusCaseId;
      action: "auto_apply";
      proposed_status: "in_transit" | "at_delivery";
      reason: string;
      evidence: Record<string, unknown>;
    }
  | {
      case_id: "B";
      action: "flag_intransit_issue";
      proposed_status: null;
      reason: string;
      evidence: Record<string, unknown>;
    }
  | null;

export type LoadGpsContext = {
  load_uuid: string;
  operating_company_id: string;
  unit_uuid: string | null;
  driver_uuid: string | null;
  current_status: string;
  lat: number;
  lng: number;
  speed_mph: number | null;
  recorded_at: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  position_30min_ago_lat: number | null;
  position_30min_ago_lng: number | null;
  position_30min_ago_at: string | null;
  delivery_geofence_entered_at: string | null;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinGeofenceMiles(lat: number, lng: number, stopLat: number, stopLng: number, radiusMiles = GEOFENCE_MILES): boolean {
  return haversineMiles(lat, lng, stopLat, stopLng) <= radiusMiles;
}

export function evaluateCaseA(ctx: LoadGpsContext): DriftAction {
  if (ctx.current_status !== "at_pickup") return null;
  if (ctx.position_30min_ago_lat == null || ctx.position_30min_ago_lng == null) return null;

  const milesMoved = haversineMiles(ctx.position_30min_ago_lat, ctx.position_30min_ago_lng, ctx.lat, ctx.lng);
  if (milesMoved <= MOVEMENT_MILES) return null;

  return {
    case_id: "A",
    action: "auto_apply",
    proposed_status: "in_transit",
    reason: `GPS moved ${milesMoved.toFixed(1)} mi in ${MOVEMENT_WINDOW_MIN} min while status remained at_pickup.`,
    evidence: {
      miles_moved: milesMoved,
      window_minutes: MOVEMENT_WINDOW_MIN,
      from_lat: ctx.position_30min_ago_lat,
      from_lng: ctx.position_30min_ago_lng,
      to_lat: ctx.lat,
      to_lng: ctx.lng,
    },
  };
}

export function evaluateCaseB(ctx: LoadGpsContext): DriftAction {
  if (ctx.current_status !== "in_transit") return null;
  if (ctx.pickup_lat == null || ctx.pickup_lng == null) return null;
  if (!isWithinGeofenceMiles(ctx.lat, ctx.lng, ctx.pickup_lat, ctx.pickup_lng)) return null;

  const stationaryMiles =
    ctx.position_30min_ago_lat != null && ctx.position_30min_ago_lng != null
      ? haversineMiles(ctx.position_30min_ago_lat, ctx.position_30min_ago_lng, ctx.lat, ctx.lng)
      : 0;
  if (stationaryMiles > 0.25) return null;

  return {
    case_id: "B",
    action: "flag_intransit_issue",
    proposed_status: null,
    reason: `GPS stationary at pickup geofence for ${STATIONARY_WINDOW_MIN}+ min while status is in_transit.`,
    evidence: {
      stationary_miles: stationaryMiles,
      pickup_lat: ctx.pickup_lat,
      pickup_lng: ctx.pickup_lng,
      gps_lat: ctx.lat,
      gps_lng: ctx.lng,
    },
  };
}

export function evaluateCaseC(ctx: LoadGpsContext): DriftAction {
  if (ctx.current_status !== "in_transit") return null;
  if (ctx.delivery_lat == null || ctx.delivery_lng == null) return null;
  if (!isWithinGeofenceMiles(ctx.lat, ctx.lng, ctx.delivery_lat, ctx.delivery_lng)) return null;

  const enteredAt = ctx.delivery_geofence_entered_at ?? ctx.recorded_at;
  const dwellMinutes = Math.max(0, Math.floor((Date.now() - new Date(enteredAt).getTime()) / 60000));
  if (dwellMinutes < DELIVERY_DWELL_MIN) return null;

  return {
    case_id: "C",
    action: "auto_apply",
    proposed_status: "at_delivery",
    reason: `GPS at delivery geofence for ${dwellMinutes} min while status remained in_transit.`,
    evidence: {
      dwell_minutes: dwellMinutes,
      delivery_lat: ctx.delivery_lat,
      delivery_lng: ctx.delivery_lng,
      gps_lat: ctx.lat,
      gps_lng: ctx.lng,
    },
  };
}

export function detectStatusDriftFromContext(ctx: LoadGpsContext): DriftAction {
  return evaluateCaseA(ctx) ?? evaluateCaseB(ctx) ?? evaluateCaseC(ctx);
}

async function fetchPositionSnapshot(
  client: DbClient,
  operatingCompanyId: string,
  unitUuid: string,
  minutesAgo: number
): Promise<{ lat: number; lng: number; recorded_at: string } | null> {
  const res = await client.query<{ lat: string; lng: string; recorded_at: string }>(
    `
      SELECT lat::text, lng::text, recorded_at::text
      FROM integrations.auto_status_position_snapshots
      WHERE operating_company_id = $1::uuid
        AND unit_uuid = $2::uuid
        AND recorded_at <= now() - ($3::int * interval '1 minute')
      ORDER BY recorded_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, unitUuid, minutesAgo]
  );
  const row = res.rows[0];
  if (!row) return null;
  return { lat: Number(row.lat), lng: Number(row.lng), recorded_at: row.recorded_at };
}

async function fetchLoadGpsContext(client: DbClient, operatingCompanyId: string, loadUuid: string): Promise<LoadGpsContext | null> {
  const res = await client.query<{
    load_uuid: string;
    operating_company_id: string;
    unit_uuid: string | null;
    driver_uuid: string | null;
    current_status: string;
    lat: string | null;
    lng: string | null;
    speed_mph: string | null;
    recorded_at: string | null;
    pickup_lat: string | null;
    pickup_lng: string | null;
    delivery_lat: string | null;
    delivery_lng: string | null;
  }>(
    `
      SELECT
        l.id::text AS load_uuid,
        l.operating_company_id::text,
        l.assigned_unit_id::text AS unit_uuid,
        COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id)::text AS driver_uuid,
        l.status::text AS current_status,
        p.lat::text,
        p.lng::text,
        p.speed_mph::text,
        p.recorded_at::text,
        pickup.latitude::text AS pickup_lat,
        pickup.longitude::text AS pickup_lng,
        delivery.latitude::text AS delivery_lat,
        delivery.longitude::text AS delivery_lng
      FROM mdata.loads l
      LEFT JOIN integrations.samsara_vehicle_positions p
        ON p.unit_uuid = l.assigned_unit_id
       AND p.operating_company_id = l.operating_company_id
      LEFT JOIN LATERAL (
        SELECT loc.latitude, loc.longitude
        FROM mdata.load_stops s
        LEFT JOIN mdata.locations loc ON loc.id = s.location_id
        WHERE s.load_id = l.id AND s.stop_type::text = 'pickup'
        ORDER BY s.sequence_number ASC
        LIMIT 1
      ) pickup ON true
      LEFT JOIN LATERAL (
        SELECT loc.latitude, loc.longitude
        FROM mdata.load_stops s
        LEFT JOIN mdata.locations loc ON loc.id = s.location_id
        WHERE s.load_id = l.id AND s.stop_type::text = 'delivery'
        ORDER BY s.sequence_number DESC
        LIMIT 1
      ) delivery ON true
      WHERE l.id = $2::uuid
        AND l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, loadUuid]
  );

  const row = res.rows[0];
  if (!row || row.lat == null || row.lng == null || row.recorded_at == null || !row.unit_uuid) return null;

  const snapshot30 = await fetchPositionSnapshot(client, operatingCompanyId, row.unit_uuid, MOVEMENT_WINDOW_MIN);

  let deliveryGeofenceEnteredAt: string | null = null;
  if (row.delivery_lat != null && row.delivery_lng != null) {
    const withinDelivery = isWithinGeofenceMiles(
      Number(row.lat),
      Number(row.lng),
      Number(row.delivery_lat),
      Number(row.delivery_lng)
    );
    if (withinDelivery) {
      const dwellRes = await client.query<{ recorded_at: string }>(
        `
          SELECT recorded_at::text
          FROM integrations.auto_status_position_snapshots
          WHERE operating_company_id = $1::uuid
            AND unit_uuid = $2::uuid
            AND recorded_at >= now() - interval '2 hours'
          ORDER BY recorded_at ASC
        `,
        [operatingCompanyId, row.unit_uuid]
      );
      for (const snap of dwellRes.rows) {
        const snapRes = await client.query<{ lat: string; lng: string }>(
          `SELECT lat::text, lng::text FROM integrations.auto_status_position_snapshots WHERE operating_company_id = $1::uuid AND unit_uuid = $2::uuid AND recorded_at = $3::timestamptz LIMIT 1`,
          [operatingCompanyId, row.unit_uuid, snap.recorded_at]
        );
        const snapRow = snapRes.rows[0];
        if (!snapRow) continue;
        const inside = isWithinGeofenceMiles(
          Number(snapRow.lat),
          Number(snapRow.lng),
          Number(row.delivery_lat),
          Number(row.delivery_lng)
        );
        if (inside) {
          deliveryGeofenceEnteredAt = snap.recorded_at;
          break;
        }
      }
      if (!deliveryGeofenceEnteredAt) deliveryGeofenceEnteredAt = row.recorded_at;
    }
  }

  return {
    load_uuid: row.load_uuid,
    operating_company_id: row.operating_company_id,
    unit_uuid: row.unit_uuid,
    driver_uuid: row.driver_uuid,
    current_status: row.current_status,
    lat: Number(row.lat),
    lng: Number(row.lng),
    speed_mph: row.speed_mph != null ? Number(row.speed_mph) : null,
    recorded_at: row.recorded_at,
    pickup_lat: row.pickup_lat != null ? Number(row.pickup_lat) : null,
    pickup_lng: row.pickup_lng != null ? Number(row.pickup_lng) : null,
    delivery_lat: row.delivery_lat != null ? Number(row.delivery_lat) : null,
    delivery_lng: row.delivery_lng != null ? Number(row.delivery_lng) : null,
    position_30min_ago_lat: snapshot30?.lat ?? null,
    position_30min_ago_lng: snapshot30?.lng ?? null,
    position_30min_ago_at: snapshot30?.recorded_at ?? null,
    delivery_geofence_entered_at: deliveryGeofenceEnteredAt,
  };
}

export async function detectStatusDrift(
  client: DbClient,
  operatingCompanyId: string,
  loadUuid: string
): Promise<{ context: LoadGpsContext | null; drift: DriftAction }> {
  const context = await fetchLoadGpsContext(client, operatingCompanyId, loadUuid);
  if (!context) return { context: null, drift: null };
  return { context, drift: detectStatusDriftFromContext(context) };
}

async function hasRecentDuplicate(
  client: DbClient,
  operatingCompanyId: string,
  loadUuid: string,
  caseId: AutoStatusCaseId
): Promise<boolean> {
  const res = await client.query<{ uuid: string }>(
    `
      SELECT uuid::text
      FROM integrations.auto_status_switch_events
      WHERE operating_company_id = $1::uuid
        AND load_uuid = $2::uuid
        AND case_id = $3
        AND created_at >= now() - ($4::int * interval '1 minute')
      LIMIT 1
    `,
    [operatingCompanyId, loadUuid, caseId, IDEMPOTENCY_WINDOW_MIN]
  );
  return Boolean(res.rows[0]);
}

async function flagIntransitIssue(
  client: DbClient,
  ctx: LoadGpsContext,
  drift: Extract<DriftAction, { action: "flag_intransit_issue" }>
): Promise<{ event_uuid: string }> {
  const issueRes = await client.query<{ id: string }>(
    `
      INSERT INTO dispatch.intransit_issues (
        load_id,
        unit_id,
        driver_id,
        issue_type,
        issue_category,
        issue_description,
        severity,
        status,
        gps_lat,
        gps_lng,
        gps_label
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, 'open', $8, $9, $10)
      RETURNING id::text
    `,
    [
      ctx.load_uuid,
      ctx.unit_uuid,
      ctx.driver_uuid,
      "status_drift",
      "other",
      drift.reason,
      "warning",
      ctx.lat,
      ctx.lng,
      "auto_status_switch_case_b",
    ]
  );

  const eventRes = await client.query<{ uuid: string }>(
    `
      INSERT INTO integrations.auto_status_switch_events (
        operating_company_id,
        load_uuid,
        unit_uuid,
        driver_uuid,
        case_id,
        from_status,
        to_status,
        reason,
        auto_switched,
        evidence
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'B', $5, NULL, $6, false, $7::jsonb)
      RETURNING uuid::text
    `,
    [
      ctx.operating_company_id,
      ctx.load_uuid,
      ctx.unit_uuid,
      ctx.driver_uuid,
      ctx.current_status,
      drift.reason,
      JSON.stringify({ ...drift.evidence, intransit_issue_id: issueRes.rows[0]?.id }),
    ]
  );

  await appendCrudAudit(
    client,
    SYSTEM_USER_ID,
    "integrations.auto_status_switch.flagged",
    {
      resource_type: "mdata.loads",
      resource_id: ctx.load_uuid,
      case_id: "B",
      auto_switched: false,
      reason: drift.reason,
      intransit_issue_id: issueRes.rows[0]?.id,
    },
    "warning",
    "GAP-56-CAP-4"
  );

  return { event_uuid: eventRes.rows[0]?.uuid ?? "" };
}

export async function applyAutoSwitch(
  client: DbClient,
  operatingCompanyId: string,
  loadUuid: string,
  newStatus: "in_transit" | "at_delivery",
  reason: string,
  drift: Extract<DriftAction, { action: "auto_apply" }>
): Promise<{ applied: boolean; event_uuid?: string; skipped?: string }> {
  if (await hasRecentDuplicate(client, operatingCompanyId, loadUuid, drift.case_id)) {
    return { applied: false, skipped: "idempotent_duplicate" };
  }

  const loadRes = await client.query<{ status: string }>(
    `SELECT status::text FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL LIMIT 1`,
    [loadUuid, operatingCompanyId]
  );
  const current = loadRes.rows[0];
  if (!current) return { applied: false, skipped: "load_not_found" };
  if (current.status === newStatus) return { applied: false, skipped: "already_at_status" };

  const ctx = await fetchLoadGpsContext(client, operatingCompanyId, loadUuid);
  if (!ctx) return { applied: false, skipped: "missing_gps_context" };

  await client.query(`UPDATE mdata.loads SET status = $2, updated_at = now() WHERE id = $1::uuid`, [loadUuid, newStatus]);

  const eventRes = await client.query<{ uuid: string }>(
    `
      INSERT INTO integrations.auto_status_switch_events (
        operating_company_id,
        load_uuid,
        unit_uuid,
        driver_uuid,
        case_id,
        from_status,
        to_status,
        reason,
        auto_switched,
        applied_at,
        evidence
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, true, now(), $9::jsonb)
      RETURNING uuid::text
    `,
    [
      operatingCompanyId,
      loadUuid,
      ctx.unit_uuid,
      ctx.driver_uuid,
      drift.case_id,
      current.status,
      newStatus,
      reason,
      JSON.stringify(drift.evidence),
    ]
  );

  await appendCrudAudit(
    client,
    SYSTEM_USER_ID,
    "mdata.loads.status_changed",
    {
      resource_type: "mdata.loads",
      resource_id: loadUuid,
      entity_type: "load",
      entity_id: loadUuid,
      from_status: current.status,
      to_status: newStatus,
      auto_switched: true,
      case_id: drift.case_id,
      reason,
    },
    "info",
    "GAP-56-CAP-4"
  );

  let driverNotified = false;
  if (ctx.driver_uuid) {
    const push = await notifyDriverWebPush({
      operatingCompanyId,
      driverId: ctx.driver_uuid,
      title: "Load status updated automatically",
      body: reason,
      tag: `auto-status-${loadUuid}`,
      data: { kind: "auto_status_switch", load_uuid: loadUuid, new_status: newStatus },
    });
    driverNotified = push.sent > 0;
  }

  await client.query(
    `UPDATE integrations.auto_status_switch_events SET driver_notified = $2 WHERE uuid = $1::uuid`,
    [eventRes.rows[0]?.uuid, driverNotified]
  );

  return { applied: true, event_uuid: eventRes.rows[0]?.uuid };
}

export async function processDriftForLoad(
  client: DbClient,
  operatingCompanyId: string,
  loadUuid: string
): Promise<{ drift: DriftAction; result?: Record<string, unknown> }> {
  const { drift } = await detectStatusDrift(client, operatingCompanyId, loadUuid);
  if (!drift) return { drift: null };

  if (drift.action === "flag_intransit_issue") {
    const ctx = await fetchLoadGpsContext(client, operatingCompanyId, loadUuid);
    if (!ctx) return { drift };
    if (await hasRecentDuplicate(client, operatingCompanyId, loadUuid, "B")) {
      return { drift, result: { skipped: "idempotent_duplicate" } };
    }
    const flagged = await flagIntransitIssue(client, ctx, drift);
    return { drift, result: { flagged: true, event_uuid: flagged.event_uuid } };
  }

  const applied = await applyAutoSwitch(client, operatingCompanyId, loadUuid, drift.proposed_status, drift.reason, drift);
  return { drift, result: applied };
}

export async function recordPositionSnapshotsForCompany(client: DbClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ unit_uuid: string; lat: string; lng: string; speed_mph: string | null }>(
    `
      SELECT
        p.unit_uuid::text,
        p.lat::text,
        p.lng::text,
        p.speed_mph::text
      FROM integrations.samsara_vehicle_positions p
      WHERE p.operating_company_id = $1::uuid
    `,
    [operatingCompanyId]
  );

  for (const row of res.rows) {
    await client.query(
      `
        INSERT INTO integrations.auto_status_position_snapshots (
          operating_company_id, unit_uuid, lat, lng, speed_mph, recorded_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, now())
      `,
      [operatingCompanyId, row.unit_uuid, Number(row.lat), Number(row.lng), row.speed_mph != null ? Number(row.speed_mph) : null]
    );
  }

  await client.query(
    `
      DELETE FROM integrations.auto_status_position_snapshots
      WHERE operating_company_id = $1::uuid
        AND recorded_at < now() - interval '3 hours'
    `,
    [operatingCompanyId]
  );

  return res.rows.length;
}

export async function listActiveLoadsForAutoStatus(client: DbClient, operatingCompanyId: string): Promise<string[]> {
  const res = await client.query<{ load_uuid: string }>(
    `
      SELECT l.id::text AS load_uuid
      FROM mdata.loads l
      JOIN integrations.samsara_vehicle_positions p
        ON p.unit_uuid = l.assigned_unit_id
       AND p.operating_company_id = l.operating_company_id
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text IN ('at_pickup', 'in_transit')
        AND l.assigned_unit_id IS NOT NULL
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => r.load_uuid);
}

export async function listRecentAutoStatusSwitches(
  client: DbClient,
  operatingCompanyId: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  const res = await client.query(
    `
      SELECT
        e.uuid::text,
        e.load_uuid::text,
        e.case_id,
        e.from_status,
        e.to_status,
        e.reason,
        e.auto_switched,
        e.applied_at::text,
        e.driver_notified,
        e.evidence,
        e.created_at::text,
        l.load_number
      FROM integrations.auto_status_switch_events e
      JOIN mdata.loads l ON l.id = e.load_uuid
      WHERE e.operating_company_id = $1::uuid
        AND e.auto_switched = true
      ORDER BY e.created_at DESC
      LIMIT $2
    `,
    [operatingCompanyId, limit]
  );
  return res.rows;
}
