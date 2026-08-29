import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { OperatingCompanyMembershipError, resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

const qualityReadRoles = new Set(["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety"]);
const qualityWriteRoles = new Set(["Owner"]);
const eventTypeSchema = z.enum([
  "late_payment",
  "non_payment",
  "lumper_dispute",
  "detention_dispute",
  "tonu_dispute",
  "load_cancelled",
  "rate_dispute",
  "damage_claim",
  "commendation",
  "other",
]);
const severitySchema = z.enum(["info", "warning", "severe"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = z.string().uuid();

const customerParamsSchema = z.object({ customer_id: uuidSchema });
const eventParamsSchema = z.object({ customer_id: uuidSchema, event_id: uuidSchema });
const reasonsQuerySchema = z.object({
  operating_company_id: uuidSchema,
  event_type: eventTypeSchema.optional(),
  include_inactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});
const listQuerySchema = z.object({
  operating_company_id: uuidSchema,
  include_voided: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});
// CUST-F5995 — POST/PATCH-void/PATCH-update all resolved the caller's DEFAULT company (or none at
// all), ignoring any company the caller actually had selected on the Customer Detail page. That let
// create silently write against the wrong entity after a company switch, and let void/update look up
// the target event by event_id/customer_id alone with no company binding whatsoever — under Owner RLS
// (org.user_accessible_company_ids() returns every entity for Owner sessions) that permitted voiding or
// editing another company's quality event by UUID. Every mutation below now takes the same optional
// operating_company_id query param the GET routes already use and resolves/validates it the same way.
const companyQuerySchema = z.object({ operating_company_id: uuidSchema.optional() });

const createCustomerQualityEventBodySchema = z
  .object({
    event_type: eventTypeSchema,
    event_date: isoDateSchema,
    severity: severitySchema,
    summary: z.string().trim().min(1).max(500),
    details: z.string().trim().max(5000).optional(),
    reason_id: uuidSchema.optional(),
    dollar_impact_amount: z.number().min(0).optional(),
    dollar_currency: z.string().trim().min(3).max(3).optional(),
    days_late: z.number().int().min(0).optional(),
    related_load_id: uuidSchema.optional(),
    related_invoice_id: uuidSchema.optional(),
    document_ids: z.array(uuidSchema).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event_type !== "commendation" && value.event_type !== "other" && !value.reason_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reason_id is required for this event_type",
        path: ["reason_id"],
      });
    }
  });

