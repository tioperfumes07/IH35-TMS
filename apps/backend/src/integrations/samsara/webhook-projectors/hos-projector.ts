import type { DbClient, ProjectionResult, SamsaraWebhookEvent } from "../webhook-projection.types.js";

type DutyStatus =
  | "off_duty"
  | "sleeper"
  | "driving"
  | "on_duty_not_driving"
  | "personal_conveyance"
  | "yard_moves";

const DUTY_STATUS_MAP: Record<string, DutyStatus> = {
  off_duty: "off_duty",
  offduty: "off_duty",
  sleeper: "sleeper",
  sleeper_berth: "sleeper",
  sleeperberth: "sleeper",
  driving: "driving",
  on_duty: "on_duty_not_driving",
  onduty: "on_duty_not_driving",
  on_duty_not_driving: "on_duty_not_driving",
  ondutynotdriving: "on_duty_not_driving",
  personal_conveyance: "personal_conveyance",
  personalconveyance: "personal_conveyance",
  yard_moves: "yard_moves",
  yardmoves: "yard_moves",
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseDutyStatus(payload: Record<string, unknown>): DutyStatus | null {
  const data = asObject(payload.data);
  const candidate =
    asString(data?.dutyStatus) ??
    asString(data?.duty_status) ??
    asString(payload.dutyStatus) ??
    asString(payload.duty_status) ??
    asString(data?.status) ??
    asString(payload.status);
  if (!candidate) return null;
  const normalized = candidate.toLowerCase().replace(/[\s-]/g, "_");
  return DUTY_STATUS_MAP[normalized.replaceAll("_", "")] ?? DUTY_STATUS_MAP[normalized] ?? null;
}

function parseTimestamp(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseStartedAt(payload: Record<string, unknown>): string | null {
  const data = asObject(payload.data);
  return (
    parseTimestamp(data?.startedAt) ??
    parseTimestamp(data?.started_at) ??
    parseTimestamp(data?.startTime) ??
    parseTimestamp(payload.startedAt) ??
    parseTimestamp(payload.started_at) ??
    parseTimestamp(payload.time)
  );
}

function parseEndedAt(payload: Record<string, unknown>): string | null {
  const data = asObject(payload.data);
  return (
    parseTimestamp(data?.endedAt) ??
    parseTimestamp(data?.ended_at) ??
    parseTimestamp(data?.endTime) ??
    parseTimestamp(payload.endedAt) ??
    parseTimestamp(payload.ended_at)
  );
}

function parseOdometerMiles(payload: Record<string, unknown>): number | null {
  const data = asObject(payload.data);
  const miles =
    (typeof data?.odometer_mi === "number" && data.odometer_mi) ||
    (typeof data?.odometerMiles === "number" && data.odometerMiles) ||
    (typeof payload.odometer_mi === "number" && payload.odometer_mi) ||
    (typeof payload.odometerMiles === "number" && payload.odometerMiles);
  if (typeof miles === "number" && Number.isFinite(miles) && miles >= 0) return Math.round(miles);

  const meters =
    (typeof data?.odometerMeters === "number" && data.odometerMeters) ||
    (typeof payload.odometerMeters === "number" && payload.odometerMeters);
  if (typeof meters === "number" && Number.isFinite(meters) && meters >= 0) return Math.round(meters * 0.000621371);
  return null;
}

function parseLocation(payload: Record<string, unknown>): string | null {
  const data = asObject(payload.data);
  const location = asObject(data?.location) ?? asObject(payload.location);
  if (!location) return null;
  const city = asString(location.city);
  const state = asString(location.state);
  if (city && state) return `${city}, ${state}`;
  return city ?? state ?? null;
}

function extractDriverSamsaraId(payload: Record<string, unknown>): string | null {
  const data = asObject(payload.data);
  const driver = asObject(data?.driver) ?? asObject(payload.driver);
  return asString(driver?.id) ?? asString(data?.driverId) ?? asString(data?.driver_id) ?? asString(payload.driverId) ?? null;
}

function extractVehicleSamsaraId(payload: Record<string, unknown>): string | null {
  const data = asObject(payload.data);
  const vehicle = asObject(data?.vehicle) ?? asObject(payload.vehicle);
  return (
    asString(vehicle?.id) ??
    asString(data?.vehicleId) ??
    asString(data?.vehicle_id) ??
    asString(payload.vehicleId) ??
    asString(payload.vehicle_id)
  );
}

async function resolveLocalDriverId(client: DbClient, operatingCompanyId: string, samsaraDriverId: string): Promise<string | null> {
  const direct = await client.query<{ id: string }>(
    `
      SELECT d.id::text AS id
      FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid
        AND d.samsara_driver_id = $2
      LIMIT 1
    `,
    [operatingCompanyId, samsaraDriverId]
  );
  if (direct.rows[0]?.id) return direct.rows[0].id;
  const mirror = await client.query<{ local_driver_id: string | null }>(
    `
      SELECT sd.local_driver_id::text AS local_driver_id
      FROM integrations.samsara_drivers sd
      WHERE sd.operating_company_id = $1::uuid
        AND sd.samsara_driver_id = $2
      LIMIT 1
    `,
    [operatingCompanyId, samsaraDriverId]
  );
  return mirror.rows[0]?.local_driver_id ?? null;
}

async function resolveLocalUnitId(client: DbClient, operatingCompanyId: string, samsaraVehicleId: string | null): Promise<string | null> {
  if (!samsaraVehicleId) return null;
  const res = await client.query<{ local_unit_id: string | null }>(
    `
      SELECT sv.local_unit_id::text AS local_unit_id
      FROM integrations.samsara_vehicles sv
      WHERE sv.operating_company_id = $1::uuid
        AND sv.samsara_vehicle_id = $2
      LIMIT 1
    `,
    [operatingCompanyId, samsaraVehicleId]
  );
  return res.rows[0]?.local_unit_id ?? null;
}

export async function projectHosEvent(client: DbClient, event: SamsaraWebhookEvent): Promise<ProjectionResult> {
  const dutyStatus = parseDutyStatus(event.payload);
  const startedAt = parseStartedAt(event.payload);
  const endedAt = parseEndedAt(event.payload);
  const driverSamsaraId = extractDriverSamsaraId(event.payload);
  if (!dutyStatus || !startedAt || !driverSamsaraId) {
    return {
      success: false,
      classification: "permanent",
      error_class: "malformed_payload",
      error_message: "hos event missing required duty status, started_at, or driver id",
    };
  }

  const localDriverId = await resolveLocalDriverId(client, event.operating_company_id, driverSamsaraId);
  if (!localDriverId) {
    return {
      success: false,
      classification: "permanent",
      error_class: "fk_violation",
      error_message: "hos event driver id is not mapped to mdata.drivers",
    };
  }

  const resolvedUnitId = await resolveLocalUnitId(client, event.operating_company_id, extractVehicleSamsaraId(event.payload));
  const localUnitId =
    dutyStatus === "off_duty" || dutyStatus === "sleeper" || dutyStatus === "personal_conveyance" ? null : resolvedUnitId;
  const odometerMi = parseOdometerMiles(event.payload);
  const location = parseLocation(event.payload);

  await client.query(
    `
      INSERT INTO hos.duty_status_events (
        operating_company_id,
        driver_id,
        unit_id,
        duty_status,
        started_at,
        ended_at,
        source,
        odometer_mi,
        location
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::timestamptz, $6::timestamptz, 'samsara_eld', $7, $8)
      ON CONFLICT (operating_company_id, driver_id, duty_status, started_at, source)
      DO NOTHING
    `,
    [event.operating_company_id, localDriverId, localUnitId, dutyStatus, startedAt, endedAt, odometerMi, location]
  );

  return { success: true };
}
