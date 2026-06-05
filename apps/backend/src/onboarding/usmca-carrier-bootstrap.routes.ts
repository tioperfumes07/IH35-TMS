import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  bootstrapCarrier,
  listHiddenCarriers,
  resolveCompanyIdByCode,
} from "./usmca-carrier-bootstrap.js";

type DbClient = Pick<pg.PoolClient, "query">;

const runBodySchema = z.object({
  template_carrier_code: z.string().trim().default("TRANSP"),
  target_carrier_code: z.string().trim().default("USMCA"),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withOwnerScope<T>(userId: string, role: string, fn: (client: DbClient) => Promise<T>) {
  if (role !== "Owner") {
    throw new Error("owner_only");
  }
  return withCurrentUser(userId, async (client) => fn(client));
}

export async function registerUsmcaCarrierBootstrapRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/carrier-bootstrap/hidden-carriers", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    try {
      const carriers = await withOwnerScope(user.uuid, user.role, (client) => listHiddenCarriers(client));
      return { carriers };
    } catch (err) {
      if (String(err).includes("owner_only")) {
        return reply.code(403).send({ error: "owner_only" });
      }
      throw err;
    }
  });

  app.post("/api/v1/admin/carrier-bootstrap/run", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = runBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    try {
      const result = await withOwnerScope(user.uuid, user.role, async (client) => {
        const templateId = await resolveCompanyIdByCode(client, parsed.data.template_carrier_code);
        const targetId = await resolveCompanyIdByCode(client, parsed.data.target_carrier_code);
        if (!templateId || !targetId) {
          throw new Error("carrier_not_found");
        }
        return bootstrapCarrier(client, templateId, targetId);
      });
      return reply.code(200).send(result);
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes("owner_only")) return reply.code(403).send({ error: "owner_only" });
      if (msg.includes("carrier_not_found")) return reply.code(404).send({ error: "carrier_not_found" });
      throw err;
    }
  });
}
