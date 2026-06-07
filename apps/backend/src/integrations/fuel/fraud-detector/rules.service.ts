/**
 * GAP-61 / CAP-11 — Fuel card fraud detection rules.
 * Consumes GAP-59 telematics vehicle-driver pairing for unit context at txn time.
 */

export type FraudRuleId =
  | "RULE_GPS_MISMATCH"
  | "RULE_TANK_OVERFLOW"
  | "RULE_OFF_DUTY"
  | "RULE_RAPID_MULTI"
  | "RULE_INACTIVE_TRUCK";

export type FraudSeverity = "info" | "warn" | "critical";

export type FuelTransactionContext = {
  id: string;
  operating_company_id: string;
  unit_id: string | null;
  driver_id: string | null;
  transaction_at: string;
  gallons: number | null;
  location_lat: number | null;
  location_lng: number | null;
  location_city: string | null;
  location_state: string | null;
  pump_address: string | null;
};

export type RuleMatch = {
  rule_id: FraudRuleId;
  severity: FraudSeverity;
  evidence: Record<string, unknown>;
};

export type TruckLocationSnapshot = {
  lat: number;
  lng: number;
  captured_at: string;
  unit_id: string;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const GPS_MISMATCH_MILES = 1;
export const TANK_OVERFLOW_TOLERANCE = 1.1;
export const DEFAULT_TANK_CAPACITY_GAL = 150;
export const RAPID_MULTI_WINDOW_MIN = 30;
export const INACTIVE_STATIONARY_HOURS = 24;
export const INACTIVE_MAX_MOVEMENT_MILES = 0.25;

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  const meters = 6_371_000 * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - (s1 + s2)));
  return meters / 1609.344;
}

export function evaluateGpsMismatch(
  txn: FuelTransactionContext,
  truck: TruckLocationSnapshot | null
): RuleMatch | null {
  if (txn.location_lat == null || txn.location_lng == null || !truck) return null;
  const distanceMi = haversineMiles(txn.location_lat, txn.location_lng, truck.lat, truck.lng);
  if (distanceMi <= GPS_MISMATCH_MILES) return null;
  return {
    rule_id: "RULE_GPS_MISMATCH",
    severity: "critical",
    evidence: {
      pump_lat: txn.location_lat,
      pump_lng: txn.location_lng,
      truck_lat: truck.lat,
      truck_lng: truck.lng,
      distance_miles: Number(distanceMi.toFixed(2)),
      transaction_at: txn.transaction_at,
      pump_address: txn.pump_address,
      unit_id: truck.unit_id,
      driver_id: txn.driver_id,
    },
  };
}

export function evaluateTankOverflow(
  txn: FuelTransactionContext,
  tankCapacityGal: number | null
): RuleMatch | null {
  if (txn.gallons == null || txn.gallons <= 0) return null;
  const capacity = tankCapacityGal ?? DEFAULT_TANK_CAPACITY_GAL;
  const threshold = capacity * TANK_OVERFLOW_TOLERANCE;
  if (txn.gallons <= threshold) return null;
  return {
    rule_id: "RULE_TANK_OVERFLOW",
    severity: "warn",
    evidence: {
      gallons: txn.gallons,
      tank_capacity_gal: capacity,
      threshold_gal: Number(threshold.toFixed(2)),
      unit_id: txn.unit_id,
      transaction_at: txn.transaction_at,
    },
  };
}

export function evaluateOffDuty(txn: FuelTransactionContext, dutyStatus: string | null): RuleMatch | null {
  if (dutyStatus !== "off_duty") return null;
  return {
    rule_id: "RULE_OFF_DUTY",
    severity: "warn",
    evidence: {
      driver_id: txn.driver_id,
      duty_status: dutyStatus,
      transaction_at: txn.transaction_at,
      pump_address: txn.pump_address,
    },
  };
}

export type RecentTxnStub = {
  id: string;
  transaction_at: string;
  location_lat: number | null;
  location_lng: number | null;
  location_city: string | null;
  location_state: string | null;
};

export function evaluateRapidMulti(
  txn: FuelTransactionContext,
  recent: RecentTxnStub[]
): RuleMatch | null {
  const others = recent.filter((row) => row.id !== txn.id);
  if (others.length === 0) return null;

  const differentStation = others.some((row) => {
    if (
      txn.location_lat != null &&
      txn.location_lng != null &&
      row.location_lat != null &&
      row.location_lng != null
    ) {
      return haversineMiles(txn.location_lat, txn.location_lng, row.location_lat, row.location_lng) > 0.5;
    }
    const a = `${txn.location_city ?? ""}|${txn.location_state ?? ""}`.toLowerCase();
    const b = `${row.location_city ?? ""}|${row.location_state ?? ""}`.toLowerCase();
    return a !== b && a !== "|" && b !== "|";
  });

  if (!differentStation) return null;
  return {
    rule_id: "RULE_RAPID_MULTI",
    severity: "critical",
    evidence: {
      transaction_at: txn.transaction_at,
      related_transaction_ids: others.map((row) => row.id),
      window_minutes: RAPID_MULTI_WINDOW_MIN,
      pump_address: txn.pump_address,
    },
  };
}

