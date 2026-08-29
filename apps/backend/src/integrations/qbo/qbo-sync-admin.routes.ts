import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  enqueueSyncJob,
  getSyncQueueStats,
  listSyncQueue,
  retrySyncQueueItem,
  skipSyncQueueItem,
} from "./qbo-sync.service.js";

const queueListQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["pending", "in_flight", "synced", "failed", "blocked", "dead_letter"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const retryParamsSchema = z.object({
  id: z.string().uuid(),
});

const postQueueBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: z.enum([
    "bank_transaction",
    "bill",
    "bill_payment",
    "credit_memo",
    "expense",
    "factoring_advance",
    "invoice",
    "journal_entry",
    "payment",
    "settlement",
    "transfer",
  ]),
  entity_id: z.string().uuid(),
  payload_hash: z.string().trim().min(1).max(128),
});

const skipBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function requireOwnerOrAdmin(user: { role: string }, reply: FastifyReply) {
  if (user.role !== "Owner" && user.role !== "Administrator") {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

export async function registerQboSyncAdminRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/qbo/sync-queue", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireOwnerOrAdmin(user, reply)) return;

    const query = queueListQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    // ACCT-F5559 — listSyncQueue now asserts membership itself and throws a 403-shaped Error; this
    // route has no other error mapping, so catch it here (same pattern as /retry, /skip below).
    try {
      const rows = await listSyncQueue({
        operatingCompanyId: query.data.operating_company_id,
        actorUserId: user.uuid,
        status: query.data.status,
        limit: query.data.limit,
        offset: query.data.offset,
      });
      return { items: rows };
    } catch (err) {
      if ((err as Error & { statusCode?: number })?.statusCode === 403) {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }
      throw err;
    }
  });

  app.post("/api/v1/integrations/qbo/sync-queue", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireOwnerOrAdmin(user, reply)) return;

    const body = postQueueBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const row = await enqueueSyncJob(
      body.data.operating_company_id,
      body.data.entity_type,
      body.data.entity_id,
      body.data.payload_hash,
      user.uuid
    );
    if (!row) return reply.code(503).send({ error: "qbo_not_configured" });
    return reply.code(201).send({ id: row.id });
  });

  app.post("/api/v1/integrations/qbo/sync-queue/:id/retry", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireOwnerOrAdmin(user, reply)) return;

    const params = retryParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = z
      .object({ operating_company_id: z.string().uuid() })
      .safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    // CLS-GUC-BASELINE (MDATA-F09 class) — retrySyncQueueItem now asserts membership itself and
    // throws a 403-shaped Error; this route has no other error mapping, so catch it here.
    try {
      await retrySyncQueueItem(params.data.id, user.uuid, query.data.operating_company_id);
    } catch (err) {
      if ((err as Error & { statusCode?: number })?.statusCode === 403) {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }
      throw err;
    }
    return { ok: true };
  });

  app.post("/api/v1/integrations/qbo/sync-queue/:id/skip", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = retryParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = skipBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    // CLS-GUC-BASELINE (MDATA-F09 class) — see /retry above.
    try {
      await skipSyncQueueItem(params.data.id, user.uuid, body.data.operating_company_id, body.data.reason);
    } catch (err) {
      if ((err as Error & { statusCode?: number })?.statusCode === 403) {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }
      throw err;
    }
    return { ok: true };
  });

  app.get("/api/v1/integrations/qbo/sync-queue/stats", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireOwnerOrAdmin(user, reply)) return;

    const query = z
      .object({ operating_company_id: z.string().uuid() })
      .safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    // ACCT-F5559 — getSyncQueueStats now asserts membership itself and throws a 403-shaped Error.
    try {
      const stats = await getSyncQueueStats(query.data.operating_company_id, user.uuid);
      return stats;
    } catch (err) {
      if ((err as Error & { statusCode?: number })?.statusCode === 403) {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }
      throw err;
    }
  });
}

