import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { submitDvirBodySchema, submitDriverDvir } from "../safety/dvir-submit.service.js";
import { requireDriverSession } from "./auth.js";

const loadParamsSchema = z.object({
  loadId: z.string().uuid(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverDvirRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/dvir", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const body = submitDvirBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const result = await withCurrentUser(req.user!.uuid, async (client) => submitDriverDvir(client, req.user!.uuid, driver, body.data));

    if ("error" in result) {
      if (result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
      if (result.error === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
      if (result.error === "duplicate_request") return reply.code(409).send({ error: "duplicate_request" });
      return reply.code(400).send({ error: result.error });
    }
    return result;
  });

  app.get("/api/v1/driver/dvir/:loadId", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const driver = req.driver;
    if (!driver) return;

    const payload = await withCurrentUser(req.user!.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.dvir_submissions
          WHERE load_id = $1
            AND driver_id = $2
            AND type = 'pre_trip'
          ORDER BY submitted_at DESC
          LIMIT 1
        `,
        [params.data.loadId, driver.id]
      );
      return res.rows[0] ?? null;
    });

    if (!payload) return reply.code(404).send({ error: "dvir_not_found" });
    return payload;
  });
}
