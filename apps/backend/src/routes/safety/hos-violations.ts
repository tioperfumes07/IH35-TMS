import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  source: z.enum(["samsara_auto", "manual_office", "dot_citation"]).optional(),
});

const createHosViolationSchema = z.object({
  driver_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  occurred_at: z.string().datetime().optional(),
  violation_code: z.string().trim().min(1),
  violation_description: z.string().optional(),
  duty_status: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  source: z.enum(["manual", "eld_import", "dot_inspection"]).default("manual"),
  notes: z.string().optional(),
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
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
    return fn(client);
  });
}

export async function registerSafetyHosViolationsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/hos-violations", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters: string[] = ["operating_company_id = $1", "voided_at IS NULL"];
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        filters.push(`driver_id = $${values.length}`);
      }
      if (query.data.from) {
        values.push(query.data.from);
        filters.push(`occurred_at >= $${values.length}::timestamptz`);
      }
      if (query.data.to) {
        values.push(query.data.to);
        filters.push(`occurred_at <= $${values.length}::timestamptz`);
      }
      if (query.data.source) {
        values.push(query.data.source);
        filters.push(`source = $${values.length}`);
      }
      const res = await client.query(
        `
          SELECT *
          FROM safety.hos_violations
          WHERE ${filters.join(" AND ")}
          ORDER BY occurred_at DESC, created_at DESC
          LIMIT 500
        `,
        values
      );
      return res.rows;
    });

    return { hos_violations: rows };
  });

  app.get("/api/v1/safety/hos-violations/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.hos_violations
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "hos_violation_not_found" });
    return row;
  });

  app.post("/api/v1/safety/hos-violations", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createHosViolationSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const created = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.hos_violations (
            operating_company_id, driver_id, unit_id, occurred_at, violation_code, violation_description, duty_status, severity, source, notes
          )
          VALUES ($1,$2,$3,COALESCE($4::timestamptz, now()),$5,$6,$7,$8,$9,$10)
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.driver_id,
          body.data.unit_id ?? null,
          body.data.occurred_at ?? null,
          body.data.violation_code,
          body.data.violation_description ?? null,
          body.data.duty_status ?? null,
          body.data.severity,
          body.data.source,
          body.data.notes ?? null,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.hos_violation.created",
        { hos_violation_id: row.id, severity: row.severity, source: row.source },
        row.severity === "critical" ? "warning" : "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return row;
    });

    return reply.code(201).send({ hos_violation: created });
  });

  app.post("/api/v1/safety/hos-violations/:id/void", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.hos_violations
          SET voided_at = now(), voided_by = $2, void_reason = COALESCE(void_reason, 'voided via endpoint')
          WHERE id = $1
            AND operating_company_id = $3
            AND voided_at IS NULL
          RETURNING *
        `,
        [params.data.id, user.uuid, query.data.operating_company_id]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.hos_violation.voided",
        { hos_violation_id: row.id },
        "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return row;
    });

    if (!payload) return reply.code(404).send({ error: "hos_violation_not_found" });
    return { hos_violation: payload };
  });
}
