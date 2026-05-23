import { decryptSamsaraSecret } from "../lib/samsara-crypto.js";
import { SamsaraClient, type DashcamFacing } from "../integrations/samsara/samsara-client.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type SamsaraConfigRow = {
  api_token_encrypted?: Buffer | null;
  encrypted_api_token?: Buffer | null;
  samsara_org_id?: string | null;
};

type DashcamInsertInput = {
  operating_company_id: string;
  unit_id: string;
  triggered_at: string;
  duration_sec: number;
  camera_facing: DashcamFacing;
  samsara_clip_url: string;
  samsara_clip_id: string;
  trigger_kind: "harsh_event" | "on_demand" | "dvr_pull";
  linked_harsh_event_id?: string | null;
  retention_expires_at?: string | null;
};

function encryptedTokenFromRow(row: SamsaraConfigRow | null): Buffer | null {
  if (!row) return null;
  if (Buffer.isBuffer(row.encrypted_api_token) && row.encrypted_api_token.length > 0) return row.encrypted_api_token;
  if (Buffer.isBuffer(row.api_token_encrypted) && row.api_token_encrypted.length > 0) return row.api_token_encrypted;
  return null;
}

async function buildSamsaraClient(client: DbClient, operatingCompanyId: string): Promise<SamsaraClient | null> {
  const cfg = await client.query<SamsaraConfigRow>(
    `SELECT api_token_encrypted, encrypted_api_token, samsara_org_id FROM integrations.samsara_config WHERE operating_company_id = $1::uuid LIMIT 1`,
    [operatingCompanyId]
  );
  const row = cfg.rows[0] ?? null;
  const token = decryptSamsaraSecret(encryptedTokenFromRow(row));
  if (!token) return null;
  return new SamsaraClient({
    apiToken: token,
    samsaraOrgId: row?.samsara_org_id ?? null,
  });
}

export async function fetchSamsaraClipUrlForCompany(
  client: DbClient,
  operatingCompanyId: string,
  clipId: string
): Promise<string | null> {
  const api = await buildSamsaraClient(client, operatingCompanyId);
  if (!api) return null;
  return api.getDashcamClipUrl(clipId);
}

export async function requestSamsaraOnDemandClip(
  client: DbClient,
  input: {
    operating_company_id: string;
    unit_id: string;
    start_at: string;
    duration_sec: number;
    camera_facing: DashcamFacing;
  }
): Promise<{ clipId: string; clipUrl: string | null } | null> {
  const api = await buildSamsaraClient(client, input.operating_company_id);
  if (!api) return null;
  const vehicleRes = await client.query<{ samsara_vehicle_id: string }>(
    `
      SELECT samsara_vehicle_id
      FROM integrations.samsara_vehicles
      WHERE operating_company_id = $1::uuid
        AND local_unit_id = $2::uuid
      LIMIT 1
    `,
    [input.operating_company_id, input.unit_id]
  );
  const samsaraVehicleId = vehicleRes.rows[0]?.samsara_vehicle_id;
  if (!samsaraVehicleId) return null;
  return api.requestDashcamClip({
    vehicleId: samsaraVehicleId,
    startAtIso: input.start_at,
    durationSec: input.duration_sec,
    cameraFacing: input.camera_facing,
  });
}

export async function insertDashcamClip(client: DbClient, input: DashcamInsertInput) {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO telematics.dashcam_clips (
        operating_company_id, unit_id, triggered_at, duration_sec, camera_facing,
        samsara_clip_url, samsara_clip_id, trigger_kind, linked_harsh_event_id, retention_expires_at
      )
      VALUES ($1::uuid,$2::uuid,$3::timestamptz,$4::int,$5,$6,$7,$8,$9::uuid,$10::timestamptz)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.unit_id,
      input.triggered_at,
      input.duration_sec,
      input.camera_facing,
      input.samsara_clip_url,
      input.samsara_clip_id,
      input.trigger_kind,
      input.linked_harsh_event_id ?? null,
      input.retention_expires_at ?? null,
    ]
  );
  return res.rows[0]?.id ?? null;
}