export function evaluateInactiveTruck(
  txn: FuelTransactionContext,
  maxMovementMiles: number | null
): RuleMatch | null {
  if (maxMovementMiles == null) return null;
  if (maxMovementMiles > INACTIVE_MAX_MOVEMENT_MILES) return null;
  return {
    rule_id: "RULE_INACTIVE_TRUCK",
    severity: "warn",
    evidence: {
      unit_id: txn.unit_id,
      max_movement_miles_24h: Number(maxMovementMiles.toFixed(3)),
      stationary_hours: INACTIVE_STATIONARY_HOURS,
      transaction_at: txn.transaction_at,
      pump_address: txn.pump_address,
    },
  };
}

async function resolveUnitId(client: DbClient, txn: FuelTransactionContext): Promise<string | null> {
  if (txn.unit_id) return txn.unit_id;
  if (!txn.driver_id) return null;
  const res = await client.query<{ unit_id: string }>(
    `
      SELECT a.unit_id::text
      FROM telematics.vehicle_driver_assignments a
      WHERE a.operating_company_id = $1::uuid
        AND a.driver_id = $2::uuid
        AND a.started_at <= $3::timestamptz
        AND (a.ended_at IS NULL OR a.ended_at > $3::timestamptz)
      ORDER BY a.started_at DESC, a.created_at DESC
      LIMIT 1
    `,
    [txn.operating_company_id, txn.driver_id, txn.transaction_at]
  );
  return res.rows[0]?.unit_id ?? null;
}

async function fetchTruckLocationAtTime(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string,
  transactionAt: string
): Promise<TruckLocationSnapshot | null> {
  const res = await client.query<{ lat: number; lng: number; captured_at: string; unit_id: string }>(
    `
      SELECT
        v.lat::float8 AS lat,
        v.lng::float8 AS lng,
        v.captured_at::text AS captured_at,
        v.unit_id::text AS unit_id
      FROM telematics.vehicle_locations v
      WHERE v.operating_company_id = $1::uuid
        AND v.unit_id = $2::uuid
        AND v.captured_at BETWEEN $3::timestamptz - interval '15 minutes'
                              AND $3::timestamptz + interval '15 minutes'
      ORDER BY ABS(EXTRACT(EPOCH FROM (v.captured_at - $3::timestamptz))) ASC
      LIMIT 1
    `,
    [operatingCompanyId, unitId, transactionAt]
  );
  return res.rows[0] ?? null;
}

async function fetchTankCapacityGal(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string | null,
  loadId: string | null
): Promise<number | null> {
  if (loadId) {
    const routeRes = await client.query<{ fuel_capacity_gallons: number | null }>(
      `
        SELECT r.fuel_capacity_gallons::float8 AS fuel_capacity_gallons
        FROM fuel.route_recommendations r
        WHERE r.operating_company_id = $1::uuid
          AND r.load_id = $2::uuid
          AND r.fuel_capacity_gallons IS NOT NULL
        ORDER BY r.computed_at DESC
        LIMIT 1
      `,
      [operatingCompanyId, loadId]
    );
    if (routeRes.rows[0]?.fuel_capacity_gallons != null) {
      return Number(routeRes.rows[0].fuel_capacity_gallons);
    }
  }
  if (!unitId) return null;
  return DEFAULT_TANK_CAPACITY_GAL;
}

