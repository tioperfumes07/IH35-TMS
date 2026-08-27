import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const rangeQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const observationQuerySchema = companyQuerySchema.extend({
  ids: z.string().trim().optional().transform((value, ctx) => {
    if (!value) return [];
    const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length > 200 || ids.some((id) => !z.string().uuid().safeParse(id).success)) {
      ctx.addIssue({ code: "custom", message: "ids must contain at most 200 UUIDs" });
      return z.NEVER;
    }
    return ids;
  }),
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
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [role]);
    return fn(client);
  });
}

export async function registerSafetyIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/integrity/wo-cost-outliers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = rangeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count FROM safety.v_wo_cost_outliers o WHERE o.operating_company_id = $1::uuid`,
        [query.data.operating_company_id]
      );
      const res = await client.query(
        `SELECT o.*, u.unit_number
         FROM safety.v_wo_cost_outliers o
         LEFT JOIN mdata.units u ON u.id = o.unit_id
                                AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = o.operating_company_id
         WHERE o.operating_company_id = $1::uuid ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
        [query.data.operating_company_id, query.data.limit, query.data.offset]
      );
      return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return { outliers: rows.rows, total_count: rows.total_count };
  });

  app.get("/api/v1/safety/integrity/fuel-mpg-anomalies", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = rangeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count FROM safety.v_fuel_mpg_anomalies o WHERE o.operating_company_id = $1::uuid`,
        [query.data.operating_company_id]
      );
      const res = await client.query(
        `SELECT o.*, u.unit_number,
                NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name
         FROM safety.v_fuel_mpg_anomalies o
         LEFT JOIN mdata.units u ON u.id = o.unit_id
                                AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = o.operating_company_id
         LEFT JOIN mdata.drivers d ON d.id = o.driver_id
                                  AND (d.operating_company_id = o.operating_company_id OR EXISTS (
                                    SELECT 1 FROM mdata.driver_company_authorizations integrity_report_driver_dca
                                     WHERE integrity_report_driver_dca.driver_id = d.id
                                       AND integrity_report_driver_dca.company_id = o.operating_company_id
                                       AND integrity_report_driver_dca.is_authorized = true
                                       AND integrity_report_driver_dca.deactivated_at IS NULL
                                  ))
         WHERE o.operating_company_id = $1::uuid ORDER BY o.transaction_date DESC LIMIT $2 OFFSET $3`,
        [query.data.operating_company_id, query.data.limit, query.data.offset]
      );
      return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return { anomalies: rows.rows, total_count: rows.total_count };
  });

  app.get("/api/v1/safety/integrity/driver-dwell-outliers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = rangeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count FROM safety.v_driver_dwell_outliers o WHERE o.operating_company_id = $1::uuid`,
        [query.data.operating_company_id]
      );
      const res = await client.query(
        `SELECT o.*, NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name
         FROM safety.v_driver_dwell_outliers o
         LEFT JOIN mdata.drivers d ON d.id = o.driver_id
                                  AND (d.operating_company_id = o.operating_company_id OR EXISTS (
                                    SELECT 1 FROM mdata.driver_company_authorizations integrity_report_driver_dca
                                     WHERE integrity_report_driver_dca.driver_id = d.id
                                       AND integrity_report_driver_dca.company_id = o.operating_company_id
                                       AND integrity_report_driver_dca.is_authorized = true
                                       AND integrity_report_driver_dca.deactivated_at IS NULL
                                  ))
         WHERE o.operating_company_id = $1::uuid ORDER BY o.minutes_over_avg DESC LIMIT $2 OFFSET $3`,
        [query.data.operating_company_id, query.data.limit, query.data.offset]
      );
      return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return { outliers: rows.rows, total_count: rows.total_count };
  });

  app.get("/api/v1/safety/integrity/hos-pattern-breaks", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = rangeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count FROM safety.v_hos_pattern_breaks o WHERE o.operating_company_id = $1::uuid`,
        [query.data.operating_company_id]
      );
      const res = await client.query(
        `SELECT o.*, NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name
         FROM safety.v_hos_pattern_breaks o
         LEFT JOIN mdata.drivers d ON d.id = o.driver_id
                                  AND (d.operating_company_id = o.operating_company_id OR EXISTS (
                                    SELECT 1 FROM mdata.driver_company_authorizations integrity_report_driver_dca
                                     WHERE integrity_report_driver_dca.driver_id = d.id
                                       AND integrity_report_driver_dca.company_id = o.operating_company_id
                                       AND integrity_report_driver_dca.is_authorized = true
                                       AND integrity_report_driver_dca.deactivated_at IS NULL
                                  ))
         WHERE o.operating_company_id = $1::uuid ORDER BY o.violations_30d DESC LIMIT $2 OFFSET $3`,
        [query.data.operating_company_id, query.data.limit, query.data.offset]
      );
      return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return { pattern_breaks: rows.rows, total_count: rows.total_count };
  });

  app.get("/api/v1/safety/integrity/observations", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = observationQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.integrity_observations
          WHERE operating_company_id = $1::uuid
            AND id = ANY($2::uuid[])
          ORDER BY observed_at DESC
        `,
        [query.data.operating_company_id, query.data.ids]
      );
      return res.rows;
    });
    return { observations: rows };
  });

  app.post("/api/v1/safety/integrity/observations/:id/review", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            AND operating_company_id = $3::uuid
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
        { integrity_observation_id: updated.id, operating_company_id: query.data.operating_company_id },
        "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return updated;
    });
    if (!row) return reply.code(404).send({ error: "integrity_observation_not_found" });
    return { observation: row };
  });
}
