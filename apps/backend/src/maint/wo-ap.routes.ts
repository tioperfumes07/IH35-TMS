import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  buildMaintWoApPostingPreview,
  mapMaintWoApHttpError,
  processMaintWorkOrderApPosting,
} from "./wo-ap-posting.service.js";

const idParamsSchema = z.object({ id: z.string().uuid() });

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const postBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canPost(role: string) {
  return ["Owner", "Administrator", "Manager"].includes(role);
}

export async function registerMaintWoApRoutes(app: FastifyInstance) {
  app.get("/api/v1/maint/wo/:id/posting-preview", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    try {
      const preview = await buildMaintWoApPostingPreview(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        work_order_id: params.data.id,
        actor_user_id: user.uuid,
      });
      return { preview };
    } catch (error) {
      const mapped = mapMaintWoApHttpError(error);
      if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
      throw error;
    }
  });

  app.post("/api/v1/maint/wo/:id/ap/post", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canPost(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = postBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    try {
      const result = await processMaintWorkOrderApPosting({
        operating_company_id: body.data.operating_company_id,
        work_order_id: params.data.id,
        actor_user_id: user.uuid,
      });
      return {
        work_order_id: params.data.id,
        ...result,
      };
    } catch (error) {
      const mapped = mapMaintWoApHttpError(error);
      if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
      throw error;
    }
  });
}
