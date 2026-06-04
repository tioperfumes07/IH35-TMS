import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ListAuditEventsInput = {
  operating_company_id: string;
  bulk_call_id?: string;
  event_type?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
};

type AuditEventListRow = {
  id: string;
  created_at: string;
  event_type: string;
  severity: string;
  summary: string;
  actor_user_id: string | null;
  actor_email: string | null;
  payload: unknown;
  source: string | null;
  bulk_call_id: string | null;
  total_count: number;
};

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  bulk_call_id: z.string().uuid().optional(),
  event_type: z.string().trim().min(1).max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

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

export function buildAuditEventsListQuery(input: ListAuditEventsInput): { sql: string; values: unknown[] } {
  const values: unknown[] = [input.operating_company_id];
  const filters = [`(e.payload->>'operating_company_id')::uuid = $1::uuid`];

  if (input.bulk_call_id) {
    values.push(input.bulk_call_id);
    filters.push(`e.payload->>'bulk_call_id' = $${values.length}`);
  }
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
        e.payload->>'bulk_call_id' AS bulk_call_id,
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

export async function listAuditEvents(userId: string, input: ListAuditEventsInput) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    const query = buildAuditEventsListQuery(input);
    const res = await (client as Queryable).query<AuditEventListRow>(query.sql, query.values);
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
      bulk_call_id: row.bulk_call_id,
    }));
    return {
      events,
      total_count: Number(res.rows[0]?.total_count ?? 0),
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    };
  });
}

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const role = String(req.user?.role ?? "");
  if (!["Owner", "Administrator", "Manager", "Accountant"].includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return req.user!;
}

export async function registerAuditEventsListRoutes(app: FastifyInstance) {
  app.get("/api/v1/audit/events-list", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    return listAuditEvents(user.uuid, parsed.data);
  });
}
