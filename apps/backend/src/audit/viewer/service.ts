import { withCurrentUser } from "../../auth/db.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type QueryAuditEventsInput = {
  operating_company_id: string;
  entity_type?: string;
  entity_uuid?: string;
  user_uuid?: string;
  action?: string;
  from?: string;
  to?: string;
  severity?: string;
  search_text?: string;
  limit: number;
  offset: number;
};

export type AuditViewerRow = {
  id: string;
  created_at: string;
  event_class: string;
  severity: string;
  payload: unknown;
  actor_user_id: string | null;
  actor_email: string | null;
  source: string | null;
  total_count: number;
};

function normalizeLimit(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(500, Math.max(1, Math.floor(n)));
}

function normalizeOffset(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function buildQueryAuditEventsSQL(input: QueryAuditEventsInput): { sql: string; values: unknown[] } {
  const values: unknown[] = [input.operating_company_id];
  const filters: string[] = [`(e.payload->>'operating_company_id')::uuid = $1::uuid`];

  if (input.entity_type) {
    values.push(`%${input.entity_type}%`);
    filters.push(`e.event_class ILIKE $${values.length}`);
  }
  if (input.entity_uuid) {
    values.push(input.entity_uuid);
    filters.push(`(e.payload->>'entity_uuid' = $${values.length} OR e.payload->>'entity_id' = $${values.length})`);
  }
  if (input.user_uuid) {
    values.push(input.user_uuid);
    filters.push(`e.actor_user_uuid::text = $${values.length}`);
  }
  if (input.action) {
    values.push(`%${input.action}%`);
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
  if (input.severity) {
    values.push(input.severity);
    filters.push(`e.severity = $${values.length}`);
  }
  if (input.search_text) {
    values.push(`%${input.search_text}%`);
    filters.push(`(e.event_class ILIKE $${values.length} OR e.payload::text ILIKE $${values.length})`);
  }

  values.push(normalizeLimit(input.limit));
  const limitPos = values.length;
  values.push(normalizeOffset(input.offset));
  const offsetPos = values.length;

  return {
    sql: `
      SELECT
        e.uuid::text        AS id,
        e.created_at::text  AS created_at,
        e.event_class       AS event_class,
        e.severity          AS severity,
        e.payload           AS payload,
        e.actor_user_uuid::text AS actor_user_id,
        u.email             AS actor_email,
        e.source            AS source,
        count(*) OVER()::int AS total_count
      FROM audit.audit_events e
      LEFT JOIN identity.users u ON u.id = e.actor_user_uuid
      WHERE ${filters.join(" AND ")}
      ORDER BY e.created_at DESC, e.uuid DESC
      LIMIT $${limitPos}
      OFFSET $${offsetPos}
    `,
    values,
  };
}

export async function queryAuditEvents(userId: string, input: QueryAuditEventsInput) {
  return withCurrentUser(userId, async (client) => {
    await (client as Queryable).query(
      "SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id],
    );
    const q = buildQueryAuditEventsSQL(input);
    const res = await (client as Queryable).query<AuditViewerRow>(q.sql, q.values);
    return {
      events: res.rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        event_class: r.event_class,
        severity: r.severity,
        payload: r.payload,
        actor_user_id: r.actor_user_id,
        actor_email: r.actor_email,
        source: r.source,
      })),
      total_count: Number(res.rows[0]?.total_count ?? 0),
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    };
  });
}

export async function getEventDetail(userId: string, operatingCompanyId: string, eventUuid: string) {
  return withCurrentUser(userId, async (client) => {
    await (client as Queryable).query(
      "SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId],
    );
    const res = await (client as Queryable).query<AuditViewerRow>(
      `
      SELECT
        e.uuid::text        AS id,
        e.created_at::text  AS created_at,
        e.event_class       AS event_class,
        e.severity          AS severity,
        e.payload           AS payload,
        e.actor_user_uuid::text AS actor_user_id,
        u.email             AS actor_email,
        e.source            AS source,
        1::int              AS total_count
      FROM audit.audit_events e
      LEFT JOIN identity.users u ON u.id = e.actor_user_uuid
      WHERE e.uuid = $1::uuid
        AND (e.payload->>'operating_company_id')::uuid = $2::uuid
      `,
      [eventUuid, operatingCompanyId],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      created_at: r.created_at,
      event_class: r.event_class,
      severity: r.severity,
      payload: r.payload,
      actor_user_id: r.actor_user_id,
      actor_email: r.actor_email,
      source: r.source,
    };
  });
}
