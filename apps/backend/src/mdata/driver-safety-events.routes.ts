import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const safetyReadableRoles = new Set(["Owner", "Administrator", "Manager", "Safety"]);
const eventTypeSchema = z.enum(["termination", "incident", "complaint", "commendation", "dispute"]);
const severitySchema = z.enum(["info", "warning", "severe"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = z.string().uuid();

const routeParamsSchema = z.object({
  driver_id: uuidSchema,
});

const eventParamsSchema = z.object({
  driver_id: uuidSchema,
  event_id: uuidSchema,
});

const listQuerySchema = z.object({
  include_voided: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

const createSafetyEventBodySchema = z
  .object({
    event_type: eventTypeSchema,
    event_date: isoDateSchema,
    severity: severitySchema,
    summary: z.string().trim().min(1).max(500),
    details: z.string().trim().max(5000).optional(),
    termination_reason_id: uuidSchema.optional(),
    related_load_id: uuidSchema.optional(),
    document_ids: z.array(uuidSchema).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event_type === "termination" && !value.termination_reason_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "termination_reason_id is required for termination events",
        path: ["termination_reason_id"],
      });
    }
  });

const updateSafetyEventBodySchema = z
  .object({
    details: z.string().trim().max(5000).nullable().optional(),
    document_ids: z.array(uuidSchema).max(100).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const voidSafetyEventBodySchema = z.object({
  void_reason: z.string().trim().min(10).max(1000),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOwner(role: string): boolean {
  return role === "Owner";
}

function canReadSafetyFile(role: string): boolean {
  return safetyReadableRoles.has(role);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function registerDriverSafetyEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/driver-termination-reasons", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadSafetyFile(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const querySchema = z.object({
      include_inactive: z
        .union([z.boolean(), z.string()])
        .optional()
        .transform((value) => value === true || value === "true"),
    });
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const reasons = await withCurrentUser(authUser.uuid, async (client) => {
      const whereClause = parsedQuery.data.include_inactive ? "" : "WHERE is_active = true AND deactivated_at IS NULL";
      const result = await client.query(
        `
          SELECT id, code, label, description, severity, is_active, deactivated_at
          FROM catalogs.driver_termination_reasons
          ${whereClause}
          ORDER BY
            CASE severity
              WHEN 'severe' THEN 1
              WHEN 'warning' THEN 2
              ELSE 3
            END,
            label ASC
        `
      );
      return result.rows;
    });

    return { reasons };
  });

  app.post("/api/v1/catalogs/driver-termination-reasons", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const bodySchema = z.object({
      code: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]+$/, "code must be lowercase letters, digits, and underscores")
        .min(2)
        .max(80),
      label: z.string().trim().min(1).max(160),
      description: z.string().trim().max(1000).nullable().optional(),
      severity: severitySchema,
    });
    const parsedBody = bodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.driver_termination_reasons (code, label, description, severity, created_by_user_id, updated_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $5)
            RETURNING id, code, label, description, severity, is_active, deactivated_at
          `,
          [b.code, b.label, b.description ?? null, b.severity, authUser.uuid]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "catalogs.driver_termination_reasons_created", {
          resource_id: row.id,
          resource_type: "catalogs.driver_termination_reasons",
          code: row.code,
        });
        return row;
      });
      return reply.code(201).send({ reason: created });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "termination_reason_code_conflict" });
      throw error;
    }
  });

  app.patch("/api/v1/catalogs/driver-termination-reasons/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ id: uuidSchema }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const bodySchema = z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]+$/, "code must be lowercase letters, digits, and underscores")
          .min(2)
          .max(80)
          .optional(),
        label: z.string().trim().min(1).max(160).optional(),
        description: z.string().trim().max(1000).nullable().optional(),
        severity: severitySchema.optional(),
      })
      .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });
    const parsedBody = bodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (name: string, value: unknown) => {
      values.push(value);
      fields.push(`${name} = $${values.length}`);
    };
    if ("code" in b) add("code", b.code);
    if ("label" in b) add("label", b.label);
    if ("description" in b) add("description", b.description ?? null);
    if ("severity" in b) add("severity", b.severity);
    values.push(authUser.uuid);
    fields.push(`updated_by_user_id = $${values.length}`);
    fields.push("updated_at = now()");
    values.push(parsedParams.data.id);

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            UPDATE catalogs.driver_termination_reasons
            SET ${fields.join(", ")}
            WHERE id = $${values.length}
            RETURNING id, code, label, description, severity, is_active, deactivated_at
          `,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;
        await appendCrudAudit(client, authUser.uuid, "catalogs.driver_termination_reasons_updated", {
          resource_id: row.id,
          resource_type: "catalogs.driver_termination_reasons",
        });
        return row;
      });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { reason: updated };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "termination_reason_code_conflict" });
      throw error;
    }
  });

  app.post("/api/v1/catalogs/driver-termination-reasons/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ id: uuidSchema }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.driver_termination_reasons
          SET is_active = false, deactivated_at = now(), updated_by_user_id = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, code, label, description, severity, is_active, deactivated_at
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(client, authUser.uuid, "catalogs.driver_termination_reasons_deactivated", {
        resource_id: row.id,
        resource_type: "catalogs.driver_termination_reasons",
        code: row.code,
      });
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });

  app.post("/api/v1/catalogs/driver-termination-reasons/:id/reactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ id: uuidSchema }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.driver_termination_reasons
          SET is_active = true, deactivated_at = NULL, updated_by_user_id = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, code, label, description, severity, is_active, deactivated_at
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(client, authUser.uuid, "catalogs.driver_termination_reasons_updated", {
        resource_id: row.id,
        resource_type: "catalogs.driver_termination_reasons",
        changes: { is_active: true },
      });
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });

  app.get("/api/v1/mdata/drivers/:driver_id/safety-events", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadSafetyFile(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = routeParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      const filters = ["e.driver_id = $1"];
      if (!parsedQuery.data.include_voided) {
        filters.push("e.voided_at IS NULL");
      }
      const result = await client.query(
        `
          SELECT
            e.id,
            e.driver_id,
            e.event_type,
            e.event_date,
            e.severity,
            e.summary,
            e.details,
            e.termination_reason_id,
            tr.code AS termination_reason_code,
            tr.label AS termination_reason_label,
            tr.severity AS termination_reason_severity,
            e.related_load_id,
            e.document_ids,
            e.curp_snapshot,
            e.cdl_number_snapshot,
            e.cdl_state_snapshot,
            e.voided_at,
            e.voided_by_user_id,
            vu.email AS voided_by_user_email,
            e.void_reason,
            e.created_at,
            e.updated_at,
            e.created_by_user_id,
            e.updated_by_user_id
          FROM mdata.driver_safety_events e
          LEFT JOIN catalogs.driver_termination_reasons tr ON tr.id = e.termination_reason_id
          LEFT JOIN identity.users vu ON vu.id = e.voided_by_user_id
          WHERE ${filters.join(" AND ")}
          ORDER BY e.event_date DESC, e.created_at DESC
        `,
        [parsedParams.data.driver_id]
      );
      return result.rows;
    });

    return { events: rows };
  });

  app.post("/api/v1/mdata/drivers/:driver_id/safety-events", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = routeParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    if (body.event_date > todayIsoDate()) {
      return reply.code(400).send({ error: "event_date_in_future" });
    }

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query<{
        id: string;
        curp: string | null;
        cdl_number: string | null;
        cdl_state: string | null;
      }>(
        `
          SELECT id, curp, cdl_number, cdl_state
          FROM mdata.drivers
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.driver_id]
      );
      const driver = driverRes.rows[0];
      if (!driver) return null;

      let normalizedSeverity = body.severity;
      if (body.event_type === "termination") {
        const reasonRes = await client.query<{ id: string; severity: "info" | "warning" | "severe" }>(
          `
            SELECT id, severity
            FROM catalogs.driver_termination_reasons
            WHERE id = $1
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [body.termination_reason_id]
        );
        const reason = reasonRes.rows[0];
        if (!reason) return { error: "invalid_termination_reason" as const };
        if (reason.severity !== body.severity) {
          return { error: "termination_severity_mismatch" as const };
        }
        normalizedSeverity = reason.severity;
      }

      const insertRes = await client.query(
        `
          INSERT INTO mdata.driver_safety_events (
            driver_id,
            event_type,
            event_date,
            severity,
            summary,
            details,
            termination_reason_id,
            related_load_id,
            document_ids,
            curp_snapshot,
            cdl_number_snapshot,
            cdl_state_snapshot,
            created_by_user_id,
            updated_by_user_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13
          )
          RETURNING *
        `,
        [
          parsedParams.data.driver_id,
          body.event_type,
          body.event_date,
          normalizedSeverity,
          body.summary,
          body.details ?? null,
          body.termination_reason_id ?? null,
          body.related_load_id ?? null,
          body.document_ids ?? [],
          driver.curp ?? null,
          driver.cdl_number ?? null,
          driver.cdl_state ?? null,
          authUser.uuid,
        ]
      );
      const row = insertRes.rows[0];

      if (body.event_type === "termination") {
        await client.query(
          `
            UPDATE mdata.drivers
            SET status = 'Terminated', termination_date = $2, updated_by_user_id = $3
            WHERE id = $1
          `,
          [parsedParams.data.driver_id, body.event_date, authUser.uuid]
        );
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_safety_events.created",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_safety_events",
          driver_id: row.driver_id,
          event_type: row.event_type,
          severity: row.severity,
        },
        row.severity === "severe" ? "critical" : row.severity,
        "BT-1-DRIVER-SAFETY-FILE"
      );

      return row;
    });

    if (!created) return reply.code(404).send({ error: "mdata_driver_not_found" });
    if ("error" in created) {
      if (created.error === "invalid_termination_reason") return reply.code(400).send({ error: "invalid_termination_reason" });
      return reply.code(400).send({ error: "termination_severity_mismatch" });
    }
    return reply.code(201).send({ event: created });
  });

  app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id/void", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = voidSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const currentRes = await client.query<{ id: string; voided_at: string | null }>(
        `
          SELECT id, voided_at
          FROM mdata.driver_safety_events
          WHERE id = $1 AND driver_id = $2
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.driver_id]
      );
      const existing = currentRes.rows[0];
      if (!existing) return { error: "mdata_driver_safety_event_not_found" as const };
      if (existing.voided_at) return { error: "already_voided" as const };

      const updateRes = await client.query(
        `
          UPDATE mdata.driver_safety_events
          SET
            voided_at = now(),
            voided_by_user_id = $3,
            void_reason = $4,
            updated_by_user_id = $3
          WHERE id = $1 AND driver_id = $2
          RETURNING *
        `,
        [parsedParams.data.event_id, parsedParams.data.driver_id, authUser.uuid, parsedBody.data.void_reason]
      );
      const row = updateRes.rows[0];

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_safety_events.voided",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_safety_events",
          driver_id: row.driver_id,
          void_reason: row.void_reason,
        },
        "warning",
        "BT-1-DRIVER-SAFETY-FILE"
      );

      return row;
    });

    if ("error" in result) {
      if (result.error === "already_voided") return reply.code(400).send({ error: "already_voided" });
      return reply.code(404).send({ error: result.error });
    }

    return { event: result };
  });

  app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const values: unknown[] = [parsedParams.data.event_id, parsedParams.data.driver_id, authUser.uuid];
    const sets: string[] = [];
    if ("details" in parsedBody.data) {
      values.push(parsedBody.data.details ?? null);
      sets.push(`details = $${values.length}`);
    }
    if ("document_ids" in parsedBody.data) {
      values.push(parsedBody.data.document_ids ?? []);
      sets.push(`document_ids = $${values.length}`);
    }
    sets.push("updated_by_user_id = $3");

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const currentRes = await client.query<{
        id: string;
        event_type: string;
        event_date: string;
        severity: string;
        termination_reason_id: string | null;
      }>(
        `
          SELECT id, event_type, event_date, severity, termination_reason_id
          FROM mdata.driver_safety_events
          WHERE id = $1 AND driver_id = $2
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.driver_id]
      );
      const current = currentRes.rows[0];
      if (!current) return null;

      const updateRes = await client.query(
        `
          UPDATE mdata.driver_safety_events
          SET ${sets.join(", ")}
          WHERE id = $1 AND driver_id = $2
          RETURNING *
        `,
        values
      );
      const row = updateRes.rows[0] ?? null;
      if (!row) return null;

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_safety_events.updated",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_safety_events",
          driver_id: row.driver_id,
          fields: Object.keys(parsedBody.data),
        },
        "info",
        "BT-1-DRIVER-SAFETY-FILE"
      );
      return row;
    });

    if (!result) return reply.code(404).send({ error: "mdata_driver_safety_event_not_found" });
    return { event: result };
  });
}
