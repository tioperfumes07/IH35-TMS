import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const ownerAdminRoles = new Set(["Owner", "Administrator"]);
const eventTypeSchema = z.enum([
  "customer_complaint",
  "missed_appointment",
  "unpaid_invoice_responsibility",
  "abandoned_load_dispatcher_fault",
  "rate_below_threshold_unjustified",
  "driver_complaint_validated",
  "commendation",
  "training_required",
  "policy_violation",
  "other",
]);
const severitySchema = z.enum(["info", "warning", "severe"]);
const costRecoveryStatusSchema = z.enum(["pending", "partial", "recovered", "waived", "absorbed"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = z.string().uuid();

const userParamsSchema = z.object({ user_id: uuidSchema });
const eventParamsSchema = z.object({ user_id: uuidSchema, event_id: uuidSchema });
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

const createDispatcherSafetyEventBodySchema = z
  .object({
    event_type: eventTypeSchema,
    event_date: isoDateSchema,
    severity: severitySchema,
    summary: z.string().trim().min(1).max(500),
    details: z.string().trim().max(5000).optional(),
    error_reason_id: uuidSchema.optional(),
    cost_amount: z.number().min(0).optional(),
    cost_currency: z.string().trim().min(3).max(3).optional(),
    cost_recovered_amount: z.number().min(0).optional(),
    cost_recovery_status: costRecoveryStatusSchema.optional(),
    related_load_id: uuidSchema.optional(),
    related_customer_id: uuidSchema.optional(),
    related_driver_id: uuidSchema.optional(),
    document_ids: z.array(uuidSchema).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event_type !== "commendation" && value.event_type !== "other" && !value.error_reason_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error_reason_id is required for this event_type",
        path: ["error_reason_id"],
      });
    }
  });

