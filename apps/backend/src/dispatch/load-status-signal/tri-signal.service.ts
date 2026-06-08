/**
 * GAP-57 — CAP-5 dispatch board tri-signal (on-track / behind / delayed).
 */
import type { PoolClient } from "pg";
import { getCurrentClocks } from "../../telematics/hos-clocks.service.js";
import { TRI_SIGNAL_THRESHOLDS } from "./thresholds.config.js";

export type TriSignalKind = "on_track" | "behind" | "delayed";

export type TriSignalResult = {
  load_uuid: string;
  signal: TriSignalKind;
  reason: string;
  slip_minutes: number | null;
  hos_remaining_minutes: number | null;
  driver_ack_age_minutes: number | null;
};

export type TriSignalInputs = {
  load_uuid: string;
  status: string;
  scheduled_delivery_at: string | null;
  gps_eta_at: string | null;
  hos_remaining_minutes: number | null;
  driver_ack_age_minutes: number | null;
  speed_mph: number | null;
  minutes_since_last_position: number | null;
  now?: Date;
};

const MOVING_STATUSES = new Set(["assigned", "dispatched", "in_transit", "at_pickup"]);

function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

function slipFromEta(scheduledAt: string | null, gpsEtaAt: string | null, now: Date): number | null {
  if (!scheduledAt || !gpsEtaAt) return null;
  const scheduled = new Date(scheduledAt);
  const eta = new Date(gpsEtaAt);
  if (Number.isNaN(scheduled.getTime()) || Number.isNaN(eta.getTime())) return null;
  return Math.max(0, minutesBetween(scheduled, eta));
}

export function evaluateTriSignal(inputs: TriSignalInputs): TriSignalResult {
  const now = inputs.now ?? new Date();
  const slipMinutes = slipFromEta(inputs.scheduled_delivery_at, inputs.gps_eta_at, now);
  const hosRemaining = inputs.hos_remaining_minutes;
  const t = TRI_SIGNAL_THRESHOLDS;

  if (t.delayedOnHosDepleted && hosRemaining != null && hosRemaining <= 0) {
    return {
      load_uuid: inputs.load_uuid,
      signal: "delayed",
      reason: "Drive time HOS depleted (0 minutes remaining).",
      slip_minutes: slipMinutes,
      hos_remaining_minutes: hosRemaining,
      driver_ack_age_minutes: inputs.driver_ack_age_minutes,
    };
  }

  const shouldBeMoving = MOVING_STATUSES.has(inputs.status);
  const stationary =
    shouldBeMoving &&
    inputs.minutes_since_last_position != null &&
    (inputs.speed_mph == null || inputs.speed_mph <= 5) &&
    inputs.minutes_since_last_position >= t.delayedOnNoMovementMinutes;

  if (stationary) {
    return {
      load_uuid: inputs.load_uuid,
      signal: "delayed",
      reason: `No movement for ${inputs.minutes_since_last_position} minutes while load is ${inputs.status}.`,
      slip_minutes: slipMinutes,
      hos_remaining_minutes: hosRemaining,
      driver_ack_age_minutes: inputs.driver_ack_age_minutes,
    };
  }

  if (slipMinutes == null) {
    return {
      load_uuid: inputs.load_uuid,
      signal: "on_track",
      reason: inputs.gps_eta_at ? "Unable to compare ETA to scheduled delivery." : "No GPS ETA available.",
      slip_minutes: null,
      hos_remaining_minutes: hosRemaining,
      driver_ack_age_minutes: inputs.driver_ack_age_minutes,
    };
  }

  if (slipMinutes >= t.delayedMinSlipMinutes) {
    return {
      load_uuid: inputs.load_uuid,
      signal: "delayed",
      reason: `ETA slip ${slipMinutes} minutes (≥ ${t.delayedMinSlipMinutes} min threshold).`,
      slip_minutes: slipMinutes,
      hos_remaining_minutes: hosRemaining,
      driver_ack_age_minutes: inputs.driver_ack_age_minutes,
    };
  }

  if (slipMinutes > t.onTrackMaxSlipMinutes && slipMinutes <= t.behindMaxSlipMinutes) {
    return {
      load_uuid: inputs.load_uuid,
      signal: "behind",
      reason: `ETA slip ${slipMinutes} minutes (${t.behindMinSlipMinutes}–${t.behindMaxSlipMinutes} min window).`,
      slip_minutes: slipMinutes,
      hos_remaining_minutes: hosRemaining,
      driver_ack_age_minutes: inputs.driver_ack_age_minutes,
    };
  }

  return {
    load_uuid: inputs.load_uuid,
    signal: "on_track",
    reason: slipMinutes === 0 ? "ETA on or ahead of schedule." : `ETA slip ${slipMinutes} minutes (within ${t.onTrackMaxSlipMinutes} min).`,
    slip_minutes: slipMinutes,
    hos_remaining_minutes: hosRemaining,
    driver_ack_age_minutes: inputs.driver_ack_age_minutes,
  };
}

