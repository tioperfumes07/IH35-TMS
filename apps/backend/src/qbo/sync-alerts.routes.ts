import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

function ownerAdministrator(role: string) {
  return ["Owner", "Administrator"].includes(role);
}

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  severity: z.string().optional(),
  resolved: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const acknowledgeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

const retryBodySchema = z.object({
  operating_company_id: z.string().uuid(),
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

function encodeCursor(row: { created_at: string | Date; id: string }) {
  const payload = JSON.stringify({ created_at: new Date(row.created_at).toISOString(), id: row.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export async function registerQboSyncAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/qbo/sync/alerts", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const severities = parsed.data.severity
      ? parsed.data.severity
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return { alerts: [] as unknown[], next_cursor: null as string | null };

      const cursor = decodeCursor(parsed.data.cursor);
      const values: unknown[] = [parsed.data.operating_company_id];
      const where: string[] = [`operating_company_id = $1`];

      if (parsed.data.resolved === "false") {
        where.push(`resolved_at IS NULL`);
      } else if (parsed.data.resolved === "true") {
        where.push(`resolved_at IS NOT NULL`);
      }

      if (severities.length > 0) {
        values.push(severities);
        where.push(`severity = ANY($${values.length}::text[])`);
      }

      if (cursor) {
        values.push(cursor.created_at, cursor.id);
        where.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
      }

      const fetchLimit = parsed.data.limit + 1;
      values.push(fetchLimit);
      const sql = `
        SELECT *
        FROM qbo.sync_alerts
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length}
      `;

      const res = await client.query(sql, values);
      const hasMore = res.rows.length > parsed.data.limit;
      const rows = hasMore ? res.rows.slice(0, parsed.data.limit) : res.rows;
      const next = hasMore ? encodeCursor(rows[rows.length - 1] as { created_at: string; id: string }) : null;

      return { alerts: rows, next_cursor: next };
    });

    return payload;
  });

  app.post("/api/v1/qbo/sync/alerts/:alertId/acknowledge", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ alertId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = acknowledgeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE qbo.sync_alerts
          SET acknowledged_at = now(),
              acknowledged_by_user_id = $3,
              error_payload = COALESCE(error_payload, '{}'::jsonb) || jsonb_build_object('ack_note', $4::text)
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id
        `,
        [params.data.alertId, body.data.operating_company_id, user.uuid, body.data.note ?? null]
      );
      return res.rows[0]?.id ? String(res.rows[0].id) : null;
    });

    if (!updated) return reply.code(404).send({ error: "alert_not_found" });
    return { ok: true as const, id: updated };
  });

  app.post("/api/v1/qbo/sync/alerts/:alertId/retry-now", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ alertId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = retryBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE qbo.sync_alerts
          SET retry_count = 0,
              next_retry_at = now(),
              severity = 'warning',
              error_payload = COALESCE(error_payload, '{}'::jsonb) || jsonb_build_object('manual_retry_at', now())
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id
        `,
        [params.data.alertId, body.data.operating_company_id]
      );
      return res.rows[0]?.id ? String(res.rows[0].id) : null;
    });

    if (!updated) return reply.code(404).send({ error: "alert_not_found" });
    return { ok: true as const, id: updated };
  });
}
