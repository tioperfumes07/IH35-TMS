import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  buildComplianceCredentials,
  summarizeComplianceCredentials,
  type ComplianceSeverity,
} from "./compliance-aggregate.service.js";
import { registerComplianceNotificationRulesRoutes } from "./compliance-notification-rules.routes.js";
import { registerComplianceSchedulerJobs } from "../scheduler/jobs.index.js";

const dashboardQuery = z.object({
  operating_company_id: z.string().uuid(),
  severity: z.enum(["red", "yellow", "green"]).optional(),
  type: z.string().trim().optional(),
  owner_type: z.string().trim().optional(),
});

const logQuery = dashboardQuery.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

let cronRegistered = false;

export async function registerComplianceRoutes(app: FastifyInstance) {
  await registerComplianceNotificationRulesRoutes(app);

  if (!cronRegistered) {
    registerComplianceSchedulerJobs(app);
    cronRegistered = true;
  }

  app.get("/api/v1/compliance/dashboard", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = dashboardQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const credentials = await withCurrentUser(user.uuid, async (client) =>
      buildComplianceCredentials(client, query.data.operating_company_id, {
        severity: query.data.severity as ComplianceSeverity | undefined,
        type: query.data.type,
        owner_type: query.data.owner_type,
      })
    );
    return reply.send({ credentials });
  });

  app.get("/api/v1/compliance/dashboard/summary", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = dashboardQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const credentials = await withCurrentUser(user.uuid, async (client) =>
      buildComplianceCredentials(client, query.data.operating_company_id)
    );
    return reply.send(summarizeComplianceCredentials(credentials));
  });

  app.get("/api/v1/compliance/notification-log", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = logQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          SELECT id::text, credential_type, entity_type, entity_id::text, expiration_date::text,
                 days_until_expiration, sent_at, channel, recipient, status
          FROM compliance.notification_log
          WHERE operating_company_id = $1::uuid
          ORDER BY sent_at DESC
          LIMIT $2
        `,
        [query.data.operating_company_id, query.data.limit]
      );
      return res.rows;
    });
    return reply.send({ entries: rows });
  });
}
