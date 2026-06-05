import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { sendZodValidation } from "../lib/zod-http-error.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(250).default(50),
  sort: z.enum(["name", "-name"]).default("name"),
  search: z.string().trim().max(100).optional(),
  operating_company_id: z.string().uuid().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerVendorListRoutes(app: FastifyInstance) {
  app.get("/api/v1/vendors", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);

    const { page, page_size, sort, search, operating_company_id } = parsed.data;
    const offset = (page - 1) * page_size;
    const orderDir = sort === "-name" ? "DESC" : "ASC";

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const companyRes = operating_company_id
        ? { rows: [{ id: operating_company_id }] }
        : await client.query<{ id: string }>(
            `SELECT operating_company_id AS id FROM auth.user_operating_companies WHERE user_id = $1 ORDER BY is_default DESC NULLS LAST LIMIT 1`,
            [authUser.uuid]
          );
      const companyId = companyRes.rows[0]?.id;
      if (!companyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);

      const values: unknown[] = [companyId];
      const filters = ["deactivated_at IS NULL", `operating_company_id = $1`];
      if (search) {
        values.push(`%${search}%`);
        filters.push(`(vendor_name ILIKE $${values.length} OR vendor_code ILIKE $${values.length})`);
      }

      const whereClause = `WHERE ${filters.join(" AND ")}`;
      const countRes = await client.query<{ total_count: number }>(
        `SELECT COUNT(*)::int AS total_count FROM mdata.vendors ${whereClause}`,
        values
      );
      values.push(page_size, offset);
      const rowsRes = await client.query(
        `SELECT id, vendor_name AS name, vendor_code, email
         FROM mdata.vendors ${whereClause}
         ORDER BY vendor_name ${orderDir}
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return {
        rows: rowsRes.rows,
        total_count: Number(countRes.rows[0]?.total_count ?? 0),
        page,
        page_size,
      };
    });

    if (!result) return reply.code(400).send({ error: "operating_company_id_required" });
    return result;
  });
}
