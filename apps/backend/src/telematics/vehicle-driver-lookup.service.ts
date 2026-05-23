type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type SamsaraWebhookEvent = {
  id: string;
  operating_company_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: string;
};

type OpenAssignmentRow = {
  id: string;
  driver_id: string | null;
  started_at: string;
};

type AssignmentAction = {
  close_open_assignment: boolean;
  insert_new_assignment: boolean;
};

type AssignmentEventType = "assign" | "unassign" | null;

type LocalIds = {
  unit_id: string;
  driver_id: string | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractString(...candidates: unknown[]): string | null {
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function resolveEventTimestamp(event: SamsaraWebhookEvent): string {
  const payload = event.payload;
  const data = asObject(payload.data);
  return (
    extractString(payload.occurredAt, payload.occurred_at, payload.eventTime, payload.timestamp, payload.time, data?.occurredAt, data?.occurred_at, data?.timestamp) ??
    event.received_at
  );
}

function extractSamsaraVehicleId(event: SamsaraWebhookEvent, fallbackVehicleId?: string | null): string | null {
  const payload = event.payload;
  const data = asObject(payload.data);
  const vehicle = asObject(data?.vehicle) ?? asObject(payload.vehicle);
  const assignment = asObject(data?.assignment) ?? asObject(payload.assignment);
  const assignmentVehicle = asObject(assignment?.vehicle);
  return extractString(
    fallbackVehicleId,
    vehicle?.id,
    assignmentVehicle?.id,
    data?.vehicleId,
    data?.vehicle_id,
    payload.vehicleId,
    payload.vehicle_id
  );
}

function extractSamsaraDriverId(event: SamsaraWebhookEvent): string | null {
  const payload = event.payload;
  const data = asObject(payload.data);
  const driver = asObject(data?.driver) ?? asObject(payload.driver);
  const assignment = asObject(data?.assignment) ?? asObject(payload.assignment);
  const assignmentDriver = asObject(assignment?.driver);
  return extractString(
    driver?.id,
    assignmentDriver?.id,
    data?.driverId,
    data?.driver_id,
    payload.driverId,
    payload.driver_id
  );
}

function classifyAssignmentEvent(eventType: string): AssignmentEventType {
  const normalized = eventType.trim().toLowerCase();
  if (
    normalized.includes("driver_log_on") ||
    normalized.includes("driver.log_on") ||
    normalized.includes("vehicle_assigned") ||
    normalized.includes("vehicle.assigned")
  ) {
    return "assign";
  }

  if (
    normalized.includes("driver_log_off") ||
    normalized.includes("driver.log_off") ||
    normalized.includes("vehicle_unassigned") ||
    normalized.includes("vehicle.unassigned")
  ) {
    return "unassign";
  }

  return null;
}

export function computeAssignmentAction(
  openAssignment: OpenAssignmentRow | null,
  assignmentType: AssignmentEventType,
  nextDriverId: string | null,
  occurredAtIso: string
): AssignmentAction {
  if (!assignmentType) return { close_open_assignment: false, insert_new_assignment: false };

  if (assignmentType === "assign") {
    if (!nextDriverId) return { close_open_assignment: false, insert_new_assignment: false };
    if (!openAssignment) return { close_open_assignment: false, insert_new_assignment: true };
    if (openAssignment.driver_id === nextDriverId) return { close_open_assignment: false, insert_new_assignment: false };
    if (new Date(occurredAtIso).getTime() <= new Date(openAssignment.started_at).getTime()) {
      return { close_open_assignment: false, insert_new_assignment: false };
    }
    return { close_open_assignment: true, insert_new_assignment: true };
  }

  if (!openAssignment) return { close_open_assignment: false, insert_new_assignment: false };
  if (new Date(occurredAtIso).getTime() <= new Date(openAssignment.started_at).getTime()) {
    return { close_open_assignment: false, insert_new_assignment: false };
  }
  return { close_open_assignment: true, insert_new_assignment: false };
}

async function resolveLocalIds(client: DbClient, event: SamsaraWebhookEvent, fallbackVehicleId?: string | null): Promise<LocalIds | null> {
  const samsaraVehicleId = extractSamsaraVehicleId(event, fallbackVehicleId);
  if (!samsaraVehicleId) return null;

  const unitRes = await client.query<{ unit_id: string }>(
    `
      SELECT e.current_unit_id::text AS unit_id
      FROM mdata.equipment e
      WHERE COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = $1::uuid
        AND e.samsara_vehicle_id = $2
        AND e.current_unit_id IS NOT NULL
      ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC
      LIMIT 1
    `,
    [event.operating_company_id, samsaraVehicleId]
  );
  const unitId = unitRes.rows[0]?.unit_id;
  if (!unitId) return null;

  const samsaraDriverId = extractSamsaraDriverId(event);
  if (!samsaraDriverId) return { unit_id: unitId, driver_id: null };

  const driverRes = await client.query<{ driver_id: string }>(
    `
      SELECT d.id::text AS driver_id
      FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid
        AND d.samsara_driver_id = $2
      LIMIT 1
    `,
    [event.operating_company_id, samsaraDriverId]
  );
  return {
    unit_id: unitId,
    driver_id: driverRes.rows[0]?.driver_id ?? null,
  };
}

async function getOpenAssignment(client: DbClient, operatingCompanyId: string, unitId: string): Promise<OpenAssignmentRow | null> {
  const res = await client.query<OpenAssignmentRow>(
    `
      SELECT id::text, driver_id::text, started_at::text
      FROM telematics.vehicle_driver_assignments
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND ended_at IS NULL
      ORDER BY started_at DESC, created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, unitId]
  );
  return res.rows[0] ?? null;
}

export async function processVehicleDriverPairingWebhookEvent(
  client: DbClient,
  event: SamsaraWebhookEvent,
  fallbackVehicleId?: string | null
): Promise<void> {
  const assignmentType = classifyAssignmentEvent(event.event_type);
  if (!assignmentType) return;

  const ids = await resolveLocalIds(client, event, fallbackVehicleId);
  if (!ids) return;

  const occurredAt = resolveEventTimestamp(event);
  const openAssignment = await getOpenAssignment(client, event.operating_company_id, ids.unit_id);
  const action = computeAssignmentAction(openAssignment, assignmentType, ids.driver_id, occurredAt);

  if (action.close_open_assignment && openAssignment) {
    await client.query(
      `
        UPDATE telematics.vehicle_driver_assignments
        SET ended_at = $3::timestamptz
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND ended_at IS NULL
      `,
      [openAssignment.id, event.operating_company_id, occurredAt]
    );
  }

  if (action.insert_new_assignment) {
    await client.query(
      `
        INSERT INTO telematics.vehicle_driver_assignments (
          operating_company_id,
          unit_id,
          driver_id,
          started_at,
          source,
          raw_event_id
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::timestamptz,
          'samsara_webhook',
          $5::uuid
        )
        ON CONFLICT (raw_event_id) DO NOTHING
      `,
      [event.operating_company_id, ids.unit_id, ids.driver_id, occurredAt, event.id]
    );
  }
}

export async function getDriverForVehicleAtTime(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string,
  ts: string
): Promise<string | null> {
  const res = await client.query<{ driver_id: string | null }>(
    `
      SELECT driver_id::text
      FROM telematics.vehicle_driver_assignments
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND started_at <= $3::timestamptz
        AND (ended_at IS NULL OR ended_at > $3::timestamptz)
      ORDER BY started_at DESC, created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, unitId, ts]
  );
  return res.rows[0]?.driver_id ?? null;
}
