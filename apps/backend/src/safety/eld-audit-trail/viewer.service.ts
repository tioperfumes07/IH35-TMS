import { companyBusinessDate } from "../../lib/company-business-date.js";
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { SamsaraClient, type HosLog } from "../../integrations/samsara/samsara-client.js";

export type EldLogEditRow = {
  id: string;
  driver_uuid: string;
  driver_name: string | null;
  edited_at: string;
  edited_by: string | null;
  reason: string | null;
  field_name: string;
  before_state: string | null;
  after_state: string | null;
};

export type EldEditHistoryEntry = {
  id: string;
  edited_at: string;
  edited_by: string;
  reason: string;
  field_name: string;
  before_state: string | null;
  after_state: string | null;
};

export type EldEditHistoryResult = {
  driver_uuid: string;
  driver_name: string | null;
  from: string;
  to: string;
  edits: EldEditHistoryEntry[];
  read_only: true;
};

export type DotAuditPdfPayload = {
  title: string;
  generated_at: string;
  driver_uuid: string;
  driver_name: string | null;
  period: { from: string; to: string };
  edits: EldEditHistoryEntry[];
  fmcsa_notice: string;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const READ_ONLY = true as const;

type DriverSourceRow = {
  samsara_driver_id: string;
  driver_name: string | null;
  encrypted_api_token: Buffer | null;
  api_token_encrypted: Buffer | null;
  samsara_org_id: string | null;
  is_enabled: boolean;
};

type FetchLogEdits = (driverId: string, range: { start: string; end: string }) => Promise<HosLog[]>;

function textValue(row: HosLog, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function stateValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function editTimestamp(row: HosLog): string {
  const iso = textValue(row, "editedAt", "editTime", "timestamp", "createdAt");
  if (iso) return new Date(iso).toISOString();
  const ms = Number(textValue(row, "editTimeMs", "editedAtMs", "timestampMs", "createdAtMs"));
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  throw new Error("samsara_hos_log_edit_missing_timestamp");
}

function mapApiEdit(row: HosLog, index: number): EldEditHistoryEntry {
  return {
    id: textValue(row, "id", "logEditId", "editId") ?? `samsara-edit-${index}`,
    edited_at: editTimestamp(row),
    edited_by: textValue(row, "editedBy", "editorName", "userName", "actorName") ?? "Unknown editor",
    reason: textValue(row, "reason", "remark", "annotation") ?? "No reason recorded",
    field_name: textValue(row, "fieldName", "editType", "type") ?? "duty_status",
    before_state: stateValue(row.beforeState ?? row.oldValue ?? row.before),
    after_state: stateValue(row.afterState ?? row.newValue ?? row.after),
  };
}

async function resolveDriverSource(client: Queryable, operatingCompanyId: string, driverUuid: string): Promise<DriverSourceRow> {
  const res = await client.query<DriverSourceRow>(
    `SELECT sd.samsara_driver_id,
            NULLIF(BTRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name,
            sc.encrypted_api_token, sc.api_token_encrypted, sc.samsara_org_id, sc.is_enabled
       FROM mdata.drivers d
       JOIN integrations.samsara_drivers sd
         ON sd.operating_company_id = $1::uuid
        AND sd.local_driver_id = d.id
       JOIN integrations.samsara_config sc
         ON sc.operating_company_id = $1::uuid
      WHERE (
          d.operating_company_id = $1::uuid
          OR EXISTS (
            SELECT 1
            FROM mdata.driver_company_authorizations eld_audit_driver_dca
            WHERE eld_audit_driver_dca.driver_id = d.id
              AND eld_audit_driver_dca.company_id = $1::uuid
              AND eld_audit_driver_dca.is_authorized = true
              AND eld_audit_driver_dca.deactivated_at IS NULL
          )
        )
        AND d.id = $2::uuid
        AND d.deactivated_at IS NULL
      LIMIT 1`,
    [operatingCompanyId, driverUuid]
  );
  const row = res.rows[0];
  if (!row || !row.is_enabled) throw new Error("eld_audit_source_not_configured");
  return row;
}

function sourceFetcher(row: DriverSourceRow): FetchLogEdits {
  const encrypted = Buffer.isBuffer(row.encrypted_api_token) && row.encrypted_api_token.length > 0
    ? row.encrypted_api_token
    : row.api_token_encrypted;
  const token = decryptSamsaraSecret(encrypted);
  if (!token) throw new Error("eld_audit_source_not_configured");
  const api = new SamsaraClient({ apiToken: token, samsaraOrgId: row.samsara_org_id });
  return (driverId, range) => api.getHosLogs(driverId, range);
}

function mapRow(row: EldLogEditRow): EldEditHistoryEntry {
  return {
    id: row.id,
    edited_at: row.edited_at,
    edited_by: row.edited_by?.trim() || "Unknown editor",
    reason: row.reason?.trim() || "No reason recorded",
    field_name: row.field_name,
    before_state: row.before_state,
    after_state: row.after_state,
  };
}

export function buildDotAuditPdfPayload(result: EldEditHistoryResult): DotAuditPdfPayload {
  return {
    title: "FMCSA ELD Edit History Report",
    generated_at: new Date().toISOString(),
    driver_uuid: result.driver_uuid,
    driver_name: result.driver_name,
    period: { from: result.from, to: result.to },
    edits: result.edits,
    fmcsa_notice:
      "This report is read-only and reflects mirrored Samsara HOS log edits. Original ELD records were not modified by IH35 TMS.",
  };
}

export async function getEditHistory(
  client: Queryable,
  operatingCompanyId: string,
  driverUuid: string,
  from: string,
  to: string,
  fetchLogEdits?: FetchLogEdits
): Promise<EldEditHistoryResult> {
  const source = await resolveDriverSource(client, operatingCompanyId, driverUuid);
  const rows = await (fetchLogEdits ?? sourceFetcher(source))(source.samsara_driver_id, {
    start: `${from}T00:00:00-05:00`,
    end: `${to}T23:59:59.999-05:00`,
  });
  const edits = rows.map(mapApiEdit).sort((a, b) => a.edited_at.localeCompare(b.edited_at));
  return {
    driver_uuid: driverUuid,
    driver_name: source.driver_name,
    from,
    to,
    edits,
    read_only: READ_ONLY,
  };
}

export async function getRecentEditHistory(
  client: Queryable,
  operatingCompanyId: string,
  driverUuid: string,
  limit = 25,
  fetchLogEdits?: FetchLogEdits
): Promise<EldEditHistoryResult> {
  // Company wall-clock day (America/Chicago), not the UTC calendar day — `.toISOString().slice(0,10)`
  // rolls to tomorrow after ~19:00 Central, silently shifting the "last 30 days" window (same root
  // cause as company-business-date.ts's Load Number bug).
  const now = new Date();
  const to = companyBusinessDate(now);
  const from = companyBusinessDate(new Date(now.getTime() - 30 * 86_400_000));

  const result = await getEditHistory(client, operatingCompanyId, driverUuid, from, to, fetchLogEdits);
  const edits = result.edits.slice(-limit);

  return {
    driver_uuid: driverUuid,
    driver_name: result.driver_name,
    from,
    to,
    edits,
    read_only: READ_ONLY,
  };
}

export function assertReadOnlySurface(method: string) {
  if (method !== "GET") {
    throw new Error(`ELD audit trail is read-only; ${method} is not permitted`);
  }
}
