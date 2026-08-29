import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  evaluateIntegrityRulesForTenant,
  listIntegrityAlertRules,
} from "./integrity-alert-engine.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

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
  subject_driver_id: z.string().uuid().optional(),
  subject_unit_id: z.string().uuid().optional(),
  subject_vendor_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
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

const snoozeBodySchema = z.object({
  snooze_hours: z.number().int().min(1).max(168).default(24),
});

const ruleUpsertBodySchema = z.object({
  rule_name: z.string().min(1),
  source_view: z.string().min(1),
  alert_category: z.string().min(1),
  subject_type: z.enum(["driver", "unit", "vendor", "unit_driver_pair", "vendor_driver_pair"]),
  threshold_config: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  enabled: z.boolean().optional(),
});

const rulePatchBodySchema = ruleUpsertBodySchema.partial();

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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Safety"].includes(role);
}

async function listIntegrityAlertsHandler(
  user: { uuid: string },
  query: z.infer<typeof listQuerySchema>
) {
  return withCompanyScope(user.uuid, query.operating_company_id, async (client) => {
    const filters = ["ia.operating_company_id = $1::uuid", "(ia.snoozed_until IS NULL OR ia.snoozed_until <= now())"];
    const values: unknown[] = [query.operating_company_id];
    if (query.alert_category) {
      values.push(query.alert_category);
      filters.push(`ia.alert_category = $${values.length}`);
    }
    if (query.severity) {
      values.push(query.severity);
      filters.push(`ia.severity = $${values.length}`);
    }
    if (query.resolution_status) {
      values.push(query.resolution_status);
      filters.push(`ia.resolution_status = $${values.length}`);
    }
    if (query.subject_type) {
      values.push(query.subject_type);
      filters.push(`ia.subject_type = $${values.length}`);
    }
    for (const column of ["subject_driver_id", "subject_unit_id", "subject_vendor_id"] as const) {
      if (!query[column]) continue;
      values.push(query[column]);
      filters.push(`ia.${column} = $${values.length}::uuid`);
    }
    const countRes = await client.query<{ total_count: string }>(
      `SELECT COUNT(*)::text AS total_count
       FROM safety.integrity_alerts ia
       WHERE ${filters.join(" AND ")}`,
      values
    );
    const rangeValues = [...values, query.limit, query.offset];
    const limitParameter = rangeValues.length - 1;
    const offsetParameter = rangeValues.length;
    const res = await client.query(
      `
        SELECT ia.*,
               NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS subject_driver_name,
               u.unit_number AS subject_unit_number,
               v.vendor_name AS subject_vendor_name
        FROM safety.integrity_alerts ia
        LEFT JOIN mdata.drivers d
          ON d.id = ia.subject_driver_id
         AND (d.operating_company_id = ia.operating_company_id OR EXISTS (
           SELECT 1 FROM mdata.driver_company_authorizations integrity_alerts_list_dca
           WHERE integrity_alerts_list_dca.driver_id = d.id
             AND integrity_alerts_list_dca.company_id = ia.operating_company_id
             AND integrity_alerts_list_dca.is_authorized = true
             AND integrity_alerts_list_dca.deactivated_at IS NULL
         ))
        LEFT JOIN mdata.units u
          ON u.id = ia.subject_unit_id
         AND (u.owner_company_id = ia.operating_company_id
              OR u.currently_leased_to_company_id = ia.operating_company_id)
        LEFT JOIN mdata.vendors v
          ON v.id = ia.subject_vendor_id
         AND v.operating_company_id = ia.operating_company_id
        WHERE ${filters.join(" AND ")}
        ORDER BY ia.created_at DESC
        LIMIT $${limitParameter}
        OFFSET $${offsetParameter}
      `,
      rangeValues
    );
    return { rows: res.rows, totalCount: Number(countRes.rows[0]?.total_count ?? 0) };
  });
}