type LoadContextRow = {
  load_uuid: string;
  status: string;
  scheduled_delivery_at: string | null;
  dispatcher_eta_at: string | null;
  driver_id: string | null;
  unit_id: string | null;
  speed_mph: string | null;
  position_recorded_at: string | null;
  driver_ack_at: string | null;
  latest_auto_status_at: string | null;
};

async function fetchLoadContext(
  client: PoolClient,
  operatingCompanyId: string,
  loadUuid: string
): Promise<LoadContextRow | null> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const res = await client.query<LoadContextRow>(
    `
      SELECT
        l.id::text AS load_uuid,
        l.status::text AS status,
        (
          SELECT s.scheduled_arrival_at::text
          FROM mdata.load_stops s
          WHERE s.load_id = l.id
            AND s.stop_type::text = 'delivery'
          ORDER BY s.sequence_number ASC
          LIMIT 1
        ) AS scheduled_delivery_at,
        l.dispatcher_eta_at::text AS dispatcher_eta_at,
        COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id)::text AS driver_id,
        l.assigned_unit_id::text AS unit_id,
        pos.speed_mph::text AS speed_mph,
        pos.recorded_at::text AS position_recorded_at,
        ack.acknowledged_at::text AS driver_ack_at,
        auto.latest_at::text AS latest_auto_status_at
      FROM mdata.loads l
      LEFT JOIN LATERAL (
        SELECT speed_mph, recorded_at
        FROM integrations.samsara_vehicle_positions svp
        WHERE svp.unit_uuid = l.assigned_unit_id
          AND svp.operating_company_id = l.operating_company_id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) pos ON true
      LEFT JOIN LATERAL (
        SELECT sa.acknowledged_at
        FROM driver_finance.signed_acknowledgments sa
        WHERE sa.load_id = l.id
          AND sa.operating_company_id = l.operating_company_id
        ORDER BY sa.acknowledged_at DESC
        LIMIT 1
      ) ack ON true
      LEFT JOIN LATERAL (
        SELECT MAX(s.suggested_at) AS latest_at
        FROM dispatch.auto_status_suggestions s
        WHERE s.load_id = l.id
          AND s.operating_company_id = l.operating_company_id
      ) auto ON true
      WHERE l.id = $2::uuid
        AND l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, loadUuid]
  );
  return res.rows[0] ?? null;
}

function resolveGpsEta(row: LoadContextRow): string | null {
  if (row.dispatcher_eta_at) {
    const manual = new Date(row.dispatcher_eta_at);
    if (!Number.isNaN(manual.getTime())) return manual.toISOString();
  }
  return null;
}

function driverAckAgeMinutes(ackAt: string | null, now: Date): number | null {
  if (!ackAt) return null;
  const ack = new Date(ackAt);
  if (Number.isNaN(ack.getTime())) return null;
  return Math.max(0, minutesBetween(ack, now));
}

function minutesSincePosition(recordedAt: string | null, now: Date): number | null {
  if (!recordedAt) return null;
  const at = new Date(recordedAt);
  if (Number.isNaN(at.getTime())) return null;
  return Math.max(0, minutesBetween(at, now));
}

async function buildTriSignalInputs(
  client: PoolClient,
  operatingCompanyId: string,
  row: LoadContextRow,
  now: Date
): Promise<TriSignalInputs> {
  let hosRemaining: number | null = null;
  if (row.driver_id) {
    const clocks = await getCurrentClocks(client, operatingCompanyId, row.driver_id, now);
    hosRemaining = clocks.drive_remaining_min;
  }

  return {
    load_uuid: row.load_uuid,
    status: row.status,
    scheduled_delivery_at: row.scheduled_delivery_at,
    gps_eta_at: resolveGpsEta(row),
    hos_remaining_minutes: hosRemaining,
    driver_ack_age_minutes: driverAckAgeMinutes(row.driver_ack_at, now),
    speed_mph: row.speed_mph != null ? Number(row.speed_mph) : null,
    minutes_since_last_position: minutesSincePosition(row.position_recorded_at, now),
    now,
  };
}

export async function computeTriSignal(
  client: PoolClient,
  operatingCompanyId: string,
  loadUuid: string
): Promise<TriSignalResult | null> {
  const row = await fetchLoadContext(client, operatingCompanyId, loadUuid);
  if (!row) return null;
  const inputs = await buildTriSignalInputs(client, operatingCompanyId, row, new Date());
  return evaluateTriSignal(inputs);
}

export async function computeTriSignalsForActiveLoads(
  client: PoolClient,
  operatingCompanyId: string
): Promise<TriSignalResult[]> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const loads = await client.query<{ load_uuid: string }>(
    `
      SELECT l.id::text AS load_uuid
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text IN ('assigned', 'dispatched', 'in_transit', 'at_pickup', 'at_delivery')
      ORDER BY l.updated_at DESC NULLS LAST
    `,
    [operatingCompanyId]
  );

  const now = new Date();
  const results: TriSignalResult[] = [];
  for (const load of loads.rows) {
    const row = await fetchLoadContext(client, operatingCompanyId, load.load_uuid);
    if (!row) continue;
    const inputs = await buildTriSignalInputs(client, operatingCompanyId, row, now);
    results.push(evaluateTriSignal(inputs));
  }
  return results;
}
