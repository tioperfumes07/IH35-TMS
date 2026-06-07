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
  to: string
): Promise<EldEditHistoryResult> {
  const res = await client.query<EldLogEditRow>(
    `
      SELECT
        e.id::text AS id,
        e.driver_uuid::text AS driver_uuid,
        d.display_name AS driver_name,
        e.edited_at,
        e.edited_by,
        e.reason,
        e.field_name,
        e.before_state,
        e.after_state
      FROM samsara.hos_log_edits e
      LEFT JOIN mdata.drivers d
        ON d.id = e.driver_uuid
       AND d.operating_company_id = e.operating_company_id
      WHERE e.operating_company_id = $1::uuid
        AND e.driver_uuid = $2::uuid
        AND e.edited_at >= $3::timestamptz
        AND e.edited_at < ($4::date + INTERVAL '1 day')
      ORDER BY e.edited_at ASC, e.field_name ASC
    `,
    [operatingCompanyId, driverUuid, from, to]
  );

  const driverName = res.rows[0]?.driver_name ?? null;
  return {
    driver_uuid: driverUuid,
    driver_name: driverName,
    from,
    to,
    edits: res.rows.map(mapRow),
    read_only: READ_ONLY,
  };
}

export async function getRecentEditHistory(
  client: Queryable,
  operatingCompanyId: string,
  driverUuid: string,
  limit = 25
): Promise<EldEditHistoryResult> {
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - 30);
  const from = fromDate.toISOString().slice(0, 10);

  const res = await client.query<EldLogEditRow>(
    `
      SELECT
        e.id::text AS id,
        e.driver_uuid::text AS driver_uuid,
        d.display_name AS driver_name,
        e.edited_at,
        e.edited_by,
        e.reason,
        e.field_name,
        e.before_state,
        e.after_state
      FROM samsara.hos_log_edits e
      LEFT JOIN mdata.drivers d
        ON d.id = e.driver_uuid
       AND d.operating_company_id = e.operating_company_id
      WHERE e.operating_company_id = $1::uuid
        AND e.driver_uuid = $2::uuid
      ORDER BY e.edited_at DESC, e.field_name ASC
      LIMIT $3::int
    `,
    [operatingCompanyId, driverUuid, limit]
  );

  const edits = res.rows.map(mapRow).reverse();
  const driverName = res.rows[0]?.driver_name ?? null;

  return {
    driver_uuid: driverUuid,
    driver_name: driverName,
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
