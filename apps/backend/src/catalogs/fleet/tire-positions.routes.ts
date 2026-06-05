import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { currentAuthUser, validationError } from "./shared.js";

/** WO Create modal requests limit=500; generic catalog factory caps at 200. */
const tirePositionsListQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  is_active: z.enum(["true", "false", "all"]).default("true"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function tirePositionsTableReady(client: Queryable): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass('catalogs.tire_positions') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}

export async function registerTirePositionsCatalogRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/fleet/tire-positions", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = tirePositionsListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    try {
      const payload = await withCurrentUser(authUser.uuid, async (client) => {
        if (!(await tirePositionsTableReady(client))) {
          return { rows: [], total: 0 };
        }

        const values: unknown[] = [];
        const where: string[] = [];
        if (q.is_active === "true") where.push("t.is_active = true AND t.deactivated_at IS NULL");
        if (q.is_active === "false") where.push("(t.is_active = false OR t.deactivated_at IS NOT NULL)");
        if (q.search) {
          values.push(`%${q.search}%`);
          where.push(`(t.code ILIKE $${values.length} OR t.name ILIKE $${values.length} OR COALESCE(t.description, '') ILIKE $${values.length})`);
        }
        const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const countRes = await client.query<{ total: string }>(
          `SELECT count(*)::text AS total FROM catalogs.tire_positions t ${whereClause}`,
          values
        );
        values.push(q.limit, q.offset);
        const rowsRes = await client.query(
          `
            SELECT
              t.id,
              t.code,
              t.name AS display_name,
              t.description,
              '{}'::jsonb AS metadata,
              t.is_active,
              t.sort_order,
              t.created_at,
              t.updated_at
            FROM catalogs.tire_positions t
            ${whereClause}
            ORDER BY t.sort_order ASC, t.code ASC
            LIMIT $${values.length - 1}
            OFFSET $${values.length}
          `,
          values
        );
        return { rows: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
      });

      return payload;
    } catch (error) {
      req.log.warn({ err: error }, "tire-positions catalog degraded to empty list");
      return { rows: [], total: 0 };
    }
  });
}
