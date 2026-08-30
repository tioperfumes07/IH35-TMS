import { appendCustodyEvent, type CustodyEvent } from "../../documents/chain-of-custody.service.js";
import { validateAndPreserveExif } from "../../documents/exif-preserver.js";
import { generatePresignedDownloadUrl, putObjectBytes } from "../../storage/r2-client.js";

export const PHOTO_ANGLES = [
  "front",
  "rear",
  "driver-side",
  "passenger-side",
  "front-left",
  "front-right",
  "rear-left",
  "rear-right",
] as const;

export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export type DiffStatus =
  | "pending"
  | "analyzing"
  | "clean"
  | "damage_detected"
  | "review_required"
  | "manual_override";

export type PhotoComparisonFinding = {
  location: string;
  severity: string;
  description: string;
  confidence: number;
};

export type AnglePairFinding = {
  angle_label: string;
  pre_evidence_uuid: string;
  post_evidence_uuid: string;
  has_new_damage: boolean;
  findings: PhotoComparisonFinding[];
};

export type PhotoEvidenceDetail = {
  id: string;
  r2_object_key: string;
  sha256_hash: string;
  exif_metadata: Record<string, unknown>;
  custody_events: CustodyEvent[];
  angle_label: string | null;
  download_url?: string;
};

export type PhotoComparisonSession = {
  uuid: string;
  operating_company_id: string;
  load_uuid: string | null;
  driver_uuid: string;
  unit_uuid: string;
  pre_trip_session_at: string;
  pre_trip_evidence_uuids: string[];
  post_trip_session_at: string | null;
  post_trip_evidence_uuids: string[] | null;
  diff_status: DiffStatus;
  diff_findings: AnglePairFinding[] | null;
  diff_summary: string | null;
  diff_completed_at: string | null;
  auto_damage_report_uuid: string | null;
  driver_name?: string | null;
  unit_number?: string | null;
  load_number?: string | null;
  created_at: string;
  pre_trip_photos?: PhotoEvidenceDetail[];
  post_trip_photos?: PhotoEvidenceDetail[];
};

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function isPhotoComparisonFinding(value: unknown): value is PhotoComparisonFinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const finding = value as Record<string, unknown>;
  return (
    typeof finding.location === "string" &&
    typeof finding.severity === "string" &&
    typeof finding.description === "string" &&
    typeof finding.confidence === "number" &&
    Number.isFinite(finding.confidence)
  );
}

function isAnglePairFinding(value: unknown): value is AnglePairFinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const finding = value as Record<string, unknown>;
  return (
    typeof finding.angle_label === "string" &&
    typeof finding.pre_evidence_uuid === "string" &&
    typeof finding.post_evidence_uuid === "string" &&
    typeof finding.has_new_damage === "boolean" &&
    Array.isArray(finding.findings) &&
    finding.findings.every(isPhotoComparisonFinding)
  );
}

export function normalizeSessionDiffFindings(
  status: DiffStatus,
  value: unknown
): AnglePairFinding[] | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.every(isAnglePairFinding)) return value;
  // Pending/analyzing sessions have no verdict yet. An older TEST writer stored
  // an empty JSON object for some rows; that object is not comparison evidence.
  if ((status === "pending" || status === "analyzing") && typeof value === "object") return null;
  throw new Error("photo_comparison_diff_findings_invalid");
}

function normalizeSessionRow(row: PhotoComparisonSession): PhotoComparisonSession {
  return {
    ...row,
    diff_findings: normalizeSessionDiffFindings(row.diff_status, row.diff_findings),
  };
}

const SESSION_COLUMNS = `
  uuid::text,
  operating_company_id::text,
  load_uuid::text,
  driver_uuid::text,
  unit_uuid::text,
  pre_trip_session_at::text,
  pre_trip_evidence_uuids,
  post_trip_session_at::text,
  post_trip_evidence_uuids,
  diff_status,
  diff_findings,
  diff_summary,
  diff_completed_at::text,
  auto_damage_report_uuid::text,
  created_at::text
`;

const SESSION_HUMAN_LABEL_COLUMNS = `
  mdata.resolve_driver_label_same_company(s.driver_uuid, s.operating_company_id) AS driver_name,
  (
    SELECT NULLIF(TRIM(u.unit_number), '')
    FROM mdata.units u
    WHERE u.id = s.unit_uuid
      AND (u.owner_company_id = s.operating_company_id OR u.currently_leased_to_company_id = s.operating_company_id)
    LIMIT 1
  ) AS unit_number,
  (
    SELECT NULLIF(TRIM(l.load_number), '')
    FROM mdata.loads l
    WHERE l.id = s.load_uuid
      AND l.operating_company_id = s.operating_company_id
    LIMIT 1
  ) AS load_number
`;

