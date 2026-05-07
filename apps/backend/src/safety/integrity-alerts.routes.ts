import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  alert_category: z.string().optional(),
  severity: z.string().optional(),
  resolution_status: z.string().optional(),
  subject_type: z.string().optional(),
});

const acknowledgeBodySchema = z.object({
  acknowledgment_note: z.string().optional(),
});

const resolveBodySchema = z.object({
  resolution_status: z.enum(["unresolved", "investigating", "false_positive", "confirmed_action_taken", "dismissed"]),
  resolution_action: z.string().optional(),
});

const createBodySchema = z.object({
  alert_category: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  subject_type: z.string().min(1),
  subject_driver_id: z.string().uuid().nullable().optional(),
  subject_unit_id: z.string().uuid().nullable().optional(),
  subject_vendor_id: z.string().uuid().nullable().optional(),
  detection_summary: z.string().min(1),
  detection_metric: z.unknown(),
  source_view: z.string().min(1),
  related_load_ids: z.unknown().optional(),
  related_wo_ids: z.unknown().optional(),
  related_safety_event_ids: z.unknown().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Safety"].includes(role);
}

export async function registerSafetyIntegrityAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/integrity-alerts/list", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const filters = ["operating_company_id = $1"];
      const values: unknown[] = [query.data.operating_company_id];
      if (query.data.alert_category) {
        values.push(query.data.alert_category);
        filters.push(`alert_category = $${values.length}`);
      }
      if (query.data.severity) {
        values.push(query.data.severity);
        filters.push(`severity = $${values.length}`);
      }
      if (query.data.resolution_status) {
        values.push(query.data.resolution_status);
        filters.push(`resolution_status = $${values.length}`);
      }
      if (query.data.subject_type) {
        values.push(query.data.subject_type);
        filters.push(`subject_type = $${values.length}`);
      }
      const res = await client.query(
        `
          SELECT *
          FROM safety.integrity_alerts
          WHERE ${filters.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT 500
        `,
        values
      );
      return res.rows;
    });
    return { integrity_alerts: rows };
  });

  app.get("/api/v1/safety/integrity-alerts/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.integrity_alerts WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "integrity_alert_not_found" });
    return row;
  });

  app.post("/api/v1/safety/integrity-alerts/:id/acknowledge", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = acknowledgeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.integrity_alerts
          SET acknowledged_by_user_id = $3,
              acknowledged_at = now(),
              acknowledgment_note = $4
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, user.uuid, body.data.acknowledgment_note ?? null]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.integrity_alert.acknowledged",
          {
            resource_type: "safety.integrity_alerts",
            resource_id: row.id,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "integrity_alert_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/integrity-alerts/:id/resolve", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.integrity_alerts
          SET resolution_status = $3,
              resolution_action = $4
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.resolution_status, body.data.resolution_action ?? null]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.integrity_alert.resolved",
          {
            resource_type: "safety.integrity_alerts",
            resource_id: row.id,
            resolution_status: body.data.resolution_status,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "integrity_alert_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/integrity-alerts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    if (user.role !== "Owner") {
      return reply.code(403).send({ error: "integrity_alert_create_restricted" });
    }

    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.integrity_alerts (
            operating_company_id, alert_category, severity, subject_type, subject_driver_id, subject_unit_id, subject_vendor_id,
            detection_summary, detection_metric, source_view, related_load_ids, related_wo_ids, related_safety_event_ids, created_by_user_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14
          )
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.alert_category,
          body.data.severity,
          body.data.subject_type,
          body.data.subject_driver_id ?? null,
          body.data.subject_unit_id ?? null,
          body.data.subject_vendor_id ?? null,
          body.data.detection_summary,
          JSON.stringify(body.data.detection_metric),
          body.data.source_view,
          JSON.stringify(body.data.related_load_ids ?? null),
          JSON.stringify(body.data.related_wo_ids ?? null),
          JSON.stringify(body.data.related_safety_event_ids ?? null),
          user.uuid,
        ]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.integrity_alert.created",
          {
            resource_type: "safety.integrity_alerts",
            resource_id: row.id,
            alert_category: row.alert_category,
            operating_company_id: query.data.operating_company_id,
          },
          "warning",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    return reply.code(201).send(created);
  });
}
