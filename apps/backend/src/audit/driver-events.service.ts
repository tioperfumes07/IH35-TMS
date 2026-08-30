import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { withCurrentUser } from "../auth/db.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ListDriverAuditEventsInput = {
  operating_company_id: string;
  driver_id: string;
  from?: string;
  to?: string;
  /** SAF-B29 — server-side filters (UI had these; 200-cap made client filter a silent lie). */
  actor?: string;
  // LV-AUDIT-HISTORY-STATUS-SOURCE-SINGLE-SELECT: arrays (OR'd) — same fix as the entity-audit
  // endpoint, mirrored here since this is the driver-specific audit tab's own separate route.
  event_type?: string[];
  status?: string[];
  source?: string[];
  voids_only?: boolean;
  limit: number;
  offset: number;
};

type DriverAuditEventRow = {
  id: string;
  created_at: string;
  event_type: string;
  severity: string;
  summary: string;
  actor_user_id: string | null;
  actor_email: string | null;
  payload: unknown;
  source: string | null;
  total_count: number;
};

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 100;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

function normalizeOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
}

function summarizePayload(eventClass: string, payload: unknown): string {
  if (!payload || typeof payload !== "object") return eventClass;
  const record = payload as Record<string, unknown>;
  const changes = record.changes;
  if (changes && typeof changes === "object") {
    const keys = Object.keys(changes as Record<string, unknown>);
    if (keys.length > 0) return `${eventClass}: ${keys.slice(0, 4).join(", ")}`;
  }
  if (typeof record.summary === "string" && record.summary.trim()) return record.summary.trim();
  if (typeof record.reason === "string" && record.reason.trim()) return record.reason.trim();
  return eventClass;
}

export function buildDriverAuditEventsQuery(input: ListDriverAuditEventsInput): { sql: string; values: unknown[] } {
  const values: unknown[] = [input.operating_company_id, input.driver_id];
  const filters = [
    `(
      (COALESCE(e.payload->>'entity_type', '') = 'driver' AND e.payload->>'entity_id' = $2::text)
      OR (e.payload->>'resource_id' = $2::text)
      OR (e.payload->>'driver_id' = $2::text)
      OR (e.payload->>'linked_driver_id' = $2::text)
      OR (e.payload->>'new_driver_id' = $2::text)
      OR (e.payload->>'prior_driver_id' = $2::text)
    )`,
  ];

  if (input.event_type && input.event_type.length > 0) {
    values.push(input.event_type.map((v) => `%${v}%`));
    filters.push(`e.event_class ILIKE ANY($${values.length}::text[])`);
  }
  if (input.from) {
    values.push(input.from);
    filters.push(`e.created_at >= $${values.length}::timestamptz`);
  }
  if (input.to) {
    values.push(input.to);
    filters.push(`e.created_at <= $${values.length}::timestamptz`);
  }
  if (input.actor) {
    values.push(`%${input.actor}%`);
    filters.push(`(u.email ILIKE $${values.length} OR e.actor_user_uuid::text ILIKE $${values.length})`);
  }
  if (input.status && input.status.length > 0) {
    values.push(input.status);
    filters.push(`e.payload->>'status' = ANY($${values.length}::text[])`);
  }
  if (input.source && input.source.length > 0) {
    values.push(input.source);
    filters.push(`e.source = ANY($${values.length}::text[])`);
  }
  if (input.voids_only) {
    filters.push(
      `(e.event_class ILIKE '%void%' OR e.event_class ILIKE '%reverse%' OR e.event_class ILIKE '%delete%')`
    );
  }

  values.push(normalizeLimit(input.limit));
  const limitPos = values.length;
  values.push(normalizeOffset(input.offset));
  const offsetPos = values.length;

  return {
    sql: `
      SELECT
        e.uuid::text AS id,
        e.created_at::text AS created_at,
        e.event_class AS event_type,
        e.severity AS severity,
        e.payload AS payload,
        e.actor_user_uuid::text AS actor_user_id,
        u.email AS actor_email,
        e.source AS source,
        count(*) OVER()::int AS total_count
      FROM audit.audit_events e
      INNER JOIN mdata.drivers d
        ON d.id = $2::uuid
       AND d.archived_at IS NULL
       AND (
         d.operating_company_id = $1::uuid
         OR EXISTS (
           SELECT 1 FROM mdata.driver_company_authorizations driver_audit_dca
           WHERE driver_audit_dca.driver_id = d.id
             AND driver_audit_dca.company_id = $1::uuid
             AND driver_audit_dca.is_authorized = true
             AND driver_audit_dca.deactivated_at IS NULL
         )
       )
      LEFT JOIN identity.users u ON u.id = e.actor_user_uuid
      WHERE ${filters.join(" AND ")}
      ORDER BY e.created_at DESC, e.uuid DESC
      LIMIT $${limitPos}
      OFFSET $${offsetPos}
    `,
    values,
  };
}

export async function listDriverAuditEvents(userId: string, input: ListDriverAuditEventsInput) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, input.operating_company_id);
    const query = buildDriverAuditEventsQuery(input);
    const res = await (client as Queryable).query<DriverAuditEventRow>(query.sql, query.values);
    const events = res.rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      event_type: row.event_type,
      severity: row.severity,
      summary: summarizePayload(row.event_type, row.payload),
      actor_user_id: row.actor_user_id,
      actor_email: row.actor_email,
      payload: row.payload,
      source: row.source,
    }));
    return {
      events,
      total_count: Number(res.rows[0]?.total_count ?? 0),
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    };
  });
}