function angleFromMetadata(metadata: Record<string, unknown>): string | null {
  const angle = metadata.angle_label;
  return typeof angle === "string" && angle.length > 0 ? angle : null;
}

async function assertTripPhotoLinksCompany(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    loadUuid: string | null;
    driverUuid: string;
    unitUuid: string;
    evidenceUuids?: string[];
  }
): Promise<void> {
  const result = await client.query<{
    driver_ok: boolean;
    unit_ok: boolean;
    load_ok: boolean;
    evidence_ok: boolean;
  }>(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM mdata.drivers d
          WHERE d.id = $2::uuid
            AND d.deactivated_at IS NULL
            AND (
              d.operating_company_id = $1::uuid
              OR EXISTS (
                SELECT 1
                FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = d.id
                  AND dca.company_id = $1::uuid
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
              )
            )
        ) AS driver_ok,
        EXISTS (
          SELECT 1
          FROM mdata.units u
          WHERE u.id = $3::uuid
            AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)
        ) AS unit_ok,
        (
          $4::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM mdata.loads l
            WHERE l.id = $4::uuid
              AND l.operating_company_id = $1::uuid
              AND l.soft_deleted_at IS NULL
          )
        ) AS load_ok,
        NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE($5::uuid[], ARRAY[]::uuid[])) evidence_id
          WHERE NOT EXISTS (
            SELECT 1
            FROM documents.damage_photo_evidence evidence
            WHERE evidence.id = evidence_id
              AND evidence.operating_company_id = $1::uuid
          )
        ) AS evidence_ok
    `,
    [input.operatingCompanyId, input.driverUuid, input.unitUuid, input.loadUuid, input.evidenceUuids ?? []]
  );
  const ownership = result.rows[0];
  if (!ownership?.driver_ok || !ownership.unit_ok || !ownership.load_ok || !ownership.evidence_ok) {
    throw new Error("photo_link_not_found_for_company");
  }
}

async function loadEvidenceDetails(
  client: DbClient,
  operatingCompanyId: string,
  evidenceUuids: string[]
): Promise<PhotoEvidenceDetail[]> {
  if (evidenceUuids.length === 0) return [];
  const res = await client.query<{
    id: string;
    r2_object_key: string;
    sha256_hash: string;
    exif_metadata: Record<string, unknown>;
    custody_events: CustodyEvent[];
  }>(
    `
      SELECT
        id::text,
        r2_object_key,
        sha256_hash,
        exif_metadata,
        custody_events
      FROM documents.damage_photo_evidence
      WHERE operating_company_id = $1::uuid
        AND id = ANY($2::uuid[])
      ORDER BY created_at ASC
    `,
    [operatingCompanyId, evidenceUuids]
  );

  const details: PhotoEvidenceDetail[] = [];
  for (const row of res.rows) {
    let download_url: string | undefined;
    try {
      const signed = await generatePresignedDownloadUrl(row.r2_object_key, 900);
      download_url = signed.url;
    } catch {
      download_url = undefined;
    }
    details.push({
      ...row,
      angle_label: angleFromMetadata(row.exif_metadata ?? {}),
      download_url,
    });
  }
  return details;
}

async function ensureStagingIncident(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    loadUuid: string | null;
    driverUuid: string;
    unitUuid: string;
  }
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM safety.incidents
      WHERE operating_company_id = $1::uuid
        AND incident_type = 'damage_report'
        AND load_id IS NOT DISTINCT FROM $2::uuid
        AND driver_id = $3::uuid
        AND unit_id = $4::uuid
        AND description = 'GAP-50 pre/post trip photo staging'
        AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.loadUuid, input.driverUuid, input.unitUuid]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO safety.incidents (
        operating_company_id,
        incident_type,
        incident_at,
        location,
        description,
        driver_id,
        unit_id,
        load_id,
        status
      )
      VALUES ($1::uuid, 'damage_report', now(), 'yard', 'GAP-50 pre/post trip photo staging', $2::uuid, $3::uuid, $4::uuid, 'open')
      RETURNING id::text
    `,
    [input.operatingCompanyId, input.driverUuid, input.unitUuid, input.loadUuid]
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("staging_incident_create_failed");
  return row.id;
}