const updateDispatcherSafetyEventBodySchema = z
  .object({
    details: z.string().trim().max(5000).nullable().optional(),
    document_ids: z.array(uuidSchema).max(100).nullable().optional(),
    cost_recovery_status: costRecoveryStatusSchema.nullable().optional(),
    cost_recovered_amount: z.number().min(0).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const voidDispatcherSafetyEventBodySchema = z.object({
  void_reason: z.string().trim().min(10).max(1000),
});

const returningDispatcherBodySchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canReadDispatcherSafety(role: string): boolean {
  return ownerAdminRoles.has(role);
}

function isOwner(role: string): boolean {
  return role === "Owner";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureTrackableDispatcherUser(client: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, userId: string) {
  const res = await client.query(
    `
      SELECT
        u.id,
        u.email,
        u.role,
        EXISTS (SELECT 1 FROM mdata.drivers d WHERE d.identity_user_id = u.id) AS has_driver_record
      FROM identity.users u
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );
  const user = res.rows[0] ?? null;
  if (!user) return { error: "identity_user_not_found" as const };
  if (String(user.role) === "Owner") return { error: "cannot_track_owner" as const };
  if (Boolean(user.has_driver_record)) return { error: "user_is_driver_use_driver_safety" as const };
  return {
    id: String(user.id),
    email: (user.email as string | null) ?? null,
    role: String(user.role),
  };
}

async function findReturningDispatcherMatches(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  email: string
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      returning_dispatcher: false,
      matched_events: [],
      severity_summary: { severe_count: 0, warning_count: 0, info_count: 0 },
    };
  }

  const res = await client.query(
    `
      SELECT
        e.id AS event_id,
        e.dispatcher_user_id,
        e.event_type,
        e.event_date,
        e.severity,
        e.summary,
        e.cost_amount,
        e.cost_currency,
        e.cost_recovery_status,
        e.voided_at IS NOT NULL AS voided,
        e.dispatcher_email_snapshot,
        er.code AS error_reason_code,
        er.label AS error_reason_label
      FROM mdata.dispatcher_safety_events e
      LEFT JOIN catalogs.dispatcher_error_reasons er ON er.id = e.error_reason_id
      WHERE lower(e.dispatcher_email_snapshot) = $1
      ORDER BY e.event_date DESC, e.created_at DESC
      LIMIT 50
    `,
    [normalizedEmail]
  );

  const matchedEvents = res.rows.map((row) => ({
    event_id: String(row.event_id),
    dispatcher_user_id: String(row.dispatcher_user_id),
    event_type: String(row.event_type),
    event_date: String(row.event_date),
    severity: row.severity as "info" | "warning" | "severe",
    summary: String(row.summary),
    cost_amount: row.cost_amount === null ? null : Number(row.cost_amount),
    cost_currency: row.cost_currency ?? "USD",
    cost_recovery_status: row.cost_recovery_status,
    error_reason: row.error_reason_code
      ? {
          code: String(row.error_reason_code),
          label: String(row.error_reason_label ?? row.error_reason_code),
        }
      : null,
    voided: Boolean(row.voided),
  }));

  const severitySummary = matchedEvents.reduce(
    (acc, event) => {
      if (event.severity === "severe") acc.severe_count += 1;
      else if (event.severity === "warning") acc.warning_count += 1;
      else acc.info_count += 1;
      return acc;
    },
    { severe_count: 0, warning_count: 0, info_count: 0 }
  );

  return {
    returning_dispatcher: matchedEvents.length > 0,
    matched_events: matchedEvents,
    severity_summary: severitySummary,
  };
}

export async function registerDispatcherSafetyEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/dispatcher-error-reasons", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadDispatcherSafety(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedQuery = reasonsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const reasons = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (!parsedQuery.data.include_inactive) {
        filters.push("r.is_active = true", "r.deactivated_at IS NULL");
      }
      if (parsedQuery.data.event_type) {
        values.push(parsedQuery.data.event_type);
        filters.push(`r.event_type = $${values.length}`);
      }
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT r.id, r.code, r.label, r.description, r.event_type, r.severity, r.is_active, r.deactivated_at
          FROM catalogs.dispatcher_error_reasons r
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

  app.get("/api/v1/identity/users/:user_id/safety-events", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadDispatcherSafety(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = userParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      const trackable = await ensureTrackableDispatcherUser(client, parsedParams.data.user_id);
      if ("error" in trackable) return trackable;
      const filters = ["e.dispatcher_user_id = $1"];
      if (!parsedQuery.data.include_voided) {
        filters.push("e.voided_at IS NULL");
      }
      const res = await client.query(
        `
          SELECT
            e.id,
            e.dispatcher_user_id,
            e.event_type,
            e.event_date,
            e.severity,
            e.summary,
            e.details,
            e.error_reason_id,
            r.code AS error_reason_code,
            r.label AS error_reason_label,
            e.cost_amount,
            e.cost_currency,
            e.cost_recovered_amount,
            e.cost_recovery_status,
            e.related_load_id,
            e.related_customer_id,
            e.related_driver_id,
            e.document_ids,
            e.dispatcher_email_snapshot,
            e.voided_at,
            e.voided_by_user_id,
            vu.email AS voided_by_user_email,
            e.void_reason,
            e.created_at,
            e.updated_at
          FROM mdata.dispatcher_safety_events e
          LEFT JOIN catalogs.dispatcher_error_reasons r ON r.id = e.error_reason_id
          LEFT JOIN identity.users vu ON vu.id = e.voided_by_user_id
          WHERE ${filters.join(" AND ")}
          ORDER BY e.event_date DESC, e.created_at DESC
        `,
        [parsedParams.data.user_id]
      );
      return { events: res.rows };
    });

    if ("error" in rows) {
      if (rows.error === "identity_user_not_found") return reply.code(404).send({ error: rows.error });
      if (rows.error === "cannot_track_owner" || rows.error === "user_is_driver_use_driver_safety") {
        return reply.code(400).send({ error: rows.error });
      }
    }
    return rows;
  });

  app.post("/api/v1/identity/users/:user_id/safety-events", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = userParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createDispatcherSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    if (body.event_date > todayIsoDate()) return reply.code(400).send({ error: "event_date_in_future" });

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const trackable = await ensureTrackableDispatcherUser(client, parsedParams.data.user_id);
      if ("error" in trackable) return trackable;

      let normalizedSeverity = body.severity;
      if (body.error_reason_id) {
        const reasonRes = await client.query<{ id: string; event_type: string; severity: "info" | "warning" | "severe" }>(
          `
            SELECT id, event_type, severity
            FROM catalogs.dispatcher_error_reasons
            WHERE id = $1
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [body.error_reason_id]
        );
        const reason = reasonRes.rows[0];
        if (!reason) return { error: "invalid_error_reason" as const };
        if (reason.event_type !== body.event_type) return { error: "error_reason_event_type_mismatch" as const };
        if (reason.severity !== body.severity) return { error: "error_reason_severity_mismatch" as const };
        normalizedSeverity = reason.severity;
      }

      const insertRes = await client.query(
        `
          INSERT INTO mdata.dispatcher_safety_events (
            dispatcher_user_id, event_type, event_date, severity, summary, details, error_reason_id,
            cost_amount, cost_currency, cost_recovered_amount, cost_recovery_status,
            related_load_id, related_customer_id, related_driver_id,
            document_ids, dispatcher_email_snapshot, created_by_user_id, updated_by_user_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17
          )
          RETURNING *
        `,
        [
          trackable.id,
          body.event_type,
          body.event_date,
          normalizedSeverity,
          body.summary,
          body.details ?? null,
          body.error_reason_id ?? null,
          body.cost_amount ?? null,
          (body.cost_currency ?? "USD").toUpperCase(),
          body.cost_recovered_amount ?? null,
          body.cost_recovery_status ?? null,
          body.related_load_id ?? null,
          body.related_customer_id ?? null,
          body.related_driver_id ?? null,
          body.document_ids ?? [],
          trackable.email ? trackable.email.toLowerCase() : null,
          authUser.uuid,
        ]
      );
      const row = insertRes.rows[0];

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.dispatcher_safety_events.created",
        {
          resource_id: row.id,
          resource_type: "mdata.dispatcher_safety_events",
          dispatcher_user_id: row.dispatcher_user_id,
          event_type: row.event_type,
          severity: row.severity,
          cost_amount: row.cost_amount,
        },
        row.severity === "severe" ? "critical" : row.severity,
        "BT-1-DISPATCHER-SAFETY-FILE"
      );

      return row;
    });

    if ("error" in created) {
      if (created.error === "identity_user_not_found") return reply.code(404).send({ error: created.error });
      if (created.error === "cannot_track_owner" || created.error === "user_is_driver_use_driver_safety") {
        return reply.code(400).send({ error: created.error });
      }
      if (created.error === "invalid_error_reason") return reply.code(400).send({ error: created.error });
      if (created.error === "error_reason_event_type_mismatch") return reply.code(400).send({ error: created.error });
      if (created.error === "error_reason_severity_mismatch") return reply.code(400).send({ error: created.error });
    }

    return reply.code(201).send({ event: created });
  });

  app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id/void", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = voidDispatcherSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const currentRes = await client.query<{ id: string; voided_at: string | null }>(
        `
          SELECT id, voided_at
          FROM mdata.dispatcher_safety_events
          WHERE id = $1 AND dispatcher_user_id = $2
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.user_id]
      );
      const current = currentRes.rows[0];
      if (!current) return { error: "dispatcher_safety_event_not_found" as const };
      if (current.voided_at) return { error: "already_voided" as const };

      const updateRes = await client.query(
        `
          UPDATE mdata.dispatcher_safety_events
          SET voided_at = now(), voided_by_user_id = $3, void_reason = $4, updated_by_user_id = $3
          WHERE id = $1 AND dispatcher_user_id = $2
          RETURNING *
        `,
        [parsedParams.data.event_id, parsedParams.data.user_id, authUser.uuid, parsedBody.data.void_reason]
      );
      const row = updateRes.rows[0];

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.dispatcher_safety_events.voided",
        {
          resource_id: row.id,
          resource_type: "mdata.dispatcher_safety_events",
          dispatcher_user_id: row.dispatcher_user_id,
          void_reason: row.void_reason,
        },
        "warning",
        "BT-1-DISPATCHER-SAFETY-FILE"
      );

      return row;
    });

    if ("error" in result) {
      if (result.error === "already_voided") return reply.code(400).send({ error: "already_voided" });
      return reply.code(404).send({ error: result.error });
    }
    return { event: result };
  });

  app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateDispatcherSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const values: unknown[] = [parsedParams.data.event_id, parsedParams.data.user_id, authUser.uuid];
    const sets: string[] = [];
    if ("details" in parsedBody.data) {
      values.push(parsedBody.data.details ?? null);
      sets.push(`details = $${values.length}`);
    }
    if ("document_ids" in parsedBody.data) {
      values.push(parsedBody.data.document_ids ?? []);
      sets.push(`document_ids = $${values.length}`);
    }
    if ("cost_recovery_status" in parsedBody.data) {
      values.push(parsedBody.data.cost_recovery_status ?? null);
      sets.push(`cost_recovery_status = $${values.length}`);
    }
    if ("cost_recovered_amount" in parsedBody.data) {
      values.push(parsedBody.data.cost_recovered_amount ?? null);
      sets.push(`cost_recovered_amount = $${values.length}`);
    }
    sets.push("updated_by_user_id = $3");

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const currentRes = await client.query(
        `
          SELECT id
          FROM mdata.dispatcher_safety_events
          WHERE id = $1 AND dispatcher_user_id = $2
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.user_id]
      );
      if (!currentRes.rows[0]) return null;

      const updateRes = await client.query(
        `
          UPDATE mdata.dispatcher_safety_events
          SET ${sets.join(", ")}
          WHERE id = $1 AND dispatcher_user_id = $2
          RETURNING *
        `,
        values
      );
      const row = updateRes.rows[0] ?? null;
      if (!row) return null;

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.dispatcher_safety_events.updated",
        {
          resource_id: row.id,
          resource_type: "mdata.dispatcher_safety_events",
          dispatcher_user_id: row.dispatcher_user_id,
          fields: Object.keys(parsedBody.data),
        },
        "info",
        "BT-1-DISPATCHER-SAFETY-FILE"
      );

      return row;
    });
    if (!updated) return reply.code(404).send({ error: "dispatcher_safety_event_not_found" });
    return { event: updated };
  });

  app.post("/api/v1/identity/users/check-returning-dispatcher", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadDispatcherSafety(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedBody = returningDispatcherBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      return findReturningDispatcherMatches(client, parsedBody.data.email);
    });

    return result;
  });
}

export { findReturningDispatcherMatches, ensureTrackableDispatcherUser };
