import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });

const createRuleSchema = companyQuery.extend({
  credential_type: z.string().trim().min(1).max(100),
  entity_scope: z.enum(["all", "specific", "role"]).default("all"),
  recipient_user_ids: z.array(z.string().uuid()).optional(),
  recipient_emails: z.array(z.string().email()).optional(),
  notify_days_before: z.array(z.number().int().min(0).max(365)).optional(),
  channel: z.array(z.enum(["email", "in_app"])).optional(),
});

const patchRuleSchema = createRuleSchema.partial().extend({
  active: z.boolean().optional(),
});

const idParams = z.object({ id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canManage(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

export async function registerComplianceNotificationRulesRoutes(app: FastifyInstance) {
  app.get("/api/v1/compliance/notification-rules", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          SELECT id::text, credential_type, entity_scope, recipient_user_ids, recipient_emails,
                 notify_days_before, channel, active, created_at, updated_at
          FROM compliance.notification_rules
          WHERE operating_company_id = $1::uuid AND active = true
          ORDER BY credential_type
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return reply.send({ rules: rows });
  });

  app.post("/api/v1/compliance/notification-rules", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user || !canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createRuleSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const row = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const res = await client.query(
        `
          INSERT INTO compliance.notification_rules (
            operating_company_id, credential_type, entity_scope, recipient_user_ids,
            recipient_emails, notify_days_before, channel, created_by_user_id
          ) VALUES ($1::uuid, $2, $3, $4::uuid[], $5::text[], $6::int[], $7::text[], $8::uuid)
          RETURNING id::text, credential_type, entity_scope, recipient_user_ids, recipient_emails,
                    notify_days_before, channel, active
        `,
        [
          body.data.operating_company_id,
          body.data.credential_type,
          body.data.entity_scope,
          body.data.recipient_user_ids ?? null,
          body.data.recipient_emails ?? null,
          body.data.notify_days_before ?? [30, 14, 7, 1],
          body.data.channel ?? ["email", "in_app"],
          user.uuid,
        ]
      );
      await appendCrudAudit(
        client as Parameters<typeof appendCrudAudit>[0],
        user.uuid,
        "compliance.notification_rule.created",
        { entityId: res.rows[0]?.id, operatingCompanyId: body.data.operating_company_id }
      );
      return res.rows[0];
    });
    return reply.code(201).send({ rule: row });
  });

  app.patch("/api/v1/compliance/notification-rules/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user || !canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParams.safeParse(req.params ?? {});
    const body = patchRuleSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    if (!body.data.operating_company_id) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE compliance.notification_rules
          SET credential_type = COALESCE($3, credential_type),
              entity_scope = COALESCE($4, entity_scope),
              recipient_user_ids = COALESCE($5::uuid[], recipient_user_ids),
              recipient_emails = COALESCE($6::text[], recipient_emails),
              notify_days_before = COALESCE($7::int[], notify_days_before),
              channel = COALESCE($8::text[], channel),
              active = COALESCE($9, active),
              updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          RETURNING id::text, credential_type, active
        `,
        [
          params.data.id,
          body.data.operating_company_id,
          body.data.credential_type ?? null,
          body.data.entity_scope ?? null,
          body.data.recipient_user_ids ?? null,
          body.data.recipient_emails ?? null,
          body.data.notify_days_before ?? null,
          body.data.channel ?? null,
          body.data.active ?? null,
        ]
      );
      return res.rows[0];
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send({ rule: row });
  });

  app.delete("/api/v1/compliance/notification-rules/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user || !canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParams.safeParse(req.params ?? {});
    const query = companyQuery.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      await client.query(
        `
          UPDATE compliance.notification_rules
          SET active = false, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        `,
        [params.data.id, query.data.operating_company_id]
      );
    });
    return reply.send({ ok: true });
  });
}