async function fetchDutyStatusAtTime(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string | null,
  transactionAt: string
): Promise<string | null> {
  if (!driverId) return null;
  const res = await client.query<{ duty_status: string }>(
    `
      SELECT e.duty_status
      FROM hos.duty_status_events e
      WHERE e.operating_company_id = $1::uuid
        AND e.driver_id = $2::uuid
        AND e.started_at <= $3::timestamptz
        AND (e.ended_at IS NULL OR e.ended_at > $3::timestamptz)
      ORDER BY e.started_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, driverId, transactionAt]
  );
  return res.rows[0]?.duty_status ?? null;
}

async function fetchRecentTransactions(
  client: DbClient,
  txn: FuelTransactionContext
): Promise<RecentTxnStub[]> {
  const res = await client.query<RecentTxnStub>(
    `
      SELECT
        ft.id::text AS id,
        ft.transaction_at::text AS transaction_at,
        ft.location_lat::float8 AS location_lat,
        ft.location_lng::float8 AS location_lng,
        ft.location_city,
        ft.location_state
      FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1::uuid
        AND ft.archived_at IS NULL
        AND ft.transaction_at BETWEEN $2::timestamptz - ($3::int || ' minutes')::interval
                                  AND $2::timestamptz + ($3::int || ' minutes')::interval
        AND (
          ft.driver_id = $4::uuid
          OR ($5::uuid IS NOT NULL AND ft.unit_id = $5::uuid)
        )
      ORDER BY ft.transaction_at ASC
    `,
    [txn.operating_company_id, txn.transaction_at, RAPID_MULTI_WINDOW_MIN, txn.driver_id, txn.unit_id]
  );
  return res.rows;
}

async function fetchMaxMovementMiles24h(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string,
  transactionAt: string
): Promise<number | null> {
  const res = await client.query<{ min_lat: number; max_lat: number; min_lng: number; max_lng: number; points: string }>(
    `
      SELECT
        MIN(v.lat::float8) AS min_lat,
        MAX(v.lat::float8) AS max_lat,
        MIN(v.lng::float8) AS min_lng,
        MAX(v.lng::float8) AS max_lng,
        COUNT(*)::text AS points
      FROM telematics.vehicle_locations v
      WHERE v.operating_company_id = $1::uuid
        AND v.unit_id = $2::uuid
        AND v.captured_at BETWEEN $3::timestamptz - interval '24 hours' AND $3::timestamptz
    `,
    [operatingCompanyId, unitId, transactionAt]
  );
  const row = res.rows[0];
  if (!row || Number(row.points) < 2) return null;
  const latSpan = haversineMiles(row.min_lat, row.min_lng, row.max_lat, row.min_lng);
  const lngSpan = haversineMiles(row.min_lat, row.min_lng, row.min_lat, row.max_lng);
  return Math.max(latSpan, lngSpan);
}

function pumpAddress(txn: FuelTransactionContext): string | null {
  const parts = [txn.location_city, txn.location_state].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function evaluateTransactionRules(
  client: DbClient,
  raw: Record<string, unknown>
): Promise<RuleMatch[]> {
  const txn: FuelTransactionContext = {
    id: String(raw.id),
    operating_company_id: String(raw.operating_company_id),
    unit_id: raw.unit_id ? String(raw.unit_id) : null,
    driver_id: raw.driver_id ? String(raw.driver_id) : null,
    transaction_at: String(raw.transaction_at),
    gallons: raw.gallons != null ? Number(raw.gallons) : null,
    location_lat: raw.location_lat != null ? Number(raw.location_lat) : null,
    location_lng: raw.location_lng != null ? Number(raw.location_lng) : null,
    location_city: raw.location_city ? String(raw.location_city) : null,
    location_state: raw.location_state ? String(raw.location_state) : null,
    pump_address: null,
  };
  txn.pump_address = pumpAddress(txn);

  const unitId = (await resolveUnitId(client, txn)) ?? txn.unit_id;
  txn.unit_id = unitId;

  const matches: RuleMatch[] = [];

  if (unitId) {
    const truck = await fetchTruckLocationAtTime(client, txn.operating_company_id, unitId, txn.transaction_at);
    const gps = evaluateGpsMismatch(txn, truck);
    if (gps) matches.push(gps);

    const movement = await fetchMaxMovementMiles24h(client, txn.operating_company_id, unitId, txn.transaction_at);
    const inactive = evaluateInactiveTruck(txn, movement);
    if (inactive) matches.push(inactive);
  }

  const tankCapacity = await fetchTankCapacityGal(
    client,
    txn.operating_company_id,
    unitId,
    raw.load_id ? String(raw.load_id) : null
  );
  const overflow = evaluateTankOverflow(txn, tankCapacity);
  if (overflow) matches.push(overflow);

  const dutyStatus = await fetchDutyStatusAtTime(client, txn.operating_company_id, txn.driver_id, txn.transaction_at);
  const offDuty = evaluateOffDuty(txn, dutyStatus);
  if (offDuty) matches.push(offDuty);

  const recent = await fetchRecentTransactions(client, txn);
  const rapid = evaluateRapidMulti(txn, recent);
  if (rapid) matches.push(rapid);

  return matches;
}

export async function insertFraudAlerts(
  client: DbClient,
  operatingCompanyId: string,
  fuelTransactionId: string,
  matches: RuleMatch[]
): Promise<Array<{ alertId: string; match: RuleMatch }>> {
  const created: Array<{ alertId: string; match: RuleMatch }> = [];
  for (const match of matches) {
    const res = await client.query<{ uuid: string }>(
      `
        INSERT INTO fuel.fraud_alerts (
          operating_company_id, fuel_transaction_uuid, rule_id, severity, evidence, status
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, 'open')
        ON CONFLICT (operating_company_id, fuel_transaction_uuid, rule_id) DO NOTHING
        RETURNING uuid::text
      `,
      [operatingCompanyId, fuelTransactionId, match.rule_id, match.severity, JSON.stringify(match.evidence)]
    );
    if (res.rows[0]?.uuid) created.push({ alertId: res.rows[0].uuid, match });
  }
  return created;
}
