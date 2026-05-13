import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { triggerFullMasterDataSync, type MasterEntityType } from "./master-data-sync.service.js";

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: z.enum(["vendor", "customer", "item", "account"]).optional(),
});

export async function registerMasterDataSyncRoutes(app: FastifyInstance) {
  app.post("/api/v1/qbo/master-data-sync/trigger-full", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    if (String(req.user?.role ?? "") !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const entityType = (parsed.data.entity_type ?? null) as MasterEntityType | null;

    void triggerFullMasterDataSync({
      operatingCompanyId: parsed.data.operating_company_id,
      entityType,
    }).catch((error) => {
      app.log.error({ err: error }, "QBO master-data manual full sync failed");
    });

    return reply.code(202).send({ accepted: true });
  });
}
