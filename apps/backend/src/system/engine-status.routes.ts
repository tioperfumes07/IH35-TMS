/**
 * E-41 — GET /api/v1/system/engine-status (Round 306).
 * Owner sees built-vs-producing for every registry engine without asking.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { fetchEngineStatusBoard } from "./engine-status.reads.js";

async function registerEngineStatusRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/system/engine-status",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;

      const parsed = companyQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);

      const { operating_company_id } = parsed.data;
      return withCompanyScope(user.uuid, operating_company_id, async (client) => {
        const board = await fetchEngineStatusBoard(client, operating_company_id);
        return { operating_company_id, ...board };
      });
    }
  );
}

export default fp(registerEngineStatusRoutes);
