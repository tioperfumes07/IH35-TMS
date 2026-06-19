/**
 * GAP-59 / CAP-9 — Vehicle-driver pairing at time of event.
 * Wrapper around telematics.vehicle_driver_assignments (migration 0221).
 */
import { decryptSamsaraSecret } from "../../../lib/samsara-crypto.js";
import { withCircuitBreaker } from "../../../lib/circuit-breaker/index.js";
import { samsaraFetch } from "../samsara-client.js";
import { getDriverForVehicleAtTime } from "../../../telematics/vehicle-driver-lookup.service.js";

const SAMSARA_API_BASE = "https://api.samsara.com";
export const OVERLAP_STOP_THRESHOLD_RATIO = 0.05;

export type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type PairingAssignmentRow = {
  id: string;
  unit_id: string;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  started_at: string;
  ended_at: string | null;
  source: string;
};

export type SamsaraVehicleAssignment = {
  samsara_vehicle_id: string;
  samsara_driver_id: string;
  started_at: string;
  ended_at: string | null;
  samsara_assignment_id: string;
};

export type SyncFromSamsaraResult = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  overlap_flags_created: number;
  overlap_ratio: number;
  overlap_stop_triggered: boolean;
};

export type OverlapFlagRow = {
  id: string;
  driver_id: string;
  assignment_id_a: string;
  assignment_id_b: string;
  unit_id_a: string;
  unit_id_b: string;
  overlap_started_at: string;
  overlap_ended_at: string | null;
};

type SamsaraConfigRow = {
  api_token_encrypted?: Buffer | null;
  encrypted_api_token?: Buffer | null;
};

