import { appendCustodyEvent, getCustodyChain, type CustodyEvent } from "../../documents/chain-of-custody.service.js";
import { validateAndPreserveExif } from "../../documents/exif-preserver.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type DamagePhotoEvidence = {
  id: string;
  damage_incident_id: string;
  r2_object_key: string;
  sha256_hash: string;
  exif_metadata: Record<string, unknown>;
  custody_events: CustodyEvent[];
};

export async function attachPhotoToDamage(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    damageUuid: string;
    userUuid: string;
    buffer: Buffer;
    r2ObjectKey: string;
  }
): Promise<DamagePhotoEvidence> {
  const validation = validateAndPreserveExif(input.buffer);
  if (!validation.exifPresent) {
    throw new Error(`exif_missing:${validation.missingFields.join(",")}`);
  }

  const incidentRes = await client.query<{ id: string }>(
    `
      SELECT id
      FROM safety.incidents
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND incident_type = 'damage_report'
      LIMIT 1
    `,
    [input.damageUuid, input.operatingCompanyId]
  );
  if (!incidentRes.rows[0]) throw new Error("damage_report_not_found");

  const custody = appendCustodyEvent([], {
    event_kind: "uploaded",
    user_uuid: input.userUuid,
    details: { r2_object_key: input.r2ObjectKey, missing_optional: validation.missingFields },
    sha256_at_event: validation.sha256,
  });

  const insertRes = await client.query<DamagePhotoEvidence>(
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
      RETURNING
        id::text,
        damage_incident_id::text,
        r2_object_key,
        sha256_hash,
        exif_metadata,
        custody_events
    `,
    [
      input.operatingCompanyId,
      input.damageUuid,
      input.r2ObjectKey,
      validation.sha256,
      JSON.stringify(validation.metadata),
      JSON.stringify(custody),
    ]
  );
  const row = insertRes.rows[0];
  if (!row) throw new Error("evidence_insert_failed");

  await client.query(
    `
      UPDATE safety.incidents
      SET evidence_uuids = array_append(evidence_uuids, $3::uuid),
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [input.damageUuid, input.operatingCompanyId, row.id]
  );

  return row;
}

export async function listDamagePhotos(
  client: DbClient,
  operatingCompanyId: string,
  damageUuid: string
): Promise<DamagePhotoEvidence[]> {
  const res = await client.query<DamagePhotoEvidence>(
    `
      SELECT
        id::text,
        damage_incident_id::text,
        r2_object_key,
        sha256_hash,
        exif_metadata,
        custody_events
      FROM documents.damage_photo_evidence
      WHERE operating_company_id = $1::uuid
        AND damage_incident_id = $2::uuid
      ORDER BY created_at ASC
    `,
    [operatingCompanyId, damageUuid]
  );
  return res.rows;
}

export async function recordCustodyAccess(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    damageUuid: string;
    evidenceUuid: string;
    userUuid: string;
    eventKind: "viewed" | "downloaded" | "exported";
    details?: Record<string, unknown>;
  }
): Promise<CustodyEvent[]> {
  const res = await client.query<{ custody_events: CustodyEvent[]; sha256_hash: string }>(
    `
      SELECT custody_events, sha256_hash
      FROM documents.damage_photo_evidence
      WHERE id = $1::uuid
        AND damage_incident_id = $2::uuid
        AND operating_company_id = $3::uuid
      LIMIT 1
    `,
    [input.evidenceUuid, input.damageUuid, input.operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) throw new Error("evidence_not_found");

  const next = appendCustodyEvent(row.custody_events ?? [], {
    event_kind: input.eventKind,
    user_uuid: input.userUuid,
    details: input.details ?? {},
    sha256_at_event: row.sha256_hash,
  });

  await client.query(
    `
      UPDATE documents.damage_photo_evidence
      SET custody_events = $4::jsonb,
          updated_at = now()
      WHERE id = $1::uuid
        AND damage_incident_id = $2::uuid
        AND operating_company_id = $3::uuid
    `,
    [input.evidenceUuid, input.damageUuid, input.operatingCompanyId, JSON.stringify(next)]
  );

  return getCustodyChain(next);
}