export async function uploadTripPhotoEvidence(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    userUuid: string;
    driverUuid: string;
    unitUuid: string;
    loadUuid: string | null;
    angleLabel: PhotoAngle;
    buffer: Buffer;
    r2ObjectKey: string;
    contentType: string;
  }
): Promise<{ evidence_uuid: string }> {
  await assertTripPhotoLinksCompany(client, input);
  const validation = validateAndPreserveExif(input.buffer);
  if (!validation.exifPresent) {
    throw new Error(`exif_missing:${validation.missingFields.join(",")}`);
  }

  const stagingIncidentId = await ensureStagingIncident(client, {
    operatingCompanyId: input.operatingCompanyId,
    loadUuid: input.loadUuid,
    driverUuid: input.driverUuid,
    unitUuid: input.unitUuid,
  });

  const metadata = {
    ...validation.metadata,
    angle_label: input.angleLabel,
  };

  const custody = appendCustodyEvent([], {
    event_kind: "uploaded",
    user_uuid: input.userUuid,
    details: {
      r2_object_key: input.r2ObjectKey,
      angle_label: input.angleLabel,
      source: "gap50_trip_photo",
    },
    sha256_at_event: validation.sha256,
  });

  await putObjectBytes(input.r2ObjectKey, input.buffer, input.contentType);

  const insertRes = await client.query<{ id: string }>(
    `
      INSERT INTO documents.damage_photo_evidence (
        operating_company_id,
        damage_incident_id,
        r2_object_key,
        sha256_hash,
        exif_metadata,
        custody_events
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb)
      RETURNING id::text
    `,
    [
      input.operatingCompanyId,
      stagingIncidentId,
      input.r2ObjectKey,
      validation.sha256,
      JSON.stringify(metadata),
      JSON.stringify(custody),
    ]
  );
  const row = insertRes.rows[0];
  if (!row) throw new Error("evidence_insert_failed");
  return { evidence_uuid: row.id };
}

