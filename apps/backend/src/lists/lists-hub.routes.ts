import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";

const COMPANY_QUERY = z.object({
  operating_company_id: z.string().uuid(),
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

export async function registerListsHubRoutes(app: FastifyInstance) {
  app.get("/api/v1/lists/inventory", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const inventory = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT domain, catalog_key, display_name, row_count
          FROM views.catalogs_inventory
          ORDER BY domain, display_name
        `
      );
      return res.rows;
    });
    return { inventory };
  });

  app.get("/api/v1/lists/recent-activity", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const activity = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT created_at, event_type, catalog_key, action, entity_name, user_display_name, qbo_sync_status
          FROM views.catalogs_recent_activity
          ORDER BY created_at DESC
          LIMIT 50
        `
      );
      return res.rows;
    });
    return { activity };
  });

  app.get("/api/v1/lists/qbo-sync-health", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const health = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT entity, local_count, qbo_count, pending_count, drift
          FROM views.qbo_sync_health
          ORDER BY entity
        `
      );
      return res.rows;
    });
    return { health };
  });

  app.post("/api/v1/lists/force-qbo-sync", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = COMPANY_QUERY.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const idempotencyKey = `qbo:force_sync:lists_hub:${body.data.operating_company_id}:${Date.now()}`;
      await client.query(
        `
          INSERT INTO outbox.queue (
            operating_company_id,
            target_system,
            operation,
            entity_type,
            entity_uuid,
            idempotency_key,
            payload,
            status,
            audit_user_id
          )
          VALUES (
            $4::uuid,
            'qbo',
            'force_full_sync',
            'lists_hub',
            gen_random_uuid(),
            $1,
            $2::jsonb,
            'pending',
            $3
          )
          ON CONFLICT (idempotency_key) DO NOTHING
        `,
        [
          idempotencyKey,
          JSON.stringify({
            operating_company_id: body.data.operating_company_id,
            initiated_by_user_id: user.uuid,
            scope: "catalogs",
          }),
          user.uuid,
          body.data.operating_company_id,
        ]
      );
      return { started: true, idempotency_key: idempotencyKey };
    });
    return reply.code(202).send(result);
  });
}

