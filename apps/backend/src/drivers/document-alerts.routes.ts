import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  acknowledgeDocumentAlertEvent,
  evaluateDocumentAlertsForTenant,
  listDocumentAlertRules,
  listOpenDocumentAlertEvents,
  updateDocumentAlertRule,
} from "./document-alerts.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const ruleParamsSchema = z.object({ ruleId: z.string().uuid() });
const eventParamsSchema = z.object({ eventId: z.string().uuid() });

const updateRuleBodySchema = z.object({
  rule_name: z.string().min(1).max(120).optional(),
  days_before_expiry: z.array(z.number().int().min(0).max(365)).min(1).max(12).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  notify_email: z.boolean().optional(),
  notify_in_app: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const acknowledgeBodySchema = z.object({
  note: z.string().max(2000).optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function officeAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerDriversDocumentAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/drivers/document-alerts/inbox", async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const events = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      listOpenDocumentAlertEvents(client, query.data.operating_company_id)
    );
    return reply.send({ events, pending_count: events.length });
  });

  app.get("/api/v1/drivers/document-alert-rules", async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const rules = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      listDocumentAlertRules(client, query.data.operating_company_id)
    );
    return reply.send({ document_alert_rules: rules });
  });

  app.patch("/api/v1/drivers/document-alert-rules/:ruleId", async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const params = ruleParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = updateRuleBodySchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    const updated = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      updateDocumentAlertRule(client, query.data.operating_company_id, params.data.ruleId, body.data)
    );
    if (!updated) return reply.code(404).send({ error: "rule_not_found" });
    return reply.send({ document_alert_rule: updated });
  });

  app.post("/api/v1/drivers/document-alerts/:eventId/acknowledge", async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const params = eventParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = acknowledgeBodySchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      acknowledgeDocumentAlertEvent(
        client,
        query.data.operating_company_id,
        params.data.eventId,
        authUser.uuid,
        body.data.note
      )
    );
    if (!row) return reply.code(404).send({ error: "event_not_found" });
    return reply.send({ event: row });
  });

  app.post("/api/v1/drivers/document-alerts/evaluate", async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const result = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      evaluateDocumentAlertsForTenant(client, query.data.operating_company_id)
    );
    return reply.send(result);
  });
}
