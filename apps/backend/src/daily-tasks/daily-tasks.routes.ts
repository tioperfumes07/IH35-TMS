import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  acceptTask,
  cancelBodySchema,
  cancelTask,
  completeTask,
  createDailyTaskBodySchema,
  createTask,
  getTask,
  listDailyTasksQuerySchema,
  listTaskEvents,
  listTasks,
  reassignBodySchema,
  reassignTask,
  taskIdParamsSchema,
} from "./daily-tasks.service.js";

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

export async function registerDailyTasksRoutes(app: FastifyInstance) {
  app.post("/api/v1/daily-tasks", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = createDailyTaskBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);
      return createTask(client, {
        actorUserId: user.uuid,
        actorRole: String(user.role ?? ""),
        body: parsed.data,
      });
    });

    if ("error" in result && result.error === "forbidden_company") {
      return reply.code(403).send({ error: "forbidden_company" });
    }
    return reply.code(201).send(result);
  });

  app.get("/api/v1/daily-tasks", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = listDailyTasksQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);
      return listTasks(client, {
        actorUserId: user.uuid,
        actorRole: String(user.role ?? ""),
        query: parsed.data,
      });
    });
    if ("error" in result && result.error === "forbidden_company") {
      return reply.code(403).send({ error: "forbidden_company" });
    }
    return result;
  });

  app.get("/api/v1/daily-tasks/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = taskIdParamsSchema.safeParse(req.params ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const result = await withCurrentUser(user.uuid, async (client) =>
      getTask(client, {
        actorUserId: user.uuid,
        actorRole: String(user.role ?? ""),
        taskId: parsed.data.id,
      })
    );
    if ("error" in result && result.error === "not_found") return reply.code(404).send({ error: "not_found" });
    if ("error" in result && result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
    return result;
  });

  app.post("/api/v1/daily-tasks/:id/accept", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = taskIdParamsSchema.safeParse(req.params ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const result = await withCurrentUser(user.uuid, async (client) =>
      acceptTask(client, {
        actorUserId: user.uuid,
        actorRole: String(user.role ?? ""),
        taskId: parsed.data.id,
      })
    );
    if ("error" in result && result.error === "not_found") return reply.code(404).send({ error: "not_found" });
    if ("error" in result && result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if ("error" in result && result.error === "invalid_status") return reply.code(409).send({ error: "invalid_status" });
    return result;
  });

  app.post("/api/v1/daily-tasks/:id/complete", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = taskIdParamsSchema.safeParse(req.params ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const result = await withCurrentUser(user.uuid, async (client) =>
      completeTask(client, {
        actorUserId: user.uuid,
        actorRole: String(user.role ?? ""),
        taskId: parsed.data.id,
      })
    );
    if ("error" in result && result.error === "not_found") return reply.code(404).send({ error: "not_found" });
    if ("error" in result && result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if ("error" in result && result.error === "invalid_status") return reply.code(409).send({ error: "invalid_status" });
    return result;
  });

  app.post("/api/v1/daily-tasks/:id/reassign", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsedParams = taskIdParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = reassignBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(user.uuid, async (client) =>
      reassignTask(client, {
        actorUserId: user.uuid,
        actorRole: String(user.role ?? ""),
        taskId: parsedParams.data.id,
        body: parsedBody.data,
      })
    );
    if ("error" in result && result.error === "not_found") return reply.code(404).send({ error: "not_found" });
    if ("error" in result && result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if ("error" in result && result.error === "invalid_status") return reply.code(409).send({ error: "invalid_status" });
    return result;
  });

  app.post("/api/v1/daily-tasks/:id/cancel", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsedParams = taskIdParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = cancelBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(user.uuid, async (client) =>
      cancelTask(client, {
        actorUserId: user.uuid,
        actorRole: String(user.role ?? ""),
        taskId: parsedParams.data.id,
        body: parsedBody.data,
      })
    );
    if ("error" in result && result.error === "not_found") return reply.code(404).send({ error: "not_found" });
    if ("error" in result && result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if ("error" in result && result.error === "invalid_status") return reply.code(409).send({ error: "invalid_status" });
    return result;
  });

  app.get("/api/v1/daily-tasks/:id/events", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = taskIdParamsSchema.safeParse(req.params ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const result = await withCurrentUser(user.uuid, async (client) =>
      listTaskEvents(client, {
        actorUserId: user.uuid,
        actorRole: String(user.role ?? ""),
        taskId: parsed.data.id,
      })
    );
    if ("error" in result && result.error === "not_found") return reply.code(404).send({ error: "not_found" });
    if ("error" in result && result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
    return result;
  });
}
