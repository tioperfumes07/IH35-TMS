import { withCurrentUser } from "../auth/db.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ListDriverAuditEventsInput = {
  operating_company_id: string;
  driver_id: string;
  event_type?: string;
  from?: string;
  to?: string;
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
    `d.operating_company_id = $1::uuid`,
    `d.id = $2::uuid`,
    `(
      (COALESCE(e.payload->>'entity_type', '') = 'driver' AND e.payload->>'entity_id' = $2::text)
      OR (e.payload->>'resource_id' = $2::text)
      OR (e.payload->>'driver_id' = $2::text)
      OR (e.payload->>'linked_driver_id' = $2::text)
      OR (e.payload->>'new_driver_id' = $2::text)
      OR (e.payload->>'prior_driver_id' = $2::text)
    )`,
  ];

  if (input.event_type) {
    values.push(`%${input.event_type}%`);
    filters.push(`e.event_class ILIKE $${values.length}`);
  }
  if (input.from) {
    values.push(input.from);
    filters.push(`e.created_at >= $${values.length}::timestamptz`);
  }
  if (input.to) {
    values.push(input.to);
    filters.push(`e.created_at <= $${values.length}::timestamptz`);
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
      INNER JOIN mdata.drivers d ON d.id = $2::uuid
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
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
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
