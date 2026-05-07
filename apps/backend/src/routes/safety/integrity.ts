import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompany<T>(userId: string, role: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
    return fn(client);
  });
}

export async function registerSafetyIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/integrity/wo-cost-outliers", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.v_wo_cost_outliers WHERE operating_company_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { outliers: rows };
  });

  app.get("/api/v1/safety/integrity/fuel-mpg-anomalies", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.v_fuel_mpg_anomalies WHERE operating_company_id = $1 ORDER BY transaction_date DESC LIMIT 200`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { anomalies: rows };
  });

  app.get("/api/v1/safety/integrity/driver-dwell-outliers", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.v_driver_dwell_outliers WHERE operating_company_id = $1 ORDER BY minutes_over_avg DESC LIMIT 200`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { outliers: rows };
  });

  app.get("/api/v1/safety/integrity/hos-pattern-breaks", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.v_hos_pattern_breaks WHERE operating_company_id = $1 ORDER BY violations_30d DESC LIMIT 200`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { pattern_breaks: rows };
  });

  app.get("/api/v1/safety/integrity/observations", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.integrity_observations
          WHERE operating_company_id = $1
          ORDER BY observed_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { observations: rows };
  });

  app.post("/api/v1/safety/integrity/observations/:id/review", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const row = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.integrity_observations
          SET status = 'reviewed', reviewed_at = now(), reviewed_by = $2
          WHERE id = $1
            AND operating_company_id = $3
          RETURNING *
        `,
        [params.data.id, user.uuid, query.data.operating_company_id]
      );
      const updated = res.rows[0];
      if (!updated) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.integrity.observation_reviewed",
        { integrity_observation_id: updated.id },
        "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return updated;
    });
    if (!row) return reply.code(404).send({ error: "integrity_observation_not_found" });
    return { observation: row };
  });
}
