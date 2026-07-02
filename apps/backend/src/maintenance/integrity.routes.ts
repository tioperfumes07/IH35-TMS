import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const idSchema = z.object({ unit_id: z.string().uuid().optional(), driver_id: z.string().uuid().optional(), vendor_id: z.string().uuid().optional() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

export async function registerMaintenanceIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/integrity/unit-history", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_unit_history WHERE operating_company_id = $1 ORDER BY cost_90d DESC NULLS LAST LIMIT $2`,
        [query.data.operating_company_id, query.data.limit]
      );
      return res.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/integrity/unit-history/:unit_id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success || !params.data.unit_id) return reply.code(400).send({ error: "validation_error" });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const row = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_unit_history WHERE operating_company_id = $1 AND unit_id = $2 LIMIT 1`,
        [query.data.operating_company_id, params.data.unit_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/api/v1/maintenance/integrity/driver-history", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_driver_history WHERE operating_company_id = $1 ORDER BY accidents_90d DESC, wo_count_90d DESC LIMIT $2`,
        [query.data.operating_company_id, query.data.limit]
      );
      return res.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/integrity/driver-history/:driver_id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success || !params.data.driver_id) return reply.code(400).send({ error: "validation_error" });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const row = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_driver_history WHERE operating_company_id = $1 AND driver_id = $2 LIMIT 1`,
        [query.data.operating_company_id, params.data.driver_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/api/v1/maintenance/integrity/vendor-history", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_vendor_history WHERE operating_company_id = $1 ORDER BY spend_90d DESC NULLS LAST LIMIT $2`,
        [query.data.operating_company_id, query.data.limit]
      );
      return res.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/integrity/vendor-history/:vendor_id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success || !params.data.vendor_id) return reply.code(400).send({ error: "validation_error" });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const row = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_vendor_history WHERE operating_company_id = $1 AND vendor_id = $2 LIMIT 1`,
        [query.data.operating_company_id, params.data.vendor_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/api/v1/maintenance/integrity/fleet-baselines", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_fleet_baselines WHERE operating_company_id = $1 ORDER BY equipment_class ASC`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });
}