export async function startPreTripSession(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    loadUuid: string | null;
    driverUuid: string;
    unitUuid: string;
    evidenceUuids: string[];
  }
): Promise<string> {
  if (input.evidenceUuids.length === 0) {
    throw new Error("evidence_uuids_required");
  }

  await assertTripPhotoLinksCompany(client, input);

  const inserted = await client.query<{ uuid: string }>(
    `
      INSERT INTO safety.photo_comparison_sessions (
        operating_company_id,
        load_uuid,
        driver_uuid,
        unit_uuid,
        pre_trip_session_at,
        pre_trip_evidence_uuids,
        diff_status
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now(), $5::uuid[], 'pending')
      RETURNING uuid::text
    `,
    [
      input.operatingCompanyId,
      input.loadUuid,
      input.driverUuid,
      input.unitUuid,
      input.evidenceUuids,
    ]
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("session_create_failed");
  return row.uuid;
}

export async function submitPostTripPhotos(
  client: DbClient,
  operatingCompanyId: string,
  sessionUuid: string,
  evidenceUuids: string[]
): Promise<PhotoComparisonSession> {
  if (evidenceUuids.length === 0) {
    throw new Error("evidence_uuids_required");
  }

  const updated = await client.query<PhotoComparisonSession>(
    `
      UPDATE safety.photo_comparison_sessions
      SET post_trip_session_at = now(),
          post_trip_evidence_uuids = $2::uuid[],
          diff_status = 'analyzing'
      WHERE uuid = $1::uuid
        AND operating_company_id = $3::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM unnest($2::uuid[]) evidence_id
          WHERE NOT EXISTS (
            SELECT 1
            FROM documents.damage_photo_evidence evidence
            WHERE evidence.id = evidence_id
              AND evidence.operating_company_id = $3::uuid
          )
        )
        AND post_trip_evidence_uuids IS NULL
      RETURNING ${SESSION_COLUMNS}
    `,
    [sessionUuid, evidenceUuids, operatingCompanyId]
  );
  const row = updated.rows[0];
  if (!row) throw new Error("session_not_found_or_post_already_submitted");
  return normalizeSessionRow(row);
}

export async function getSession(
  client: DbClient,
  operatingCompanyId: string,
  sessionUuid: string
): Promise<PhotoComparisonSession | null> {
  const res = await client.query<PhotoComparisonSession>(
    `
      SELECT ${SESSION_COLUMNS}, ${SESSION_HUMAN_LABEL_COLUMNS}
      FROM safety.photo_comparison_sessions s
      WHERE s.uuid = $1::uuid
        AND s.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [sessionUuid, operatingCompanyId]
  );
  const session = res.rows[0];
  if (!session) return null;

  session.pre_trip_photos = await loadEvidenceDetails(
    client,
    operatingCompanyId,
    session.pre_trip_evidence_uuids ?? []
  );
  session.post_trip_photos = await loadEvidenceDetails(
    client,
    operatingCompanyId,
    session.post_trip_evidence_uuids ?? []
  );
  return normalizeSessionRow(session);
}

export async function listSessions(
  client: DbClient,
  filters: {
    operatingCompanyId: string;
    driverUuid?: string;
    status?: DiffStatus;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  }
): Promise<{ sessions: PhotoComparisonSession[]; totalCount: number }> {
  const clauses = ["operating_company_id = $1::uuid"];
  const values: unknown[] = [filters.operatingCompanyId];
  let idx = 2;

  if (filters.driverUuid) {
    clauses.push(`driver_uuid = $${idx}::uuid`);
    values.push(filters.driverUuid);
    idx += 1;
  }
  if (filters.status) {
    clauses.push(`diff_status = $${idx}`);
    values.push(filters.status);
    idx += 1;
  }
  if (filters.from) {
    clauses.push(`created_at >= $${idx}::timestamptz`);
    values.push(filters.from);
    idx += 1;
  }
  if (filters.to) {
    clauses.push(`created_at <= $${idx}::timestamptz`);
    values.push(filters.to);
    idx += 1;
  }

  const countRes = await client.query<{ total_count: string }>(
    `
      SELECT COUNT(*)::text AS total_count
      FROM safety.photo_comparison_sessions
      WHERE ${clauses.join(" AND ")}
    `,
    values
  );

  const pageValues = [...values, filters.limit, filters.offset];
  const res = await client.query<PhotoComparisonSession>(
    `
      SELECT ${SESSION_COLUMNS}, ${SESSION_HUMAN_LABEL_COLUMNS}
      FROM safety.photo_comparison_sessions s
      WHERE ${clauses.join(" AND ")}
      ORDER BY s.created_at DESC
      LIMIT $${pageValues.length - 1}
      OFFSET $${pageValues.length}
    `,
    pageValues
  );
  return { sessions: res.rows.map(normalizeSessionRow), totalCount: Number(countRes.rows[0]?.total_count ?? 0) };
}

export async function applyManualOverride(
  client: DbClient,
  input: {
    sessionUuid: string;
    operatingCompanyId: string;
    userUuid: string;
    diffSummary: string;
    diffFindings?: AnglePairFinding[];
  }
): Promise<PhotoComparisonSession | null> {
  const res = await client.query<PhotoComparisonSession>(
    `
      UPDATE safety.photo_comparison_sessions
      SET diff_status = 'manual_override',
          diff_summary = $3,
          diff_findings = COALESCE($4::jsonb, diff_findings),
          diff_completed_at = now()
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
      RETURNING ${SESSION_COLUMNS}
    `,
    [input.sessionUuid, input.operatingCompanyId, input.diffSummary, JSON.stringify(input.diffFindings ?? null)]
  );
  return res.rows[0] ? normalizeSessionRow(res.rows[0]) : null;
}

export async function updateSessionDiffResult(
  client: DbClient,
  input: {
    sessionUuid: string;
    operatingCompanyId: string;
    diffStatus: DiffStatus;
    diffFindings: unknown;
    diffSummary: string;
    autoDamageReportUuid?: string | null;
  }
): Promise<void> {
  const updated = await client.query<{ uuid: string }>(
    `
      UPDATE safety.photo_comparison_sessions
      SET diff_status = $2,
          diff_findings = $3::jsonb,
          diff_summary = $4,
          diff_completed_at = now(),
          auto_damage_report_uuid = COALESCE($5::uuid, auto_damage_report_uuid)
      WHERE uuid = $1::uuid
        AND operating_company_id = $6::uuid
        AND diff_status = 'analyzing'
      RETURNING uuid::text
    `,
    [
      input.sessionUuid,
      input.diffStatus,
      JSON.stringify(input.diffFindings),
      input.diffSummary,
      input.autoDamageReportUuid ?? null,
      input.operatingCompanyId,
    ]
  );
  if (!updated.rows[0]) throw new Error("photo_comparison_result_update_lost");
}
