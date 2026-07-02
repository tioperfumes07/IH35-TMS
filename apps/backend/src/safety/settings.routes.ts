import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const patchBodySchema = z.object({
  dashboard_active_window_days: z.number().int().min(1).max(90).optional(),
  dashboard_inactive_threshold_days: z.number().int().min(1).max(365).optional(),
  csa_score_alert_threshold: z.number().int().nullable().optional(),
  integrity_alert_email_to: z.array(z.string()).nullable().optional(),
  integrity_alert_sms_to: z.array(z.string()).nullable().optional(),
  default_fine_dispute_window_days: z.number().int().min(1).optional(),
  violation_response_sla_days: z.number().int().min(1).optional(),
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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Safety"].includes(role);
}

export async function registerSafetySettingsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/settings", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.safety_settings
          WHERE operating_company_id = $1
          LIMIT 1
        `,
        [query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "safety_settings_not_found" });
    return row;
  });

  app.patch("/api/v1/safety/settings", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const entries = Object.entries(body.data).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return reply.code(400).send({ error: "no_changes" });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [];
      const sets: string[] = [];
      for (const [key, value] of entries) {
        values.push(key === "integrity_alert_email_to" || key === "integrity_alert_sms_to" ? value ?? null : value);
        const idx = values.length;
        if (key === "integrity_alert_email_to" || key === "integrity_alert_sms_to") {
          sets.push(`${key} = $${idx}::text[]`);
        } else {
          sets.push(`${key} = $${idx}`);
        }
      }
      values.push(user.uuid, query.data.operating_company_id);
      sets.push(`updated_by_user_id = $${values.length - 1}`);

      const res = await client.query(
        `
          UPDATE safety.safety_settings
          SET ${sets.join(", ")}
          WHERE operating_company_id = $${values.length}
          RETURNING *
        `,
        values
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.safety_settings.updated",
          {
            resource_type: "safety.safety_settings",
            resource_id: row.id,
            operating_company_id: query.data.operating_company_id,
            changes: body.data,
          },
          "info",
          "BT-3-SAFETY-GAPS-FILL"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "safety_settings_not_found" });
    return updated;
  });
}
