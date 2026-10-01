import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { canVoidCancel } from "../../lib/authz/void-cancel-authz.js";
import { createSettlementDeduction } from "../../driver-finance/deductions.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

// SAF-F16 — driver-profile reverse view. A complaint touches a driver on EITHER side
// (`complainant_driver_id` when they filed it, `respondent_driver_id` when it is against them);
// the driver's own page must surface both, so one param matches either column.
// Optional; absent = the existing company-wide list. The privacy gate is unchanged.
const complaintsQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  // E-28 (owner order 2026-10-01): load -> complaints and unit -> complaints, the other half of the link.
  load_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

// SAF-F11: void is reason-REQUIRED. This route accepted no body and wrote
// `void_reason = COALESCE(void_reason, 'voided via endpoint')`, so a voided complaint carried a
// placeholder instead of an accountable explanation — on a record type that is owner-privacy gated
// and evidentiary. min(3) matches the accounting void contract and VoidReasonModal's default.
const voidBodySchema = z.object({
  void_reason: z.string().trim().min(3).max(500),
});

const complaintSchema = z.object({
  filed_at: z.string().datetime().optional(),
  // ROUND 313 E-28: broker and shipper are first-class sources (both are customers in mdata or named externally).
  complainant_type: z.enum(["driver", "customer", "broker", "shipper", "employee", "external", "anonymous"]),
  complainant_driver_id: z.string().uuid().optional(),
  complainant_user_id: z.string().uuid().optional(),
  complainant_customer_id: z.string().uuid().optional(),
  complainant_external_name: z.string().optional(),
  complainant_external_contact: z.string().optional(),
  respondent_type: z.enum(["driver", "employee"]),
  respondent_driver_id: z.string().uuid().optional(),
  respondent_user_id: z.string().uuid().optional(),
  complaint_type_id: z.string().uuid(),
  summary: z.string().trim().min(1),
  evidence_doc_ids: z.array(z.string().uuid()).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "investigating", "resolved", "dismissed", "escalated"]).optional(),
  resolution: z.string().optional(),
  // E-28: the load and truck the complaint is about, where applicable. Same company only — validated
  // here and enforced by trg_complaints_same_company_links (202615100000).
  load_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  // ROUND 313 E-28: the stop the complaint is about (must be a stop of load_id — trg_complaints_stop_link) and the
  // investigation's determination. A chargeback to the driver needs driver_caused = true (owner C5:A).
  stop_id: z.string().uuid().optional(),
  driver_caused: z.boolean().optional(),
});

const chargebackBodySchema = z.object({
  amount_cents: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: "validation_error",
    message: "Check the complaint details and try again.",
    details: error.flatten(),
  });
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
    reply.code(403).send({
      error: "E_COMPLAINT_PRIVACY_GATED",
      message: "Complaints are restricted to Owner, Administrator, and Safety roles.",
    });
    return null;
  }
  return role;
}

async function withCompany<T>(userId: string, role: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [role]);
    return fn(client);
  });
}

