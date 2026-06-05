import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { pullItemsFromQbo } from "./items-puller.js";
import { fetchItemsSyncStatus, reconcileItems } from "./items-reconciler.js";

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const statusQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function isWriteRole(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

export async function registerItemsSyncRoutes(app: FastifyInstance) {
  app.post("/api/v1/qbo-sync/items/pull-now", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    try {
      const result = await pullItemsFromQbo(parsed.data.operating_company_id);
      return reply.send({ ok: true, ...result });
    } catch (error) {
      app.log.error({ err: error }, "Items pull failed");
      return reply.code(502).send({ error: "qbo_pull_failed", message: error instanceof Error ? error.message : "unknown" });
    }
  });

  app.post("/api/v1/qbo-sync/items/reconcile-now", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    try {
      const result = await reconcileItems(parsed.data.operating_company_id);
      return reply.send({ ok: true, ...result });
    } catch (error) {
      app.log.error({ err: error }, "Items reconcile failed");
      return reply.code(500).send({ error: "reconcile_failed", message: error instanceof Error ? error.message : "unknown" });
    }
  });

  app.get("/api/v1/qbo-sync/items/status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const parsed = statusQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const status = await fetchItemsSyncStatus(parsed.data.operating_company_id);
    return reply.send(status);
  });
}
