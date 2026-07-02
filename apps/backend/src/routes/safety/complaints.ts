import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const complaintSchema = z.object({
  filed_at: z.string().datetime().optional(),
  complainant_type: z.enum(["driver", "customer", "employee", "external", "anonymous"]),
  complainant_driver_id: z.string().uuid().optional(),
  complainant_user_id: z.string().uuid().optional(),
  complainant_customer_id: z.string().uuid().optional(),
  complainant_external_name: z.string().optional(),
  complainant_external_contact: z.string().optional(),
  respondent_type: z.enum(["driver", "employee"]),
  respondent_driver_id: z.string().uuid().optional(),
  respondent_user_id: z.string().uuid().optional(),
  complaint_type: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  evidence_doc_ids: z.array(z.string().uuid()).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "investigating", "resolved", "dismissed", "escalated"]).optional(),
  resolution: z.string().optional(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function normalizeRole(role: string) {
  if (role === "Owner") return "owner";
  if (role === "Administrator") return "admin";
  if (role === "Safety") return "safety";
  if (role === "Manager") return "manager";
  if (role === "Dispatcher") return "dispatcher";
  if (role === "Accountant") return "accountant";
  if (role === "Driver") return "driver";
  return role.toLowerCase();
}

function ensureComplaintReadRole(user: { role: string }, reply: FastifyReply) {
  const role = normalizeRole(user.role);
  if (!["owner", "admin", "safety"].includes(role)) {
    reply.code(403).send({ error: "E_COMPLAINT_PRIVACY_GATED" });
    return null;
  }
  return role;
}

async function withCompany<T>(userId: string, role: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
    return fn(client);
  });
}

function validateConsistency(input: z.infer<typeof complaintSchema>) {
  const complainantOk =
    (input.complainant_type === "driver" && Boolean(input.complainant_driver_id)) ||
    (input.complainant_type === "employee" && Boolean(input.complainant_user_id)) ||
    (input.complainant_type === "customer" && Boolean(input.complainant_customer_id)) ||
    (input.complainant_type === "external" && Boolean(input.complainant_external_name)) ||
    input.complainant_type === "anonymous";
  const respondentOk =
    (input.respondent_type === "driver" && Boolean(input.respondent_driver_id) && !input.respondent_user_id) ||
    (input.respondent_type === "employee" && Boolean(input.respondent_user_id) && !input.respondent_driver_id);
  return complainantOk && respondentOk;
}

export async function registerSafetyComplaintsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/complaints", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.complaints WHERE operating_company_id = $1 ORDER BY filed_at DESC LIMIT 500`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return { complaints: rows };
  });

  app.get("/api/v1/safety/complaints/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.complaints WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "complaint_not_found" });
    return row;
  });

  app.post("/api/v1/safety/complaints", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = complaintSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    if (!validateConsistency(body.data)) return reply.code(400).send({ error: "complaint_consistency_failed" });

    const created = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.complaints (
            operating_company_id, filed_at, complainant_type, complainant_driver_id, complainant_user_id, complainant_customer_id,
            complainant_external_name, complainant_external_contact, respondent_type, respondent_driver_id, respondent_user_id,
            complaint_type, summary, evidence_doc_ids, severity, status, resolution, created_by
          )
          VALUES (
            $1, COALESCE($2::timestamptz, now()), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, COALESCE($16, 'open'), $17, $18
          )
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.filed_at ?? null,
          body.data.complainant_type,
          body.data.complainant_driver_id ?? null,
          body.data.complainant_user_id ?? null,
          body.data.complainant_customer_id ?? null,
          body.data.complainant_external_name ?? null,
          body.data.complainant_external_contact ?? null,
          body.data.respondent_type,
          body.data.respondent_driver_id ?? null,
          body.data.respondent_user_id ?? null,
          body.data.complaint_type,
          body.data.summary,
          body.data.evidence_doc_ids ?? null,
          body.data.severity,
          body.data.status ?? "open",
          body.data.resolution ?? null,
          user.uuid,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, user.uuid, "safety.complaint.filed", { complaint_id: row.id, severity: row.severity }, "warning", "P3-T11.17.2-SAFETY-V6.4");
      return row;
    });
    return reply.code(201).send({ complaint: created });
  });

  app.patch("/api/v1/safety/complaints/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    if (appRole !== "owner") return reply.code(403).send({ error: "E_COMPLAINT_PRIVACY_GATED" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = complaintSchema.partial().safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.complaints
          SET status = COALESCE($3, status),
              resolution = COALESCE($4, resolution),
              resolved_at = CASE WHEN COALESCE($3, status) IN ('resolved', 'dismissed') THEN now() ELSE resolved_at END,
              resolved_by = CASE WHEN COALESCE($3, status) IN ('resolved', 'dismissed') THEN $5 ELSE resolved_by END
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.status ?? null, body.data.resolution ?? null, user.uuid]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(client, user.uuid, "safety.complaint.status_changed", { complaint_id: row.id, status: row.status }, "info", "P3-T11.17.2-SAFETY-V6.4");
      if (["resolved", "dismissed"].includes(row.status)) {
        await appendCrudAudit(client, user.uuid, "safety.complaint.resolved", { complaint_id: row.id, status: row.status }, "info", "P3-T11.17.2-SAFETY-V6.4");
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "complaint_not_found" });
    return { complaint: updated };
  });

  app.post("/api/v1/safety/complaints/:id/void", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    if (appRole !== "owner") return reply.code(403).send({ error: "E_COMPLAINT_PRIVACY_GATED" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const voided = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.complaints
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
      await appendCrudAudit(client, user.uuid, "safety.complaint.voided", { complaint_id: row.id }, "warning", "P3-T11.17.2-SAFETY-V6.4");
      return row;
    });
    if (!voided) return reply.code(404).send({ error: "complaint_not_found" });
    return { complaint: voided };
  });
}
