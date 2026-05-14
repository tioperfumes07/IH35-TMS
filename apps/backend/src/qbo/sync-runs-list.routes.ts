import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.string().optional(),
  kind: z.string().optional(),
  time_range: z.enum(["1h", "24h", "7d", "30d"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function windowStart(range: string | undefined) {
  const now = Date.now();
  const r = range ?? "24h";
  if (r === "1h") return new Date(now - 60 * 60 * 1000);
  if (r === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (r === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return new Date(now - 24 * 60 * 60 * 1000);
}

export async function registerQboSyncRunsListRoutes(app: FastifyInstance) {
  app.get("/api/v1/qbo/sync/runs", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const limit = parsed.data.limit ?? 50;
    const startedAfter = windowStart(parsed.data.time_range);

    const runs = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return [];

      const values: unknown[] = [parsed.data.operating_company_id, startedAfter];
      const where: string[] = [`operating_company_id = $1`, `started_at >= $2`];

      if (parsed.data.status) {
        values.push(parsed.data.status);
        where.push(`status = $${values.length}`);
      }
      if (parsed.data.kind) {
        values.push(parsed.data.kind);
        where.push(`kind = $${values.length}`);
      }
      if (parsed.data.search && parsed.data.search.trim()) {
        values.push(`%${parsed.data.search.trim()}%`);
        where.push(`(kind ILIKE $${values.length} OR COALESCE(error_message,'') ILIKE $${values.length})`);
      }

      values.push(limit);
      const sql = `
        SELECT *
        FROM qbo.sync_runs
        WHERE ${where.join(" AND ")}
        ORDER BY started_at DESC
        LIMIT $${values.length}
      `;

      const res = await client.query(sql, values);

      return res.rows.map((row: Record<string, unknown>) => {
        const payload = (row.payload as Record<string, unknown> | null) ?? {};
        const startedAt = row.started_at ? new Date(String(row.started_at)) : null;
        const completedAt = row.completed_at ? new Date(String(row.completed_at)) : null;
        const durationMs =
          startedAt && completedAt && !Number.isNaN(startedAt.getTime()) && !Number.isNaN(completedAt.getTime())
            ? completedAt.getTime() - startedAt.getTime()
            : null;

        return {
          id: String(row.id),
          started_at: startedAt ? startedAt.toISOString() : new Date().toISOString(),
          completed_at: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
          kind: String(row.kind ?? ""),
          status: String(row.status ?? ""),
          retry_count: Number(row.retry_count ?? 0),
          last_error: row.error_message != null ? String(row.error_message) : null,
          duration_ms: durationMs,
          entity_kind: typeof payload.entity_type === "string" ? payload.entity_type : null,
          entity_id: typeof payload.entity_id === "string" ? payload.entity_id : payload.entity_id != null ? String(payload.entity_id) : null,
          payload: row.payload ?? {},
          error_stack: typeof payload.error_stack === "string" ? payload.error_stack : null,
        };
      });
    });

    return { runs };
  });
}
