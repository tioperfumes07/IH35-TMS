import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { deactivateTeam } from "./driver-team.service.js";

const idParamsSchema = z.object({ teamId: z.string().uuid() });

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function ensureOffice(req: FastifyRequest, reply: FastifyReply) {
  const user = auth(req, reply);
  if (!user) return null;
  if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

// DELETE-only: GET/POST/PATCH live on registerDriverTeamSplitRoutes (same URLs collided here).
export async function registerDriverTeamsAliasRoutes(app: FastifyInstance) {
  app.delete("/api/v1/driver-teams/:teamId", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureOffice(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    try {
      await deactivateTeam(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        team_id: params.data.teamId,
        reason: "driver-teams api soft delete",
      });
      return reply.code(204).send();
    } catch (error) {
      const msg = String((error as Error)?.message ?? "delete_team_failed");
      // DRV-F6002 — mirror driver-team-split.routes.ts's mapServiceError: without this, a
      // membership failure from deactivateTeam's setScopedCompanyContext fell through to a bare 400
      // instead of the 403 every other membership-gated route returns.
      if (msg.includes("forbidden_company_membership")) return reply.code(403).send({ error: "forbidden_company_membership" });
      const code = msg.includes("E_TEAM_HAS_IN_PROGRESS_LOADS") ? 409 : 400;
      return reply.code(code).send({ error: msg });
    }
  });
}
