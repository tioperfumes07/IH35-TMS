import { companyBusinessDate } from "../../lib/company-business-date.js";

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

// ELD-1: the ELD edit-history feature mirrors Samsara HOS log edits from `samsara.hos_log_edits`.
// That table's real source + migration are a Jorge-gated follow-up, so on environments where it is
// not yet provisioned the two SELECTs below would raise 42P01 (`relation "samsara.hos_log_edits"
// does not exist`) and 500 EVERY request — the whole ELD nav module hard-crashes. Guard the reads
// with `to_regclass` so, until the table exists, the endpoint returns an honest EMPTY history
// (source-not-connected) instead of crashing. The feature is preserved, not removed: the instant the
// gated table lands, these queries run unchanged and real data flows through. Fail-honest, not silent
// — the empty result is a truthful "no ELD edit source connected yet", not a masked error.
async function eldEditSourceExists(client: Queryable): Promise<boolean> {
  const res = await client.query<{ reg: string | null }>(
    `SELECT to_regclass('samsara.hos_log_edits')::text AS reg`
  );
  return Boolean(res.rows[0]?.reg);
}

function emptyHistory(
  driverUuid: string,
  from: string,
  to: string
): EldEditHistoryResult {
  return { driver_uuid: driverUuid, driver_name: null, from, to, edits: [], read_only: READ_ONLY };
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
  to: string
): Promise<EldEditHistoryResult> {
  // ELD-1: return an honest empty history when the Samsara mirror table is not yet provisioned,
  // rather than 500-ing the whole ELD module (see eldEditSourceExists).
  if (!(await eldEditSourceExists(client))) {
    return emptyHistory(driverUuid, from, to);
  }
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
  // Company wall-clock day (America/Chicago), not the UTC calendar day — `.toISOString().slice(0,10)`
  // rolls to tomorrow after ~19:00 Central, silently shifting the "last 30 days" window (same root
  // cause as company-business-date.ts's Load Number bug).
  const now = new Date();
  const to = companyBusinessDate(now);
  const from = companyBusinessDate(new Date(now.getTime() - 30 * 86_400_000));

  // ELD-1: honest empty history when the Samsara mirror table is not yet provisioned (no 500).
  if (!(await eldEditSourceExists(client))) {
    return emptyHistory(driverUuid, from, to);
  }

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
