import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  computeTeamLoadSplit,
  createTeam,
  deactivateTeam,
  getDriverTeam,
  listDriverTeams,
  updateTeamSplit,
  type TeamSplitMethod,
} from "./driver-team.service.js";

const splitMethodSchema = z.enum(["50_50", "60_40", "70_30", "mileage_prorated", "hours_prorated", "custom"]);
const teamIdParamsSchema = z.object({ id: z.string().uuid() });
const loadIdParamsSchema = z.object({ id: z.string().uuid() });
const operatingCompanyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

const createTeamBodySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    team_name: z.string().trim().min(2).max(200),
    primary_driver_id: z.string().uuid(),
    co_driver_id: z.string().uuid(),
    split_method: splitMethodSchema.default("50_50"),
    primary_share_pct: z.number().min(0).max(100).optional(),
    co_share_pct: z.number().min(0).max(100).optional(),
    notes: z.string().trim().max(3000).optional(),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((body) => body.primary_driver_id !== body.co_driver_id, {
    message: "primary and co driver must be different",
    path: ["co_driver_id"],
  });

const updateTeamBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  split_method: splitMethodSchema,
  primary_share_pct: z.number().min(0).max(100).optional(),
  co_share_pct: z.number().min(0).max(100).optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reactivate: z.boolean().optional(),
  notes: z.string().trim().max(3000).optional(),
});

const deactivateBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000),
});

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ensureOfficeRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Dispatcher";
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapServiceError(error: unknown) {
  const msg = String((error as Error)?.message ?? "unknown_error");
  if (msg.includes("E_TEAM_NOT_FOUND")) return { code: 404, error: "E_TEAM_NOT_FOUND" };
  if (msg.includes("E_LOAD_NOT_FOUND")) return { code: 404, error: "E_LOAD_NOT_FOUND" };
  if (msg.includes("E_LOAD_NOT_TEAM_ASSIGNED")) return { code: 409, error: "E_LOAD_NOT_TEAM_ASSIGNED" };
  if (msg.includes("E_TEAM_NOT_ACTIVE")) return { code: 409, error: "E_TEAM_NOT_ACTIVE" };
  if (msg.includes("E_LOAD_ALREADY_SOLO_ASSIGNED")) return { code: 409, error: "E_LOAD_ALREADY_SOLO_ASSIGNED" };
  if (msg.includes("E_DRIVER_NOT_IN_COMPANY")) return { code: 400, error: "E_DRIVER_NOT_IN_COMPANY" };
  if (msg.includes("E_DRIVER_ALREADY_IN_ACTIVE_TEAM")) return { code: 409, error: "E_DRIVER_ALREADY_IN_ACTIVE_TEAM" };
  if (msg.includes("E_SPLIT_PERCENTAGES_MUST_EQUAL_100")) return { code: 400, error: "E_SPLIT_PERCENTAGES_MUST_EQUAL_100" };
  if (msg.includes("E_INVALID_SPLIT_PERCENTAGES")) return { code: 400, error: "E_INVALID_SPLIT_PERCENTAGES" };
  if (msg.includes("E_TEAM_HAS_IN_PROGRESS_LOADS")) return { code: 409, error: "E_TEAM_HAS_IN_PROGRESS_LOADS" };
  if (msg.includes("E_SETTLEMENT_POSTED_SPLIT_IMMUTABLE")) return { code: 409, error: "E_SETTLEMENT_POSTED_SPLIT_IMMUTABLE" };
  if (msg.includes("E_REASON_REQUIRED")) return { code: 400, error: "E_REASON_REQUIRED" };
  return { code: 500, error: "team_driver_operation_failed", message: msg };
}

export async function registerDriverTeamSplitRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver-teams", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    if (!ensureOfficeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createTeamBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const data = await createTeam(user.uuid, body.data);
      return reply.code(201).send({ data });
    } catch (error) {
      const mapped = mapServiceError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.get("/api/v1/driver-teams", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const query = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const teams = await listDriverTeams(user.uuid, query.data.operating_company_id);
      return { teams };
    } catch (error) {
      const mapped = mapServiceError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.get("/api/v1/driver-teams/:id", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = teamIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const team = await getDriverTeam(user.uuid, query.data.operating_company_id, params.data.id);
      if (!team) return reply.code(404).send({ error: "E_TEAM_NOT_FOUND" });
      return { team };
    } catch (error) {
      const mapped = mapServiceError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.patch("/api/v1/driver-teams/:id", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    if (!ensureOfficeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = teamIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = updateTeamBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const data = await updateTeamSplit(user.uuid, { ...body.data, team_id: params.data.id });
      return { data };
    } catch (error) {
      const mapped = mapServiceError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.post("/api/v1/driver-teams/:id/deactivate", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    if (!ensureOfficeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = teamIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = deactivateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const data = await deactivateTeam(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        team_id: params.data.id,
        reason: body.data.reason,
      });
      return { data };
    } catch (error) {
      const mapped = mapServiceError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });

  app.get("/api/v1/loads/:id/team-settlement-split", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const data = await computeTeamLoadSplit(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        load_id: params.data.id,
      });
      return data;
    } catch (error) {
      const mapped = mapServiceError(error);
      return reply.code(mapped.code).send({ error: mapped.error, message: mapped.message });
    }
  });
}
