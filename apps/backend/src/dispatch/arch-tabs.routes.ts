import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  createOfficeIntransitIssue,
  listAssignmentHistoryGlobal,
  listAtRiskLoads,
  listIntransitIssues,
  resolveIntransitIssue,
} from "./arch-tabs.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.string().trim().optional(),
  load_id: z.string().uuid().optional(),
  issue_id: z.string().uuid().optional(),
  issue_driver_id: z.string().uuid().optional(),
  issue_unit_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createIssueBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid(),
  issue_category: z.string().trim().min(1).max(80),
  issue_description: z.string().trim().min(10).max(4000),
  severity: z.enum(["info", "warning", "severe"]),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
});

const resolveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  notes: z.string().trim().max(2000).optional(),
});

const issueParamsSchema = z.object({ id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDispatchArchTabsRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/at-risk-loads", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listAtRiskLoads(user.uuid, query.data.operating_company_id);
  });

  app.get("/api/v1/dispatch/intransit-issues", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listIntransitIssues(user.uuid, query.data.operating_company_id, {
      status: query.data.status,
      issue_id: query.data.issue_id,
      load_id: query.data.load_id,
      driver_id: query.data.issue_driver_id,
      unit_id: query.data.issue_unit_id,
    });
  });

  app.get("/api/v1/dispatch/assignment-history", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listAssignmentHistoryGlobal(user.uuid, query.data.operating_company_id, {
      driver_id: query.data.driver_id,
      from: query.data.from,
      to: query.data.to,
      reason: query.data.reason,
      limit: query.data.limit,
      offset: query.data.offset,
    });
  });

  app.post("/api/v1/dispatch/intransit-issues/office", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createIssueBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const result = await createOfficeIntransitIssue(user.uuid, body.data.operating_company_id, body.data);
    if (!result.ok) return reply.code(result.error === "load_not_found" ? 404 : 409).send({ error: result.error });
    return reply.code(201).send(result.issue);
  });

  app.post("/api/v1/dispatch/intransit-issues/:id/resolve", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = issueParamsSchema.safeParse(req.params ?? {});
    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await resolveIntransitIssue(user.uuid, body.data.operating_company_id, params.data.id, body.data.notes);
    if (!result.ok) return reply.code(404).send({ error: result.error });
    return result.issue;
  });
}