export async function registerSafetyIntegrityAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/integrity-alerts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const result = await listIntegrityAlertsHandler(user, query.data);
    return { integrity_alerts: result.rows, total_count: result.totalCount };
  });

  app.get("/api/v1/safety/integrity-alerts/list", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const result = await listIntegrityAlertsHandler(user, query.data);
    return { integrity_alerts: result.rows, total_count: result.totalCount };
  });

  app.get("/api/v1/safety/integrity-alert-rules", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      listIntegrityAlertRules(client, query.data.operating_company_id)
    );
    return { integrity_alert_rules: rows };
  });

  app.post("/api/v1/safety/integrity-alert-rules", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = ruleUpsertBodySchema
      .extend({ rule_code: z.string().min(1) })
      .safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.integrity_alert_rules (
            operating_company_id, rule_code, rule_name, source_view, alert_category, subject_type,
            threshold_config, severity, enabled, created_by_user_id, updated_by_user_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$10)
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.rule_code,
          body.data.rule_name,
          body.data.source_view,
          body.data.alert_category,
          body.data.subject_type,
          JSON.stringify(body.data.threshold_config ?? {}),
          body.data.severity ?? "warning",
          body.data.enabled ?? true,
          user.uuid,
        ]
      );
      return res.rows[0] ?? null;
    });
    if (!created) return reply.code(500).send({ error: "rule_create_failed" });
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/safety/integrity-alert-rules/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = rulePatchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const sets: string[] = [];
    const values: unknown[] = [params.data.id, query.data.operating_company_id];
    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (body.data.rule_name !== undefined) push("rule_name", body.data.rule_name);
    if (body.data.source_view !== undefined) push("source_view", body.data.source_view);
    if (body.data.alert_category !== undefined) push("alert_category", body.data.alert_category);
    if (body.data.subject_type !== undefined) push("subject_type", body.data.subject_type);
    if (body.data.threshold_config !== undefined) push("threshold_config", JSON.stringify(body.data.threshold_config));
    if (body.data.severity !== undefined) push("severity", body.data.severity);
    if (body.data.enabled !== undefined) push("enabled", body.data.enabled);
    if (sets.length === 0) return reply.code(400).send({ error: "no_fields_to_update" });
    push("updated_by_user_id", user.uuid);
    sets.push("updated_at = now()");

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.integrity_alert_rules
          SET ${sets.join(", ")}
          WHERE id = $1 AND operating_company_id = $2::uuid
          RETURNING *
        `,
        values
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "integrity_alert_rule_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/integrity-alerts/evaluate", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      evaluateIntegrityRulesForTenant(client, query.data.operating_company_id)
    );
    return result;
  });

  app.get("/api/v1/safety/integrity-alerts/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT ia.*,
                NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS subject_driver_name,
                u.unit_number AS subject_unit_number,
                v.vendor_name AS subject_vendor_name
           FROM safety.integrity_alerts ia
           LEFT JOIN mdata.drivers d
             ON d.id = ia.subject_driver_id
            AND (d.operating_company_id = ia.operating_company_id OR EXISTS (
              SELECT 1 FROM mdata.driver_company_authorizations integrity_alerts_detail_dca
              WHERE integrity_alerts_detail_dca.driver_id = d.id
                AND integrity_alerts_detail_dca.company_id = ia.operating_company_id
                AND integrity_alerts_detail_dca.is_authorized = true
                AND integrity_alerts_detail_dca.deactivated_at IS NULL
            ))
           LEFT JOIN mdata.units u
             ON u.id = ia.subject_unit_id
            AND (u.owner_company_id = ia.operating_company_id
                 OR u.currently_leased_to_company_id = ia.operating_company_id)
           LEFT JOIN mdata.vendors v
             ON v.id = ia.subject_vendor_id
            AND v.operating_company_id = ia.operating_company_id
          WHERE ia.id = $1 AND ia.operating_company_id = $2::uuid
          LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "integrity_alert_not_found" });
    return row;
  });

  app.post("/api/v1/safety/integrity-alerts/:id/acknowledge", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            AND operating_company_id = $2::uuid
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

  app.post("/api/v1/safety/integrity-alerts/:id/resolve", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            AND operating_company_id = $2::uuid
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

  app.post("/api/v1/safety/integrity-alerts/:id/snooze", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = snoozeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.integrity_alerts
          SET snoozed_until = now() + ($3::int * interval '1 hour')
          WHERE id = $1
            AND operating_company_id = $2::uuid
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.snooze_hours]
      );
      const row = res.rows[0] ?? null;
      if (row?.event_id) {
        await client.query(
          `
            UPDATE safety.integrity_alert_events
            SET event_status = 'snoozed',
                snoozed_until = now() + ($2::int * interval '1 hour'),
                updated_at = now()
            WHERE id = $1
          `,
          [row.event_id, body.data.snooze_hours]
        );
      }
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.integrity_alert.snoozed",
          {
            resource_type: "safety.integrity_alerts",
            resource_id: row.id,
            snooze_hours: body.data.snooze_hours,
            operating_company_id: query.data.operating_company_id,
          },
          "info",
          "A23-12"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "integrity_alert_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/integrity-alerts", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