const updateCustomerQualityEventBodySchema = z
  .object({
    details: z.string().trim().max(5000).nullable().optional(),
    document_ids: z.array(uuidSchema).max(100).nullable().optional(),
    dollar_impact_amount: z.number().min(0).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const voidCustomerQualityEventBodySchema = z.object({
  void_reason: z.string().trim().min(10).max(1000),
});

const DISPUTE_TYPES = new Set(["lumper_dispute", "detention_dispute", "tonu_dispute", "rate_dispute", "damage_claim"]);

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canRead(role: string): boolean {
  return qualityReadRoles.has(role);
}

function canWrite(role: string): boolean {
  return qualityWriteRoles.has(role);
}

function isRecentDispute(eventType: string, eventDate: string | Date): boolean {
  if (!DISPUTE_TYPES.has(eventType)) return false;
  const normalizedDate =
    eventDate instanceof Date
      ? new Date(Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate()))
      : new Date(`${eventDate}T00:00:00.000Z`);
  if (Number.isNaN(normalizedDate.getTime())) return false;
  const threshold = new Date();
  threshold.setUTCFullYear(threshold.getUTCFullYear() - 1);
  return normalizedDate >= threshold;
}

function todayIsoDate() {
  return companyBusinessDate();
}

export async function registerCustomerQualityEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/customer-quality-event-reasons", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = reasonsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const reasons = await withCurrentUser(authUser.uuid, async (client) => {
      // customer_quality_event_reasons is per-entity + FORCE RLS (202607920000). Resolve the caller's
      // company and set the GUC so the read returns the entity's rows; also filter explicitly.
      const companyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id
      );
      if (!companyId) return null;
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      const values: unknown[] = [companyId];
      const filters: string[] = ["r.operating_company_id = $1::uuid"];
      if (!parsedQuery.data.include_inactive) filters.push("r.is_active = true", "r.deactivated_at IS NULL");
      if (parsedQuery.data.event_type) {
        values.push(parsedQuery.data.event_type);
        filters.push(`r.event_type = $${values.length}`);
      }
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT r.id, r.operating_company_id, r.code, r.label, r.description, r.event_type, r.severity, r.is_active, r.deactivated_at
          FROM catalogs.customer_quality_event_reasons r
          ${whereClause}
          ORDER BY
            r.event_type ASC,
            CASE r.severity WHEN 'severe' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
            r.label ASC
        `,
        values
      );
      return res.rows;
    });
    if (reasons === null) return reply.code(403).send({ error: "forbidden" });
    return { reasons };
  });

  app.get("/api/v1/mdata/customers/:customer_id/quality-events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canRead(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = customerParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const events = await withCurrentUser(authUser.uuid, async (client) => {
      // XE-IDOR fix (financial read leak): mdata.* RLS is role-scoped, NOT entity-scoped, so an
      // id-only parent-existence check exposes another operating company's dispute dollars. Resolve
      // the caller's operating company and bind it on BOTH the parent check and the events query so
      // a foreign customer id can only ever return the caller's own entity's rows.
      const companyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id
      );
      if (!companyId) return { error: "mdata_customer_not_found" as const };
      // Set the GUC so the LEFT JOIN on the per-entity reasons catalog resolves under FORCE RLS.
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);

      // CUST-F5974 — quality events are permanent history. customers_select intentionally hides
      // deactivated rows, so a plain parent lookup (and the redundant parent JOIN below) made an
      // archived customer's immutable history disappear. Validate the exact same-company parent
      // through the existing narrow SECURITY DEFINER resolver; the event query remains pinned to
      // that validated customer id and never broadens to another entity.
      const customerRes = await client.query(
        `SELECT id FROM mdata.get_customer_same_company($1::uuid, $2::uuid) LIMIT 1`,
        [parsedParams.data.customer_id, companyId]
      );
      if (!customerRes.rows[0]) return { error: "mdata_customer_not_found" as const };

      const filters = ["e.customer_id = $1"];
      if (!parsedQuery.data.include_voided) filters.push("e.voided_at IS NULL");
      const res = await client.query(
        `
          SELECT
            e.id, e.customer_id, e.event_type, e.event_date, e.severity, e.summary, e.details,
            e.reason_id, r.code AS reason_code, r.label AS reason_label,
            e.dollar_impact_amount, e.dollar_currency, e.days_late,
            e.related_load_id, rl.load_number AS related_load_number,
            e.related_invoice_id, ri.display_id AS related_invoice_display_id, e.document_ids,
            e.voided_at, e.voided_by_user_id, vu.email AS voided_by_user_email, e.void_reason,
            e.created_at, e.updated_at
          FROM mdata.customer_quality_events e
          LEFT JOIN catalogs.customer_quality_event_reasons r ON r.id = e.reason_id
          LEFT JOIN identity.users vu ON vu.id = e.voided_by_user_id
          LEFT JOIN mdata.loads rl
            ON rl.id = e.related_load_id
           AND rl.operating_company_id = $2::uuid
           AND rl.customer_id = e.customer_id
          LEFT JOIN accounting.invoices ri
            ON ri.id = e.related_invoice_id
           AND ri.operating_company_id = $2::uuid
           AND ri.customer_id = e.customer_id
          WHERE ${filters.join(" AND ")}
          ORDER BY e.event_date DESC, e.created_at DESC
        `,
        [parsedParams.data.customer_id, companyId]
      );
      return { events: res.rows };
    });

    if ("error" in events) return reply.code(404).send({ error: events.error });
    return events;
  });

  app.post("/api/v1/mdata/customers/:customer_id/quality-events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canWrite(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = customerParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = createCustomerQualityEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    if (body.event_date > todayIsoDate()) return reply.code(400).send({ error: "event_date_in_future" });

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      // CUST-F5995 — resolve the caller's SELECTED company (falls back to their default only when
      // omitted), scope the customer check to it (closes the id-only XE-IDOR the GET already fixed),
      // and set the GUC so the per-entity reason lookup below resolves in the customer's entity
      // (customer_quality_event_reasons is FORCE RLS). A named company the caller isn't a member of
      // throws OperatingCompanyMembershipError, mapped to the same not-found the caller would see for
      // any other cross-company id.
      const companyId = await resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id).catch(
        (e) => {
          if (e instanceof OperatingCompanyMembershipError) return null;
          throw e;
        }
      );
      if (!companyId) return { error: "mdata_customer_not_found" as const };
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      const customerRes = await client.query(
        `SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [parsedParams.data.customer_id, companyId]
      );
      if (!customerRes.rows[0]) return { error: "mdata_customer_not_found" as const };

      let relatedLoadNumber: string | null = null;
      if (body.related_load_id) {
        const relatedLoadRes = await client.query<{ id: string; load_number: string | null }>(
          `SELECT l.id, l.load_number
             FROM mdata.loads l
            WHERE l.id = $1::uuid
              AND l.operating_company_id = $2::uuid
              AND l.customer_id = $3::uuid
            LIMIT 1`,
          [body.related_load_id, companyId, parsedParams.data.customer_id],
        );
        if (!relatedLoadRes.rows[0]) return { error: "invalid_related_load_id" as const };
        relatedLoadNumber = relatedLoadRes.rows[0].load_number ?? null;
      }

      let relatedInvoiceDisplayId: string | null = null;
      if (body.related_invoice_id) {
        const relatedInvoiceRes = await client.query<{ id: string; display_id: string | null }>(
          `SELECT i.id, i.display_id
             FROM accounting.invoices i
            WHERE i.id = $1::uuid
              AND i.operating_company_id = $2::uuid
              AND i.customer_id = $3::uuid
            LIMIT 1`,
          [body.related_invoice_id, companyId, parsedParams.data.customer_id],
        );
        if (!relatedInvoiceRes.rows[0]) return { error: "invalid_related_invoice_id" as const };
        relatedInvoiceDisplayId = relatedInvoiceRes.rows[0].display_id ?? null;
      }

      let normalizedSeverity = body.severity;
      if (body.reason_id) {
        const reasonRes = await client.query<{ id: string; event_type: string; severity: "info" | "warning" | "severe" }>(
          `
            SELECT id, event_type, severity
            FROM catalogs.customer_quality_event_reasons
            WHERE id = $1
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [body.reason_id]
        );
        const reason = reasonRes.rows[0];
        if (!reason) return { error: "invalid_reason_id" as const };
        if (reason.event_type !== body.event_type) return { error: "reason_event_type_mismatch" as const };
        if (reason.severity !== body.severity) return { error: "reason_severity_mismatch" as const };
        normalizedSeverity = reason.severity;
      }

      const insertRes = await client.query(
        `
          INSERT INTO mdata.customer_quality_events (
            customer_id, event_type, event_date, severity, summary, details, reason_id,
            dollar_impact_amount, dollar_currency, days_late,
            related_load_id, related_invoice_id, document_ids,
            created_by_user_id, updated_by_user_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14
          )
          RETURNING *
        `,
        [
          parsedParams.data.customer_id,
          body.event_type,
          body.event_date,
          normalizedSeverity,
          body.summary,
          body.details ?? null,
          body.reason_id ?? null,
          body.dollar_impact_amount ?? null,
          (body.dollar_currency ?? "USD").toUpperCase(),
          body.days_late ?? null,
          body.related_load_id ?? null,
          body.related_invoice_id ?? null,
          body.document_ids ?? [],
          authUser.uuid,
        ]
      );
      const row = insertRes.rows[0];

      if (isRecentDispute(row.event_type, row.event_date)) {
        await client.query(
          `
            UPDATE mdata.customers
            SET quality_disputes_count = GREATEST(0, quality_disputes_count + 1), updated_by_user_id = $2
            WHERE id = $1
          `,
          [parsedParams.data.customer_id, authUser.uuid]
        );
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.customer_quality_events.created",
        {
          resource_id: row.id,
          resource_type: "mdata.customer_quality_events",
          customer_id: row.customer_id,
          event_type: row.event_type,
          severity: row.severity,
          dollar_impact_amount: row.dollar_impact_amount,
        },
        row.severity === "severe" ? "critical" : row.severity,
        "BT-1-CUSTOMER-QUALITY-FLAGS"
      );

      return {
        ...row,
        related_load_number: relatedLoadNumber,
        related_invoice_display_id: relatedInvoiceDisplayId,
      };
    });

    if ("error" in created) {
      if (created.error === "mdata_customer_not_found") return reply.code(404).send({ error: created.error });
      return reply.code(400).send({ error: created.error });
    }
    return reply.code(201).send({ event: created });
  });

  app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canWrite(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = voidCustomerQualityEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      // CUST-F5995 — this lookup previously bound only event_id + customer_id with no company context
      // at all, so an Owner session (RLS is not a backstop for Owner — org.user_accessible_company_ids()
      // returns every entity) could void any company's event by UUID. Resolve + validate the caller's
      // selected company the same way the GET route does, and prove the customer belongs to it via the
      // same SECURITY DEFINER helper (mdata.get_customer_same_company) BEFORE ever touching the event —
      // it still finds archived customers so permanent quality history stays voidable (CUST-F5974).
      const companyId = await resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id).catch(
        (e) => {
          if (e instanceof OperatingCompanyMembershipError) return null;
          throw e;
        }
      );
      if (!companyId) return { error: "customer_quality_event_not_found" as const };
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      const customerRes = await client.query(
        `SELECT id FROM mdata.get_customer_same_company($1::uuid, $2::uuid) LIMIT 1`,
        [parsedParams.data.customer_id, companyId]
      );
      if (!customerRes.rows[0]) return { error: "customer_quality_event_not_found" as const };

      const currentRes = await client.query<{ id: string; event_type: string; event_date: string; voided_at: string | null }>(
        `
          SELECT id, event_type, event_date, voided_at
          FROM mdata.customer_quality_events
          WHERE id = $1 AND customer_id = $2
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.customer_id]
      );
      const current = currentRes.rows[0];
      if (!current) return { error: "customer_quality_event_not_found" as const };
      if (current.voided_at) return { error: "already_voided" as const };

      const updateRes = await client.query(
        `
          UPDATE mdata.customer_quality_events
          SET voided_at = now(), voided_by_user_id = $3, void_reason = $4, updated_by_user_id = $3
          WHERE id = $1 AND customer_id = $2
          RETURNING *
        `,
        [parsedParams.data.event_id, parsedParams.data.customer_id, authUser.uuid, parsedBody.data.void_reason]
      );
      const row = updateRes.rows[0];

      if (isRecentDispute(current.event_type, current.event_date)) {
        await client.query(
          `
            UPDATE mdata.customers
            SET quality_disputes_count = GREATEST(0, quality_disputes_count - 1), updated_by_user_id = $2
            WHERE id = $1
          `,
          [parsedParams.data.customer_id, authUser.uuid]
        );
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.customer_quality_events.voided",
        {
          resource_id: row.id,
          resource_type: "mdata.customer_quality_events",
          customer_id: row.customer_id,
          void_reason: row.void_reason,
        },
        "warning",
        "BT-1-CUSTOMER-QUALITY-FLAGS"
      );

      return row;
    });

    if ("error" in result) {
      if (result.error === "already_voided") return reply.code(400).send({ error: "already_voided" });
      return reply.code(404).send({ error: result.error });
    }
    return { event: result };
  });

  app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canWrite(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = updateCustomerQualityEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const values: unknown[] = [parsedParams.data.event_id, parsedParams.data.customer_id, authUser.uuid];
    const sets: string[] = [];
    if ("details" in parsedBody.data) {
      values.push(parsedBody.data.details ?? null);
      sets.push(`details = $${values.length}`);
    }
    if ("document_ids" in parsedBody.data) {
      values.push(parsedBody.data.document_ids ?? []);
      sets.push(`document_ids = $${values.length}`);
    }
    if ("dollar_impact_amount" in parsedBody.data) {
      values.push(parsedBody.data.dollar_impact_amount ?? null);
      sets.push(`dollar_impact_amount = $${values.length}`);
    }
    sets.push("updated_by_user_id = $3");

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      // CUST-F5995 — same fix as void: bind the caller's resolved+validated company before the event
      // lookup so this can't reach another entity's row under Owner RLS.
      const companyId = await resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id).catch(
        (e) => {
          if (e instanceof OperatingCompanyMembershipError) return null;
          throw e;
        }
      );
      if (!companyId) return null;
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      const customerRes = await client.query(
        `SELECT id FROM mdata.get_customer_same_company($1::uuid, $2::uuid) LIMIT 1`,
        [parsedParams.data.customer_id, companyId]
      );
      if (!customerRes.rows[0]) return null;

      const currentRes = await client.query(
        `
          SELECT id
          FROM mdata.customer_quality_events
          WHERE id = $1 AND customer_id = $2
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.customer_id]
      );
      if (!currentRes.rows[0]) return null;

      const updateRes = await client.query(
        `
          UPDATE mdata.customer_quality_events
          SET ${sets.join(", ")}
          WHERE id = $1 AND customer_id = $2
          RETURNING *
        `,
        values
      );
      const row = updateRes.rows[0] ?? null;
      if (!row) return null;

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.customer_quality_events.updated",
        {
          resource_id: row.id,
          resource_type: "mdata.customer_quality_events",
          customer_id: row.customer_id,
          fields: Object.keys(parsedBody.data),
        },
        "info",
        "BT-1-CUSTOMER-QUALITY-FLAGS"
      );

      return row;
    });

    if (!updated) return reply.code(404).send({ error: "customer_quality_event_not_found" });
    return { event: updated };
  });
}