function validateConsistency(input: z.infer<typeof complaintSchema>) {
  const complainantOk =
    (input.complainant_type === "driver" && Boolean(input.complainant_driver_id)) ||
    (input.complainant_type === "employee" && Boolean(input.complainant_user_id)) ||
    (input.complainant_type === "customer" && Boolean(input.complainant_customer_id)) ||
    ((input.complainant_type === "broker" || input.complainant_type === "shipper") &&
      (Boolean(input.complainant_customer_id) || Boolean(input.complainant_external_name))) ||
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
    const query = complaintsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters: string[] = [];
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        // SAF-F16: filter in SQL so every ranged page is scoped to the requested driver.
        filters.push(`(c.complainant_driver_id = $${values.length} OR c.respondent_driver_id = $${values.length})`);
      }
      if (query.data.customer_id) {
        values.push(query.data.customer_id);
        filters.push(`c.complainant_customer_id = $${values.length}`);
      }
      if (query.data.user_id) {
        values.push(query.data.user_id);
        filters.push(`(c.complainant_user_id = $${values.length} OR c.respondent_user_id = $${values.length})`);
      }
      if (query.data.load_id) {
        values.push(query.data.load_id);
        filters.push(`c.load_id = $${values.length}`);
      }
      if (query.data.unit_id) {
        values.push(query.data.unit_id);
        filters.push(`c.unit_id = $${values.length}`);
      }
      const reverseFilter = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total_count
         FROM safety.complaints c
         WHERE c.operating_company_id = $1::uuid
         ${reverseFilter}`,
        values,
      );
      const totalCount = Number(countRes.rows[0]?.total_count ?? 0);
      values.push(query.data.limit);
      const limitParam = values.length;
      values.push(query.data.offset);
      const offsetParam = values.length;
      // FAIL-CP1: the grid rendered raw driver uuids because the row carried only ids and
      // EntityLink falls back to printing `id` when given no label. On a privacy-gated discipline
      // record, "who complained about whom" is the entire content of the row — so resolve both
      // names server-side rather than making every consumer re-join.
      // FAIL-CP1 RESIDUAL: the first pass resolved only the DRIVER names, so a complaint filed by a
      // CUSTOMER still rendered a raw uuid — the tab's own comment ("Without a label EntityLink
      // prints the raw uuid") sat nine lines above the one EntityLink that was still given no label.
      const res = await client.query(
        `SELECT c.*,
                TRIM(CONCAT(cd.first_name, ' ', cd.last_name)) AS complainant_driver_name,
                TRIM(CONCAT(rd.first_name, ' ', rd.last_name)) AS respondent_driver_name,
                cc.customer_name AS complainant_customer_name,
                TRIM(CONCAT(cu.first_name, ' ', cu.last_name)) AS complainant_user_name,
                TRIM(CONCAT(ru.first_name, ' ', ru.last_name)) AS respondent_user_name,
                cl.load_number AS complaint_load_number,
                cun.unit_number AS complaint_unit_number
         FROM safety.complaints c
         LEFT JOIN mdata.drivers cd ON cd.id = c.complainant_driver_id AND (cd.operating_company_id = c.operating_company_id OR EXISTS (
           SELECT 1 FROM mdata.driver_company_authorizations complaint_complainant_driver_dca
           WHERE complaint_complainant_driver_dca.driver_id = cd.id
             AND complaint_complainant_driver_dca.company_id = c.operating_company_id
             AND complaint_complainant_driver_dca.is_authorized = true
             AND complaint_complainant_driver_dca.deactivated_at IS NULL
         ))
         LEFT JOIN mdata.drivers rd ON rd.id = c.respondent_driver_id AND (rd.operating_company_id = c.operating_company_id OR EXISTS (
           SELECT 1 FROM mdata.driver_company_authorizations complaint_respondent_driver_dca
           WHERE complaint_respondent_driver_dca.driver_id = rd.id
             AND complaint_respondent_driver_dca.company_id = c.operating_company_id
             AND complaint_respondent_driver_dca.is_authorized = true
             AND complaint_respondent_driver_dca.deactivated_at IS NULL
         ))
         LEFT JOIN mdata.customers cc ON cc.id = c.complainant_customer_id AND cc.operating_company_id = c.operating_company_id
         LEFT JOIN identity.users cu ON cu.id = c.complainant_user_id
         LEFT JOIN identity.users ru ON ru.id = c.respondent_user_id
         -- E-28 (owner order 2026-10-01): resolve the load/truck this complaint is about, same
         -- "join the name server-side" pattern as every identity column above (FAIL-CP1) — EntityLink
         -- prints the raw uuid when given no label.
         LEFT JOIN mdata.loads cl ON cl.id = c.load_id AND cl.operating_company_id = c.operating_company_id
         LEFT JOIN mdata.units cun ON cun.id = c.unit_id
         WHERE c.operating_company_id = $1::uuid
         ${reverseFilter}
         ORDER BY c.filed_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        values
      );
      return { complaints: res.rows, total_count: totalCount };
    });

    return result;
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
        `SELECT * FROM safety.complaints WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) {
      return reply.code(404).send({
        error: "complaint_not_found",
        message: "The complaint could not be found.",
      });
    }
    return row;
  });

  app.post("/api/v1/safety/complaints", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = complaintSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    if (!validateConsistency(body.data)) {
      return reply.code(400).send({
        error: "complaint_consistency_failed",
        message: "Select the matching complainant and respondent details, then try again.",
      });
    }

    const created = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const linked = await client.query(
        `SELECT
           ($2::uuid IS NULL OR EXISTS (
             SELECT 1 FROM mdata.drivers d
             WHERE d.id = $2::uuid
               AND d.archived_at IS NULL
               AND (d.operating_company_id = $1::uuid OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations complaint_create_complainant_dca
                 WHERE complaint_create_complainant_dca.driver_id = d.id
                   AND complaint_create_complainant_dca.company_id = $1::uuid
                   AND complaint_create_complainant_dca.is_authorized = true
                   AND complaint_create_complainant_dca.deactivated_at IS NULL
               ))
           )) AS complainant_driver_ok,
           ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM mdata.drivers d
             WHERE d.id = $3::uuid
               AND d.archived_at IS NULL
               AND (d.operating_company_id = $1::uuid OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations complaint_create_respondent_dca
                 WHERE complaint_create_respondent_dca.driver_id = d.id
                   AND complaint_create_respondent_dca.company_id = $1::uuid
                   AND complaint_create_respondent_dca.is_authorized = true
                   AND complaint_create_respondent_dca.deactivated_at IS NULL
               ))
           )) AS respondent_driver_ok,
           ($4::uuid IS NULL OR EXISTS (
             SELECT 1 FROM mdata.customers c WHERE c.id = $4::uuid AND c.operating_company_id = $1::uuid
           )) AS customer_ok,
           ($5::uuid IS NULL OR EXISTS (
             SELECT 1 FROM identity.users u
             WHERE u.id = $5::uuid AND u.deactivated_at IS NULL
               AND (u.default_company_id = $1::uuid OR EXISTS (
                 SELECT 1 FROM org.user_company_access uca WHERE uca.user_id = u.id AND uca.company_id = $1::uuid
               ))
           )) AS complainant_user_ok,
           ($6::uuid IS NULL OR EXISTS (
             SELECT 1 FROM identity.users u
             WHERE u.id = $6::uuid AND u.deactivated_at IS NULL
               AND (u.default_company_id = $1::uuid OR EXISTS (
                 SELECT 1 FROM org.user_company_access uca WHERE uca.user_id = u.id AND uca.company_id = $1::uuid
               ))
           )) AS respondent_user_ok,
           EXISTS (
             SELECT 1 FROM catalogs.complaint_types ct
             WHERE ct.id = $7::uuid AND ct.operating_company_id = $1::uuid AND ct.is_active = true
           ) AS complaint_type_ok,
           (COALESCE(cardinality($8::uuid[]), 0) = (
             SELECT count(*)::int FROM docs.files f
              WHERE f.id = ANY(COALESCE($8::uuid[], ARRAY[]::uuid[]))
                AND f.operating_company_id = $1::uuid
                AND f.deleted_at IS NULL
           )) AS evidence_docs_ok,
           ($9::uuid IS NULL OR EXISTS (
             SELECT 1 FROM mdata.loads l WHERE l.id = $9::uuid AND l.operating_company_id = $1::uuid
           )) AS load_ok,
           ($10::uuid IS NULL OR EXISTS (
             SELECT 1 FROM mdata.units u WHERE u.id = $10::uuid
               AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)
           )) AS unit_ok`,
        [
          query.data.operating_company_id,
          body.data.complainant_driver_id ?? null,
          body.data.respondent_driver_id ?? null,
          body.data.complainant_customer_id ?? null,
          body.data.complainant_user_id ?? null,
          body.data.respondent_user_id ?? null,
          body.data.complaint_type_id,
          body.data.evidence_doc_ids ?? [],
          body.data.load_id ?? null,
          body.data.unit_id ?? null,
        ]
      );
      const validity = linked.rows[0];
      if (!validity || Object.values(validity).some((value) => value !== true)) return null;
      const res = await client.query(
        `
          INSERT INTO safety.complaints (
            operating_company_id, filed_at, complainant_type, complainant_driver_id, complainant_user_id, complainant_customer_id,
            complainant_external_name, complainant_external_contact, respondent_type, respondent_driver_id, respondent_user_id,
            complaint_type, summary, evidence_doc_ids, severity, status, resolution, created_by,
            -- P1 LIVE 500: safety.complaints.complaint_date is a NOT NULL date column with NO default
            -- (migration 0050 line 322) and this INSERT never populated it, so EVERY create failed with
            -- Postgres 23502: null value in column complaint_date violates not-null constraint.
            -- That is why live complaints sat at 0 - not a payload problem; the request had already
            -- passed zod AND validateConsistency before it reached here.
            -- Migration 0051 introduced filed_at and BACK-FILLED it FROM complaint_date, i.e. filed_at
            -- superseded this column but the NOT NULL was left behind with nothing writing it.
            -- Derived from the SAME $2 expression as filed_at (not a new parameter) so the two can never
            -- disagree, and so a caller-supplied filed_at lands on the same calendar day.
            complaint_date,
            -- Same class as complaint_date: v5 (migration 0050) NOT NULL columns that the v6.4 INSERT
            -- never filled, so each one 500s with Postgres 23502 in turn. Filling them from their v6.4
            -- equivalents rather than one-per-deploy:
            --   respondent_id      = the v5 SINGLE respondent id; v6.4 split it into two typed columns,
            --                        and respondent_type already says which one is populated.
            --   complaint_type_id  = FK to catalogs.complaint_types, resolved from the v6.4 type_code
            --                        text within the same operating company (type_code is UNIQUE per company).
            respondent_id,
            complaint_type_id,
            load_id,
            unit_id,
            stop_id,
            driver_caused
          )
          VALUES (
            $1, COALESCE($2::timestamptz, now()), $3, $4, $5, $6, $7, $8, $9, $10, $11,
            (SELECT ct.type_code FROM catalogs.complaint_types ct WHERE ct.id = $12::uuid AND ct.operating_company_id = $1::uuid),
            $13, $14, $15, COALESCE($16, 'open'), $17, $18,
            COALESCE($2::timestamptz, now())::date,
            COALESCE($10::uuid, $11::uuid),
            $12::uuid,
            $19::uuid,
            $20::uuid,
            $21::uuid,
            $22::boolean
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
          body.data.complaint_type_id,
          body.data.summary,
          body.data.evidence_doc_ids ?? null,
          body.data.severity,
          body.data.status ?? "open",
          body.data.resolution ?? null,
          user.uuid,
          body.data.load_id ?? null,
          body.data.unit_id ?? null,
          body.data.stop_id ?? null,
          body.data.driver_caused ?? null,
        ]
      ).catch((err: { code?: string; message?: string }) => {
        // trg_complaints_same_company_links / trg_complaints_stop_link refuse a foreign load, truck or stop.
        if (err?.code === "23514") return { rows: [{ __cross_company: true }] };
        throw err;
      });
      if ((res.rows[0] as { __cross_company?: boolean } | undefined)?.__cross_company) return null;
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (!row?.id) throw new Error("safety_complaint_insert_failed");
      await appendCrudAudit(client, user.uuid, "safety.complaint.filed", { complaint_id: row.id, operating_company_id: query.data.operating_company_id, severity: row.severity, load_id: row.load_id ?? null, unit_id: row.unit_id ?? null }, "warning", "P3-T11.17.2-SAFETY-V6.4");
      return row;
    });
    if (!created) {
      return reply.code(400).send({
        error: "linked_entity_not_in_operating_company",
        message: "Select active complaint links from the current operating company.",
      });
    }
    return reply.code(201).send({ complaint: created });
  });

  app.patch("/api/v1/safety/complaints/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    if (appRole !== "owner") {
      return reply.code(403).send({
        error: "E_COMPLAINT_PRIVACY_GATED",
        message: "Only an Owner can update a complaint.",
      });
    }
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
              resolved_by = CASE WHEN COALESCE($3, status) IN ('resolved', 'dismissed') THEN $5 ELSE resolved_by END,
              load_id = COALESCE($6::uuid, load_id),
              unit_id = COALESCE($7::uuid, unit_id),
              stop_id = COALESCE($8::uuid, stop_id),
              driver_caused = COALESCE($9::boolean, driver_caused)
          WHERE id = $1
            AND operating_company_id = $2::uuid
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.status ?? null, body.data.resolution ?? null, user.uuid, body.data.load_id ?? null, body.data.unit_id ?? null, body.data.stop_id ?? null, body.data.driver_caused ?? null]
      ).catch((err: { code?: string; message?: string }) => {
        // trg_complaints_same_company_links refuses another entity's load or truck.
        if (err?.code === "23514") return { rows: [{ __cross_company: true, message: err.message }] };
        throw err;
      });
      if ((res.rows[0] as { __cross_company?: boolean } | undefined)?.__cross_company) return { __cross_company: true } as const;
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(client, user.uuid, "safety.complaint.status_changed", { complaint_id: row.id, operating_company_id: query.data.operating_company_id, status: row.status }, "info", "P3-T11.17.2-SAFETY-V6.4");
      if (["resolved", "dismissed"].includes(row.status)) {
        await appendCrudAudit(client, user.uuid, "safety.complaint.resolved", { complaint_id: row.id, operating_company_id: query.data.operating_company_id, status: row.status }, "info", "P3-T11.17.2-SAFETY-V6.4");
      }
      return row;
    });
    if (updated && "__cross_company" in updated) {
      return reply.code(400).send({ error: "linked_entity_not_in_operating_company", message: "That load or truck belongs to another company." });
    }
    if (!updated) {
      return reply.code(404).send({
        error: "complaint_not_found",
        message: "The complaint could not be found.",
      });
    }
    return { complaint: updated };
  });

  // ROUND 313 E-28 — chargeback to the driver (owner C5:A): only a RESOLVED, DRIVER-CAUSED complaint against a driver,
  // approved by an accounting executor who is not the person who filed it (maker != checker, F13:A). The deduction is
  // created through the canonical driver-finance writer (createSettlementDeduction) so settlement close recovers it with
  // its existing GL routing; the complaint keeps the link (chargeback_deduction_id) and the CHECK
  // complaints_chargeback_only_driver_caused_approved refuses any other shape.
  app.post("/api/v1/safety/complaints/:id/chargeback", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canVoidCancel(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden", message: "Approving a chargeback requires Owner, Administrator or Accountant." });
    }
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = chargebackBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const appRole = normalizeRole(String(user.role ?? ""));
    const result = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const c = (await client.query(
        `SELECT id::text, status, voided_at, respondent_type, respondent_driver_id::text, driver_caused, created_by::text,
                chargeback_deduction_id::text, load_id::text, upper(coalesce(complaint_type, '')) AS type_code
           FROM safety.complaints WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
        [params.data.id, query.data.operating_company_id]
      )).rows[0] as Record<string, unknown> | undefined;
      if (!c) return { code: 404, error: "complaint_not_found" } as const;
      if (c.voided_at) return { code: 409, error: "complaint_voided" } as const;
      if (c.chargeback_deduction_id) return { code: 409, error: "chargeback_already_created", deduction_id: c.chargeback_deduction_id } as const;
      if (c.status !== "resolved") return { code: 409, error: "complaint_not_resolved" } as const;
      if (c.driver_caused !== true) return { code: 409, error: "not_driver_caused" } as const;
      if (c.respondent_type !== "driver" || !c.respondent_driver_id) return { code: 409, error: "complaint_not_against_a_driver" } as const;
      if (c.created_by === user.uuid) return { code: 409, error: "maker_cannot_approve_own_complaint" } as const;
      const deduction = await createSettlementDeduction(client, {
        driverId: String(c.respondent_driver_id),
        operatingCompanyId: query.data.operating_company_id,
        amountCents: body.data.amount_cents,
        reason: `Complaint chargeback (complaint ${c.id}): ${body.data.reason}`,
        sourceType: String(c.type_code).includes("DAMAGE") ? "damage" : "other",
        loadId: (c.load_id as string | null) ?? null,
        createdByUserId: user.uuid,
      } as Parameters<typeof createSettlementDeduction>[1]);
      await client.query(
        `UPDATE safety.complaints
            SET chargeback_deduction_id = $3::uuid, chargeback_cents = $4, chargeback_approved_by = $5::uuid, chargeback_approved_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [params.data.id, query.data.operating_company_id, deduction.id, body.data.amount_cents, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "safety.complaint.chargeback_approved", { complaint_id: params.data.id, operating_company_id: query.data.operating_company_id, deduction_id: deduction.id, amount_cents: body.data.amount_cents, driver_id: c.respondent_driver_id }, "warning", "ROUND-313-E-28");
      return { code: 201, complaint_id: params.data.id, deduction } as const;
    });
    const { code, ...payload } = result as { code: number } & Record<string, unknown>;
    return reply.code(code).send(payload);
  });

  // ROUND 313 E-28 — reverse: the driver's own complaint list (same read roles as /safety/complaints).
  app.get("/api/v1/drivers/:id/complaints", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) =>
      (await client.query(
        `SELECT c.id::text, c.filed_at, c.complainant_type, c.severity, c.status, c.summary, c.resolution, c.complaint_type,
                c.load_id::text, l.load_number, c.unit_id::text, u.unit_number, c.stop_id::text, c.driver_caused,
                c.chargeback_deduction_id::text, c.chargeback_cents, d.status AS chargeback_status, d.applied_to_settlement_id::text
           FROM safety.complaints c
           LEFT JOIN mdata.loads l ON l.id = c.load_id AND l.operating_company_id = c.operating_company_id
           LEFT JOIN mdata.units u ON u.id = c.unit_id
           LEFT JOIN driver_finance.driver_settlement_deductions d ON d.id = c.chargeback_deduction_id
          WHERE c.operating_company_id = $1::uuid AND c.respondent_driver_id = $2::uuid AND c.voided_at IS NULL
          ORDER BY c.filed_at DESC NULLS LAST`,
        [query.data.operating_company_id, params.data.id]
      )).rows
    );
    return { rows };
  });

  app.post("/api/v1/safety/complaints/:id/void", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const appRole = ensureComplaintReadRole(user, reply);
    if (!appRole) return;
    if (appRole !== "owner") {
      return reply.code(403).send({
        error: "E_COMPLAINT_PRIVACY_GATED",
        message: "Only an Owner can void a complaint.",
      });
    }
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const voided = await withCompany(user.uuid, appRole, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.complaints
          SET voided_at = now(), voided_by = $2, void_reason = $4
          WHERE id = $1
            AND operating_company_id = $3::uuid
            AND voided_at IS NULL
          RETURNING *
        `,
        [params.data.id, user.uuid, query.data.operating_company_id, body.data.void_reason]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.complaint.voided",
        { complaint_id: row.id, operating_company_id: query.data.operating_company_id, void_reason: body.data.void_reason },
        "warning",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return row;
    });
    if (!voided) {
      return reply.code(404).send({
        error: "complaint_not_found",
        message: "The complaint could not be found or was already voided.",
      });
    }
    return { complaint: voided };
  });
}
