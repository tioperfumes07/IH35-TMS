import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError } from "../accounting/shared.js";
import { withLuciaBypass } from "../auth/db.js";

function activityRoleGate(role: string) {
  return role === "Owner" || role === "SuperAdmin";
}

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
  actor_user_id: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(200).optional(),
  entity_type: z.string().trim().min(1).max(200).optional(),
  since: z.string().trim().min(1).max(80).optional(),
});

function decodeCursor(raw: string | undefined): { created_at: string; id: string } | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { created_at?: string; id?: string };
    if (!json.created_at || !json.id) return null;
    return { created_at: json.created_at, id: json.id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { created_at: string; id: string }) {
  const payload = JSON.stringify({ created_at: new Date(row.created_at).toISOString(), id: row.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function previewPayload(payload: unknown): string {
  try {
    const text = JSON.stringify(payload ?? {});
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  } catch {
    return "";
  }
}

export async function registerAdminActivityRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/activity", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!activityRoleGate(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    let sinceIso: string | null = null;
    if (parsed.data.since) {
      const ms = Date.parse(parsed.data.since);
      if (!Number.isFinite(ms)) return reply.code(400).send({ error: "invalid_since" });
      sinceIso = new Date(ms).toISOString();
    }

    const payload = await withLuciaBypass(async (client) => {
      const reg = await client.query(`SELECT to_regclass('audit.audit_events') IS NOT NULL AS ok`);
      if (!reg.rows[0]?.ok) return { items: [] as unknown[], next_cursor: null as string | null };

      const cursor = decodeCursor(parsed.data.cursor);
      const values: unknown[] = [];
      const where: string[] = ["TRUE"];

      if (parsed.data.actor_user_id) {
        values.push(parsed.data.actor_user_id);
        where.push(`e.actor_user_uuid = $${values.length}::uuid`);
      }
      if (parsed.data.action) {
        values.push(`%${parsed.data.action}%`);
        where.push(`e.event_class ILIKE $${values.length}`);
      }
      if (parsed.data.entity_type) {
        values.push(`%${parsed.data.entity_type}%`);
        where.push(`COALESCE(e.payload->>'entity_type','') ILIKE $${values.length}`);
      }
      if (sinceIso) {
        values.push(sinceIso);
        where.push(`e.created_at >= $${values.length}::timestamptz`);
      }
      if (cursor) {
        values.push(cursor.created_at, cursor.id);
        where.push(`(e.created_at, e.uuid) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
      }

      const fetchLimit = parsed.data.limit + 1;
      values.push(fetchLimit);

      const sql = `
        SELECT
          e.uuid::text AS id,
          e.created_at::text AS created_at,
          e.event_class AS action,
          e.severity AS severity,
          e.payload AS payload,
          e.actor_user_uuid::text AS actor_user_id,
          u.email AS actor_email,
          e.source AS source,
          e.payload->>'entity_type' AS entity_type,
          e.payload->>'entity_id' AS entity_id
        FROM audit.audit_events e
        LEFT JOIN identity.users u ON u.id = e.actor_user_uuid
        WHERE ${where.join(" AND ")}
        ORDER BY e.created_at DESC, e.uuid DESC
        LIMIT $${values.length}
      `;

      const res = await client.query(sql, values);
      const hasMore = res.rows.length > parsed.data.limit;
      const rows = hasMore ? res.rows.slice(0, parsed.data.limit) : res.rows;

      const items = rows.map((row) => {
        const payloadJson = row.payload as unknown;
        return {
          id: String(row.id ?? ""),
          created_at: String(row.created_at ?? ""),
          actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
          actor_email: row.actor_email ? String(row.actor_email) : null,
          action: String(row.action ?? ""),
          entity_type: row.entity_type ? String(row.entity_type) : null,
          entity_id: row.entity_id ? String(row.entity_id) : null,
          payload: payloadJson,
          payload_preview: previewPayload(payloadJson),
          severity: String(row.severity ?? ""),
          source: row.source ? String(row.source) : null,
        };
      });

      const next =
        hasMore && items.length > 0
          ? encodeCursor({ created_at: items[items.length - 1]?.created_at ?? "", id: items[items.length - 1]?.id ?? "" })
          : null;

      return { items, next_cursor: next };
    });

    return payload;
  });
}