function encryptedTokenFromRow(row: SamsaraConfigRow | null): Buffer | null {
  if (!row) return null;
  if (Buffer.isBuffer(row.encrypted_api_token) && row.encrypted_api_token.length > 0) return row.encrypted_api_token;
  if (Buffer.isBuffer(row.api_token_encrypted) && row.api_token_encrypted.length > 0) return row.api_token_encrypted;
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function extractString(...candidates: unknown[]): string | null {
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

export function buildSamsaraAssignmentId(
  samsaraVehicleId: string,
  samsaraDriverId: string,
  startedAt: string
): string {
  return `${samsaraVehicleId}:${samsaraDriverId}:${startedAt}`;
}

export function intervalsOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null
): boolean {
  const aStartMs = Date.parse(aStart);
  const aEndMs = aEnd ? Date.parse(aEnd) : Number.POSITIVE_INFINITY;
  const bStartMs = Date.parse(bStart);
  const bEndMs = bEnd ? Date.parse(bEnd) : Number.POSITIVE_INFINITY;
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

export function computeOverlapRatio(overlappingAssignments: number, totalAssignments: number): number {
  if (totalAssignments <= 0) return 0;
  return overlappingAssignments / totalAssignments;
}

async function resolveSamsaraApiToken(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  const cfg = await client.query<SamsaraConfigRow>(
    `
      SELECT api_token_encrypted, encrypted_api_token
      FROM integrations.samsara_config
      WHERE operating_company_id = $1::uuid
        AND is_enabled = true
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const row = cfg.rows[0] ?? null;
  return decryptSamsaraSecret(encryptedTokenFromRow(row));
}

export function parseSamsaraVehicleAssignments(json: Record<string, unknown>): SamsaraVehicleAssignment[] {
  const rows = Array.isArray(json.data) ? json.data : [];
  const out: SamsaraVehicleAssignment[] = [];

  for (const rawRow of rows) {
    const vehicle = asObject(rawRow);
    if (!vehicle) continue;
    const samsaraVehicleId = extractString(vehicle.id);
    if (!samsaraVehicleId) continue;

    const assignments = Array.isArray(vehicle.driverAssignments) ? vehicle.driverAssignments : [];
    for (const rawAssignment of assignments) {
      const assignment = asObject(rawAssignment);
      if (!assignment) continue;
      const driver = asObject(assignment.driver);
      const samsaraDriverId = extractString(driver?.id, assignment.driverId);
      // Require ONLY a driver. Samsara's CURRENT (open) assignment objects don't reliably carry a
      // startTime in the fields we check — the old `|| !startedAt` dropped EVERY current assignment, so
      // the worker wrote 0 while the probe (which doesn't need startTime) resolved all of them. Fall back
      // to now() for the timestamp and use a stable time-less id so repeated syncs dedup, not churn.
      if (!samsaraDriverId) continue;
      const startedAt = extractString(assignment.startTime, assignment.startedAt, assignment.start_time);
      const endedAt = extractString(assignment.endTime, assignment.endedAt, assignment.end_time);
      const startedAtIso = startedAt ? new Date(startedAt).toISOString() : new Date().toISOString();
      out.push({
        samsara_vehicle_id: samsaraVehicleId,
        samsara_driver_id: samsaraDriverId,
        started_at: startedAtIso,
        ended_at: endedAt ? new Date(endedAt).toISOString() : null,
        samsara_assignment_id: startedAt
          ? buildSamsaraAssignmentId(samsaraVehicleId, samsaraDriverId, startedAtIso)
          : `${samsaraVehicleId}:${samsaraDriverId}:current`,
      });
    }
  }

  return out;
}

async function fetchSamsaraVehicleAssignmentsPage(
  token: string,
  startTime: string,
  endTime: string,
  after: string | null
): Promise<{ assignments: SamsaraVehicleAssignment[]; hasNextPage: boolean; cursor: string | null }> {
  const url = new URL(`${SAMSARA_API_BASE}/fleet/vehicles/driver-assignments`);
  url.searchParams.set("startTime", startTime);
  url.searchParams.set("endTime", endTime);
  url.searchParams.set("limit", "512");
  if (after) url.searchParams.set("after", after);

  const res = await withCircuitBreaker("samsara", () =>
    samsaraFetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })
  );
  if (!res.ok) {
    throw new Error(`samsara_vehicle_assignments_http_${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const pagination = asObject(json.pagination);
  const hasNextPage = Boolean(pagination?.hasNextPage);
  const cursor =
    typeof pagination?.endCursor === "string" && pagination.endCursor.trim().length > 0
      ? pagination.endCursor.trim()
      : null;

  return {
    assignments: parseSamsaraVehicleAssignments(json),
    hasNextPage,
    cursor,
  };
}

export async function fetchSamsaraVehicleAssignments(
  token: string,
  startTime: string,
  endTime: string
): Promise<SamsaraVehicleAssignment[]> {
  const out: SamsaraVehicleAssignment[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const pageResult = await fetchSamsaraVehicleAssignmentsPage(token, startTime, endTime, after);
    out.push(...pageResult.assignments);
    if (!pageResult.hasNextPage || !pageResult.cursor) break;
    after = pageResult.cursor;
  }
  return out;
}

async function resolveLocalUnitAndDriver(
  client: DbClient,
  operatingCompanyId: string,
  samsaraVehicleId: string,
  samsaraDriverId: string
): Promise<{ unit_id: string; driver_id: string | null } | null> {
  // PRIMARY: resolve the unit on the SAME key the fleet board + position ingest use
  // (mdata.units.samsara_vehicle_id). The old equipment-keyed lookup dropped most logged-in drivers
  // because mdata.equipment.samsara_vehicle_id is not populated the way mdata.units.samsara_vehicle_id is
  // — so the assignment got written against a unit the board never reads (or skipped entirely).
  const unitsRes = await client.query<{ unit_id: string }>(
    `
      SELECT id::text AS unit_id
      FROM mdata.units
      WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
        AND samsara_vehicle_id = $2
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, samsaraVehicleId]
  );
  let unitId = unitsRes.rows[0]?.unit_id;
  if (!unitId) {
    // FALLBACK: legacy equipment-keyed mapping (kept so nothing that worked before regresses).
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
      [operatingCompanyId, samsaraVehicleId]
    );
    unitId = unitRes.rows[0]?.unit_id;
  }
  if (!unitId) return null;

  const driverRes = await client.query<{ driver_id: string }>(
    `
      SELECT d.id::text AS driver_id
      FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid
        AND d.samsara_driver_id = $2
      LIMIT 1
    `,
    [operatingCompanyId, samsaraDriverId]
  );

  return {
    unit_id: unitId,
    driver_id: driverRes.rows[0]?.driver_id ?? null,
  };
}

async function upsertSamsaraAssignment(
  client: DbClient,
  operatingCompanyId: string,
  assignment: SamsaraVehicleAssignment,
  local: { unit_id: string; driver_id: string | null }
): Promise<"inserted" | "updated" | "skipped"> {
  const existing = await client.query<{ id: string; ended_at: string | null }>(
    `
      SELECT id::text, ended_at::text
      FROM telematics.vehicle_driver_assignments
      WHERE operating_company_id = $1::uuid
        AND samsara_assignment_id = $2
      LIMIT 1
    `,
    [operatingCompanyId, assignment.samsara_assignment_id]
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (!row.ended_at && assignment.ended_at) {
      await client.query(
        `
          UPDATE telematics.vehicle_driver_assignments
          SET ended_at = $3::timestamptz
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND ended_at IS NULL
        `,
        [row.id, operatingCompanyId, assignment.ended_at]
      );
      return "updated";
    }
    return "skipped";
  }

  // Driver handoff: keep exactly ONE open assignment per unit = the current driver. Before inserting the
  // current open assignment, end any other open one on this unit (the board reads the open assignment).
  if (!assignment.ended_at) {
    await client.query(
      `
        UPDATE telematics.vehicle_driver_assignments
        SET ended_at = now()
        WHERE operating_company_id = $1::uuid
          AND unit_id = $2::uuid
          AND ended_at IS NULL
          AND samsara_assignment_id IS DISTINCT FROM $3
      `,
      [operatingCompanyId, local.unit_id, assignment.samsara_assignment_id]
    );
  }

  await client.query(
    `
      INSERT INTO telematics.vehicle_driver_assignments (
        operating_company_id,
        unit_id,
        driver_id,
        started_at,
        ended_at,
        source,
        samsara_assignment_id
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz, 'reconciled', $6)
      ON CONFLICT DO NOTHING
    `,
    [
      operatingCompanyId,
      local.unit_id,
      local.driver_id,
      assignment.started_at,
      assignment.ended_at,
      assignment.samsara_assignment_id,
    ]
  );
  return "inserted";
}

export async function detectAndFlagOverlaps(
  client: DbClient,
  operatingCompanyId: string,
  lookbackDays = 30
): Promise<{ flags_created: number; overlapping_assignments: number; total_assignments: number; overlap_ratio: number }> {
  const totals = await client.query<{ total: string; overlapping: string }>(
    `
      WITH scoped AS (
        SELECT id, driver_id, unit_id, started_at, ended_at
        FROM telematics.vehicle_driver_assignments
        WHERE operating_company_id = $1::uuid
          AND driver_id IS NOT NULL
          AND started_at >= now() - ($2::int || ' days')::interval
      ),
      overlaps AS (
        SELECT DISTINCT a.id AS assignment_id
        FROM scoped a
        JOIN scoped b
          ON a.driver_id = b.driver_id
         AND a.id < b.id
         AND a.unit_id <> b.unit_id
         AND a.started_at < COALESCE(b.ended_at, 'infinity'::timestamptz)
         AND COALESCE(a.ended_at, 'infinity'::timestamptz) > b.started_at
      )
      SELECT
        (SELECT COUNT(*)::text FROM scoped) AS total,
        (SELECT COUNT(*)::text FROM overlaps) AS overlapping
    `,
    [operatingCompanyId, lookbackDays]
  );

  const totalAssignments = Number(totals.rows[0]?.total ?? 0);
  const overlappingAssignments = Number(totals.rows[0]?.overlapping ?? 0);
  const overlapRatio = computeOverlapRatio(overlappingAssignments, totalAssignments);

  const overlapRows = await client.query<{
    driver_id: string;
    assignment_id_a: string;
    assignment_id_b: string;
    unit_id_a: string;
    unit_id_b: string;
    overlap_started_at: string;
    overlap_ended_at: string | null;
  }>(
    `
      WITH scoped AS (
        SELECT id, driver_id, unit_id, started_at, ended_at
        FROM telematics.vehicle_driver_assignments
        WHERE operating_company_id = $1::uuid
          AND driver_id IS NOT NULL
          AND started_at >= now() - ($2::int || ' days')::interval
      )
      SELECT
        a.driver_id::text,
        a.id::text AS assignment_id_a,
        b.id::text AS assignment_id_b,
        a.unit_id::text AS unit_id_a,
        b.unit_id::text AS unit_id_b,
        GREATEST(a.started_at, b.started_at)::text AS overlap_started_at,
        LEAST(COALESCE(a.ended_at, 'infinity'::timestamptz), COALESCE(b.ended_at, 'infinity'::timestamptz))::text AS overlap_ended_at
      FROM scoped a
      JOIN scoped b
        ON a.driver_id = b.driver_id
       AND a.id < b.id
       AND a.unit_id <> b.unit_id
       AND a.started_at < COALESCE(b.ended_at, 'infinity'::timestamptz)
       AND COALESCE(a.ended_at, 'infinity'::timestamptz) > b.started_at
      ORDER BY overlap_started_at DESC
      LIMIT 500
    `,
    [operatingCompanyId, lookbackDays]
  );

  let flagsCreated = 0;
  for (const row of overlapRows.rows) {
    const overlapEndedAt =
      row.overlap_ended_at && row.overlap_ended_at !== "infinity" ? row.overlap_ended_at : null;
    const insert = await client.query<{ id: string }>(
      `
        INSERT INTO telematics.vehicle_driver_pairing_overlap_flags (
          operating_company_id,
          driver_id,
          assignment_id_a,
          assignment_id_b,
          unit_id_a,
          unit_id_b,
          overlap_started_at,
          overlap_ended_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::timestamptz, $8::timestamptz)
        ON CONFLICT DO NOTHING
        RETURNING id::text
      `,
      [
        operatingCompanyId,
        row.driver_id,
        row.assignment_id_a,
        row.assignment_id_b,
        row.unit_id_a,
        row.unit_id_b,
        row.overlap_started_at,
        overlapEndedAt,
      ]
    );
    if (insert.rows[0]) flagsCreated += 1;
  }

  return {
    flags_created: flagsCreated,
    overlapping_assignments: overlappingAssignments,
    total_assignments: totalAssignments,
    overlap_ratio: overlapRatio,
  };
}

// Make the pairing sync OBSERVABLE — its errors used to be swallowed (only a cron warning), so a
// failing pairing sync was invisible while the sibling stats cron looked healthy. Writes a row to
// integrations.integration_sync_log so the probe's last_samsara_sync surfaces success/failure + the error.
async function writePairingSyncLog(
  client: DbClient,
  operatingCompanyId: string,
  success: boolean,
  result: SyncFromSamsaraResult,
  errorMessage: string | null
): Promise<void> {
  const exists = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('integrations.integration_sync_log') IS NOT NULL AS ok`
  );
  if (!exists.rows[0]?.ok) return;
  await client.query(
    `
      INSERT INTO integrations.integration_sync_log (
        operating_company_id, integration, sync_kind, finished_at, success,
        rows_added, rows_updated, rows_removed, error_message, payload
      ) VALUES ($1, 'samsara', 'vehicle_driver_pairing', now(), $2, $3, $4, 0, $5, $6::jsonb)
    `,
    [
      operatingCompanyId,
      success,
      result.inserted,
      result.updated,
      errorMessage,
      JSON.stringify({ fetched: result.fetched, skipped: result.skipped }),
    ]
  );
}

export async function syncFromSamsara(
  client: DbClient,
  operatingCompanyId: string,
  options?: { lookbackHours?: number }
): Promise<SyncFromSamsaraResult> {
  // Default 1h — the /fleet/vehicles/driver-assignments call works at 1h (the probe proves it) but a large
  // window appears to error, which silently broke the worker. A current assignment overlaps a 1h window
  // regardless of when it started, so 1h captures every logged-in driver.
  const lookbackHours = options?.lookbackHours ?? 1;
  const token = await resolveSamsaraApiToken(client, operatingCompanyId);
  const result: SyncFromSamsaraResult = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    overlap_flags_created: 0,
    overlap_ratio: 0,
    overlap_stop_triggered: false,
  };

  if (!token) return result;

  try {
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
    const assignments = await fetchSamsaraVehicleAssignments(token, startTime, endTime);
    result.fetched = assignments.length;

    for (const assignment of assignments) {
      const local = await resolveLocalUnitAndDriver(
        client,
        operatingCompanyId,
        assignment.samsara_vehicle_id,
        assignment.samsara_driver_id
      );
      if (!local) {
        result.skipped += 1;
        continue;
      }
      const action = await upsertSamsaraAssignment(client, operatingCompanyId, assignment, local);
      if (action === "inserted") result.inserted += 1;
      else if (action === "updated") result.updated += 1;
      else result.skipped += 1;
    }

    const overlap = await detectAndFlagOverlaps(client, operatingCompanyId);
    result.overlap_flags_created = overlap.flags_created;
    result.overlap_ratio = overlap.overlap_ratio;
    result.overlap_stop_triggered = overlap.overlap_ratio > OVERLAP_STOP_THRESHOLD_RATIO;

    await writePairingSyncLog(client, operatingCompanyId, true, result, null);
    return result;
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    await writePairingSyncLog(client, operatingCompanyId, false, result, message).catch(() => undefined);
    throw err;
  }
}

export async function lookupDriverForVehicleAtTime(
  client: DbClient,
  operatingCompanyId: string,
  vehicleId: string,
  atTime: string
): Promise<string | null> {
  return getDriverForVehicleAtTime(client, operatingCompanyId, vehicleId, atTime);
}

export async function getDriverPairingHistory(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string,
  from: string,
  to: string
): Promise<PairingAssignmentRow[]> {
  const res = await client.query<PairingAssignmentRow>(
    `
      SELECT
        a.id::text,
        a.unit_id::text,
        u.unit_number,
        a.driver_id::text,
        CASE
          WHEN d.id IS NULL THEN NULL
          ELSE trim(concat(coalesce(d.first_name, ''), ' ', coalesce(d.last_name, '')))
        END AS driver_name,
        a.started_at::text,
        a.ended_at::text,
        a.source
      FROM telematics.vehicle_driver_assignments a
      JOIN mdata.units u ON u.id = a.unit_id
      LEFT JOIN mdata.drivers d ON d.id = a.driver_id
      WHERE a.operating_company_id = $1::uuid
        AND a.driver_id = $2::uuid
        AND a.started_at <= $4::timestamptz
        AND (a.ended_at IS NULL OR a.ended_at >= $3::timestamptz)
      ORDER BY a.started_at DESC, a.created_at DESC
      LIMIT 500
    `,
    [operatingCompanyId, driverId, from, to]
  );
  return res.rows;
}

export type ManualOverrideInput = {
  operating_company_id: string;
  vehicle_id: string;
  driver_id: string;
  started_at?: string;
  ended_at?: string | null;
  created_by_user_uuid: string;
};

export async function applyManualOverride(
  client: DbClient,
  input: ManualOverrideInput
): Promise<{ assignment_id: string }> {
  const startedAt = input.started_at ?? new Date().toISOString();

  const open = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM telematics.vehicle_driver_assignments
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND ended_at IS NULL
      ORDER BY started_at DESC, created_at DESC
      LIMIT 1
    `,
    [input.operating_company_id, input.vehicle_id]
  );

  if (open.rows[0]) {
    await client.query(
      `
        UPDATE telematics.vehicle_driver_assignments
        SET ended_at = $3::timestamptz
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND ended_at IS NULL
      `,
      [open.rows[0].id, input.operating_company_id, startedAt]
    );
  }

  const insert = await client.query<{ id: string }>(
    `
      INSERT INTO telematics.vehicle_driver_assignments (
        operating_company_id,
        unit_id,
        driver_id,
        started_at,
        ended_at,
        source,
        created_by_user_uuid
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz, 'manual_override', $6::uuid)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.vehicle_id,
      input.driver_id,
      startedAt,
      input.ended_at ?? null,
      input.created_by_user_uuid,
    ]
  );

  const assignmentId = insert.rows[0]?.id;
  if (!assignmentId) throw new Error("manual_override_insert_failed");
  return { assignment_id: assignmentId };
}
