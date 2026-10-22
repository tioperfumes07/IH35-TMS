/**
 * LEAD 443.243 — Fuel Assignment Question HTTP surface (Cursor popup).
 * List / count / get / evaluate / answer. Answer runs applyFillTruckAndLoad (audited).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  answerFuelAssignmentQuestion,
  countOpenFuelAssignmentQuestions,
  evaluateFuelAssignment,
  getFuelAssignmentQuestion,
  listFuelAssignmentQuestions,
} from "./fuel-assignment-question.service.js";

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["open", "answered", "cancelled", "all"]).default("open"),
  load_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  fuel_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const evaluateBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  fuel_transaction_id: z.string().uuid(),
  apply_if_certain: z.boolean().optional(),
});

const answerBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  kind: z.enum(["confirm_proposed", "pick_other", "keep_card_truck"]),
  unit_id: z.string().uuid().nullable().optional(),
  load_id: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(2000).nullable().optional(),
});

const ANSWER_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"]);

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerFuelAssignmentQuestionRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/fuel/assignment-questions",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const query = listQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const q = query.data;
      const result = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
        const tableExists = await client.query(
          `SELECT to_regclass('fuel.fuel_assignment_questions') IS NOT NULL AS ok`
        );
        if (!(tableExists.rows[0] as { ok?: boolean } | undefined)?.ok) {
          return { unavailable: true as const };
        }
        return listFuelAssignmentQuestions(client, {
          companyId: q.operating_company_id,
          status: q.status,
          loadId: q.load_id,
          unitId: q.unit_id,
          fuelId: q.fuel_id,
          limit: q.limit,
          offset: q.offset,
        });
      });
      if ("unavailable" in result && result.unavailable) {
        return reply.code(503).send({ error: "fuel_assignment_questions_unavailable" });
      }
      return reply.send(result);
    }
  );

  app.get(
    "/api/v1/fuel/assignment-questions/open-count",
    { config: { rateLimit: { max: 180, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const query = companyQuery.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const count = await withCompanyScope(authUser.uuid, query.data.operating_company_id, async (client) => {
        const tableExists = await client.query(
          `SELECT to_regclass('fuel.fuel_assignment_questions') IS NOT NULL AS ok`
        );
        if (!(tableExists.rows[0] as { ok?: boolean } | undefined)?.ok) return 0;
        return countOpenFuelAssignmentQuestions(client, query.data.operating_company_id);
      });
      return reply.send({ count });
    }
  );

  app.get(
    "/api/v1/fuel/assignment-questions/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const id = z.string().uuid().safeParse((req.params as { id?: string }).id);
      const query = companyQuery.safeParse(req.query ?? {});
      if (!id.success || !query.success) {
        return reply.code(400).send({ error: "validation_error" });
      }
      const row = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
        getFuelAssignmentQuestion(client, query.data.operating_company_id, id.data)
      );
      if (!row) return reply.code(404).send({ error: "question_not_found" });
      return reply.send({ question: row });
    }
  );

  app.post(
    "/api/v1/fuel/assignment-questions/evaluate",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const body = evaluateBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);
      if (!ANSWER_ROLES.has(authUser.role)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const result = await withCompanyScope(authUser.uuid, body.data.operating_company_id, (client) =>
        evaluateFuelAssignment(client, {
          companyId: body.data.operating_company_id,
          actorUserId: authUser.uuid,
          fuelId: body.data.fuel_transaction_id,
          applyIfCertain: body.data.apply_if_certain,
        })
      );
      if ("error" in result && result.error) {
        const code = result.error === "fuel_not_found" ? 404 : 503;
        return reply.code(code).send({ error: result.error });
      }
      return reply.send(result);
    }
  );

  app.post(
    "/api/v1/fuel/assignment-questions/:id/answer",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const id = z.string().uuid().safeParse((req.params as { id?: string }).id);
      const body = answerBodySchema.safeParse(req.body ?? {});
      if (!id.success || !body.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: body.success ? undefined : body.error.flatten(),
        });
      }
      if (!ANSWER_ROLES.has(authUser.role)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const result = await withCompanyScope(authUser.uuid, body.data.operating_company_id, (client) =>
        answerFuelAssignmentQuestion(client, {
          companyId: body.data.operating_company_id,
          actorUserId: authUser.uuid,
          questionId: id.data,
          kind: body.data.kind,
          unitId: body.data.unit_id,
          loadId: body.data.load_id,
          reason: body.data.reason,
        })
      );
      if ("error" in result) {
        const code =
          result.error === "question_not_found"
            ? 404
            : result.error === "question_not_open" || result.error === "answer_race"
              ? 409
              : 400;
        return reply.code(code).send({ error: result.error });
      }
      return reply.send(result);
    }
  );
}
