import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  module: z.string().trim().min(1).max(100).optional(),
  entity_type: z.string().trim().min(1).max(200).optional(),
  entity_id: z.string().uuid().optional(),
  actor_user_id: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  correlation_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

type SpineEventRow = {
  event_id: string;
  occurred_at: string;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  actor_email: string | null;
  subject_type: string | null;
  subject_id: string | null;
  payload: unknown;
  source: string | null;
  source_table: string | null;
  source_reference_id: string | null;
  actor_user_id: string | null;
  correlation_id: string | null;
  total_count: number;
};

export async function registerSpineEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/audit/spine-events", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const role = String(req.user?.role ?? "");
    if (!["Owner", "Administrator", "Manager", "Accountant"].includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const p = parsed.data;
    const values: unknown[] = [p.operating_company_id];
    const filters: string[] = [`el.operating_company_id = $1::uuid`];

    if (p.module) {
      values.push(`%${p.module}%`);
      filters.push(`el.event_type ILIKE $${values.length}`);
    }
    if (p.entity_type) {
      values.push(p.entity_type);
      filters.push(`el.subject_type = $${values.length}`);
    }
    if (p.entity_id) {
      values.push(p.entity_id);
      filters.push(`el.subject_id = $${values.length}::uuid`);
    }
    if (p.actor_user_id) {
      values.push(p.actor_user_id);
      filters.push(`el.actor_user_id = $${values.length}::uuid`);
    }
    if (p.action) {
      values.push(`%${p.action}%`);
      filters.push(`el.event_type ILIKE $${values.length}`);
    }
    if (p.from) {
      values.push(p.from);
      filters.push(`el.occurred_at >= $${values.length}::timestamptz`);
    }
    if (p.to) {
      values.push(p.to);
      filters.push(`el.occurred_at <= $${values.length}::timestamptz`);
    }
    if (p.correlation_id) {
      values.push(p.correlation_id);
      filters.push(`el.correlation_id = $${values.length}::uuid`);
    }

    values.push(p.limit);
    const limitPos = values.length;
    values.push(p.offset);
    const offsetPos = values.length;

    const sql = `
      SELECT
        el.event_id::text            AS event_id,
        el.occurred_at::text         AS occurred_at,
        el.event_type                AS event_type,
        el.actor_type                AS actor_type,
        el.actor_id::text            AS actor_id,
        u.email                      AS actor_email,
        el.subject_type              AS subject_type,
        el.subject_id::text          AS subject_id,
        el.payload                   AS payload,
        el.source                    AS source,
        el.source_table              AS source_table,
        el.source_reference_id::text AS source_reference_id,
        el.actor_user_id::text       AS actor_user_id,
        el.correlation_id::text      AS correlation_id,
        count(*) OVER ()::int        AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC, el.event_id DESC
      LIMIT $${limitPos}
      OFFSET $${offsetPos}
    `;

    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(
        "SELECT set_config('app.operating_company_id', $1, true)", [p.operating_company_id]
      );
      const res = await client.query<SpineEventRow>(sql, values);
      return {
        events: res.rows.map((r) => ({
          event_id: r.event_id,
          occurred_at: r.occurred_at,
          event_type: r.event_type,
          actor_type: r.actor_type,
          actor_id: r.actor_id,
          actor_email: r.actor_email,
          subject_type: r.subject_type,
          subject_id: r.subject_id,
          payload: r.payload,
          source: r.source,
          source_table: r.source_table,
          source_reference_id: r.source_reference_id,
          actor_user_id: r.actor_user_id,
          correlation_id: r.correlation_id,
        })),
        total_count: Number(res.rows[0]?.total_count ?? 0),
        limit: p.limit,
        offset: p.offset,
      };
    });
  });
}
