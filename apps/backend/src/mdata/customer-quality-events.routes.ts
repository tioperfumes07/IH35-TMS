import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

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
  event_type: eventTypeSchema.optional(),
  include_inactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});
const listQuerySchema = z.object({
  include_voided: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

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
  if (!requireAuth(req, reply)) return null;
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
  return new Date().toISOString().slice(0, 10);
}

export async function registerCustomerQualityEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/customer-quality-event-reasons", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = reasonsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const reasons = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (!parsedQuery.data.include_inactive) filters.push("r.is_active = true", "r.deactivated_at IS NULL");
      if (parsedQuery.data.event_type) {
        values.push(parsedQuery.data.event_type);
        filters.push(`r.event_type = $${values.length}`);
      }
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT r.id, r.code, r.label, r.description, r.event_type, r.severity, r.is_active, r.deactivated_at
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
    return { reasons };
  });

  app.get("/api/v1/mdata/customers/:customer_id/quality-events", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canRead(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = customerParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const events = await withCurrentUser(authUser.uuid, async (client) => {
      const customerRes = await client.query(`SELECT id FROM mdata.customers WHERE id = $1 LIMIT 1`, [parsedParams.data.customer_id]);
      if (!customerRes.rows[0]) return { error: "mdata_customer_not_found" as const };

      const filters = ["e.customer_id = $1"];
      if (!parsedQuery.data.include_voided) filters.push("e.voided_at IS NULL");
      const res = await client.query(
        `
          SELECT
            e.id, e.customer_id, e.event_type, e.event_date, e.severity, e.summary, e.details,
            e.reason_id, r.code AS reason_code, r.label AS reason_label,
            e.dollar_impact_amount, e.dollar_currency, e.days_late,
            e.related_load_id, e.related_invoice_id, e.document_ids,
            e.voided_at, e.voided_by_user_id, vu.email AS voided_by_user_email, e.void_reason,
            e.created_at, e.updated_at
          FROM mdata.customer_quality_events e
          LEFT JOIN catalogs.customer_quality_event_reasons r ON r.id = e.reason_id
          LEFT JOIN identity.users vu ON vu.id = e.voided_by_user_id
          WHERE ${filters.join(" AND ")}
          ORDER BY e.event_date DESC, e.created_at DESC
        `,
        [parsedParams.data.customer_id]
      );
      return { events: res.rows };
    });

    if ("error" in events) return reply.code(404).send({ error: events.error });
    return events;
  });

  app.post("/api/v1/mdata/customers/:customer_id/quality-events", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canWrite(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = customerParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createCustomerQualityEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    if (body.event_date > todayIsoDate()) return reply.code(400).send({ error: "event_date_in_future" });

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const customerRes = await client.query(`SELECT id FROM mdata.customers WHERE id = $1 LIMIT 1`, [parsedParams.data.customer_id]);
      if (!customerRes.rows[0]) return { error: "mdata_customer_not_found" as const };

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

      return row;
    });

    if ("error" in created) {
      if (created.error === "mdata_customer_not_found") return reply.code(404).send({ error: created.error });
      return reply.code(400).send({ error: created.error });
    }
    return reply.code(201).send({ event: created });
  });

  app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id/void", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canWrite(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = voidCustomerQualityEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
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

  app.patch("/api/v1/mdata/customers/:customer_id/quality-events/:event_id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canWrite(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
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
