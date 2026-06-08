import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  approveDetentionRequest,
  detentionApprovalKpis,
  listDetentionRequests,
  rejectDetentionRequest,
} from "./detention-approval.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["pending_review", "approved", "rejected", "invoiced"]).optional(),
});

const kpisQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const requestParamsSchema = z.object({ id: z.string().uuid() });

const approveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const rejectBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

/** Manager+ approval roles for detention billing decisions. */
function isDetentionApprover(role: unknown): boolean {
  const r = String(role ?? "");
  return r === "Owner" || r === "Administrator" || r === "Manager";
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDispatchDetentionApprovalRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/detention/requests", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listDetentionRequests(user.uuid, query.data.operating_company_id, query.data.status);
  });

  app.get("/api/v1/dispatch/detention/requests/kpis", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = kpisQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return detentionApprovalKpis(user.uuid, query.data.operating_company_id);
  });

  app.patch("/api/v1/dispatch/detention/requests/:id/approve", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isDetentionApprover(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = requestParamsSchema.safeParse(req.params ?? {});
    const body = approveBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await approveDetentionRequest(user.uuid, body.data.operating_company_id, params.data.id);
    if (!result.ok) {
      if (result.error === "not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "zero_accrual") return reply.code(422).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return result;
  });

  app.patch("/api/v1/dispatch/detention/requests/:id/reject", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isDetentionApprover(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = requestParamsSchema.safeParse(req.params ?? {});
    const body = rejectBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await rejectDetentionRequest(
      user.uuid,
      body.data.operating_company_id,
      params.data.id,
      body.data.reason
    );
    if (!result.ok) {
      if (result.error === "not_found") return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return result;
  });
}
